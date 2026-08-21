import { describe, expect, it } from "vitest";
import {
  checkAnswerFormat,
  checkCitability,
  checkFreshness,
  checkIndexability,
  checkMetadata,
  checkStructuredData,
  buildPageCheckResult,
  buildPageCheckGuidance
} from "./page-checks";

const NOW = new Date("2026-07-10T00:00:00Z");
const CTX = { pageUrl: "https://acme.com/page", projectDomainNormalized: "acme.com" };

describe("checkStructuredData", () => {
  it("passes for a recognized @type", () => {
    const html = `<script type="application/ld+json">{"@type":"Article","headline":"x"}</script>`;
    const result = checkStructuredData(html);
    expect(result.pass).toBe(true);
    expect(result.matchedTypes).toEqual(["Article"]);
  });

  it("fails when no ld+json script is present", () => {
    expect(checkStructuredData("<html><body>hi</body></html>").pass).toBe(false);
  });

  it("fails for an unrecognized @type", () => {
    const html = `<script type="application/ld+json">{"@type":"Recipe"}</script>`;
    expect(checkStructuredData(html).pass).toBe(false);
  });

  it("reads an @graph entry", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"FAQPage"}]}</script>`;
    const result = checkStructuredData(html);
    expect(result.pass).toBe(true);
    expect(result.matchedTypes).toContain("FAQPage");
  });

  it("ignores malformed JSON-LD instead of throwing", () => {
    const html = `<script type="application/ld+json">{not valid json</script>`;
    expect(() => checkStructuredData(html)).not.toThrow();
    expect(checkStructuredData(html).pass).toBe(false);
  });

  it("dedupes repeated matched types", () => {
    const html = `
      <script type="application/ld+json">{"@type":"Article"}</script>
      <script type="application/ld+json">{"@type":"Article"}</script>
    `;
    expect(checkStructuredData(html).matchedTypes).toEqual(["Article"]);
  });
});

describe("checkAnswerFormat", () => {
  const noStructuredData = { pass: false, matchedTypes: [] as string[] };

  it("awards full points for a well-formed answer-first page", () => {
    const html = `<h1>Title</h1><p>${"a".repeat(200)}</p><h2>A</h2><h2>B</h2>`;
    const result = checkAnswerFormat(html, noStructuredData);
    expect(result.points).toBe(15);
    expect(result.hasOneH1).toBe(true);
    expect(result.hasTwoH2).toBe(true);
    expect(result.hasAnswerFirstIntro).toBe(true);
  });

  it("fails the intro check when the first paragraph is too short", () => {
    const html = `<h1>Title</h1><p>short</p><h2>A</h2><h2>B</h2>`;
    expect(checkAnswerFormat(html, noStructuredData).hasAnswerFirstIntro).toBe(false);
  });

  it("counts FAQPage structured data as satisfying the intro check", () => {
    const html = `<h1>Title</h1><p>short</p>`;
    const result = checkAnswerFormat(html, { pass: true, matchedTypes: ["FAQPage"] });
    expect(result.hasAnswerFirstIntro).toBe(true);
  });

  it("fails hasOneH1 when there are zero or multiple h1s", () => {
    expect(checkAnswerFormat("<p>no h1</p>", noStructuredData).hasOneH1).toBe(false);
    expect(checkAnswerFormat("<h1>a</h1><h1>b</h1>", noStructuredData).hasOneH1).toBe(false);
  });

  it("fails hasTwoH2 with fewer than two h2s", () => {
    expect(checkAnswerFormat("<h1>a</h1><h2>only one</h2>", noStructuredData).hasTwoH2).toBe(false);
  });

  it("reports the raw h1/h2 counts backing hasOneH1/hasTwoH2", () => {
    expect(checkAnswerFormat("<p>no h1</p>", noStructuredData).h1Count).toBe(0);
    expect(checkAnswerFormat("<h1>a</h1><h1>b</h1>", noStructuredData).h1Count).toBe(2);
    expect(checkAnswerFormat("<h1>a</h1><h2>only one</h2>", noStructuredData).h2Count).toBe(1);
  });
});

describe("checkMetadata", () => {
  const og = `<meta property="og:title" content="A title"><meta property="og:description" content="A description">`;

  it("awards points for a title, description, and OG tags", () => {
    const html = `<title>A perfectly reasonable title</title><meta name="description" content="${"a".repeat(80)}">${og}`;
    const result = checkMetadata(html);
    expect(result.points).toBe(15);
    expect(result.titleOk).toBe(true);
    expect(result.descriptionOk).toBe(true);
    expect(result.ogOk).toBe(true);
  });

  it("penalizes a too-short title", () => {
    expect(checkMetadata("<title>Hi</title>").titleOk).toBe(false);
  });

  it("penalizes a too-long title", () => {
    expect(checkMetadata(`<title>${"a".repeat(100)}</title>`).titleOk).toBe(false);
  });

  it("handles content-before-name attribute order", () => {
    const html = `<meta content="${"a".repeat(80)}" name="description">`;
    expect(checkMetadata(html).descriptionOk).toBe(true);
  });

  it("scores zero with no title, description, or OG tags", () => {
    expect(checkMetadata("<html></html>").points).toBe(0);
  });

  it("requires both og:title and og:description for ogOk", () => {
    expect(checkMetadata(`<meta property="og:title" content="only title">`).ogOk).toBe(false);
    expect(checkMetadata(og).ogOk).toBe(true);
  });

  it("handles content-before-property attribute order for OG tags", () => {
    const html = `<meta content="A title" property="og:title"><meta content="A description" property="og:description">`;
    expect(checkMetadata(html).ogOk).toBe(true);
  });

  it("reports the raw title/description lengths backing titleOk/descriptionOk", () => {
    const result = checkMetadata(`<title>${"a".repeat(100)}</title>`);
    expect(result.titleLength).toBe(100);
    expect(checkMetadata("<html></html>").descriptionLength).toBe(0);
  });
});

describe("checkFreshness", () => {
  it("reads dateModified from JSON-LD as fresh within 180 days", () => {
    const html = `<script type="application/ld+json">{"dateModified":"2026-06-01T00:00:00Z"}</script>`;
    const result = checkFreshness(html, NOW);
    expect(result.status).toBe("fresh");
    expect(result.points).toBe(15);
  });

  it("classifies 200-540 days old as aging", () => {
    const html = `<script type="application/ld+json">{"datePublished":"2025-11-01T00:00:00Z"}</script>`;
    expect(checkFreshness(html, NOW).status).toBe("aging");
  });

  it("classifies over 540 days old as stale", () => {
    const html = `<script type="application/ld+json">{"datePublished":"2023-01-01T00:00:00Z"}</script>`;
    const result = checkFreshness(html, NOW);
    expect(result.status).toBe("stale");
    expect(result.points).toBe(0);
  });

  it("falls back to meta article:modified_time", () => {
    const html = `<meta property="article:modified_time" content="2026-06-01T00:00:00Z">`;
    expect(checkFreshness(html, NOW).status).toBe("fresh");
  });

  it("falls back to meta last-modified", () => {
    const html = `<meta name="last-modified" content="2026-06-01T00:00:00Z">`;
    expect(checkFreshness(html, NOW).status).toBe("fresh");
  });

  it("returns unknown, never stale, when no date is found", () => {
    const result = checkFreshness("<html></html>", NOW);
    expect(result.status).toBe("unknown");
    expect(result.date).toBeNull();
  });

  it("prioritizes JSON-LD over meta tags", () => {
    const html = `
      <script type="application/ld+json">{"dateModified":"2026-06-01T00:00:00Z"}</script>
      <meta name="last-modified" content="2020-01-01T00:00:00Z">
    `;
    expect(checkFreshness(html, NOW).status).toBe("fresh");
  });
});

describe("checkIndexability", () => {
  it("awards full points for a same-domain canonical, no noindex, and hreflang", () => {
    const html = `
      <link rel="canonical" href="https://acme.com/page">
      <link rel="alternate" hreflang="es" href="https://acme.com/es/page">
    `;
    const result = checkIndexability(html, CTX);
    expect(result.points).toBe(20);
    expect(result.canonicalOk).toBe(true);
    expect(result.noindex).toBe(false);
    expect(result.hreflangPresent).toBe(true);
  });

  it("resolves a relative canonical href against pageUrl", () => {
    const html = `<link rel="canonical" href="/page">`;
    const result = checkIndexability(html, CTX);
    expect(result.canonicalOk).toBe(true);
    expect(result.canonicalUrl).toBe("https://acme.com/page");
  });

  it("rejects a canonical pointing at a different domain", () => {
    const html = `<link rel="canonical" href="https://evil.com/page">`;
    const result = checkIndexability(html, CTX);
    expect(result.canonicalPresent).toBe(true);
    expect(result.canonicalOk).toBe(false);
  });

  it("accepts a canonical on a real subdomain of the audited domain", () => {
    const html = `<link rel="canonical" href="https://blog.acme.com/page">`;
    expect(checkIndexability(html, CTX).canonicalOk).toBe(true);
  });

  it("flags noindex from a meta robots tag as a hard zero on that sub-check", () => {
    const html = `<meta name="robots" content="noindex, nofollow">`;
    const result = checkIndexability(html, CTX);
    expect(result.noindex).toBe(true);
    expect(result.points).toBe(0);
  });

  it("ignores a robots meta tag without noindex", () => {
    const html = `<meta name="robots" content="index, follow">`;
    expect(checkIndexability(html, CTX).noindex).toBe(false);
  });

  it("treats absent canonical/hreflang as failing without throwing", () => {
    const result = checkIndexability("<html></html>", CTX);
    expect(result.canonicalPresent).toBe(false);
    expect(result.canonicalOk).toBe(false);
    expect(result.hreflangPresent).toBe(false);
    expect(result.noindex).toBe(false); // absence of the tag means indexable, the default
    expect(result.points).toBe(10); // only the "not noindexed" points
  });

  it("handles attribute order (href before rel) on the canonical link tag", () => {
    const html = `<link href="/page" rel="canonical">`;
    expect(checkIndexability(html, CTX).canonicalOk).toBe(true);
  });
});

describe("checkCitability", () => {
  it("awards points for lists/tables and substantive content", () => {
    const html = `<ul><li>a</li></ul><p>${"word ".repeat(300)}</p>`;
    const result = checkCitability(html);
    expect(result.hasListOrTable).toBe(true);
    expect(result.contentOk).toBe(true);
    expect(result.points).toBe(20);
  });

  it("detects a table as satisfying hasListOrTable", () => {
    expect(checkCitability("<table><tr><td>x</td></tr></table>").hasListOrTable).toBe(true);
  });

  it("fails contentOk under the word-count threshold", () => {
    const result = checkCitability("<p>too short</p>");
    expect(result.contentOk).toBe(false);
    expect(result.wordCount).toBeLessThan(300);
  });

  it("excludes script and style block contents from the word count", () => {
    const html = `<script>${"x ".repeat(400)}</script><style>${"y ".repeat(400)}</style><p>short</p>`;
    const result = checkCitability(html);
    expect(result.wordCount).toBeLessThan(10);
    expect(result.contentOk).toBe(false);
  });
});

describe("buildPageCheckResult", () => {
  const fullHtml = `
    <title>A perfectly reasonable page title</title>
    <meta name="description" content="${"a".repeat(80)}">
    <meta property="og:title" content="A title">
    <meta property="og:description" content="A description">
    <link rel="canonical" href="https://acme.com/page">
    <link rel="alternate" hreflang="es" href="https://acme.com/es/page">
    <script type="application/ld+json">{"@type":"Article","dateModified":"2026-06-01T00:00:00Z"}</script>
    <h1>Title</h1><p>${"a".repeat(200)}</p><h2>A</h2><h2>B</h2>
    <ul><li>${"word ".repeat(300)}</li></ul>
  `;

  it("scores a fully compliant page at 100", () => {
    expect(buildPageCheckResult(fullHtml, CTX, NOW).pageScore).toBe(100);
  });

  it("rescales to 0-100 over the 85-point baseline when freshness is unknown", () => {
    const html = `
      <script type="application/ld+json">{"@type":"Article"}</script>
      <h1>Title</h1><p>${"a".repeat(200)}</p><h2>A</h2><h2>B</h2>
    `;
    // baseline = 15 (structured) + 15 (answer format) + 0 (metadata) + 10 (not noindexed) + 0 (citability) = 40/85 -> rescaled
    const result = buildPageCheckResult(html, CTX, NOW);
    expect(result.freshness.status).toBe("unknown");
    expect(result.pageScore).toBe(Math.round((40 / 85) * 100));
  });

  it("scores an empty page at the 'not noindexed by default' floor, not zero", () => {
    // An empty page has no robots meta tag at all, so it's not noindexed —
    // that's still 10/85 baseline points, which is genuinely correct: an
    // indexable-but-empty page differs from a noindexed one.
    const result = buildPageCheckResult("<html></html>", CTX, NOW);
    expect(result.pageScore).toBe(Math.round((10 / 85) * 100));
  });

  it("scores a noindexed empty page at 0", () => {
    const html = `<meta name="robots" content="noindex">`;
    expect(buildPageCheckResult(html, CTX, NOW).pageScore).toBe(0);
  });

  it("never lets an unknown-freshness page score higher than a fully-scored equivalent", () => {
    const withDate = buildPageCheckResult(
      `<script type="application/ld+json">{"@type":"Article","dateModified":"2026-06-01T00:00:00Z"}</script><h1>a</h1>`,
      CTX,
      NOW
    );
    const withoutDate = buildPageCheckResult(
      `<script type="application/ld+json">{"@type":"Article"}</script><h1>a</h1>`,
      CTX,
      NOW
    );
    expect(withoutDate.pageScore).toBeGreaterThanOrEqual(0);
    expect(withDate.pageScore).toBeGreaterThanOrEqual(withoutDate.pageScore);
  });
});

describe("buildPageCheckGuidance", () => {
  const fullHtml = `
    <title>A perfectly reasonable page title</title>
    <meta name="description" content="${"a".repeat(80)}">
    <meta property="og:title" content="A title">
    <meta property="og:description" content="A description">
    <link rel="canonical" href="https://acme.com/page">
    <script type="application/ld+json">{"@type":"Article","dateModified":"2026-06-01T00:00:00Z"}</script>
    <h1>Title</h1><p>${"a".repeat(200)}</p><h2>A</h2><h2>B</h2>
    <ul><li>${"word ".repeat(300)}</li></ul>
  `;

  it("returns only the hreflang note for a fully compliant single-market page", () => {
    // hreflang is the one check that's never a hard "problem" for a
    // single-market site — see checkIndexability's header comment.
    const guidance = buildPageCheckGuidance(buildPageCheckResult(fullHtml, CTX, NOW));
    expect(guidance).toEqual(["Si esta página tiene versiones en otros idiomas o países, añade etiquetas <link rel=\"alternate\" hreflang=\"...\"> para cada una."]);
  });

  it("cites the real measured h1 count and title length in the guidance text", () => {
    const html = `<h1>a</h1><h1>b</h1><title>${"a".repeat(100)}</title>`;
    const guidance = buildPageCheckGuidance(buildPageCheckResult(html, CTX, NOW));
    expect(guidance.some((line) => line.includes("ahora: 2 detectados"))).toBe(true);
    expect(guidance.some((line) => line.includes("ahora: 100"))).toBe(true);
  });

  it("suggests adding a date when freshness is unknown, and updating content when stale/aging", () => {
    const unknown = buildPageCheckGuidance(buildPageCheckResult("<html></html>", CTX, NOW));
    expect(unknown.some((line) => line.includes("fecha de actualización"))).toBe(true);

    const staleHtml = `<script type="application/ld+json">{"datePublished":"2023-01-01T00:00:00Z"}</script>`;
    const stale = buildPageCheckGuidance(buildPageCheckResult(staleHtml, CTX, NOW));
    expect(stale.some((line) => line.includes("Actualiza el contenido"))).toBe(true);
  });

  it("suggests structured data only when the check actually fails", () => {
    const withStructuredData = buildPageCheckGuidance(
      buildPageCheckResult(`<script type="application/ld+json">{"@type":"Article"}</script>`, CTX, NOW)
    );
    expect(withStructuredData.some((line) => line.includes("datos estructurados"))).toBe(false);

    const withoutStructuredData = buildPageCheckGuidance(buildPageCheckResult("<html></html>", CTX, NOW));
    expect(withoutStructuredData.some((line) => line.includes("datos estructurados"))).toBe(true);
  });

  it("warns about noindex distinctly from a missing/wrong canonical", () => {
    const noindexHtml = `<meta name="robots" content="noindex">`;
    const guidance = buildPageCheckGuidance(buildPageCheckResult(noindexHtml, CTX, NOW));
    expect(guidance.some((line) => line.includes("noindex"))).toBe(true);
    expect(guidance.some((line) => line.includes("canonical"))).toBe(true);
  });

  it("distinguishes a missing canonical from one pointing off-domain", () => {
    const missing = buildPageCheckGuidance(buildPageCheckResult("<html></html>", CTX, NOW));
    expect(missing.some((line) => line.includes("Añade una etiqueta"))).toBe(true);

    const wrongDomain = buildPageCheckGuidance(
      buildPageCheckResult(`<link rel="canonical" href="https://evil.com/page">`, CTX, NOW)
    );
    expect(wrongDomain.some((line) => line.includes("apunta a otro dominio"))).toBe(true);
  });

  it("suggests lists/tables and more content only when those checks fail", () => {
    const thin = buildPageCheckGuidance(buildPageCheckResult("<p>short</p>", CTX, NOW));
    expect(thin.some((line) => line.includes("listas o tablas"))).toBe(true);
    expect(thin.some((line) => line.includes("Amplía el contenido"))).toBe(true);
  });

  it("never throws on a legacy pre-R3 snapshot (no indexability/citability/ogOk) and asserts nothing it never measured", () => {
    // Shape of a web_audit_snapshots row persisted BEFORE R3 shipped — this
    // exact input crashed the web-audit page in production (2026-07-12:
    // "Cannot read properties of undefined (reading 'noindex')").
    const legacy = {
      structuredData: { pass: true, matchedTypes: ["Article"] },
      answerFormat: { points: 30, hasOneH1: true, hasTwoH2: true, hasAnswerFirstIntro: true, h1Count: 1, h2Count: 2 },
      metadata: { points: 20, titleOk: true, descriptionOk: true, titleLength: 30, descriptionLength: 80 },
      freshness: { status: "fresh" as const, points: 20, date: "2026-06-01T00:00:00.000Z" },
      pageScore: 100
    };
    expect(() => buildPageCheckGuidance(legacy)).not.toThrow();
    const guidance = buildPageCheckGuidance(legacy);
    // No R3 guidance for sub-checks that were never measured on this row:
    expect(guidance.some((line) => line.includes("noindex"))).toBe(false);
    expect(guidance.some((line) => line.includes("canonical"))).toBe(false);
    expect(guidance.some((line) => line.includes("hreflang"))).toBe(false);
    expect(guidance.some((line) => line.includes("listas o tablas"))).toBe(false);
    expect(guidance.some((line) => line.includes("Open Graph"))).toBe(false);
    expect(guidance).toEqual([]);
  });

  it("suggests Open Graph tags only when they're missing", () => {
    const withOg = buildPageCheckGuidance(
      buildPageCheckResult(`<meta property="og:title" content="a"><meta property="og:description" content="b">`, CTX, NOW)
    );
    expect(withOg.some((line) => line.includes("Open Graph"))).toBe(false);

    const withoutOg = buildPageCheckGuidance(buildPageCheckResult("<html></html>", CTX, NOW));
    expect(withoutOg.some((line) => line.includes("Open Graph"))).toBe(true);
  });
});

/**
 * AUDIT-SNIPPET-1 — un motor puede rastrear e indexar una página y aun así
 * tener prohibido reproducir un fragmento de ella. Para un producto de
 * visibilidad en IA ése es el bloqueo que importa: sin fragmento no hay cita.
 * Hasta esta fase, ni la meta ni la cabecera se miraban.
 */
describe("checkIndexability — directivas que bloquean la cita", () => {
  const clean = "<html><head></head><body>hola</body></html>";

  it("detecta nosnippet en la meta robots", () => {
    const html = `<html><head><meta name="robots" content="index, nosnippet"></head></html>`;
    expect(checkIndexability(html, CTX).snippetBlocks).toEqual([{ directive: "nosnippet", source: "meta" }]);
  });

  it("detecta nosnippet en la cabecera X-Robots-Tag, que no aparece en el HTML", () => {
    // El caso que motivó capturar la cabecera: servida por el CDN, invisible
    // para cualquier análisis que sólo mire el HTML.
    expect(checkIndexability(clean, { ...CTX, xRobotsTag: "nosnippet" }).snippetBlocks).toEqual([
      { directive: "nosnippet", source: "header" }
    ]);
  });

  it("detecta max-snippet:0, que prohíbe el fragmento igual que nosnippet", () => {
    const html = `<html><head><meta name="robots" content="max-snippet:0"></head></html>`;
    expect(checkIndexability(html, CTX).snippetBlocks).toEqual([{ directive: "max-snippet:0", source: "meta" }]);
  });

  it("no confunde max-snippet:0 con un límite real como max-snippet:50", () => {
    const html = `<html><head><meta name="robots" content="max-snippet:50"></head></html>`;
    expect(checkIndexability(html, CTX).snippetBlocks).toEqual([]);
  });

  it("no cuenta data-nosnippet, que marca un bloque y no la página", () => {
    const html = `<html><body><div data-nosnippet>aviso legal</div></body></html>`;
    expect(checkIndexability(html, CTX).snippetBlocks).toEqual([]);
  });

  it("recoge meta y cabecera a la vez, cada una con su origen", () => {
    const html = `<html><head><meta name="robots" content="nosnippet"></head></html>`;
    const result = checkIndexability(html, { ...CTX, xRobotsTag: "max-snippet:0" });
    expect(result.snippetBlocks).toEqual([
      { directive: "nosnippet", source: "meta" },
      { directive: "max-snippet:0", source: "header" }
    ]);
  });

  it("una página limpia queda MEDIDA y vacía, que no es lo mismo que sin medir", () => {
    expect(checkIndexability(clean, CTX).snippetBlocks).toEqual([]);
  });

  it("NO mueve la puntuación: los puntos siguen saliendo de canonical + noindex + hreflang", () => {
    // El invariante que protege `readiness_score` (peso .20 del GEO Score, con
    // pesos aprobados por el fundador): este hallazgo se reporta, no se puntúa.
    const html = `<html><head><meta name="robots" content="nosnippet"></head></html>`;
    const blocked = checkIndexability(html, { ...CTX, xRobotsTag: "nosnippet" });
    const allowed = checkIndexability(clean, CTX);
    expect(blocked.points).toBe(allowed.points);
  });
});
