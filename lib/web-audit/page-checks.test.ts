import { describe, expect, it } from "vitest";
import {
  checkAnswerFormat,
  checkFreshness,
  checkMetadata,
  checkStructuredData,
  buildPageCheckResult,
  buildPageCheckGuidance
} from "./page-checks";

const NOW = new Date("2026-07-10T00:00:00Z");

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
    expect(result.points).toBe(30);
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
  it("awards points for a title and description in range", () => {
    const html = `<title>A perfectly reasonable title</title><meta name="description" content="${"a".repeat(80)}">`;
    const result = checkMetadata(html);
    expect(result.points).toBe(20);
    expect(result.titleOk).toBe(true);
    expect(result.descriptionOk).toBe(true);
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

  it("scores zero with no title or description", () => {
    expect(checkMetadata("<html></html>").points).toBe(0);
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
    expect(result.points).toBe(20);
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

describe("buildPageCheckResult", () => {
  it("scores a fully compliant page at 100", () => {
    const html = `
      <title>A perfectly reasonable page title</title>
      <meta name="description" content="${"a".repeat(80)}">
      <script type="application/ld+json">{"@type":"Article","dateModified":"2026-06-01T00:00:00Z"}</script>
      <h1>Title</h1><p>${"a".repeat(200)}</p><h2>A</h2><h2>B</h2>
    `;
    expect(buildPageCheckResult(html, NOW).pageScore).toBe(100);
  });

  it("rescales to 0-100 over the 80-point baseline when freshness is unknown", () => {
    const html = `
      <script type="application/ld+json">{"@type":"Article"}</script>
      <h1>Title</h1><p>${"a".repeat(200)}</p><h2>A</h2><h2>B</h2>
    `;
    // baseline = 30 (structured) + 30 (answer format) + 0 (metadata) = 60/80 -> rescaled
    const result = buildPageCheckResult(html, NOW);
    expect(result.freshness.status).toBe("unknown");
    expect(result.pageScore).toBe(Math.round((60 / 80) * 100));
  });

  it("scores an empty page at 0", () => {
    expect(buildPageCheckResult("<html></html>", NOW).pageScore).toBe(0);
  });

  it("never lets an unknown-freshness page score higher than a fully-scored equivalent", () => {
    const withDate = buildPageCheckResult(
      `<script type="application/ld+json">{"@type":"Article","dateModified":"2026-06-01T00:00:00Z"}</script><h1>a</h1>`,
      NOW
    );
    const withoutDate = buildPageCheckResult(
      `<script type="application/ld+json">{"@type":"Article"}</script><h1>a</h1>`,
      NOW
    );
    expect(withoutDate.pageScore).toBeGreaterThanOrEqual(0);
    expect(withDate.pageScore).toBeGreaterThanOrEqual(withoutDate.pageScore);
  });
});

describe("buildPageCheckGuidance", () => {
  it("returns no guidance for a fully compliant page", () => {
    const html = `
      <title>A perfectly reasonable page title</title>
      <meta name="description" content="${"a".repeat(80)}">
      <script type="application/ld+json">{"@type":"Article","dateModified":"2026-06-01T00:00:00Z"}</script>
      <h1>Title</h1><p>${"a".repeat(200)}</p><h2>A</h2><h2>B</h2>
    `;
    expect(buildPageCheckGuidance(buildPageCheckResult(html, NOW))).toEqual([]);
  });

  it("cites the real measured h1 count and title length in the guidance text", () => {
    const html = `<h1>a</h1><h1>b</h1><title>${"a".repeat(100)}</title>`;
    const guidance = buildPageCheckGuidance(buildPageCheckResult(html, NOW));
    expect(guidance.some((line) => line.includes("ahora: 2 detectados"))).toBe(true);
    expect(guidance.some((line) => line.includes("ahora: 100"))).toBe(true);
  });

  it("suggests adding a date when freshness is unknown, and updating content when stale/aging", () => {
    const unknown = buildPageCheckGuidance(buildPageCheckResult("<html></html>", NOW));
    expect(unknown.some((line) => line.includes("fecha de actualización"))).toBe(true);

    const staleHtml = `<script type="application/ld+json">{"datePublished":"2023-01-01T00:00:00Z"}</script>`;
    const stale = buildPageCheckGuidance(buildPageCheckResult(staleHtml, NOW));
    expect(stale.some((line) => line.includes("Actualiza el contenido"))).toBe(true);
  });

  it("suggests structured data only when the check actually fails", () => {
    const withStructuredData = buildPageCheckGuidance(
      buildPageCheckResult(`<script type="application/ld+json">{"@type":"Article"}</script>`, NOW)
    );
    expect(withStructuredData.some((line) => line.includes("datos estructurados"))).toBe(false);

    const withoutStructuredData = buildPageCheckGuidance(buildPageCheckResult("<html></html>", NOW));
    expect(withoutStructuredData.some((line) => line.includes("datos estructurados"))).toBe(true);
  });
});
