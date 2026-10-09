import "server-only";

import { verifyOwnDomainPages } from "@/lib/recommendations/domain-coverage";
import { sanitizeField } from "@/lib/text/sanitize";
import { auditDomainContent } from "@/lib/web-audit/audit-domain-content";
import type { CoverageTopicResult } from "@/lib/studies/prospect-scorecard";

/**
 * SECTOR-STUDY-1 (prospect report) — content coverage for a domain that is not
 * a project: for each question, the same grounded `site:` call "Auditar mi
 * web" makes (`auditDomainContent`) and the same fail-closed own-domain check
 * (`verifyOwnDomainPages`). A topic only counts as covered when a grounding
 * citation resolves to the domain itself; a failed call is "failed", which
 * the report treats as inconclusive — never as "no content".
 *
 * Sequential with the product's 700 ms pacing, and budgeted against the
 * caller's deadline: a topic that would start too late is returned
 * "skipped", not attempted. Nothing is persisted. Never throws.
 */
const PACING_MS = 700;
/** auditDomainContent's own retries plus redirect resolution can take this long; don't start one with less. */
const MIN_TOPIC_BUDGET_MS = 18_000;
const NOTE_MAX = 400;

export async function runProspectCoverage(input: {
  brand: string;
  domain: string;
  topics: Array<{ promptIndex: number; text: string }>;
  deadlineAt: number;
}): Promise<CoverageTopicResult[]> {
  const out: CoverageTopicResult[] = [];
  for (const topic of input.topics) {
    if (input.deadlineAt - Date.now() < MIN_TOPIC_BUDGET_MS) {
      out.push({ promptIndex: topic.promptIndex, status: "skipped", pages: [], aiNote: null });
      continue;
    }
    if (out.length > 0) await new Promise((resolve) => setTimeout(resolve, PACING_MS));
    try {
      const raw = await auditDomainContent({ brand: input.brand, domain: input.domain, language: "es", topic: topic.text });
      const { pages } = await verifyOwnDomainPages(raw.groundingChunks, input.domain);
      out.push({
        promptIndex: topic.promptIndex,
        status: "ok",
        pages,
        // The model's own description: an interpretation, shown as such, never the verdict.
        aiNote: pages.length > 0 ? sanitizeField(raw.text, NOTE_MAX) : null
      });
    } catch {
      out.push({ promptIndex: topic.promptIndex, status: "failed", pages: [], aiNote: null });
    }
  }
  return out;
}
