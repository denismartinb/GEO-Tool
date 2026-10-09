import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

/**
 * GEO-SELF-1 Fase 1. `/precios` es como el equipo, la documentación y
 * cualquiera que escriba en castellano llaman a la página de precios; la ruta
 * real es `/pricing`. Sin la redirección, esa URL es un 404.
 */
describe("next.config redirects", () => {
  it("/precios redirige permanentemente a /pricing", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toContainEqual({ source: "/precios", destination: "/pricing", permanent: true });
  });
});
