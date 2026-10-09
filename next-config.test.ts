import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

/**
 * GEO-SELF-1 Fase 1 (log §252). La página de precios vive en `/precios`
 * (decisión del fundador, 2026-10-09): es la URL canónica y la que enlazan el
 * menú y todo el sitio. `/pricing`, su ruta antigua, redirige con 308 para que
 * enlaces viejos, buscadores y respuestas de IA sigan llegando.
 */
describe("next.config redirects", () => {
  it("/pricing redirige permanentemente a /precios", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toContainEqual({ source: "/pricing", destination: "/precios", permanent: true });
    expect(redirects).toContainEqual({
      source: "/pricing/:path*",
      destination: "/precios/:path*",
      permanent: true
    });
  });

  it("conserva la query string (p. ej. ?openPlan=pro): ninguna regla la descarta", async () => {
    // Next.js pasa la query de la petición al destino por defecto; sólo se
    // pierde si el destino declara su propia query o si la regla usa `has`
    // para reescribirla. Ninguna de las dos cosas debe aparecer aquí.
    const redirects = (await nextConfig.redirects?.()) ?? [];
    for (const r of redirects.filter((r) => r.source.startsWith("/pricing"))) {
      expect(r.destination).not.toContain("?");
      expect("has" in r).toBe(false);
    }
  });

  it("/precios no redirige a ningún sitio (es la ruta real)", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects.some((r) => r.source === "/precios" || r.source.startsWith("/precios/"))).toBe(false);
  });
});
