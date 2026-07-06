import "server-only";

import { z } from "zod";
import { auditDomainContent } from "@/lib/llm/gemini";
import { resolveGroundingRedirects } from "@/lib/scan/citation-resolution";
import { checkGenerationRateLimit, type GenerationRateLimitConfig } from "@/lib/recommendations/generation-rate-limit";
import { isProOrAbove } from "@/lib/billing";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import { type createServiceClient } from "@/lib/supabase/service";
import { type AuthenticatedContext } from "@/lib/scan/types";
import {
  parseCoverageMap,
  NOT_COVERED_NOTE,
  COULD_NOT_VERIFY_NOTE,
  type DomainCoveragePage,
  type DomainCoverageTopic,
  type DomainCoverageMap
} from "@/lib/web-audit/coverage-map";

// Re-exported for existing call sites (coverage-overlay.ts, the "Auditoría
// web" section, tests) — the canonical definitions now live in
// lib/web-audit/coverage-map.ts, shared with WEB-AUDIT-1's read-only usage.
export { NOT_COVERED_NOTE, COULD_NOT_VERIFY_NOTE };
export type { DomainCoveragePage, DomainCoverageTopic, DomainCoverageMap };

/**
 * "Auditar cobertura del dominio" (DOMAIN-COVERAGE-1): a standalone, Pro+-gated
 * feature that, for each of the latest completed scan's active prompt topics,
 * asks Gemini (with Google Search grounding restricted in the prompt to the
 * brand's own domain) whether that domain verifiably publishes content on the
 * topic. The result is a per-topic "coverage map" that distinguishes:
 *   - a CONTENT gap  (no own-domain page exists on the topic), from
 *   - a SURFACING gap (a page exists but AI doesn't cite it in scans),
 * which need opposite fixes. This lives on the "Auditoría web" page
 * (WEB-AUDIT-1; previously Escaneos), NOT bolted onto a recommendation card.
 *
 * Reviewed by data-guardian before implementation (APROBADO CON CONDICIONES).
 * Non-negotiable invariants enforced here:
 *
 * 1. The narrative note Gemini returns is NEVER treated as verified fact —
 *    grounding is response-level, not sentence-level. The only verified artifact
 *    is the list of pages (url + title) whose grounding citation actually
 *    resolves (fail-closed on an unresolved redirect) to the project's own
 *    domain (or a subdomain, label-boundary matched so "evilacme.com" can never
 *    match "acme.com"). When zero verified citations survive for a topic, we
 *    store a FIXED non-Gemini note, not the model's own text.
 * 2. Pro-plan gate reads `profiles.current_plan` directly via isProOrAbove and
 *    fails closed on anything but an exact "pro"/"agency" value (including a
 *    missing profile row) — never through getPlanForUser/resolvePlan.
 * 3. Every consumed Gemini call is persisted — including a "nothing found"
 *    result — so the rate limit reflects real spend and can't be evaded by
 *    discarding an unverifiable response.
 * 4. Persistence uses generation_type = "domain_coverage" with a NULL
 *    recommendation_id (data-guardian C1/C2: distinct type, conditional-
 *    nullability CHECK in migration 0013). Ownership is proven with the
 *    user-context `supabase` client before any service-role write; scan_id and
 *    prompt ids are derived server-side, never accepted from the client (C5).
 *
 * Topic selection: prompts backing an active add_citation_block gap this run
 * are audited first (see selectedPrompts below), filling any remaining budget
 * with other active prompts in creation order. Without this, a large prompt
 * set made it very unlikely the coverage budget (MAX_COVERAGE_TOPICS) ever
 * reached the specific prompt behind a real citation-gap card.
 */

export const domainCoverageInputSchema = z.object({
  projectId: z.string().uuid()
});

export type DomainCoverageResult =
  | { success: true; coverage: DomainCoverageMap; cached: boolean }
  | { success: false; error: string };

const GENERIC_FAILURE = "No se ha podido auditar la cobertura de tu dominio en este momento. Inténtalo de nuevo en unos minutos.";
const PLAN_REQUIRED_FAILURE = "Auditar la cobertura de tu dominio está disponible a partir del plan Pro.";
const RATE_LIMIT_FAILURE =
  "Has alcanzado el límite de auditorías de cobertura para este proyecto por hoy. Vuelve a intentarlo más tarde.";
const NO_SCAN_FAILURE = "Necesitas al menos un escaneo completado antes de auditar la cobertura de tu dominio.";
const NO_PROMPTS_FAILURE = "Este proyecto no tiene prompts activos que auditar.";

const LOG_PREFIX = "[geo:domain-coverage]";
const GENERATION_TYPE = "domain_coverage";
// Detection version. Bumped to v2 with WEB-AUDIT-DQ (keyword-subject grounding
// query, gemini.ts auditDomainContent). The cache lookup filters by this, so
// maps produced by an older, worse detection version are recomputed on the
// next audit instead of being served stale — a detection improvement must not
// be masked by a cached false-negative.
const RULE_ID = "domain_coverage_v2";

// Stricter, separately-scoped budget than the general 20/day rewrite pool: a
// coverage run is several live grounding searches plus redirect-resolution
// fetches — materially more expensive than a plain JSON generation call.
const DOMAIN_COVERAGE_RATE_LIMIT: GenerationRateLimitConfig = { window: "day", maxPerWindow: 5 };

// Bound how many topics a single run audits, and cap the total wall-clock spent
// on Gemini calls well under the page's maxDuration=60 (docs/adr/0003). Each
// topic is a sequential grounding call (up to GEMINI_CALL_TIMEOUT_MS=20s), so
// without a total budget a few slow calls could blow the platform ceiling and
// get the whole request killed before we ever persist a row (breaking
// invariant 3). Once the budget is exceeded, remaining topics are marked
// "could not verify" rather than dropped, and the (partial) map is persisted.
const MAX_COVERAGE_TOPICS = 6;
const COVERAGE_TOTAL_BUDGET_MS = 45_000;

const NOTE_MAX = 400;
const TITLE_MAX = 160;
const TOPIC_MAX = 300;
const MAX_PAGES_PER_TOPIC = 4;

const SUPABASE_CALL_TIMEOUT_MS = 8_000;

class OperationTimeoutError extends Error {
  constructor(stage: string) {
    super(`Operation timed out: ${stage}`);
    this.name = "OperationTimeoutError";
  }
}

function withTimeout<T>(promise: PromiseLike<T>, stage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OperationTimeoutError(stage)), SUPABASE_CALL_TIMEOUT_MS);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function isSameOrSubdomain(domain: string, root: string): boolean {
  if (!domain || !root) return false;
  return domain === root || domain.endsWith(`.${root}`);
}

function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.startsWith("www.") ? hostname.slice("www.".length) : hostname;
  } catch {
    return null;
  }
}

function sanitizeField(input: string, maxLen: number): string {
  let stripped = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    stripped += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return stripped
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

type ProjectRow = { id: string; brand: string; domain: string; language: string; is_archived: boolean };
type PromptRow = { id: string; prompt_text: string };

/**
 * Per-topic diagnostic counters (WEB-AUDIT-DQ): where own-domain pages are lost
 * along the grounding → resolve → domain-match pipeline. Sanitized (domains
 * only, no page content) and bounded, so it's safe to log. Used to confirm the
 * cause of coverage false-negatives (e.g. a large brand auditing 0/N) before
 * changing any detection behavior — see docs/specs/web-audit/phase-dq-coverage-quality.md.
 */
type OwnDomainDiag = {
  /** Grounding chunks Gemini returned for this topic. */
  chunks: number;
  /** Of those, how many redirects resolved to a real destination URL. */
  resolved: number;
  /** Of the resolved, how many matched the project's own domain / a subdomain. */
  own: number;
  /** Up to 3 distinct resolved domains that were NOT own-domain (sample). */
  otherDomainsSample: string[];
};

/**
 * Filters a topic's raw grounding chunks down to the pages that verifiably
 * belong to the project's own domain (invariant 1). A citation counts only if
 * its redirect resolves (fail-closed) to the project's own domain or a real
 * subdomain, label-boundary matched. Also returns a sanitized per-stage
 * diagnostic (WEB-AUDIT-DQ) — the returned `pages` and the coverage result are
 * byte-for-byte unchanged; `diag` is observability only.
 */
async function verifyOwnDomainPages(
  chunks: Array<{ uri: string; title?: string }>,
  projectDomainNormalized: string
): Promise<{ pages: DomainCoveragePage[]; diag: OwnDomainDiag }> {
  const resolvedByUri = await resolveGroundingRedirects(chunks.map((c) => c.uri));
  const pages: DomainCoveragePage[] = [];
  const seen = new Set<string>();
  const otherDomains = new Set<string>();
  let resolvedCount = 0;
  for (const chunk of chunks) {
    const resolvedUrl = resolvedByUri.get(chunk.uri)?.resolvedUrl;
    if (!resolvedUrl) continue; // fail-closed: an unresolved redirect is never "own domain"
    resolvedCount += 1;
    const resolvedDomain = extractDomain(resolvedUrl);
    if (!resolvedDomain || !isSameOrSubdomain(resolvedDomain, projectDomainNormalized)) {
      if (resolvedDomain && otherDomains.size < 3) otherDomains.add(resolvedDomain);
      continue;
    }
    if (seen.has(resolvedUrl)) continue;
    seen.add(resolvedUrl);
    pages.push({ url: resolvedUrl, title: sanitizeField(chunk.title ?? resolvedUrl, TITLE_MAX) });
    if (pages.length >= MAX_PAGES_PER_TOPIC) break;
  }
  return {
    pages,
    diag: { chunks: chunks.length, resolved: resolvedCount, own: pages.length, otherDomainsSample: [...otherDomains] }
  };
}

/**
 * WEB-AUDIT-DQ cache-hit diagnostic: reads the per-topic grounding-chunk counts
 * out of the persisted raw_content (shape: { topics: [{ promptId, groundingChunks }] })
 * and logs one line per topic. Fully defensive — a malformed/absent raw_content
 * just logs nothing. Observability only; never affects the returned map.
 */
function logCachedCoverageDiag(
  projectId: string,
  scanId: string,
  rawContent: string | null,
  coverage: DomainCoverageMap
): void {
  if (!rawContent) return;
  try {
    const parsed = JSON.parse(rawContent) as { topics?: Array<{ promptId?: string; groundingChunks?: unknown }> };
    const chunksByPrompt = new Map<string, number>();
    for (const t of parsed.topics ?? []) {
      if (typeof t?.promptId === "string") {
        chunksByPrompt.set(t.promptId, Array.isArray(t.groundingChunks) ? t.groundingChunks.length : 0);
      }
    }
    for (const topic of coverage.topics) {
      console.info(`${LOG_PREFIX}:dq cached_diag`, {
        project_id: projectId,
        scan_id: scanId,
        prompt_id: topic.promptId,
        found: topic.found,
        chunks: chunksByPrompt.get(topic.promptId) ?? 0
      });
    }
  } catch {
    // malformed raw_content — diagnostic is best-effort, never throws
  }
}

export async function auditDomainCoverageCore({
  projectId,
  supabase,
  service,
  user
}: {
  projectId: string;
  supabase: AuthenticatedContext["supabase"];
  service: ReturnType<typeof createServiceClient>;
  user: AuthenticatedContext["user"];
}): Promise<DomainCoverageResult> {
  try {
    // Ownership — proven with the user-context (RLS-scoped) client before any
    // service-role write (data-guardian C5).
    const { data: projectRaw, error: projectError } = await withTimeout(
      supabase
        .from("projects")
        .select("id, brand, domain, language, is_archived")
        .eq("id", projectId)
        .eq("owner_user_id", user.id)
        .maybeSingle(),
      "load_project"
    );

    const project = projectRaw as unknown as ProjectRow | null;
    if (projectError || !project) {
      return { success: false, error: feedbackErrorMessages.project_not_found };
    }
    if (project.is_archived) {
      return { success: false, error: feedbackErrorMessages.project_archived };
    }

    // Plan gate — invariant 2. Raw column value, never via resolvePlan.
    const { data: profileRaw } = await withTimeout(
      supabase.from("profiles").select("current_plan").eq("id", user.id).maybeSingle(),
      "load_plan"
    );
    if (!isProOrAbove((profileRaw as { current_plan?: string } | null)?.current_plan)) {
      return { success: false, error: PLAN_REQUIRED_FAILURE };
    }

    // Scan/prompt context is derived server-side (data-guardian C5): the latest
    // completed run of THIS project, and the project's active prompts.
    const { data: latestRunRaw } = await withTimeout(
      supabase
        .from("scan_runs")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "load_latest_run"
    );
    const scanId = (latestRunRaw as { id: string } | null)?.id ?? null;
    if (!scanId) {
      return { success: false, error: NO_SCAN_FAILURE };
    }

    const { data: promptRows } = await withTimeout(
      supabase
        .from("project_prompts")
        .select("id, prompt_text")
        .eq("project_id", projectId)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      "load_prompts"
    );
    const prompts = ((promptRows ?? []) as PromptRow[]).filter((p) => p.prompt_text?.trim());
    if (prompts.length === 0) {
      return { success: false, error: NO_PROMPTS_FAILURE };
    }

    // Cache (data-guardian C4): reuse the most recent coverage map for THIS
    // project only if it was derived from the current latest scan. `.is(null)`,
    // not `.eq(..., null)`, is required for a NULL column in PostgREST.
    const { data: existingRaw } = await withTimeout(
      service
        .from("generated_solutions")
        .select("sanitized_content, raw_content")
        .eq("project_id", projectId)
        .eq("generation_type", GENERATION_TYPE)
        .eq("rule_id", RULE_ID)
        .is("recommendation_id", null)
        .eq("status", "completed")
        .eq("is_sanitized", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "load_existing_coverage"
    );
    const existingRow = existingRaw as unknown as { sanitized_content: string | null; raw_content: string | null } | null;
    const existing = parseCoverageMap(existingRow?.sanitized_content ?? null);
    if (existing && existing.scanId === scanId) {
      // WEB-AUDIT-DQ: the fresh-path per-topic diagnostic can't run on a cache
      // hit (we return before the Gemini loop), so surface the equivalent
      // signal from the already-persisted raw grounding chunks — how many
      // chunks Gemini returned per topic. `chunks: 0` across topics points at
      // the query/grounding stage; `chunks > 0` with found:false points at
      // redirect-resolution / off-domain. No network, no Gemini spend.
      logCachedCoverageDiag(projectId, scanId, existingRow?.raw_content ?? null, existing);
      return { success: true, coverage: existing, cached: true };
    }

    console.info(`${LOG_PREFIX} start`, { project_id: projectId, scan_id: scanId, prompts: prompts.length });

    const rateLimit = await checkGenerationRateLimit(service, projectId, {
      config: DOMAIN_COVERAGE_RATE_LIMIT,
      generationType: GENERATION_TYPE
    });
    if (!rateLimit.allowed) {
      console.warn(`${LOG_PREFIX} rate_limited`, { project_id: projectId });
      return {
        success: false,
        error: rateLimit.reason === "rate_limit_exceeded" ? RATE_LIMIT_FAILURE : GENERIC_FAILURE
      };
    }

    // Prioritize prompts that actually back an active add_citation_block gap
    // this run (RECS-COVERAGE-OVERLAY-1's whole point is confirming/refuting
    // those gaps) — with a prompt set much larger than MAX_COVERAGE_TOPICS,
    // auditing "the first N active prompts" in creation order made it very
    // unlikely a real citation-gap card's own prompt was ever covered. Fall
    // back to creation order to fill any remaining budget.
    const { data: citationRecRows } = await withTimeout(
      supabase
        .from("recommendations")
        .select("evidence_json")
        .eq("project_id", projectId)
        .eq("run_id", scanId)
        .eq("status", "active")
        .eq("recommendation_type", "add_citation_block"),
      "load_citation_gap_recs"
    );
    const citationResultIds = ((citationRecRows ?? []) as Array<{ evidence_json: unknown }>)
      .map((row) => {
        const ev = row.evidence_json as { affected_prompt_details?: Array<{ id?: string }> } | null;
        return ev?.affected_prompt_details?.[0]?.id;
      })
      .filter((id): id is string => Boolean(id));

    let priorityPromptIds = new Set<string>();
    if (citationResultIds.length > 0) {
      const { data: resultRows } = await withTimeout(
        supabase
          .from("scan_prompt_results")
          .select("id, prompt_id")
          .eq("project_id", projectId)
          .eq("run_id", scanId)
          .in("id", citationResultIds),
        "load_citation_gap_prompt_ids"
      );
      priorityPromptIds = new Set(
        ((resultRows ?? []) as Array<{ id: string; prompt_id: string | null }>)
          .map((r) => r.prompt_id)
          .filter((id): id is string => Boolean(id))
      );
    }

    const priorityPrompts = prompts.filter((p) => priorityPromptIds.has(p.id));
    const otherPrompts = prompts.filter((p) => !priorityPromptIds.has(p.id));
    const selectedPrompts = [...priorityPrompts, ...otherPrompts].slice(0, MAX_COVERAGE_TOPICS);
    const projectDomainNormalized = normalizeDomain(project.domain);
    const topics: DomainCoverageTopic[] = [];
    const rawByPrompt: Array<{ promptId: string; text: string; groundingChunks: unknown }> = [];
    const startedAt = Date.now();

    for (const prompt of selectedPrompts) {
      const topic = sanitizeField(prompt.prompt_text, TOPIC_MAX);

      // Total-budget guard (see COVERAGE_TOTAL_BUDGET_MS): once exceeded, mark
      // the rest as "could not verify" instead of risking a platform kill.
      if (Date.now() - startedAt > COVERAGE_TOTAL_BUDGET_MS) {
        topics.push({ promptId: prompt.id, topic, found: false, pages: [], note: COULD_NOT_VERIFY_NOTE });
        continue;
      }

      try {
        const raw = await auditDomainContent({
          brand: project.brand,
          domain: project.domain,
          language: project.language,
          topic
        });
        rawByPrompt.push({ promptId: prompt.id, text: raw.text, groundingChunks: raw.groundingChunks });

        const { pages, diag } = await verifyOwnDomainPages(raw.groundingChunks, projectDomainNormalized);
        // WEB-AUDIT-DQ diagnostic: pinpoints where own-domain pages are lost
        // (Gemini returned nothing vs. redirects failing to resolve vs. results
        // resolving off-domain despite the site: restriction). Sanitized and
        // bounded. Remove/downgrade once the coverage false-negative is fixed.
        console.info(`${LOG_PREFIX}:dq topic_diag`, {
          project_id: projectId,
          scan_id: scanId,
          prompt_id: prompt.id,
          chunks: diag.chunks,
          resolved: diag.resolved,
          own: diag.own,
          other_domains: diag.otherDomainsSample
        });
        topics.push(
          pages.length > 0
            ? { promptId: prompt.id, topic, found: true, pages, note: sanitizeField(raw.text, NOTE_MAX) }
            : { promptId: prompt.id, topic, found: false, pages: [], note: NOT_COVERED_NOTE }
        );
      } catch (error) {
        // Fail-soft per topic: one failing grounding call never aborts the map.
        console.error(`${LOG_PREFIX} topic_failed`, {
          project_id: projectId,
          error_name: error instanceof Error ? error.name : "unknown"
        });
        topics.push({ promptId: prompt.id, topic, found: false, pages: [], note: COULD_NOT_VERIFY_NOTE });
      }
    }

    const coverage: DomainCoverageMap = {
      scanId,
      generatedAt: new Date().toISOString(),
      topics
    };

    // Persist unconditionally (invariant 3): every consumed run gets a row so
    // the rate limit reflects real spend, even a fully "not covered" result.
    const sanitizedAt = new Date().toISOString();
    const { error: insertError } = await withTimeout(
      service.from("generated_solutions").insert({
        recommendation_id: null,
        project_id: projectId,
        rule_id: RULE_ID,
        generation_type: GENERATION_TYPE,
        status: "completed",
        raw_content: JSON.stringify({ topics: rawByPrompt }),
        sanitized_content: JSON.stringify(coverage),
        is_sanitized: true,
        sanitized_at: sanitizedAt,
        provider: "gemini",
        evidence_json: {
          scan_id: scanId,
          prompt_ids: selectedPrompts.map((p) => p.id),
          topics: topics.map((t) => t.topic)
        }
      }),
      "persist_coverage"
    );

    if (insertError) {
      console.error(`${LOG_PREFIX} persist_failed`, { project_id: projectId });
      return { success: false, error: GENERIC_FAILURE };
    }

    console.info(`${LOG_PREFIX} persisted`, {
      project_id: projectId,
      scan_id: scanId,
      topics_count: topics.length,
      covered: topics.filter((t) => t.found).length
    });

    return { success: true, coverage, cached: false };
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      console.error(`${LOG_PREFIX} stage_timed_out`, { project_id: projectId, stage: error.message });
    } else {
      console.error(`${LOG_PREFIX} unexpected_error`, {
        project_id: projectId,
        error_name: error instanceof Error ? error.name : "unknown"
      });
    }
    return { success: false, error: GENERIC_FAILURE };
  }
}
