import { afterEach, describe, expect, it, vi } from "vitest";

const fetchFavicon = vi.hoisted(() => vi.fn());

vi.mock("@/lib/domains/favicon-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domains/favicon-source")>()),
  fetchFavicon
}));

import { GET } from "./route";

function call(query: string) {
  return GET(new Request(`https://genscore.es/api/favicon?${query}`));
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/favicon", () => {
  it("devuelve el icono con caché larga cuando hay uno real", async () => {
    fetchFavicon.mockResolvedValue({
      kind: "icon",
      body: new Uint8Array([1, 2, 3]).buffer,
      contentType: "image/png"
    });

    const res = await call("domain=mahou.es&sz=64");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("s-maxage=604800");
  });

  it("devuelve 204 y NO 404 cuando no hay icono", async () => {
    // Regresión de un PILOT FAIL real (2026-08-06): con 404, el piloto marcaba
    // Dominios como pantalla rota por alberdiderma.es, y detrás habrían venido
    // la consola del navegador y Sentry. Un dominio sin favicon no es un error.
    fetchFavicon.mockResolvedValue({ kind: "generic" });

    const res = await call("domain=alberdiderma.es&sz=64");

    expect(res.status).toBe(204);
    expect(res.status).toBeLessThan(400);
  });

  it("un fallo transitorio también es 204, pero se cachea un minuto", async () => {
    fetchFavicon.mockResolvedValue({ kind: "unavailable" });

    const res = await call("domain=mahou.es&sz=64");

    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it("un dominio sin icono se cachea un día, no un minuto ni una semana", async () => {
    fetchFavicon.mockResolvedValue({ kind: "generic" });

    const res = await call("domain=alberdiderma.es&sz=64");

    expect(res.headers.get("cache-control")).toContain("s-maxage=86400");
  });

  it("rechaza lo que no es un dominio sin gastar una llamada", async () => {
    const res = await call("domain=" + encodeURIComponent("https://evil.com/x"));

    expect(res.status).toBe(204);
    expect(fetchFavicon).not.toHaveBeenCalled();
  });

  it("normaliza www y mayúsculas, y ajusta el tamaño al que sirve S2", async () => {
    fetchFavicon.mockResolvedValue({ kind: "generic" });

    await call("domain=WWW.Mahou.ES&sz=100");

    expect(fetchFavicon).toHaveBeenCalledWith("mahou.es", 128);
  });

  it("sobrevive a que falte el tamaño", async () => {
    fetchFavicon.mockResolvedValue({ kind: "generic" });

    await call("domain=mahou.es");

    expect(fetchFavicon).toHaveBeenCalledWith("mahou.es", 64);
  });
});
