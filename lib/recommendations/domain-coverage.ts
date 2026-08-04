import "server-only";

import { z } from "zod";
import { auditDomainContent } from "@/lib/llm/gemini";
import { resolveGroundingRedirects } from "@/lib/scan/citation-resolution";
import { checkGenerationRateLimit, type GenerationRateLimitConfig } from "@/lib/recommendations/generation-rate-limit";
import { isProOrAbove } from "@/lib/billing";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import { type AuditFailureReason } from "@/lib/web-audit/audit-failure";
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
 * set made it very unlikely the coverage budget (BATCH_TOPICS_PER_CALL) ever
 * reached the specific prompt behind a real citation-gap card.
 *
 * WEB-AUDIT-CHAIN (2026-07-09): a single request can only afford
 * BATCH_TOPICS_PER_CALL sequential Gemini grounding calls under the page's
 * maxDuration=60 (ADR-0003) — for a project with many more active prompts
 * than that (49 on a real account), the old single-shot design meant most
 * prompts were NEVER audited, no matter how many times "Auditar ahora" was
 * clicked, because prompt selection was deterministic. This mirrors
 * SCAN-CHAIN-1 (docs/adr/0014) instead: one campaign spans multiple batched
 * requests, driven from the founder's own authenticated browser session
 * (foreground-only — ADR-0014's own addendum found the background
 * `after()`-driven self-chain unreliable behind Vercel preview-deployment
 * protection, so this skips that path entirely and only does the proven
 * foreground loop).
 *
 * Persistence model: the FIRST batch of a new campaign inserts one
 * `generated_solutions` row with status='running' (allowed by
 * gensol_status_chk) holding the topics covered so far. Every following
 * batch UPDATEs that SAME row — never inserts a new one — so the campaign
 * counts as exactly ONE unit against DOMAIN_COVERAGE_RATE_LIMIT (5/day)
 * regardless of how many requests it takes (checkGenerationRateLimit counts
 * rows, not calls). The rate limit is therefore checked only when starting a
 * brand-new campaign; resuming an existing 'running' row for the same scanId
 * skips it entirely (it was already counted at creation). The final batch
 * flips status to 'completed'. "Remaining prompts to audit" is recomputed
 * fresh every call from (active prompts) minus (promptIds already present in
 * the persisted topics) — not fixed at campaign creation — so an edited
 * prompt set self-corrects mid-campaign with no extra bookkeeping, and a
 * campaign abandoned mid-flight (tab closed) simply resumes from wherever it
 * left off the next time "Auditar ahora" is clicked, with no stale-run
 * reconciliation needed (unlike scan_runs, an unfinished coverage campaign
 * has no "stuck" failure mode — it just waits).
 */

export const domainCoverageInputSchema = z.object({
  projectId: z.string().uuid()
});

export type DomainCoverageResult =
  | {
      success: true;
      coverage: DomainCoverageMap;
      cached: boolean;
      /**
       * "running" when active prompts remain unaudited this campaign — the
       * caller (run-audit-button.tsx) should call again to continue.
       * "completed" once every active prompt has a result.
       */
      status: "running" | "completed";
      /** Total active prompts this campaign covers — for progress display
       * (coverage.topics.length / totalPrompts). */
      totalPrompts: number;
    }
  | {
      success: false;
      error: string;
      /**
       * Machine-readable classification of `error`, so a caller that must
       * decide whether retrying could ever help (AUDIT-AFTER-SCAN-1's backend
       * runner) never has to match on Spanish prose. Required, not optional:
       * a new failure path that forgets to classify itself should fail the
       * typecheck, not default to "retry forever". See audit-failure.ts.
       */
      reason: AuditFailureReason;
    };

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

// Bound how many topics a single BATCH (one request/call) audits, and cap the
// wall-clock spent on Gemini calls in that batch well under the page's
// maxDuration=60 (docs/adr/0003). Each topic is a sequential grounding call
// (up to GEMINI_CALL_TIMEOUT_MS=20s), so without a per-batch budget a few slow
// calls could blow the platform ceiling and get the whole request killed
// before we ever persist a row (breaking invariant 3) — with NO response ever
// reaching the client, which looks like "stays on Auditando… forever" rather
// than a clean error. Once the budget is exceeded, the loop simply stops
// selecting more topics THIS batch (see the per-topic loop below); anything
// not yet attempted stays unaudited and is picked up normally by the next
// chained batch (WEB-AUDIT-CHAIN) instead of being lost or wasted as
// inconclusive.
//
// Kept deliberately small — smaller than the 6/45s that shipped with the
// initial WEB-AUDIT-CHAIN cut — after a real 49-prompt campaign combined with
// GEMINI_CALL_PACING_MS below pushed batches close enough to the platform
// ceiling to risk a silent kill. A smaller, safer batch also means more
// frequent progress updates in the UI, which reads as "working" instead of
// "stuck" during a long campaign.
const BATCH_TOPICS_PER_CALL = 4;
const BATCH_TIME_BUDGET_MS = 30_000;

// Spacing between sequential Gemini grounding calls within one batch
// (WEB-AUDIT-CHAIN, 2026-07-09): before chaining, a single audit made at most
// BATCH_TOPICS_PER_CALL calls total, once every few minutes at most (manual
// click + the 5/day limit) — a tight back-to-back loop never tripped
// anything. Chaining raised real sustained call volume (a 49-prompt campaign
// now fires ~49 grounding calls across ~8 batches within roughly a minute),
// which is exactly the shape that trips a provider's requests-per-minute
// quota even while comfortably under its daily one. This delay keeps a
// batch's own calls spaced out; the topic_failed log below also now
// includes the real error message (previously only error.name, which for
// every Gemini API failure is the same generic "Error") so a genuine quota
// hit is visible in logs instead of silently guessed at.
const GEMINI_CALL_PACING_MS = 700;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/**
 * Reads the prior batches' raw grounding data out of a campaign row's
 * raw_content (WEB-AUDIT-CHAIN), so a continuation batch can append to it
 * instead of discarding earlier batches' data. Defensive: malformed/absent
 * raw_content yields an empty array rather than throwing.
 */
function parsePriorRawTopics(
  rawContent: string | null
): Array<{ promptId: string; text: string; groundingChunks: unknown }> {
  if (!rawContent) return [];
  try {
    const parsed = JSON.parse(rawContent) as { topics?: unknown };
    return Array.isArray(parsed.topics)
      ? (parsed.topics as Array<{ promptId: string; text: string; groundingChunks: unknown }>)
      : [];
  } catch {
    return [];
  }
}

export async function auditDomainCoverageCore({
  projectId,
  supabase,
  service,
  user,
  trigger = "manual"
}: {
  projectId: string;
  supabase: AuthenticatedContext["supabase"];
  service: ReturnType<typeof createServiceClient>;
  /**
   * Only `.id` is read, and only to prove ownership. Narrowed from the full
   * Supabase `User` so the backend post-scan runner (AUDIT-AFTER-SCAN-1) can
   * pass the project's owner id without fabricating a session object — a real
   * `AuthenticatedContext["user"]` still satisfies this.
   */
  user: Pick<AuthenticatedContext["user"], "id">;
  /**
   * `"automatic"` = the post-scan backend runner (AUDIT-AFTER-SCAN-1), which
   * skips the 5/day campaign rate limit. That limit exists to bound what a
   * human can trigger by clicking; the automatic path is bounded by something
   * stricter — it runs at most once per completed scan run, and each run is
   * already capped by the plan's own scan allowance. Leaving the limit on
   * would mean the 6th scan of a day silently ships without an audit, which
   * is exactly the failure this phase exists to remove. The PLAN gate below
   * is NOT bypassed: it is a commercial boundary, not a rate limit.
   */
  trigger?: "manual" | "automatic";
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
      return { success: false, error: feedbackErrorMessages.project_not_found, reason: "project_not_found" };
    }
    if (project.is_archived) {
      return { success: false, error: feedbackErrorMessages.project_archived, reason: "project_archived" };
    }

    // Plan gate — invariant 2. Raw column value, never via resolvePlan.
    const { data: profileRaw } = await withTimeout(
      supabase.from("profiles").select("current_plan").eq("id", user.id).maybeSingle(),
      "load_plan"
    );
    if (!isProOrAbove((profileRaw as { current_plan?: string } | null)?.current_plan)) {
      return { success: false, error: PLAN_REQUIRED_FAILURE, reason: "plan_required" };
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
      return { success: false, error: NO_SCAN_FAILURE, reason: "no_scan" };
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
      return { success: false, error: NO_PROMPTS_FAILURE, reason: "no_prompts" };
    }

    // Existing campaign row for THIS project (any status). Used to (a) serve a
    // completed cache hit for the current scan, (b) resume an in-progress
    // campaign for the current scan (WEB-AUDIT-CHAIN), or (c) detect a
    // stale/abandoned campaign from an older scan, which is never resumed — a
    // fresh campaign starts instead. `.is(null)`, not `.eq(..., null)`, is
    // required for a NULL column in PostgREST.
    const { data: existingRaw } = await withTimeout(
      service
        .from("generated_solutions")
        .select("id, status, sanitized_content, raw_content")
        .eq("project_id", projectId)
        .eq("generation_type", GENERATION_TYPE)
        .eq("rule_id", RULE_ID)
        .is("recommendation_id", null)
        .in("status", ["completed", "running"])
        .eq("is_sanitized", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "load_existing_coverage"
    );
    const existingRow = existingRaw as unknown as {
      id: string;
      status: string;
      sanitized_content: string | null;
      raw_content: string | null;
    } | null;
    const existing = parseCoverageMap(existingRow?.sanitized_content ?? null);
    const existingMatchesScan = Boolean(existing && existing.scanId === scanId);

    if (existingRow?.status === "completed" && existingMatchesScan) {
      // WEB-AUDIT-DQ: the fresh-path per-topic diagnostic can't run on a cache
      // hit (we return before the Gemini loop), so surface the equivalent
      // signal from the already-persisted raw grounding chunks — how many
      // chunks Gemini returned per topic. `chunks: 0` across topics points at
      // the query/grounding stage; `chunks > 0` with found:false points at
      // redirect-resolution / off-domain. No network, no Gemini spend.
      logCachedCoverageDiag(projectId, scanId, existingRow.raw_content, existing!);
      return { success: true, coverage: existing!, cached: true, status: "completed", totalPrompts: prompts.length };
    }

    // Resuming an in-progress campaign for THIS scan skips the rate-limit
    // check entirely — it was already consumed when the campaign's row was
    // first inserted, and checkGenerationRateLimit counts rows (not calls), so
    // re-checking here could spuriously block a campaign that is already one
    // of today's counted units from continuing past the limit boundary.
    const resuming = existingRow?.status === "running" && existingMatchesScan;

    if (!resuming && trigger === "manual") {
      const rateLimit = await checkGenerationRateLimit(service, projectId, {
        config: DOMAIN_COVERAGE_RATE_LIMIT,
        generationType: GENERATION_TYPE
      });
      if (!rateLimit.allowed) {
        console.warn(`${LOG_PREFIX} rate_limited`, { project_id: projectId });
        return {
          success: false,
          error: rateLimit.reason === "rate_limit_exceeded" ? RATE_LIMIT_FAILURE : GENERIC_FAILURE,
          reason: rateLimit.reason === "rate_limit_exceeded" ? "rate_limited" : "generic"
        };
      }
    }

    // Remaining prompts for this campaign: every active prompt not already
    // covered by an earlier batch. Recomputed fresh every call (not fixed at
    // campaign creation) so an edited prompt set self-corrects mid-campaign.
    const alreadyCoveredTopics = resuming ? existing!.topics : [];
    const coveredPromptIds = new Set(alreadyCoveredTopics.map((t) => t.promptId));
    const remainingPrompts = prompts.filter((p) => !coveredPromptIds.has(p.id));

    console.info(`${LOG_PREFIX} ${resuming ? "resume" : "start"}`, {
      project_id: projectId,
      scan_id: scanId,
      prompts: prompts.length,
      already_covered: alreadyCoveredTopics.length
    });

    // Prioritize prompts that actually back an active add_citation_block gap
    // this run (RECS-COVERAGE-OVERLAY-1's whole point is confirming/refuting
    // those gaps) — with a prompt set much larger than BATCH_TOPICS_PER_CALL,
    // auditing "the first N remaining prompts" in creation order made it very
    // unlikely a real citation-gap card's own prompt was ever covered. Fall
    // back to creation order to fill any remaining batch capacity.
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

    const priorityPrompts = remainingPrompts.filter((p) => priorityPromptIds.has(p.id));
    const otherPrompts = remainingPrompts.filter((p) => !priorityPromptIds.has(p.id));
    const selectedPrompts = [...priorityPrompts, ...otherPrompts].slice(0, BATCH_TOPICS_PER_CALL);
    const projectDomainNormalized = normalizeDomain(project.domain);
    const topics: DomainCoverageTopic[] = [];
    const rawByPrompt: Array<{ promptId: string; text: string; groundingChunks: unknown }> = [];
    const startedAt = Date.now();

    for (const prompt of selectedPrompts) {
      // Per-batch budget guard (see BATCH_TIME_BUDGET_MS): once exceeded, stop
      // attempting more topics THIS batch rather than risking a platform kill.
      // Unlike the pre-chaining design, a prompt not yet attempted is left OUT
      // of `topics` entirely (not marked "could not verify") — it simply
      // remains in the campaign's remaining-prompts set and is picked up
      // normally by the next chained batch (WEB-AUDIT-CHAIN), instead of being
      // permanently wasted as inconclusive.
      if (Date.now() - startedAt > BATCH_TIME_BUDGET_MS) break;

      const topic = sanitizeField(prompt.prompt_text, TOPIC_MAX);

      // Space out sequential Gemini calls within this batch (see
      // GEMINI_CALL_PACING_MS) — skip before the very first call, no point
      // delaying a request that's about to fire immediately anyway.
      if (topics.length > 0) await delay(GEMINI_CALL_PACING_MS);

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
        // error_message is safe to log: auditDomainContent only ever throws
        // GeminiTimeoutError, GeminiConfigError, or an Error built from
        // getGeminiApiError(status) — all fixed, pre-sanitized strings, never
        // a raw provider stack trace (reliability rule: no raw errors in
        // logs). This is what actually distinguishes a real quota hit (429 →
        // "Gemini API quota or rate limit reached.") from a timeout or a
        // config problem, instead of every failure looking identical.
        console.error(`${LOG_PREFIX} topic_failed`, {
          project_id: projectId,
          error_name: error instanceof Error ? error.name : "unknown",
          error_message: error instanceof Error ? error.message : "unknown"
        });
        topics.push({ promptId: prompt.id, topic, found: false, pages: [], note: COULD_NOT_VERIFY_NOTE });
      }
    }

    // Merge this batch's results into the campaign's accumulated topics
    // (WEB-AUDIT-CHAIN). Dedupe by promptId defensively — a racing duplicate
    // driver call (e.g. two tabs) re-selecting an overlapping batch before
    // either persists is a low-stakes edge case (wasted Gemini spend, not data
    // corruption); this just keeps the merged map from listing a topic twice.
    const seenPromptIds = new Set<string>();
    const allTopics: DomainCoverageTopic[] = [];
    for (const t of [...alreadyCoveredTopics, ...topics]) {
      if (seenPromptIds.has(t.promptId)) continue;
      seenPromptIds.add(t.promptId);
      allTopics.push(t);
    }
    const stillRemaining = prompts.some((p) => !seenPromptIds.has(p.id));
    const campaignStatus: "running" | "completed" = stillRemaining ? "running" : "completed";

    const coverage: DomainCoverageMap = {
      scanId,
      generatedAt: new Date().toISOString(),
      topics: allTopics
    };

    // Persist unconditionally (invariant 3): every consumed batch gets a row/
    // update so the rate limit reflects real spend, even a fully "not
    // covered" partial result. First batch of a campaign INSERTs; every
    // following batch UPDATEs the SAME row (never inserts again) — this is
    // what makes one campaign count as exactly one unit of
    // DOMAIN_COVERAGE_RATE_LIMIT regardless of how many chained requests it
    // takes.
    const sanitizedAt = new Date().toISOString();
    const mergedRawTopics = resuming
      ? [...parsePriorRawTopics(existingRow!.raw_content), ...rawByPrompt]
      : rawByPrompt;
    const persistPayload = {
      recommendation_id: null,
      project_id: projectId,
      rule_id: RULE_ID,
      generation_type: GENERATION_TYPE,
      status: campaignStatus,
      raw_content: JSON.stringify({ topics: mergedRawTopics }),
      sanitized_content: JSON.stringify(coverage),
      is_sanitized: true,
      sanitized_at: sanitizedAt,
      provider: "gemini",
      evidence_json: {
        scan_id: scanId,
        prompt_ids: allTopics.map((t) => t.promptId),
        topics: allTopics.map((t) => t.topic)
      }
    };

    const { error: persistError } = resuming
      ? await withTimeout(
          service.from("generated_solutions").update(persistPayload).eq("id", existingRow!.id),
          "persist_coverage"
        )
      : await withTimeout(service.from("generated_solutions").insert(persistPayload), "persist_coverage");

    if (persistError) {
      console.error(`${LOG_PREFIX} persist_failed`, { project_id: projectId });
      return { success: false, error: GENERIC_FAILURE, reason: "generic" };
    }

    console.info(`${LOG_PREFIX} ${campaignStatus === "completed" ? "completed" : "batch_persisted"}`, {
      project_id: projectId,
      scan_id: scanId,
      topics_count: allTopics.length,
      total_prompts: prompts.length,
      covered: allTopics.filter((t) => t.found).length
    });

    return { success: true, coverage, cached: false, status: campaignStatus, totalPrompts: prompts.length };
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      console.error(`${LOG_PREFIX} stage_timed_out`, { project_id: projectId, stage: error.message });
    } else {
      console.error(`${LOG_PREFIX} unexpected_error`, {
        project_id: projectId,
        error_name: error instanceof Error ? error.name : "unknown"
      });
    }
    return { success: false, error: GENERIC_FAILURE, reason: "generic" };
  }
}
