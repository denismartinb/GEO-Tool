import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

// APP-LAUNCH-1 (log §389): the service worker may cache only static, hashed or
// brand files. A customer's page, an API answer or a console data load (RSC)
// must always go to the network untouched.

type Listener = (event: unknown) => void;

function loadWorker() {
  const listeners: Record<string, Listener> = {};
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (req: Request | string) => store.get(typeof req === "string" ? req : req.url)?.clone()),
    put: vi.fn(async (req: Request, res: Response) => void store.set(req.url, res)),
    keys: vi.fn(async () => [...store.keys()].map((u) => new Request(u))),
    delete: vi.fn(async (req: Request) => store.delete(req.url)),
    addAll: vi.fn(async () => undefined)
  };
  const fetchMock = vi.fn(async () => {
    const res = new Response("body", { status: 200 });
    Object.defineProperty(res, "type", { value: "basic" });
    return res;
  });
  const context = {
    self: {
      location: { origin: "https://www.genscore.es" },
      addEventListener: (name: string, fn: Listener) => (listeners[name] = fn),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() }
    },
    caches: { open: vi.fn(async () => cache), keys: vi.fn(async () => []), match: vi.fn(async () => new Response("offline")), delete: vi.fn() },
    fetch: fetchMock,
    URL,
    Request,
    Response,
    Promise
  };
  vm.runInNewContext(readFileSync(join(__dirname, "..", "public", "sw.js"), "utf8"), context);

  function dispatch(url: string, init: { mode?: string; method?: string } = {}) {
    let responded: Promise<Response> | null = null;
    const request = { url, method: init.method ?? "GET", mode: init.mode ?? "cors" };
    listeners.fetch({ request, respondWith: (p: Promise<Response>) => (responded = p) });
    return responded as Promise<Response> | null;
  }
  return { dispatch, cache, fetchMock };
}

describe("service worker de la app", () => {
  it("guarda lo estático con hash, los iconos y la marca, y lo sirve de la caché la segunda vez", async () => {
    const { dispatch, fetchMock, cache } = loadWorker();
    for (const path of ["/_next/static/chunks/app-abc123.js", "/_next/static/media/figtree.woff2", "/icons/icon-192.png", "/brand/logo.svg"]) {
      const url = `https://www.genscore.es${path}`;
      const first = dispatch(url);
      expect(first, path).not.toBeNull();
      await first;
    }
    expect(cache.put).toHaveBeenCalledTimes(4);
    fetchMock.mockClear();
    const again = dispatch("https://www.genscore.es/_next/static/chunks/app-abc123.js");
    await again;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nunca intercepta páginas de la consola, la API ni las cargas de datos", () => {
    const { dispatch } = loadWorker();
    for (const path of [
      "/dashboard/projects/p1",
      "/dashboard/projects/p1?_rsc=abc",
      "/api/me",
      "/_next/image?url=%2Fx.png&w=64",
      "/_next/static/chunks/app.js?v=1",
      "/login"
    ]) {
      expect(dispatch(`https://www.genscore.es${path}`), path).toBeNull();
    }
    expect(dispatch("https://cdn.otro.com/_next/static/x.js")).toBeNull();
    expect(dispatch("https://www.genscore.es/_next/static/x.js", { method: "POST" })).toBeNull();
  });

  it("una navegación va a la red y, sin red, enseña la pantalla sin conexión sin guardar la página", async () => {
    const { dispatch, fetchMock, cache } = loadWorker();
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    const res = await dispatch("https://www.genscore.es/dashboard", { mode: "navigate" });
    expect(await res!.text()).toBe("offline");
    expect(cache.put).not.toHaveBeenCalled();
  });
});
