import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORDPRESS_PLUGIN_URL } from "./wordpress-plugin";

const MDX = readFileSync(join(process.cwd(), "app/blog/plugin-de-wordpress-de-genscore/page.mdx"), "utf8");
const README = readFileSync(join(process.cwd(), "docs/wordpress-plugin/genscore/readme.txt"), "utf8");

describe("WP-LAUNCH-1: el artículo del plugin dice lo que hace el plugin", () => {
  it("el enlace de instalación es la ficha del plugin en WordPress.org", () => {
    expect(WORDPRESS_PLUGIN_URL).toBe("https://wordpress.org/plugins/genscore/");
  });

  it("el artículo enlaza la ficha por la constante, nunca a mano", () => {
    expect(MDX).toContain("WORDPRESS_PLUGIN_URL");
    expect(MDX).not.toMatch(/wordpress\.org\/plugins/);
  });

  it("lo que se busca en el directorio es el slug de la ficha", () => {
    const slug = WORDPRESS_PLUGIN_URL.split("/").filter(Boolean).pop();
    expect(slug).toBe("genscore");
    expect(MDX).toContain("busca «GenScore»");
  });

  it("los motores de los interruptores del artículo son los del plugin", () => {
    // readme: "AI crawler switches ... for OpenAI, Anthropic, Perplexity, Google-Extended and Meta".
    for (const token of ["OpenAI", "Anthropic", "Perplexity", "Google-Extended", "Meta"]) {
      expect(README).toContain(token);
    }
    expect(MDX).toContain("ChatGPT, Claude, Perplexity, Gemini y Meta");
  });

  it("el artículo no promete que el plugin escriba con IA ni que publique solo", () => {
    expect(README).toMatch(/does not use AI to write anything/);
    expect(README).toMatch(/Drafts are never published by the plugin/);
    expect(MDX).toContain("no usa IA para escribir");
    expect(MDX).toContain("nunca los publica");
  });
});
