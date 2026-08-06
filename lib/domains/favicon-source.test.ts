import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFavicon, isPlausibleDomain, resetSentinelCache } from "./favicon-source";

const GLOBE = new Uint8Array([1, 2, 3, 4]).buffer;
const REAL = new Uint8Array([9, 9, 9, 9]).buffer;

function res(body: ArrayBuffer, ok = true) {
  return {
    ok,
    headers: { get: () => null },
    arrayBuffer: async () => body
  } as unknown as Response;
}

/** Responde según el dominio pedido, que es lo que distingue el centinela. */
function mockFetch(byDomain: (domain: string) => Response | Promise<Response>) {
  return vi.fn((url: string | URL) => {
    const domain = new URL(String(url)).searchParams.get("domain") ?? "";
    return Promise.resolve(byDomain(domain));
  });
}

beforeEach(() => {
  resetSentinelCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchFavicon", () => {
  it("reconoce el comodín comparándolo con el centinela, sin hash incrustado", () => {
    // El dominio .invalid no puede existir, así que lo que devuelva S2 para él
    // ES el comodín, sea cual sea el dibujo de hoy.
    vi.stubGlobal("fetch", mockFetch(() => res(GLOBE)));
    return expect(fetchFavicon("alberdiderma.es", 64)).resolves.toEqual({ kind: "generic" });
  });

  it("deja pasar un icono que no coincide con el comodín", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((domain) => res(domain.endsWith(".invalid") ? GLOBE : REAL))
    );
    const result = await fetchFavicon("mahou.es", 64);
    expect(result.kind).toBe("icon");
  });

  it("falla abierto: sin calibración sirve el icono en vez de esconderlo", async () => {
    // Esconder la marca real de un competidor es información perdida; enseñar
    // un globo de más sólo es feo.
    vi.stubGlobal(
      "fetch",
      mockFetch((domain) => res(REAL, !domain.endsWith(".invalid")))
    );
    const result = await fetchFavicon("mahou.es", 64);
    expect(result.kind).toBe("icon");
  });

  it("es 'unavailable' cuando el propio icono no se puede traer", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((domain) => res(GLOBE, domain.endsWith(".invalid")))
    );
    await expect(fetchFavicon("mahou.es", 64)).resolves.toEqual({ kind: "unavailable" });
  });

  it("trata un cuerpo vacío como no disponible, no como icono", async () => {
    vi.stubGlobal("fetch", mockFetch(() => res(new ArrayBuffer(0))));
    await expect(fetchFavicon("mahou.es", 64)).resolves.toEqual({ kind: "unavailable" });
  });

  it("no dispara una calibración por petición: el centinela se comparte", async () => {
    const fetchMock = mockFetch((domain) => res(domain.endsWith(".invalid") ? GLOBE : REAL));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      fetchFavicon("a.es", 64),
      fetchFavicon("b.es", 64),
      fetchFavicon("c.es", 64)
    ]);

    const sentinelCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes(".invalid")
    );
    expect(sentinelCalls).toHaveLength(1);
  });

  it("calibra por tamaño: el comodín no es el mismo dibujo a 32 que a 256", async () => {
    const fetchMock = mockFetch((domain) => res(domain.endsWith(".invalid") ? GLOBE : REAL));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFavicon("a.es", 32);
    await fetchFavicon("a.es", 256);

    const sentinelCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes(".invalid")
    );
    expect(sentinelCalls).toHaveLength(2);
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
});
