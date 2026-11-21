"use server";

import { requireOperator } from "@/lib/admin/operator";
import { runProspectAudit } from "@/lib/studies/prospect-audit";
import type { ProspectAudit } from "@/lib/studies/prospect-audit-format";
import { runProspectCoverage } from "@/lib/studies/prospect-coverage";
import type { CoverageTopicResult } from "@/lib/studies/prospect-scorecard";
import { brandFromDomain, CUSTOM_STUDY_LIMITS, normalizeStudyDomain, type AnswerRecord, type Engine } from "@/lib/studies/sector-study";
import {
  computeBrandCompetitorsCore,
  prepareBrandStudyCore,
  runStudyStep,
  STEP_BUDGET_MS,
  type PreparedBrandStudy,
  type StudySpec
} from "@/lib/studies/study-engine";

export type { PreparedBrandStudy, StudySpec };

/**
 * SECTOR-STUDY-1 — the operator console's entry points to the study engine
 * (`lib/studies/study-engine.ts`). Gate: `requireOperator()` inside each
 * action itself, never delegated to the page (.claude/rules/admin.md).
 */
export async function runSectorStudyStep(input: {
  spec: StudySpec;
  engines: Engine[];
  promptIndex: number;
  sample: number;
}): Promise<AnswerRecord[]> {
  await requireOperator("/admin/estudio");
  return runStudyStep(input);
}

/** "Preparar con IA" for a one-brand study. See `prepareBrandStudyCore`. */
export async function prepareBrandStudy(input: {
  domain: string;
  brand?: string;
  promptCount: number;
  zone?: string;
}): Promise<PreparedBrandStudy> {
  await requireOperator("/admin/estudio");
  return prepareBrandStudyCore(input);
}

/** Competitors only. See `computeBrandCompetitorsCore`. */
export async function computeBrandCompetitors(input: { domain: string; brand?: string }) {
  await requireOperator("/admin/estudio");
  return computeBrandCompetitorsCore(input);
}

/**
 * Technical audit: the homepage, robots/llms/sitemap, and — for the analysed
 * brand — up to `MAX_AUDIT_PAGES` own-domain pages that already came out of
 * the study (coverage pages, pages an engine cited). The browser's URLs are
 * not trusted: `selectCandidateUrls` keeps only https URLs on the domain, and
 * `fetchPageSafely` re-checks every one. No LLM, no rows written, no crawling.
 */
export async function runProspectAuditAction(input: {
  domain: string;
  coveragePages?: Array<{ url: string; topic: string }>;
  citedUrls?: Array<{ url: string; promptCount: number }>;
}): Promise<ProspectAudit | null> {
  await requireOperator("/admin/estudio");
  const domain = normalizeStudyDomain(String(input.domain ?? ""));
  if (!domain) return null;
  const urls = <T extends { url: unknown }>(list: T[] | undefined) =>
    (Array.isArray(list) ? list : []).filter((item) => typeof item?.url === "string" && item.url.length <= 2000).slice(0, 40);
  return runProspectAudit(domain, {
    coveragePages: urls(input.coveragePages).map((page) => ({ url: String(page.url), topic: String(page.topic ?? "").slice(0, 300) })),
    citedUrls: urls(input.citedUrls).map((page) => ({ url: String(page.url), promptCount: Math.max(1, Math.trunc(Number(page.promptCount) || 1)) }))
  });
}

/** Coverage calls per action: each is a grounded Gemini call plus redirect resolution, so two fit a 45 s budget. */
const COVERAGE_TOPICS_PER_STEP = 2;

/**
 * Content coverage for a batch of the study's questions: one grounded `site:`
 * search per question (`auditDomainContent`, the "Auditar mi web" call), own
 * domain verified fail-closed. This IS LLM spend — one call per question, at
 * most `CUSTOM_STUDY_LIMITS.maxPrompts` per report — and the report states
 * the count. Questions are validated like a study step; nothing is persisted.
 */
export async function runProspectCoverageStep(input: {
  domain: string;
  brand?: string;
  topics: Array<{ promptIndex: number; text: string }>;
}): Promise<CoverageTopicResult[]> {
  await requireOperator("/admin/estudio");
  const domain = normalizeStudyDomain(String(input.domain ?? ""));
  if (!domain) throw new Error("bad_domain");
  const brand = (String(input.brand ?? "").trim() || brandFromDomain(domain)).slice(0, CUSTOM_STUDY_LIMITS.maxNameChars);
  const topics = (Array.isArray(input.topics) ? input.topics : []).slice(0, COVERAGE_TOPICS_PER_STEP).map((topic) => ({
    promptIndex: Math.trunc(Number(topic?.promptIndex)),
    text: String(topic?.text ?? "").trim()
  }));
  if (
    topics.length === 0 ||
    topics.some(
      (topic) =>
        !Number.isInteger(topic.promptIndex) ||
        topic.promptIndex < 0 ||
        topic.promptIndex >= CUSTOM_STUDY_LIMITS.maxPrompts ||
        topic.text.length < 5 ||
        topic.text.length > CUSTOM_STUDY_LIMITS.maxPromptChars
    )
  ) {
    throw new Error("bad_topics");
  }
  return runProspectCoverage({ brand, domain, topics, deadlineAt: Date.now() + STEP_BUDGET_MS });
}
