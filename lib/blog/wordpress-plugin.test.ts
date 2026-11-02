import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORDPRESS_PLUGIN_URL } from "./wordpress-plugin";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MDX = read("app/blog/genscore-para-wordpress/page.mdx");
const PLUGIN = "docs/wordpress-plugin/genscore";

describe("WP-LAUNCH-1: el artículo del plugin dice lo que hace el plugin", () => {
  it("el enlace de instalación es una ficha del directorio de WordPress.org", () => {
    expect(WORDPRESS_PLUGIN_URL).toMatch(/^https:\/\/wordpress\.org\/plugins\/[a-z0-9-]+\/$/);
  });

  it("el artículo enlaza el directorio por la constante, nunca a mano", () => {
    expect(MDX).toContain("WORDPRESS_PLUGIN_URL");
    expect(MDX).not.toMatch(/wordpress\.org\/plugins/);
  });

  it("lo que se busca en «Añadir nuevo» es el nombre del plugin", () => {
    const name = /Plugin Name:\s*(.+)/.exec(read(`${PLUGIN}/genscore.php`))?.[1]?.trim() ?? "";
    expect(name.startsWith("GenScore")).toBe(true);
    expect(MDX).toContain("busca «GenScore»");
  });

  it("«Crear borrador» nunca publica: el plugin crea el post como borrador", () => {
    expect(MDX).toContain("nunca lo publica");
    expect(read(`${PLUGIN}/includes/drafts.php`)).toMatch(/'post_status'\s*=>\s*'draft'/);
  });

  it("cada arreglo pide confirmación y se puede deshacer", () => {
    const js = read(`${PLUGIN}/assets/admin.js`);
    expect(js).toContain("¿Publicar en ");
    expect(js).toContain("Deshacer");
    expect(MDX).toContain("Deshacer");
  });

  it("sin cuenta no llama a genscore.es: todas las llamadas viven en account.php", () => {
    const remote = /wp_remote_(get|post|request)\s*\(/;
    const files = readdirSync(join(process.cwd(), PLUGIN, "includes")).filter((f) => f.endsWith(".php") && f !== "account.php");
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      expect(read(`${PLUGIN}/includes/${f}`), f).not.toMatch(remote);
    }
    expect(MDX.toLowerCase()).toContain("sin cuenta, el plugin no envía nada");
  });
});
