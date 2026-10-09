"use server";

import { requireOperator } from "@/lib/admin/operator";
import { resolveBusinessContext } from "@/lib/projects/business-profile";
import { generateAddedPrompts, suggestPrompts } from "@/lib/projects/prompt-suggestions-llm";
import { suggestCompetitors } from "@/lib/competitors/competitor-suggestions-llm";
import { isGenericEntity } from "@/lib/entity-hygiene/generic-entities";
import { runProspectAudit } from "@/lib/studies/prospect-audit";
import type { ProspectAudit } from "@/lib/studies/prospect-audit-format";
import { runProspectCoverage } from "@/lib/studies/prospect-coverage";
import type { CoverageTopicResult } from "@/lib/studies/prospect-scorecard";
import { runSectorAnswer } from "@/lib/studies/run-sector-answer";
import {
  brandFromDomain,
  buildCustomStudy,
  CUSTOM_STUDY_LIMITS,
  ENGINES,
  normalizeStudyDomain,
  SECTORS,
  type AnswerRecord,
  type Engine
} from "@/lib/studies/sector-study";

/**
 * SECTOR-STUDY-1 — one step of a study from the operator console: one
 * question × the chosen engines × one sample, run in parallel.
 *
 * Why a step and not the whole study: 12 questions × 3 engines × 2 samples
 * is ~72 generation + 72 extraction calls, several minutes of work in a
 * 60 s function. The browser drives the steps and aggregates; each step is
 * budgeted against its own invocation (.claude/rules/scan.md).
 *
 * Two kinds of study: a predefined sector, or a custom one for one brand
 * (domain + the operator's questions + competitors), rebuilt and validated
 * here on every step — the browser's copy is never trusted.
 *
 * Gate: `requireOperator()` inside the action itself, never delegated to the
 * page (.claude/rules/admin.md). No database write — the only cost is the
 * provider calls, bounded by the inputs validated below.
 */
const STEP_BUDGET_MS = 45_000;

export type StudySpec =
  | { kind: "sector"; sectorId: string }
  | { kind: "custom"; domain: string; brand?: string; prompts: string[]; competitors: string[] };

export async function runSectorStudyStep(input: {
  spec: StudySpec;
  engines: Engine[];
  promptIndex: number;
  sample: number;
}): Promise<AnswerRecord[]> {
  await requireOperator("/admin/estudio");

  let sector;
  if (input.spec.kind === "sector") {
    const sectorId = input.spec.sectorId;
    sector = SECTORS.find((candidate) => candidate.id === sectorId);
    if (!sector) throw new Error("unknown_sector");
  } else {
    const built = buildCustomStudy(input.spec);
    if (!built.ok) throw new Error(built.error);
    sector = built.sector;
  }
  const engines = [...new Set(input.engines)].filter((engine): engine is Engine => ENGINES.includes(engine));
  if (engines.length === 0) throw new Error("no_engines");
  if (!Number.isInteger(input.promptIndex) || input.promptIndex < 0 || input.promptIndex >= sector.prompts.length) {
    throw new Error("bad_prompt_index");
  }
  if (!Number.isInteger(input.sample) || input.sample < 1 || input.sample > 3) throw new Error("bad_sample");

  const deadlineAt = Date.now() + STEP_BUDGET_MS;
  const config = sector;
  return Promise.all(
    engines.map((engine) =>
      runSectorAnswer({ sector: config, engine, promptIndex: input.promptIndex, sample: input.sample, deadlineAt })
    )
  );
}

export type PreparedBrandStudy =
  | {
      ok: true;
      domain: string;
      brand: string;
      profile: string;
      competitors: string[];
      /** Domain of each suggested competitor (by name), for the technical comparison. Hand-typed names have none. */
      competitorDomains: Record<string, string>;
      /** "failed" = the suggester threw; "empty" = it answered with nobody. Both are said on screen, never a silent empty box. */
      competitorsStatus: "ok" | "empty" | "failed";
      prompts: string[];
    }
  | { ok: false; error: string };

/**
 * "Preparar con IA" for a one-brand study: the same three calls a new project
 * makes in onboarding (business profile from the homepage, grounded
 * competitors, brand-neutral prompts), returned to the form for the operator
 * to review — never run straight into a study, and never persisted.
 * With a `zone` ("Alicante"), about a third of the questions are local
 * ("keywords" mode seeded with the zone); the rest are by service and sector.
 * `suggestPrompts` caps at 15, so any shortfall is filled by the "auto"
 * generator, always deduplicated against what is already there.
 */
export async function prepareBrandStudy(input: {
  domain: string;
  brand?: string;
  promptCount: number;
  zone?: string;
}): Promise<PreparedBrandStudy> {
  await requireOperator("/admin/estudio");

  const domain = normalizeStudyDomain(String(input.domain ?? ""));
  if (!domain) return { ok: false, error: "bad_domain" };
  const brand = (String(input.brand ?? "").trim() || brandFromDomain(domain)).slice(0, CUSTOM_STUDY_LIMITS.maxNameChars);
  const promptCount = Math.min(Math.max(Math.trunc(Number(input.promptCount) || 15), 5), CUSTOM_STUDY_LIMITS.maxPrompts);
  const zone = String(input.zone ?? "").trim().slice(0, 60);
  const localCount = zone ? Math.min(Math.round(promptCount / 3), 10) : 0;
  const country = "ES";
  const language = "es";

  const context = await resolveBusinessContext({ domain, country, language }).catch(
    () => ({ status: "unidentified", reason: "profile_failed" }) as const
  );
  if (context.status === "unidentified") return { ok: false, error: context.reason };
  const profile = context.profile;

  const [competitors, prompts] = await Promise.all([
    suggestStudyCompetitors({ brand, domain, country, language, profile }),
    (async () => {
      const service = (await suggestPrompts({ brand, domain, country, language, profile, limit: Math.min(promptCount - localCount, 15) }).catch(() => [])).map(
        (prompt) => prompt.text
      );
      const more = async (existing: string[], limit: number, keywords?: string[]) =>
        limit <= 0
          ? []
          : (
              await generateAddedPrompts({
                mode: keywords ? "keywords" : "auto",
                keywords,
                brand,
                domain,
                country,
                language,
                existingPromptTexts: existing,
                existingCategories: [],
                limit: Math.min(limit, 10),
                profile
              }).catch(() => [])
            ).map((prompt) => prompt.text);
      const local = await more(service, localCount, [zone]);
      let all = [...service, ...local];
      if (all.length < promptCount) all = [...all, ...(await more(all, promptCount - all.length))];
      return all.slice(0, promptCount);
    })()
  ]);

  return {
    ok: true,
    domain,
    brand,
    profile: `${profile.whatItSells} · ${profile.sector} / ${profile.subSector} · ${profile.geographicScope}`,
    competitors: competitors.names,
    competitorDomains: competitors.domains,
    competitorsStatus: competitors.status,
    prompts: prompts.filter((prompt) => prompt.length >= 5 && prompt.length <= CUSTOM_STUDY_LIMITS.maxPromptChars)
  };
}

/**
 * Competitors exactly as onboarding computes them: `suggestCompetitors` over
 * the business profile (grounded), then entity hygiene. That suggester
 * swallows provider errors and answers [] (it reports the incident itself),
 * so "failed" here only covers a throw; an empty answer is reported as
 * "empty" and the screen says so.
 */
async function suggestStudyCompetitors(input: {
  brand: string;
  domain: string;
  country: string;
  language: string;
  profile: Parameters<typeof suggestCompetitors>[0]["profile"];
}): Promise<{ names: string[]; domains: Record<string, string>; status: "ok" | "empty" | "failed" }> {
  try {
    const rows = (await suggestCompetitors({ ...input, limit: 8 }))
      .filter((row) => !isGenericEntity(row))
      .slice(0, CUSTOM_STUDY_LIMITS.maxCompetitors);
    return {
      names: rows.map((row) => row.name),
      domains: Object.fromEntries(rows.map((row) => [row.name, row.domain])),
      status: rows.length ? "ok" : "empty"
    };
  } catch {
    return { names: [], domains: {}, status: "failed" };
  }
}

/** Competitors only — what "Lanzar" calls when the operator left the box empty, so a study never runs without them by accident. */
export async function computeBrandCompetitors(input: {
  domain: string;
  brand?: string;
}): Promise<
  { ok: true; competitors: string[]; competitorDomains: Record<string, string>; status: "ok" | "empty" | "failed" } | { ok: false; error: string }
> {
  await requireOperator("/admin/estudio");
  const domain = normalizeStudyDomain(String(input.domain ?? ""));
  if (!domain) return { ok: false, error: "bad_domain" };
  const brand = (String(input.brand ?? "").trim() || brandFromDomain(domain)).slice(0, CUSTOM_STUDY_LIMITS.maxNameChars);
  const context = await resolveBusinessContext({ domain, country: "ES", language: "es" }).catch(
    () => ({ status: "unidentified", reason: "profile_failed" }) as const
  );
  if (context.status === "unidentified") return { ok: false, error: context.reason };
  const result = await suggestStudyCompetitors({ brand, domain, country: "ES", language: "es", profile: context.profile });
  return { ok: true, competitors: result.names, competitorDomains: result.domains, status: result.status };
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
