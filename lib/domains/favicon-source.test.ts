import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFavicon, isPlausibleDomain, resetSentinelCache } from "./favicon-source";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
const { lookup } = await import("node:dns/promises");
const lookupMock = vi.mocked(lookup);

/** Firma PNG válida + relleno: lo que `rasterImageType` acepta. */
function png(tag: number): ArrayBuffer {
  const out = new Uint8Array(16);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  out[15] = tag; // distingue un PNG de otro sin cambiar la firma
  return out.buffer;
}

const GLOBE = png(1);
const S2_REAL = png(2);
const SITE_ICON = png(3);
const NOT_AN_IMAGE = new TextEncoder().encode("<!DOCTYPE html><html>404 nope").buffer;

function res(body: ArrayBuffer, init: { ok?: boolean; status?: number; type?: string; location?: string } = {}) {
  const headers = new Map<string, string>();
  headers.set("content-type", init.type ?? "image/png");
  if (init.location) headers.set("location", init.location);
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    arrayBuffer: async () => body
  } as unknown as Response;
}

/** El sitio no tiene apple-touch-icon: 404 en las dos rutas. */
const NO_SITE_ICON = () => res(new ArrayBuffer(0), { ok: false, status: 404 });

/**
 * Enruta por URL: las de S2 llevan `?domain=`, las del sitio son
 * `https://<dominio>/apple-touch-icon*`.
 */
function mockFetch(handlers: { site?: (url: string) => Response; s2?: (domain: string) => Response }) {
  return vi.fn((url: string | URL) => {
    const str = String(url);
    if (str.includes("/s2/favicons")) {
      const domain = new URL(str).searchParams.get("domain") ?? "";
      return Promise.resolve((handlers.s2 ?? (() => res(GLOBE)))(domain));
    }
    return Promise.resolve((handlers.site ?? NO_SITE_ICON)(str));
  });
}

beforeEach(() => {
  resetSentinelCache();
  // Por defecto todo dominio resuelve a una IP pública.
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("fetchFavicon — 3b, el icono del propio sitio", () => {
  it("prefiere el apple-touch-icon del sitio sobre lo que tenga Google", async () => {
    // El caso mahou.es entero: Google tiene un icono real pero cutre, y el
    // sitio publica uno de 180 px. Gana el del sitio.
    vi.stubGlobal(
      "fetch",
      mockFetch({ site: () => res(SITE_ICON), s2: () => res(S2_REAL) })
    );

    const result = await fetchFavicon("mahou.es", 64);

    expect(result.kind).toBe("icon");
    if (result.kind === "icon") expect(new Uint8Array(result.body)[15]).toBe(3);
  });

  it("cae a Google cuando el sitio no publica icono", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ site: NO_SITE_ICON, s2: (d) => res(d.endsWith(".invalid") ? GLOBE : S2_REAL) })
    );

    const result = await fetchFavicon("mahou.es", 64);

    expect(result.kind).toBe("icon");
    if (result.kind === "icon") expect(new Uint8Array(result.body)[15]).toBe(2);
  });

  it("rechaza HTML disfrazado de imagen y cae a Google", async () => {
    // Un servidor puede responder Content-Type: image/png con una página de
    // error dentro. La cabecera la escribe él; la firma no.
    vi.stubGlobal(
      "fetch",
      mockFetch({
        site: () => res(NOT_AN_IMAGE, { type: "image/png" }),
        s2: (d) => res(d.endsWith(".invalid") ? GLOBE : S2_REAL)
      })
    );

    const result = await fetchFavicon("mahou.es", 64);

    expect(result.kind).toBe("icon");
    if (result.kind === "icon") expect(new Uint8Array(result.body)[15]).toBe(2);
  });

  it("sigue una redirección al www del propio sitio", async () => {
    // Casi todo dominio raíz redirige a www: sin seguir saltos, la 3b no
    // serviría de nada justo en los casos para los que existe.
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch({
        site: (url) => {
          seen.push(url);
          return url.includes("www.")
            ? res(SITE_ICON)
            : res(new ArrayBuffer(0), { status: 301, location: "https://www.mahou.es/apple-touch-icon.png" });
        }
      })
    );

    const result = await fetchFavicon("mahou.es", 64);

    expect(result.kind).toBe("icon");
    expect(seen.some((u) => u.includes("www."))).toBe(true);
  });

  it("NO sigue una redirección hacia una IP interna", async () => {
    // El agujero que `redirect: "follow"` dejaría abierto: host público de
    // entrada, destino interno tras el salto.
    lookupMock.mockImplementation((async (host: string) =>
      host === "metadata.evil.com"
        ? [{ address: "169.254.169.254", family: 4 }]
        : [{ address: "93.184.216.34", family: 4 }]) as never);

    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch({
        site: (url) => {
          fetched.push(url);
          return res(new ArrayBuffer(0), { status: 302, location: "https://metadata.evil.com/x.png" });
        },
        s2: (d) => res(d.endsWith(".invalid") ? GLOBE : S2_REAL)
      })
    );

    const result = await fetchFavicon("mahou.es", 64);

    expect(fetched.some((u) => u.includes("metadata.evil.com"))).toBe(false);
    expect(result.kind).toBe("icon");
    if (result.kind === "icon") expect(new Uint8Array(result.body)[15]).toBe(2);
  });

  it("no pide nada al sitio si el dominio resuelve a una IP interna", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }] as never);

    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch({
        site: (url) => {
          fetched.push(url);
          return res(SITE_ICON);
        },
        s2: (d) => res(d.endsWith(".invalid") ? GLOBE : S2_REAL)
      })
    );

    await fetchFavicon("interno.evil.com", 64);

    expect(fetched).toHaveLength(0);
  });

  it("no intenta la segunda ruta si el presupuesto ya se gastó", async () => {
    // El presupuesto es total, no por llamada: dos rutas por cuatro saltos con
    // 5 s cada uno serían 40 s antes siquiera de preguntarle a Google.
    const realNow = Date.now;
    let clock = realNow();
    vi.spyOn(Date, "now").mockImplementation(() => clock);

    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch({
        site: (url) => {
          fetched.push(url);
          clock += 4_000; // la primera ruta se come el presupuesto entero
          return res(new ArrayBuffer(0), { ok: false, status: 404 });
        },
        s2: (d) => res(d.endsWith(".invalid") ? GLOBE : S2_REAL)
      })
    );

    const result = await fetchFavicon("lento.es", 64);

    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toContain("/apple-touch-icon.png");
    expect(result.kind).toBe("icon"); // cayó a S2, no se quedó sin nada
  });

  it("devuelve el tipo derivado de los bytes, no el que declare el servidor", async () => {
    const jpeg = new Uint8Array(16);
    jpeg.set([0xff, 0xd8, 0xff]);
    vi.stubGlobal("fetch", mockFetch({ site: () => res(jpeg.buffer, { type: "image/png" }) }));

    const result = await fetchFavicon("mahou.es", 64);

    expect(result.kind).toBe("icon");
    if (result.kind === "icon") expect(result.contentType).toBe("image/jpeg");
  });
});

describe("fetchFavicon — 3a, el comodín de Google", () => {
  it("reconoce el comodín comparándolo con el centinela, sin hash incrustado", async () => {
    vi.stubGlobal("fetch", mockFetch({ s2: () => res(GLOBE) }));
    await expect(fetchFavicon("alberdiderma.es", 64)).resolves.toEqual({ kind: "generic" });
  });

  it("deja pasar un icono que no coincide con el comodín", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ s2: (d) => res(d.endsWith(".invalid") ? GLOBE : S2_REAL) })
    );
    const result = await fetchFavicon("mahou.es", 64);
    expect(result.kind).toBe("icon");
  });

  it("falla abierto: sin calibración sirve el icono en vez de esconderlo", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        s2: (d) => (d.endsWith(".invalid") ? res(new ArrayBuffer(0), { ok: false }) : res(S2_REAL))
      })
    );
    const result = await fetchFavicon("mahou.es", 64);
    expect(result.kind).toBe("icon");
  });

  it("es 'unavailable' cuando el propio icono no se puede traer", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        s2: (d) => (d.endsWith(".invalid") ? res(GLOBE) : res(new ArrayBuffer(0), { ok: false }))
      })
    );
    await expect(fetchFavicon("mahou.es", 64)).resolves.toEqual({ kind: "unavailable" });
  });

  it("trata un cuerpo vacío como no disponible, no como icono", async () => {
    vi.stubGlobal("fetch", mockFetch({ s2: () => res(new ArrayBuffer(0)) }));
    await expect(fetchFavicon("mahou.es", 64)).resolves.toEqual({ kind: "unavailable" });
  });

  it("no dispara una calibración por petición: el centinela se comparte", async () => {
    const fetchMock = mockFetch({ s2: (d) => res(d.endsWith(".invalid") ? GLOBE : S2_REAL) });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([fetchFavicon("a.es", 64), fetchFavicon("b.es", 64), fetchFavicon("c.es", 64)]);

    const sentinelCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes(".invalid"));
    expect(sentinelCalls).toHaveLength(1);
  });

  it("calibra por tamaño: el comodín no es el mismo dibujo a 32 que a 256", async () => {
    const fetchMock = mockFetch({ s2: (d) => res(d.endsWith(".invalid") ? GLOBE : S2_REAL) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchFavicon("a.es", 32);
    await fetchFavicon("a.es", 256);

    const sentinelCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes(".invalid"));
    expect(sentinelCalls).toHaveLength(2);
  });

  it("no cachea una calibración fallida: la reintenta en la siguiente petición", async () => {
    // Cachear el fallo dejaría la instancia en fallo-abierto PERMANENTE y en
    // silencio para ese tamaño: un corte de un segundo y, mientras la función
    // siga caliente, todo globo se serviría como si fuera una marca.
    let sentinelOk = false;
    const fetchMock = mockFetch({
      s2: (d) => {
        if (!d.endsWith(".invalid")) return res(GLOBE);
        return sentinelOk ? res(GLOBE) : res(new ArrayBuffer(0), { ok: false });
      }
    });
    vi.stubGlobal("fetch", fetchMock);

    // Primera pasada: la calibración falla, así que falla abierto.
    const first = await fetchFavicon("alberdiderma.es", 64);
    expect(first.kind).toBe("icon");

    // Segunda pasada, ya con calibración: debe reconocer el comodín.
    sentinelOk = true;
    const second = await fetchFavicon("alberdiderma.es", 64);
    expect(second.kind).toBe("generic");
  });

  it("sobrevive a que la red se caiga entera", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))));
    await expect(fetchFavicon("mahou.es", 64)).resolves.toEqual({ kind: "unavailable" });
  });
});

describe("isPlausibleDomain", () => {
  it("acepta dominios normales", () => {
    expect(isPlausibleDomain("mahou.es")).toBe(true);
    expect(isPlausibleDomain("sub.dominio.co.uk")).toBe(true);
    expect(isPlausibleDomain("xn--maho-0ra.es")).toBe(true);
  });

  it("rechaza lo que no es un dominio", () => {
    expect(isPlausibleDomain("")).toBe(false);
    expect(isPlausibleDomain("sinpunto")).toBe(false);
    expect(isPlausibleDomain("https://mahou.es")).toBe(false);
    expect(isPlausibleDomain("mahou.es/algo")).toBe(false);
    expect(isPlausibleDomain("mahou .es")).toBe(false);
    expect(isPlausibleDomain("-mahou.es")).toBe(false);
    expect(isPlausibleDomain(`${"a".repeat(254)}.es`)).toBe(false);
  });

  it("rechaza una ruta inyectada tras el dominio", () => {
    // Desde la 3b este valor acaba dentro de una URL a la que pedimos de
    // verdad, así que dejar pasar una barra sería dejar elegir la ruta.
    expect(isPlausibleDomain("mahou.es/../../admin")).toBe(false);
    expect(isPlausibleDomain("mahou.es@evil.com")).toBe(false);
    expect(isPlausibleDomain("mahou.es:8080")).toBe(false);
  });
});
