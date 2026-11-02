import { describe, expect, it } from "vitest";
import { aiViewHeadline, buildAiView, importanceInsight, typeInsight } from "./ai-view";
import { checkCitability, detectPlatform, isJsThin } from "./page-checks";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { PageRender } from "./ai-render";

const page = (url: string, citability: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}, more: Partial<PageAuditEntry> = {}): PageAuditEntry =>
  ({
    url,
    contextLabel: "",
    status: "analyzed",
    check: { citability, answerFormat: { h1Count: 1, h2Count: 2 }, structuredData: { pass: true, matchedTypes: ["Organization"] }, ...extra },
    fetchMs: 1,
    htmlBytes: 1,
    ...more
  }) as unknown as PageAuditEntry;

const ok = (pct: number, kinds: Record<string, unknown> = {}, extra: Partial<Extract<PageRender, { state: "ok" }>> = {}): PageRender => ({
  state: "ok",
  measuredAt: "2026-11-02T10:00:00.000Z",
  pct,
  words: 400,
  kinds,
  samples: [],
  ...extra
});

describe("buildAiView without browser measurements (AI-READ-2, log §451)", () => {
  it("gives only the share of pages that arrive complete, never a page list", () => {
    const v = buildAiView([
      page("https://acme.com/", { wordCount: 640, jsShell: false, jsThin: false }),
      page("https://acme.com/precios", { wordCount: 18, jsShell: true }),
      page("https://acme.com/autonomos", { wordCount: 96, jsShell: false, jsThin: true }),
      page("https://acme.com/b", { wordCount: 640, jsShell: false, jsThin: false })
    ])!;
    expect(v).toEqual({ mode: "html", okPct: 50, allOk: false });
    expect(JSON.stringify(v)).not.toMatch(/acme\.com|\/precios/);
  });

  it("never declares clean a page measured before the check, nor a failed fetch", () => {
    expect(buildAiView([page("https://acme.com/", { wordCount: 640 })])).toBeNull();
    expect(buildAiView([{ url: "https://acme.com/x", contextLabel: "", status: "blocked", check: null, fetchMs: null, htmlBytes: null } as unknown as PageAuditEntry])).toBeNull();
  });

  it("speaks in percentages and without long dashes", () => {
    const v = buildAiView([page("https://acme.com/", { wordCount: 640, jsShell: false })])!;
    expect(aiViewHeadline(v)).toMatch(/^de tus páginas llegan completas/);
    expect(aiViewHeadline(v)).not.toMatch(/—/);
  });
});

describe("buildAiView with browser measurements (AI-READ-2, log §451)", () => {
  const c = { wordCount: 640, jsShell: false, jsThin: false };
  it("weights what the AI cites above the rest", () => {
    const v = buildAiView([
      page("https://acme.com/", c, {}, { contextLabel: "portada", render: ok(100) }),
      page("https://acme.com/producto/a", c, {}, { contextLabel: "citada en 3 prompts", render: ok(40) }),
      page("https://acme.com/blog/b", c, {}, { contextLabel: "verificada", render: ok(100) })
    ])!;
    expect(v.mode).toBe("measured");
    if (v.mode !== "measured") return;
    // weights 2, 3, 1.5: (200 + 120 + 150) / 6.5 = 72
    expect(v.pct).toBe(72);
    expect(v.groups[0].title).toBe("Por lo que importa");
    expect(v.groups[0].insight).toBe("Tus páginas más citadas son las que peor lee la IA.");
    expect(v.groups[1]).toMatchObject({ title: "Por tipo de página", insight: "El blog llega entero; el problema está en lo que vendes." });
  });

  it("says what is lost by kind, with one literal sample and where", () => {
    const v = buildAiView([
      page("https://acme.com/producto/a", c, {}, {
        render: ok(50, { price: { seen: 5, missing: 3 }, spec: { seen: 4, missing: 0 } }, { samples: [{ kind: "price", text: "1 kg · 24,90 €" }] })
      })
    ])!;
    if (v.mode !== "measured") throw new Error("measured");
    expect(v.kinds).toEqual([
      expect.objectContaining({ kind: "price", missingPct: 60, sample: "1 kg · 24,90 €", where: "En lo que vendes" }),
      expect.objectContaining({ kind: "spec", missingPct: 0, sample: null, where: null })
    ]);
    expect(v.groups).toEqual([]);
  });

  it("shows a change only when most pages have a previous measurement", () => {
    const two = (prev?: number) => [
      page("https://acme.com/", c, {}, { render: ok(90, {}, { prevPct: 80 }) }),
      page("https://acme.com/b", c, {}, { render: ok(70, {}, prev === undefined ? {} : { prevPct: prev }) })
    ];
    const a = buildAiView(two(70))!;
    // weights 2 and 1: 83 now against 77 before
    expect(a.mode === "measured" && a.delta).toBe(6);
    const b = buildAiView([...two(), page("https://acme.com/c", c, {}, { render: ok(70) })])!;
    expect(b.mode === "measured" && b.delta).toBeNull();
  });

  it("leaves out pages the browser could not compare", () => {
    const v = buildAiView([
      page("https://acme.com/", c, {}, { render: { state: "unmeasured", measuredAt: "2026-11-02T10:00:00.000Z" } }),
      page("https://acme.com/b", c, {}, { render: ok(80) })
    ])!;
    expect(v.mode === "measured" && v.pct).toBe(80);
  });

  it("never names a page or a count", () => {
    const v = buildAiView([page("https://acme.com/secreto", c, {}, { contextLabel: "citada en 2 prompts", render: ok(30, { faq: { seen: 2, missing: 2 } }) })]);
    expect(JSON.stringify(v)).not.toMatch(/acme|secreto|prompts/);
  });
});

describe("insights only when the figures say something", () => {
  it("stays quiet on a flat picture", () => {
    expect(importanceInsight([{ label: "Lo que cita la IA", pct: 80 }, { label: "Portada", pct: 82 }], 81)).toBeNull();
    expect(typeInsight([{ label: "Lo que vendes", pct: 92 }, { label: "Blog y guías", pct: 95 }])).toBeNull();
    expect(typeInsight([{ label: "Lo que vendes", pct: 92 }, { label: "Resto de páginas", pct: 70 }])).toBe("El mayor hueco está en el resto de páginas.");
  });
});

describe("isJsThin and detectPlatform (log §449)", () => {
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
