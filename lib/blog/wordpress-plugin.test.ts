import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORDPRESS_PLUGIN_URL } from "./wordpress-plugin";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MDX = read("app/blog/genscore-para-wordpress/page.mdx");
const PLUGIN = "docs/wordpress-plugin/genscore";
const README = read(`${PLUGIN}/readme.txt`);

describe("WP-LAUNCH-1: el artículo del plugin dice lo que hace el plugin", () => {
  it("el enlace de instalación es la ficha del plugin en WordPress.org", () => {
    expect(WORDPRESS_PLUGIN_URL).toBe("https://wordpress.org/plugins/genscore/");
  });

  it("el artículo enlaza la ficha por la constante, nunca a mano", () => {
    expect(MDX).toContain("WORDPRESS_PLUGIN_URL");
    expect(MDX).not.toMatch(/wordpress\.org\/plugins/);
  });

  it("lo que se busca en «Añadir nuevo» es el nombre del plugin", () => {
    const name = /Plugin Name:\s*(.+)/.exec(read(`${PLUGIN}/genscore.php`))?.[1]?.trim() ?? "";
    expect(name.startsWith("GenScore")).toBe(true);
    expect(MDX).toContain("busca «GenScore»");
  });

  it("los motores de los interruptores del artículo son los del plugin", () => {
    // readme: "AI crawler switches ... for OpenAI, Anthropic, Perplexity, Google-Extended and Meta".
    for (const token of ["OpenAI", "Anthropic", "Perplexity", "Google-Extended", "Meta"]) {
      expect(README).toContain(token);
    }
    expect(MDX).toContain("ChatGPT, Claude, Perplexity, Gemini y Meta");
  });

  it("con un robots.txt físico, el artículo dice lo mismo que el readme", () => {
    expect(README).toMatch(/shows the lines to copy/);
    expect(MDX).toContain("te da las líneas para copiar");
  });

  it("no promete que el plugin escriba con IA", () => {
    expect(README).toMatch(/does not use AI to write anything/);
    expect(MDX).toContain("no usa IA para escribir");
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

  it("la revisión lee como mucho las páginas que dice el artículo", () => {
    expect(read(`${PLUGIN}/includes/pages.php`)).toMatch(/const GENSCORE_KEY_PAGES = 15;/);
    expect(MDX).toContain("hasta quince");
  });
});
