import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHROME_WEB_STORE_URL } from "./chrome-extension";

const MDX = readFileSync(
  join(process.cwd(), "app/blog/extension-de-chrome-de-genscore/page.mdx"),
  "utf8"
);
const MANIFEST = JSON.parse(
  readFileSync(join(process.cwd(), "docs/chrome-extension/prueba/extension/manifest.json"), "utf8")
) as { name: string; commands: { _execute_action: { suggested_key: { default: string } } } };

describe("EXT-LAUNCH-1: el artículo de la extensión dice lo que hace la extensión", () => {
  it("el enlace de instalación es una ficha de la Chrome Web Store", () => {
    expect(CHROME_WEB_STORE_URL).toMatch(/^https:\/\/chromewebstore\.google\.com\/detail\/[^/]+\/[a-p]{32}$/);
  });

  it("el artículo enlaza la tienda por la constante, nunca a mano", () => {
    expect(MDX).toContain("CHROME_WEB_STORE_URL");
    expect(MDX).not.toMatch(/chromewebstore\.google\.com/);
  });

  it("el nombre que se busca en la tienda es el del manifiesto", () => {
    expect(MDX).toContain(MANIFEST.name);
  });

  it("el atajo publicado es el del manifiesto", () => {
    const key = MANIFEST.commands._execute_action.suggested_key.default; // Alt+Shift+G
    expect(key).toBe("Alt+Shift+G");
    expect(MDX).toContain("Alt + Mayús + G");
  });
});

describe("EXT-REACH-1 (log §436): la invitación a valorar del panel", () => {
  it("abre las reseñas de la misma ficha que enlaza el resto del producto", () => {
    const rate = readFileSync(join(process.cwd(), "docs/chrome-extension/prueba/extension/rate.js"), "utf8");
    expect(rate).toContain(`"${CHROME_WEB_STORE_URL}/reviews"`);
  });

  it("el panel carga rate.js antes que panel.js", () => {
    const html = readFileSync(join(process.cwd(), "docs/chrome-extension/prueba/extension/panel.html"), "utf8");
    expect(html.indexOf('src="rate.js"')).toBeGreaterThan(-1);
    expect(html.indexOf('src="rate.js"')).toBeLessThan(html.indexOf('src="panel.js"'));
  });
});
