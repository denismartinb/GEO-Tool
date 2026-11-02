import { describe, expect, it } from "vitest";
import { aiViewHeadline, aiViewLlmsLines, buildAiView, mdUrl } from "./ai-view";
import { checkCitability, detectPlatform, isJsThin } from "./page-checks";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";

const page = (url: string, citability: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}): PageAuditEntry =>
  ({
    url,
    contextLabel: "",
    status: "analyzed",
    check: { citability, answerFormat: { h1Count: 1, h2Count: 2 }, structuredData: { pass: true, matchedTypes: ["Organization"] }, ...extra },
    fetchMs: 1,
    htmlBytes: 1
  }) as unknown as PageAuditEntry;

describe("buildAiView (AI-VIEW-CONSOLE-1, log §448)", () => {
  it("classifies each page from what the HTML proves", () => {
    const v = buildAiView([
      page("https://acme.com/", { wordCount: 640, jsShell: false, jsThin: false, platform: "wordpress" }),
      page("https://acme.com/precios", { wordCount: 18, jsShell: true, platform: "wordpress" }),
      page("https://acme.com/autonomos", { wordCount: 96, jsShell: false, jsThin: true, platform: null })
    ])!;
    expect(v.pages.map((p) => p.state)).toEqual(["ok", "empty", "thin"]);
    expect(v).toMatchObject({ total: 3, ok: 1, platform: "wordpress" });
    expect(v.bad.map((p) => p.path)).toEqual(["/precios", "/autonomos"]);
  });

  it("never declares clean a page measured before the check, nor a failed fetch", () => {
    expect(buildAiView([page("https://acme.com/", { wordCount: 640 })])).toBeNull();
    expect(buildAiView([{ url: "https://acme.com/x", contextLabel: "", status: "blocked", check: null, fetchMs: null, htmlBytes: null } as unknown as PageAuditEntry])).toBeNull();
  });

  it("counts a page once even when the audit saw it twice", () => {
    const c = { wordCount: 640, jsShell: false };
    expect(buildAiView([page("https://acme.com/a", c), page("https://acme.com/a?x=1", c)])!.total).toBe(1);
  });

  it("uses Denis's wording under the figure", () => {
    const v = buildAiView([
      page("https://acme.com/", { wordCount: 640, jsShell: false }),
      page("https://acme.com/precios", { wordCount: 18, jsShell: true })
    ])!;
    expect(aiViewHeadline(v)).toBe(
      "páginas llegan completas a los bots de IA. En la otra, el contenido importante no está en el HTML, por tanto ChatGPT, Claude y Perplexity no pueden leerlo debido a que no ejecutan JavaScript."
    );
    expect(aiViewHeadline(v)).not.toMatch(/—/);
  });

  it("points llms.txt to the Markdown version of the affected pages", () => {
    const v = buildAiView([page("https://acme.com/precios/", { wordCount: 18, jsShell: true }), page("https://acme.com/", { wordCount: 9, jsShell: true })])!;
    expect(aiViewLlmsLines(v)).toBe("## Páginas clave en Markdown\n- [/precios/](https://acme.com/precios.md)\n- [Portada](https://acme.com/index.md)");
    expect(mdUrl("https://acme.com:8080/a/b")).toBe("https://acme.com:8080/a/b.md");
  });
});

describe("isJsThin and detectPlatform (log §448)", () => {
  it("flags a short page that a framework hydrates, not a short plain page", () => {
    expect(isJsThin('<div id="__next"><h1>Hola</h1></div><script id="__NEXT_DATA__">{}</script>', 3)).toBe(true);
    expect(isJsThin("<main><h1>Contacto</h1><p>Escríbenos.</p></main>", 3)).toBe(false);
  });

  it("flags a framework state that holds far more text than the HTML shows", () => {
    const words = Array.from({ length: 260 }, (_, i) => `palabra${i}`).join(" ");
    const html = `<main><h1>Planes</h1>${"<p>texto corto de la página</p>".repeat(40)}</main><script type="application/json">{"body":"${words}"}</script>`;
    expect(isJsThin(html, 100)).toBe(true);
    expect(isJsThin(html, 400)).toBe(false);
  });

  it("does not mark a server-rendered page as thin", () => {
    const html = `<main>${"<p>Un texto real servido en el HTML de la página.</p>".repeat(40)}</main>`;
    expect(checkCitability(html)).toMatchObject({ jsShell: false, jsThin: false, platform: null });
  });

  it("reads the platform from the HTML", () => {
    expect(detectPlatform('<link href="/wp-content/themes/x/style.css">')).toBe("wordpress");
    expect(detectPlatform('<script src="https://cdn.shopify.com/s/x.js">')).toBe("shopify");
    expect(detectPlatform('<script src="/_next/static/chunks/main.js">')).toBe("next");
    expect(detectPlatform("<p>Hola</p>")).toBeNull();
  });
});
