/**
 * Coverage-map types and parsing, shared between the domain-coverage
 * generation core (lib/recommendations/domain-coverage.ts) and the "Auditoría
 * web" section (WEB-AUDIT-1). Extracted rather than duplicated so both sides
 * agree on the exact persisted shape.
 *
 * Deliberately NOT marked `import "server-only"`: this is pure parsing logic
 * with no I/O, importable from Vitest and from server components alike (same
 * pattern as lib/recommendations/generation-rate-limit.ts).
 */

export type DomainCoveragePage = { url: string; title: string };

export type DomainCoverageTopic = {
  promptId: string;
  topic: string;
  found: boolean;
  pages: DomainCoveragePage[];
  note: string;
};

export type DomainCoverageMap = {
  scanId: string;
  generatedAt: string;
  topics: DomainCoverageTopic[];
};

// Exported (read-only reuse, no behavior change) so callers like
// coverage-overlay.ts and the web-audit opportunity matrix can distinguish a
// genuinely-confirmed "not covered" topic from an inconclusive one (transient
// Gemini failure / budget cutoff) without string-matching a duplicated
// literal — both currently produce found:false, but only the former is safe
// to reframe as "possible content gap" / count toward coverage denominators.
export const NOT_COVERED_NOTE =
  "No hemos encontrado contenido publicado en tu dominio sobre este tema a través de la búsqueda de Google.";
export const COULD_NOT_VERIFY_NOTE = "No hemos podido verificar la cobertura de este tema en este momento.";

export function parseCoverageMap(raw: string | null): DomainCoverageMap | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.scanId !== "string" || typeof parsed.generatedAt !== "string" || !Array.isArray(parsed.topics)) {
      return null;
    }
    const topics = parsed.topics.filter((t): t is DomainCoverageTopic => {
      const c = t as Record<string, unknown> | null;
      return (
        Boolean(c) &&
        typeof c?.promptId === "string" &&
        typeof c?.topic === "string" &&
        typeof c?.found === "boolean" &&
        typeof c?.note === "string" &&
        Array.isArray(c?.pages)
      );
    });
    return { scanId: parsed.scanId, generatedAt: parsed.generatedAt, topics };
  } catch {
    return null;
  }
}
