import { describe, it, expect } from "vitest";
import {
  buildWebAuditSummary,
  hasOwnDomainGroundingCitation,
  CITATION_WINDOW_SIZE,
  CITATION_WINDOW_MAX_AGE_DAYS,
  type ScanResultsWindow
} from "./opportunity-matrix";
import { NOT_COVERED_NOTE, COULD_NOT_VERIFY_NOTE, type DomainCoverageMap } from "./coverage-map";
import type { PromptResultLite } from "./opportunity-matrix";
import { GROUNDED_PROVIDERS } from "@/lib/scoring/run-scoring";
import { ENGINE_META } from "@/lib/scan/engine-meta";

const PROJECT_DOMAIN = "acme.com";
const SCAN_1_DATE = "2026-07-01T00:00:00.000Z";

function coverage(topics: DomainCoverageMap["topics"], scanId = "scan-1", generatedAt = SCAN_1_DATE): DomainCoverageMap {
  return { scanId, generatedAt, topics };
}

function result(overrides: Partial<PromptResultLite> = {}): PromptResultLite {
  return {
    prompt_id: "p1",
    extracted_json: { citations: [] },
    provider: "gemini",
    mentioned_competitors_count: 0,
    ...overrides
  };
}

function ownGroundingCitation(domain: string) {
  return { citations: [{ domain, source: "grounding" }] };
}

/** Wraps a single scan's results into the {scanId, generatedAt, results} window shape buildWebAuditSummary now expects. */
function candidates(results: PromptResultLite[], scanId = "scan-1", generatedAt = SCAN_1_DATE): ScanResultsWindow[] {
  return [{ scanId, generatedAt, results }];
}

describe("hasOwnDomainGroundingCitation", () => {
  it("counts an exact-domain grounding citation", () => {
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("acme.com"), "acme.com", "gemini")).toBe(true);
  });

  it("counts a real subdomain (label-boundary match)", () => {
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("blog.acme.com"), "acme.com", "gemini")).toBe(true);
  });

  it("rejects a domain that merely contains the root as a substring", () => {
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("evilacme.com"), "acme.com", "gemini")).toBe(false);
  });

  it("normalizes scheme and www. before matching", () => {
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("www.acme.com"), "acme.com", "gemini")).toBe(true);
  });

  it("ignores an inline (non-grounding) citation even to the own domain", () => {
    expect(
      hasOwnDomainGroundingCitation({ citations: [{ domain: "acme.com", source: "inline" }] }, "acme.com", "gemini")
    ).toBe(false);
  });

  it("ignores a grounding citation from a row whose provider is not grounded", () => {
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("acme.com"), "acme.com", "claude")).toBe(false);
  });

  it("treats a null/missing provider as grounded (historical Gemini-only rows)", () => {
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("acme.com"), "acme.com", null)).toBe(true);
  });

  it("cuenta las citas de ChatGPT, que es grounded desde ENGINES-2a", () => {
    // La regresión concreta: esta copia se quedó en {"gemini"} cuando entró
    // OpenAI como motor, así que un tema que ChatGPT SÍ citaba se clasificaba
    // como invisible o content_gap.
    expect(hasOwnDomainGroundingCitation(ownGroundingCitation("acme.com"), "acme.com", "openai")).toBe(true);
  });
});

/**
 * El guardián que la cabecera de `opportunity-matrix.ts` llevaba meses
 * afirmando que existía, y no existía: sólo se probaban `gemini`, `claude` y
 * `null`, así que `openai` pudo divergir en silencio durante un mes. Hay tres
 * declaraciones de "qué motor está grounded" —el scoring (canónica), esta
 * matriz y `ENGINE_META` para la UI— y se duplican a propósito, para que un
 * módulo no arrastre a otro por una constante. El precio de esa decisión es
 * este test: si alguna se mueve sin las otras, salta aquí.
 */
describe("paridad de motores grounded entre las tres copias", () => {
  it("todo motor grounded en el scoring lo es también en la matriz y en ENGINE_META", () => {
    expect(GROUNDED_PROVIDERS.size).toBeGreaterThan(0);
    for (const provider of GROUNDED_PROVIDERS) {
      expect(
        hasOwnDomainGroundingCitation(ownGroundingCitation("acme.com"), "acme.com", provider),
        `la matriz no cuenta a ${provider} como grounded`
      ).toBe(true);
      expect(ENGINE_META[provider]?.grounded, `ENGINE_META no marca ${provider} como grounded`).toBe(true);
    }
  });

  it("y ningún motor NO grounded cuela en ninguna de las tres", () => {
    for (const [provider, meta] of Object.entries(ENGINE_META)) {
      if (GROUNDED_PROVIDERS.has(provider)) continue;
      expect(meta.grounded, `ENGINE_META marca ${provider} como grounded y el scoring no`).toBe(false);
      expect(
        hasOwnDomainGroundingCitation(ownGroundingCitation("acme.com"), "acme.com", provider),
        `la matriz cuenta a ${provider} como grounded y el scoring no`
      ).toBe(false);
    }
  });
});

describe("buildWebAuditSummary — classification", () => {
  it("classifies a covered, cited topic as performing", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" }]),
      citationWindowCandidates: candidates([result({ extracted_json: ownGroundingCitation("acme.com") })]),
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("performing");
  });

  it("classifies a covered, uncited topic as invisible", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" }]),
      citationWindowCandidates: candidates([result()]),
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("invisible");
  });

  it("classifies an uncovered, uncited topic with competitors mentioned as content_gap", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: false, pages: [], note: NOT_COVERED_NOTE }]),
      citationWindowCandidates: candidates([result({ mentioned_competitors_count: 2 })]),
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("content_gap");
  });

  it("classifies an uncovered, uncited topic with no competitors as open_opportunity", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: false, pages: [], note: NOT_COVERED_NOTE }]),
      citationWindowCandidates: candidates([result({ mentioned_competitors_count: 0 })]),
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("open_opportunity");
  });

  it("classifies an uncovered but cited topic as unverified_cited", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: false, pages: [], note: NOT_COVERED_NOTE }]),
      citationWindowCandidates: candidates([result({ extracted_json: ownGroundingCitation("acme.com") })]),
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("unverified_cited");
  });

  it("classifies a COULD_NOT_VERIFY_NOTE topic as inconclusive regardless of result data", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: false, pages: [], note: COULD_NOT_VERIFY_NOTE }]),
      citationWindowCandidates: candidates([result({ extracted_json: ownGroundingCitation("acme.com") })]),
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("inconclusive");
  });

  it("classifies a topic with no matching scan result as inconclusive", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p-missing", topic: "t1", found: true, pages: [], note: "n" }]),
      citationWindowCandidates: candidates([]),
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("inconclusive");
  });

  it("excludes inconclusive topics from every denominator", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([
        { promptId: "p1", topic: "t1", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" },
        { promptId: "p2", topic: "t2", found: false, pages: [], note: COULD_NOT_VERIFY_NOTE }
      ]),
      citationWindowCandidates: candidates([result({ prompt_id: "p1", extracted_json: ownGroundingCitation("acme.com") })]),
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.conclusiveCount).toBe(1);
    expect(summary.coveredCount).toBe(1);
    expect(summary.coveragePct).toBe(100);
  });

  it("returns null percentages on an empty denominator instead of 0", () => {
    const summary = buildWebAuditSummary({
      coverage: coverage([{ promptId: "p1", topic: "t1", found: false, pages: [], note: COULD_NOT_VERIFY_NOTE }]),
      citationWindowCandidates: candidates([]),
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.conclusiveCount).toBe(0);
    expect(summary.coveragePct).toBeNull();
    expect(summary.surfacingPct).toBeNull();
  });

  it("keeps quadrant counts consistent with the total topic count", () => {
    const topics: DomainCoverageMap["topics"] = [
      { promptId: "p1", topic: "performing", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" },
      { promptId: "p2", topic: "invisible", found: true, pages: [{ url: "https://acme.com/b", title: "B" }], note: "n" },
      { promptId: "p3", topic: "content_gap", found: false, pages: [], note: NOT_COVERED_NOTE },
      { promptId: "p4", topic: "open_opportunity", found: false, pages: [], note: NOT_COVERED_NOTE },
      { promptId: "p5", topic: "unverified_cited", found: false, pages: [], note: NOT_COVERED_NOTE },
      { promptId: "p6", topic: "inconclusive", found: false, pages: [], note: COULD_NOT_VERIFY_NOTE }
    ];
    const results: PromptResultLite[] = [
      result({ prompt_id: "p1", extracted_json: ownGroundingCitation("acme.com") }),
      result({ prompt_id: "p2" }),
      result({ prompt_id: "p3", mentioned_competitors_count: 1 }),
      result({ prompt_id: "p4", mentioned_competitors_count: 0 }),
      result({ prompt_id: "p5", extracted_json: ownGroundingCitation("acme.com") })
      // p6 intentionally has no matching result row
    ];
    const summary = buildWebAuditSummary({ coverage: coverage(topics), citationWindowCandidates: candidates(results), projectDomain: PROJECT_DOMAIN });
    const counts = summary.topics.reduce<Record<string, number>>((acc, t) => {
      acc[t.outcome] = (acc[t.outcome] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({
      performing: 1,
      invisible: 1,
      content_gap: 1,
      open_opportunity: 1,
      unverified_cited: 1,
      inconclusive: 1
    });
    expect(summary.topics.length).toBe(6);
  });
});

describe("buildWebAuditSummary — citation window (WEB-AUDIT-R6 phase 2)", () => {
  const foundTopic = [{ promptId: "p1", topic: "t1", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" }];

  it("classifies as performing when 2 of 3 window scans cite the domain (majority)", () => {
    const window: ScanResultsWindow[] = [
      { scanId: "scan-3", generatedAt: "2026-07-15T00:00:00.000Z", results: [result({ extracted_json: ownGroundingCitation("acme.com") })] },
      { scanId: "scan-2", generatedAt: "2026-07-08T00:00:00.000Z", results: [result()] },
      { scanId: "scan-1", generatedAt: "2026-07-01T00:00:00.000Z", results: [result({ extracted_json: ownGroundingCitation("acme.com") })] }
    ];
    const summary = buildWebAuditSummary({
      coverage: coverage(foundTopic, "scan-3", "2026-07-15T00:00:00.000Z"),
      citationWindowCandidates: window,
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("performing");
  });

  it("classifies as invisible when only 1 of 3 window scans cite the domain (minority)", () => {
    const window: ScanResultsWindow[] = [
      { scanId: "scan-3", generatedAt: "2026-07-15T00:00:00.000Z", results: [result({ extracted_json: ownGroundingCitation("acme.com") })] },
      { scanId: "scan-2", generatedAt: "2026-07-08T00:00:00.000Z", results: [result()] },
      { scanId: "scan-1", generatedAt: "2026-07-01T00:00:00.000Z", results: [result()] }
    ];
    const summary = buildWebAuditSummary({
      coverage: coverage(foundTopic, "scan-3", "2026-07-15T00:00:00.000Z"),
      citationWindowCandidates: window,
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("invisible");
  });

  it("treats an exact 1-of-2 tie as cited (citedRuns*2 >= totalRuns)", () => {
    const window: ScanResultsWindow[] = [
      { scanId: "scan-2", generatedAt: "2026-07-08T00:00:00.000Z", results: [result({ extracted_json: ownGroundingCitation("acme.com") })] },
      { scanId: "scan-1", generatedAt: "2026-07-01T00:00:00.000Z", results: [result()] }
    ];
    const summary = buildWebAuditSummary({
      coverage: coverage(foundTopic, "scan-2", "2026-07-08T00:00:00.000Z"),
      citationWindowCandidates: window,
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("performing");
  });

  it("ignores scans beyond CITATION_WINDOW_SIZE, using only the most recent ones", () => {
    // 4 scans available; the 2 oldest are both cited but must fall outside the size-3 window.
    // Window (3 most recent): scan-4 uncited, scan-3 uncited, scan-2 uncited → majority uncited → invisible.
    const window: ScanResultsWindow[] = [
      { scanId: "scan-4", generatedAt: "2026-07-22T00:00:00.000Z", results: [result()] },
      { scanId: "scan-3", generatedAt: "2026-07-15T00:00:00.000Z", results: [result()] },
      { scanId: "scan-2", generatedAt: "2026-07-08T00:00:00.000Z", results: [result()] },
      { scanId: "scan-1", generatedAt: "2026-07-01T00:00:00.000Z", results: [result({ extracted_json: ownGroundingCitation("acme.com") })] }
    ];
    expect(CITATION_WINDOW_SIZE).toBe(3);
    const summary = buildWebAuditSummary({
      coverage: coverage(foundTopic, "scan-4", "2026-07-22T00:00:00.000Z"),
      citationWindowCandidates: window,
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("invisible");
  });

  it("excludes scans older than CITATION_WINDOW_MAX_AGE_DAYS from the window (recency guard)", () => {
    expect(CITATION_WINDOW_MAX_AGE_DAYS).toBe(30);
    // Only the current scan is inside the recency guard; the cited scan is 90 days old.
    const window: ScanResultsWindow[] = [
      { scanId: "scan-2", generatedAt: "2026-07-15T00:00:00.000Z", results: [result()] },
      { scanId: "scan-1", generatedAt: "2026-04-16T00:00:00.000Z", results: [result({ extracted_json: ownGroundingCitation("acme.com") })] }
    ];
    const summary = buildWebAuditSummary({
      coverage: coverage(foundTopic, "scan-2", "2026-07-15T00:00:00.000Z"),
      citationWindowCandidates: window,
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("invisible");
  });

  it("never looks ahead: a future scan's citation does not affect an earlier reference point", () => {
    const window: ScanResultsWindow[] = [
      { scanId: "scan-2", generatedAt: "2026-07-08T00:00:00.000Z", results: [result({ extracted_json: ownGroundingCitation("acme.com") })] },
      { scanId: "scan-1", generatedAt: "2026-07-01T00:00:00.000Z", results: [result()] }
    ];
    // Reference point is scan-1's own date — scan-2 (later) must be excluded from its window.
    const summary = buildWebAuditSummary({
      coverage: coverage(foundTopic, "scan-1", "2026-07-01T00:00:00.000Z"),
      citationWindowCandidates: window,
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("invisible");
  });

  it("degrades gracefully with fewer than CITATION_WINDOW_SIZE scans available", () => {
    const window: ScanResultsWindow[] = [
      { scanId: "scan-1", generatedAt: "2026-07-01T00:00:00.000Z", results: [result({ extracted_json: ownGroundingCitation("acme.com") })] }
    ];
    const summary = buildWebAuditSummary({
      coverage: coverage(foundTopic, "scan-1", "2026-07-01T00:00:00.000Z"),
      citationWindowCandidates: window,
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("performing");
  });

  it("does not count a window scan missing this prompt's result as a 'not cited' vote", () => {
    // scan-2 has a result row, but for a different prompt — no data point for p1 in that
    // scan. Only the current scan (uncited) and scan-1 (cited) should count, tying 1-of-2
    // → performing. If the missing-data scan were wrongly counted as "not cited" it would
    // become 1-of-3 → invisible, so this distinguishes the two behaviors.
    const window: ScanResultsWindow[] = [
      { scanId: "scan-3", generatedAt: "2026-07-15T00:00:00.000Z", results: [result({ prompt_id: "p1" })] },
      { scanId: "scan-2", generatedAt: "2026-07-08T00:00:00.000Z", results: [result({ prompt_id: "p9" })] },
      {
        scanId: "scan-1",
        generatedAt: "2026-07-01T00:00:00.000Z",
        results: [result({ prompt_id: "p1", extracted_json: ownGroundingCitation("acme.com") })]
      }
    ];
    const summary = buildWebAuditSummary({
      coverage: coverage(foundTopic, "scan-3", "2026-07-15T00:00:00.000Z"),
      citationWindowCandidates: window,
      projectDomain: PROJECT_DOMAIN
    });
    expect(summary.topics[0].outcome).toBe("performing");
  });
});
