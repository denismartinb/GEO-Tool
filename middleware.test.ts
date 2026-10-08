import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/active-project-cookie";

/**
 * PRELAUNCH-HARDENING-1 Fase Q4 — el middleware.
 *
 * Lo más importante de este fichero es lo que **no** hace: no es una puerta.
 * Su propio comentario lo dice —«This middleware does not gate access — its
 * result is discarded»— y sin embargo es exactamente el sitio donde alguien
 * añadiría un control de acceso creyendo que ayuda. Los tests fijan las dos
 * mitades: que refresca la sesión, y que **no bloquea nada** aunque no haya
 * usuario. Confundir lo segundo movería la autorización real
 * (`requireUser`, las rutas de API) a un sitio que además corre en cada
 * petición.
 */

const getClaims = vi.fn(async () => ({ data: null }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, _opts: unknown) => ({ auth: { getClaims } })
}));

import { config, middleware } from "./middleware";

const PROJECT_ID = "44444444-4444-4444-4444-444444444444";

function request(pathname: string) {
  return new NextRequest(new Request(`https://genscore.es${pathname}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  // The pre-existing suites below test the NORMAL (production) behaviour. On this preview-only branch every
  // other environment is locked (PREVIEW-LOCKDOWN-1): see the lockdown describe at the end.
  process.env.VERCEL_ENV = "production";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
});

describe("middleware · refresco de sesión", () => {
  it("dispara el refresco en cada petición", async () => {
    await middleware(request("/dashboard"));
    expect(getClaims).toHaveBeenCalledTimes(1);
  });

  /**
   * **No es una puerta.** Sin sesión responde igual: `NextResponse.next()`, no
   * un redirect ni un 401. Quien autoriza es `requireUser()` en cada pantalla y
   * el secreto compartido en cada ruta interna. Si este test empieza a fallar
   * porque alguien metió aquí un control de acceso, la pregunta no es cómo
   * arreglar el test.
   */
  it("no bloquea ni redirige aunque no haya sesión", async () => {
    getClaims.mockResolvedValue({ data: null });

    const response = await middleware(request("/dashboard/projects"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("middleware · cookie del proyecto activo", () => {
  it("recuerda el proyecto cuando la ruta lleva uno", async () => {
    const response = await middleware(request(`/dashboard/projects/${PROJECT_ID}/competitors`));
    const cookie = response.cookies.get(ACTIVE_PROJECT_COOKIE);

    expect(cookie?.value).toBe(PROJECT_ID);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
  });

  it("no la escribe en rutas sin proyecto", async () => {
    for (const path of ["/dashboard", "/dashboard/domains", "/blog", "/"]) {
      const response = await middleware(request(path));
      expect(response.cookies.get(ACTIVE_PROJECT_COOKIE), path).toBeUndefined();
    }
  });

  /**
   * Un segmento que no es un uuid no se guarda. La cookie no es autorización
   * —donde se lee se re-comprueba la propiedad con RLS— pero escribir basura
   * ahí sólo produce fallos raros aguas abajo.
   */
  it("ignora un segmento que no es un uuid", async () => {
    const response = await middleware(request("/dashboard/projects/new"));
    expect(response.cookies.get(ACTIVE_PROJECT_COOKIE)).toBeUndefined();
  });

  /**
   * DOMAINS-LIVE-SELECT-1 — seleccionar una tarjeta en /dashboard/domains no
   * navega (decisión del fundador, 2026-08-05), así que nunca casa con el
   * regex de ruta de arriba. Sin esta segunda rama la cookie se quedaba con
   * el proyecto anterior y el resto de la consola no se enteraba de la
   * selección hasta entrar de verdad al proyecto.
   */
  it("recuerda el proyecto cuando /dashboard/domains lleva ?active=", async () => {
    const response = await middleware(request(`/dashboard/domains?active=${PROJECT_ID}`));
    expect(response.cookies.get(ACTIVE_PROJECT_COOKIE)?.value).toBe(PROJECT_ID);
  });

  it("ignora un ?active= que no es un uuid", async () => {
    const response = await middleware(request("/dashboard/domains?active=not-a-uuid"));
    expect(response.cookies.get(ACTIVE_PROJECT_COOKIE)).toBeUndefined();
  });
});

describe("middleware · alcance", () => {
  /**
   * El matcher excluye estáticos. Sin eso, este middleware —que abre un cliente
   * de Supabase y hace una comprobación de JWT— correría en cada imagen y cada
   * bundle de la página.
   */
  it("no corre sobre estáticos ni imágenes", () => {
    // Next ancla sus matchers; sin `^...$` el patrón casa en cualquier punto
    // de la ruta y las exclusiones parecen no funcionar.
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    // PREVIEW-LOCKDOWN-1: only Next's immutable output stays excluded; favicon and images now pass through the lock.
    for (const excluded of ["/_next/static/chunks/main.js", "/_next/image"]) {
      expect(matcher.test(excluded), excluded).toBe(false);
    }
  });

  it("sí corre sobre las pantallas de producto", () => {
    // Next ancla sus matchers; sin `^...$` el patrón casa en cualquier punto
    // de la ruta y las exclusiones parecen no funcionar.
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    for (const included of ["/", "/dashboard", `/dashboard/projects/${PROJECT_ID}`, "/blog", "/pricing"]) {
      expect(matcher.test(included), included).toBe(true);
    }
  });
});

describe("PREVIEW-LOCKDOWN-1 · middleware en una vista previa (rama preview/contract-99-ui, nunca se fusiona)", () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = "preview";
  });

  const req = (path: string, init?: RequestInit) => new NextRequest(new Request(`https://preview.example${path}`, init));

  it("una ruta bloqueada NO crea el cliente de Supabase ni llama a nada: responde 403 antes", async () => {
    for (const path of ["/dashboard", "/api/me", "/api/gratis/comprobar", "/login", "/signup", "/auth/callback", "/admin", "/baja"]) {
      const response = await middleware(req(path));
      expect(response.status, path).toBe(403);
    }
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("un POST (toda acción de servidor lo es) se bloquea incluso sobre una página permitida", async () => {
    for (const path of ["/", "/pricing", "/docs/planes-y-limites", "/api/gratis/comprobar"]) {
      expect((await middleware(req(path, { method: "POST" }))).status, path).toBe(403);
    }
    expect((await middleware(req("/", { method: "GET", headers: { "next-action": "abc" } }))).status).toBe(403);
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("sirve las páginas públicas de solo lectura sin tocar Supabase, con CSP y noindex", async () => {
    for (const path of ["/", "/pricing", "/docs/planes-y-limites", "/blog", "/preview/index.html", "/preview/emails/trial-d5.html"]) {
      const response = await middleware(req(path));
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-security-policy"), path).toBe("connect-src 'self'; form-action 'self'");
      expect(response.headers.get("x-robots-tag"), path).toContain("noindex");
      expect(response.headers.get("x-preview-isolation"), path).toBe("locked");
    }
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("el matcher cubre rutas que el de producción dejaba fuera, y un segmento dinámico acabado en .png no se escapa", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ["/api/gratis/comprobar", "/docs/x", "/comparativas/y", "/api/algo/cualquiera.png", "/robots.txt", "/favicon.ico"]) {
      expect(matcher.test(path), path).toBe(true);
    }
  });

  it("en producción NO bloquea nada (el bloqueo es solo para entornos que no son producción)", async () => {
    process.env.VERCEL_ENV = "production";
    expect((await middleware(req("/dashboard"))).status).toBe(200);
    expect(getClaims).toHaveBeenCalledTimes(1);
  });
});

