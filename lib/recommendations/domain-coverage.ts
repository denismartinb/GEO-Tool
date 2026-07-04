import "server-only";

import { z } from "zod";
import { auditDomainContent } from "@/lib/llm/gemini";
import { resolveGroundingRedirects } from "@/lib/scan/citation-resolution";
import { checkGenerationRateLimit, type GenerationRateLimitConfig } from "@/lib/recommendations/generation-rate-limit";
import { isProOrAbove } from "@/lib/billing";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import { type createServiceClient } from "@/lib/supabase/service";
import { type AuthenticatedContext } from "@/lib/scan/types";

/**
 * "Auditar cobertura del dominio" (DOMAIN-COVERAGE-1): a standalone, Pro+-gated
 * feature that, for each of the latest completed scan's active prompt topics,
 * asks Gemini (with Google Search grounding restricted in the prompt to the
 * brand's own domain) whether that domain verifiably publishes content on the
 * topic. The result is a per-topic "coverage map" that distinguishes:
 *   - a CONTENT gap  (no own-domain page exists on the topic), from
 *   - a SURFACING gap (a page exists but AI doesn't cite it in scans),
 * which need opposite fixes. This lives on the Escaneos page, NOT bolted onto a
 * recommendation card.
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
 */

export const domainCoverageInputSchema = z.object({
  projectId: z.string().uuid()
});

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

export type DomainCoverageResult =
  | { success: true; coverage: DomainCoverageMap }
  | { success: false; error: string };

const GENERIC_FAILURE = "No se ha podido auditar la cobertura de tu dominio en este momento. Inténtalo de nuevo en unos minutos.";
const PLAN_REQUIRED_FAILURE = "Auditar la cobertura de tu dominio está disponible a partir del plan Pro.";
const RATE_LIMIT_FAILURE =
  "Has alcanzado el límite de auditorías de cobertura para este proyecto por hoy. Vuelve a intentarlo más tarde.";
const NO_SCAN_FAILURE = "Necesitas al menos un escaneo completado antes de auditar la cobertura de tu dominio.";
const NO_PROMPTS_FAILURE = "Este proyecto no tiene prompts activos que auditar.";
// Exported (read-only reuse, no behavior change here) so callers like
// coverage-overlay.ts can distinguish a genuinely-confirmed "not covered"
// topic from an inconclusive one (transient Gemini failure / budget cutoff)
// without string-matching a duplicated literal — both currently produce
// found:false, but only the former is safe to reframe as "possible content
// gap" (RECS-COVERAGE-OVERLAY-1).
export const NOT_COVERED_NOTE =
  "No hemos encontrado contenido publicado en tu dominio sobre este tema a través de la búsqueda de Google.";
export const COULD_NOT_VERIFY_NOTE = "No hemos podido verificar la cobertura de este tema en este momento.";

const LOG_PREFIX = "[geo:domain-coverage]";
const GENERATION_TYPE = "domain_coverage";
const RULE_ID = "domain_coverage_v1";

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

function parseCoverageMap(raw: string | null): DomainCoverageMap | null {
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

type ProjectRow = { id: string; brand: string; domain: string; language: string; is_archived: boolean };
type PromptRow = { id: string; prompt_text: string };

/**
 * Filters a topic's raw grounding chunks down to the pages that verifiably
 * belong to the project's own domain (invariant 1). A citation counts only if
 * its redirect resolves (fail-closed) to the project's own domain or a real
 * subdomain, label-boundary matched.
 */
async function verifyOwnDomainPages(
  chunks: Array<{ uri: string; title?: string }>,
  projectDomainNormalized: string
): Promise<DomainCoveragePage[]> {
  const resolvedByUri = await resolveGroundingRedirects(chunks.map((c) => c.uri));
  const pages: DomainCoveragePage[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const resolvedUrl = resolvedByUri.get(chunk.uri)?.resolvedUrl;
    if (!resolvedUrl) continue; // fail-closed: an unresolved redirect is never "own domain"
    const resolvedDomain = extractDomain(resolvedUrl);
    if (!resolvedDomain || !isSameOrSubdomain(resolvedDomain, projectDomainNormalized)) continue;
    if (seen.has(resolvedUrl)) continue;
    seen.add(resolvedUrl);
    pages.push({ url: resolvedUrl, title: sanitizeField(chunk.title ?? resolvedUrl, TITLE_MAX) });
    if (pages.length >= MAX_PAGES_PER_TOPIC) break;
  }
  return pages;
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
        .select("sanitized_content")
        .eq("project_id", projectId)
        .eq("generation_type", GENERATION_TYPE)
        .is("recommendation_id", null)
        .eq("status", "completed")
        .eq("is_sanitized", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "load_existing_coverage"
    );
    const existing = parseCoverageMap(
      (existingRaw as unknown as { sanitized_content: string | null } | null)?.sanitized_content ?? null
    );
    if (existing && existing.scanId === scanId) {
      return { success: true, coverage: existing };
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

    const selectedPrompts = prompts.slice(0, MAX_COVERAGE_TOPICS);
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

        const pages = await verifyOwnDomainPages(raw.groundingChunks, projectDomainNormalized);
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

    return { success: true, coverage };
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
