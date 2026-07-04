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
 * "Auditar mi web" (RECS-4B): an on-demand, Pro+-gated Gemini call using
 * Google Search grounding restricted (in the prompt) to the project's own
 * domain, so a recommendation asset can cite what's already published there
 * instead of a generic template.
 *
 * Reviewed by data-guardian before implementation. Three non-negotiable
 * invariants from that review, all enforced in this file:
 *
 * 1. The narrative text Gemini returns is NEVER treated as a verified fact —
 *    grounding is response-level, not sentence-level, so "at least one
 *    citation resolved to the own domain" does not mean every claim in the
 *    text is backed by it. The only verified artifact is the list of pages
 *    (url + title) whose grounding citation actually resolved to the
 *    project's own domain; the narrative is kept only as a clearly-labelled
 *    AI interpretation for context, same framing already used for every
 *    other generated_solutions artifact ("revisa antes de confiar/usar").
 * 2. The Pro-plan gate reads `profiles.current_plan` directly and fails
 *    closed on anything other than an exact "pro"/"agency" value (including
 *    a missing profile row) — never through `getPlanForUser`/`resolvePlan`,
 *    which default a missing/unrecognized plan to "pro" for the numeric-caps
 *    UI (safe there, unsafe as a feature gate).
 * 3. Every consumed Gemini call is persisted — including a "not found"
 *    result — so `checkGenerationRateLimit`'s count reflects real spend.
 *    Discarding an unverifiable response without persisting anything would
 *    let a caller retry indefinitely inside the rate-limit window.
 *
 * Persistence model matches lib/recommendations/rewrite-recommendation.ts:
 * ownership proven with the user-context `supabase` client, all writes go
 * through `generated_solutions` via the service-role client (RLS on that
 * table is select-only for the browser/user context, 0005_generated_solutions.sql).
 */

export const domainAuditInputSchema = z.object({
  projectId: z.string().uuid(),
  recommendationId: z.string().uuid()
});

export type DomainAuditPage = { url: string; title: string };

export type DomainAuditSolution = {
  found: boolean;
  pages: DomainAuditPage[];
  note: string;
};

export type DomainAuditResult = { success: true; solution: DomainAuditSolution } | { success: false; error: string };

const GENERIC_AUDIT_FAILURE = "No se ha podido auditar tu dominio en este momento. Inténtalo de nuevo en unos minutos.";
const PLAN_REQUIRED_FAILURE = "Auditar tu dominio está disponible a partir del plan Pro.";
const RATE_LIMIT_FAILURE =
  "Has alcanzado el límite de auditorías de dominio para este proyecto por hoy. Vuelve a intentarlo más tarde.";
const NOT_FOUND_NOTE =
  "No hemos encontrado contenido publicado en tu dominio sobre este tema a través de la búsqueda de Google.";

const LOG_PREFIX = "[geo:domain-audit]";
const GENERATION_TYPE = "domain_audit";

// Stricter, separately-scoped budget than the general 20/day rewrite limit
// (data-guardian review): a domain audit is a live grounding search plus up
// to several redirect-resolution fetches per call — materially more
// expensive than a plain JSON generation call.
const DOMAIN_AUDIT_RATE_LIMIT: GenerationRateLimitConfig = { window: "day", maxPerWindow: 5 };

const NOTE_MAX = 400;
const TITLE_MAX = 160;
const MAX_PAGES = 5;
const TOPIC_MAX = 500;

// Only the Gemini fetch is bounded inside lib/llm/gemini.ts; the Supabase
// reads/writes below have no library-level timeout, so each is bounded here,
// mirroring lib/recommendations/rewrite-recommendation.ts.
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

function parseDomainAuditContent(raw: string | null): DomainAuditSolution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.found !== "boolean" || typeof parsed.note !== "string" || !Array.isArray(parsed.pages)) {
      return null;
    }
    const pages = parsed.pages.filter((p): p is DomainAuditPage => {
      const candidate = p as Record<string, unknown> | null;
      return Boolean(candidate) && typeof candidate?.url === "string" && typeof candidate?.title === "string";
    });
    return { found: parsed.found, note: parsed.note, pages };
  } catch {
    return null;
  }
}

type ProjectRow = { id: string; brand: string; domain: string; language: string; is_archived: boolean };
type RecommendationRow = { id: string; title: string; description: string; recommendation_type: string };

export async function auditDomainContentCore({
  projectId,
  recommendationId,
  supabase,
  service,
  user
}: {
  projectId: string;
  recommendationId: string;
  supabase: AuthenticatedContext["supabase"];
  service: ReturnType<typeof createServiceClient>;
  user: AuthenticatedContext["user"];
}): Promise<DomainAuditResult> {
  try {
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

    // Plan gate — see invariant 2 in the module doc comment. Reads the raw
    // column value directly, never via getPlanForUser/resolvePlan.
    const { data: profileRaw } = await withTimeout(
      supabase.from("profiles").select("current_plan").eq("id", user.id).maybeSingle(),
      "load_plan"
    );
    if (!isProOrAbove((profileRaw as { current_plan?: string } | null)?.current_plan)) {
      return { success: false, error: PLAN_REQUIRED_FAILURE };
    }

    const { data: recommendationRaw, error: recommendationError } = await withTimeout(
      supabase
        .from("recommendations")
        .select("id, title, description, recommendation_type")
        .eq("id", recommendationId)
        .eq("project_id", projectId)
        .maybeSingle(),
      "load_recommendation"
    );

    const recommendation = recommendationRaw as unknown as RecommendationRow | null;
    if (recommendationError || !recommendation) {
      return { success: false, error: "No se ha encontrado la recomendación solicitada." };
    }

    // Idempotent: an existing completed+sanitized audit for this exact
    // recommendation is returned without a second Gemini call.
    const { data: existingRaw } = await withTimeout(
      service
        .from("generated_solutions")
        .select("sanitized_content")
        .eq("project_id", projectId)
        .eq("recommendation_id", recommendationId)
        .eq("generation_type", GENERATION_TYPE)
        .eq("status", "completed")
        .eq("is_sanitized", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "load_existing_audit"
    );

    const existing = parseDomainAuditContent(
      (existingRaw as unknown as { sanitized_content: string | null } | null)?.sanitized_content ?? null
    );
    if (existing) {
      return { success: true, solution: existing };
    }

    console.info(`${LOG_PREFIX} start`, { project_id: projectId, recommendation_id: recommendationId });

    // Separate, stricter budget than the general rewrite pool — see
    // invariant 3 in the module doc comment for why every call below must
    // persist a row regardless of outcome.
    const rateLimit = await checkGenerationRateLimit(service, projectId, {
      config: DOMAIN_AUDIT_RATE_LIMIT,
      generationType: GENERATION_TYPE
    });
    if (!rateLimit.allowed) {
      console.warn(`${LOG_PREFIX} rate_limited`, { project_id: projectId, recommendation_id: recommendationId });
      return {
        success: false,
        error: rateLimit.reason === "rate_limit_exceeded" ? RATE_LIMIT_FAILURE : GENERIC_AUDIT_FAILURE
      };
    }

    const topic = sanitizeField(`${recommendation.title}. ${recommendation.description}`, TOPIC_MAX);

    let raw: Awaited<ReturnType<typeof auditDomainContent>>;
    const geminiCallStartedAt = Date.now();
    try {
      raw = await auditDomainContent({
        brand: project.brand,
        domain: project.domain,
        language: project.language,
        topic
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} gemini_call_failed`, {
        project_id: projectId,
        recommendation_id: recommendationId,
        duration_ms: Date.now() - geminiCallStartedAt,
        error_name: error instanceof Error ? error.name : "unknown"
      });
      return { success: false, error: GENERIC_AUDIT_FAILURE };
    }

    // Verified-citation filter — invariant 1. The narrative text is never
    // trusted on its own; only pages whose grounding citation resolves
    // (fail-closed on an unresolved redirect) to the project's own domain (or
    // a subdomain, with a label-boundary match so "evilexample.com" can never
    // match "example.com") count as a real finding.
    const projectDomainNormalized = normalizeDomain(project.domain);
    const resolvedByUri = await resolveGroundingRedirects(raw.groundingChunks.map((c) => c.uri));

    const verifiedPages: DomainAuditPage[] = [];
    const seenUrls = new Set<string>();
    for (const chunk of raw.groundingChunks) {
      const resolvedUrl = resolvedByUri.get(chunk.uri)?.resolvedUrl;
      if (!resolvedUrl) continue; // fail-closed: an unresolved redirect is never treated as "own domain"
      const resolvedDomain = extractDomain(resolvedUrl);
      if (!resolvedDomain || !isSameOrSubdomain(resolvedDomain, projectDomainNormalized)) continue;
      if (seenUrls.has(resolvedUrl)) continue;
      seenUrls.add(resolvedUrl);
      verifiedPages.push({ url: resolvedUrl, title: sanitizeField(chunk.title ?? resolvedUrl, TITLE_MAX) });
      if (verifiedPages.length >= MAX_PAGES) break;
    }

    const solution: DomainAuditSolution =
      verifiedPages.length > 0
        ? { found: true, pages: verifiedPages, note: sanitizeField(raw.text, NOTE_MAX) }
        : { found: false, pages: [], note: NOT_FOUND_NOTE };

    // Persist unconditionally — a "not found" result is a legitimate,
    // cacheable outcome, and every consumed Gemini call must count toward
    // the rate limit above (invariant 3).
    const sanitizedAt = new Date().toISOString();
    const { error: insertError } = await withTimeout(
      service.from("generated_solutions").insert({
        recommendation_id: recommendationId,
        project_id: projectId,
        rule_id: recommendation.recommendation_type,
        generation_type: GENERATION_TYPE,
        status: "completed",
        raw_content: JSON.stringify({ text: raw.text, groundingChunks: raw.groundingChunks }),
        sanitized_content: JSON.stringify(solution),
        is_sanitized: true,
        sanitized_at: sanitizedAt,
        provider: "gemini",
        evidence_json: { topic, domain: project.domain }
      }),
      "persist_audit"
    );

    if (insertError) {
      console.error(`${LOG_PREFIX} persist_failed`, { project_id: projectId, recommendation_id: recommendationId });
      return { success: false, error: GENERIC_AUDIT_FAILURE };
    }

    console.info(`${LOG_PREFIX} persisted`, {
      project_id: projectId,
      recommendation_id: recommendationId,
      found: solution.found,
      pages_count: solution.pages.length
    });

    return { success: true, solution };
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      console.error(`${LOG_PREFIX} stage_timed_out`, {
        project_id: projectId,
        recommendation_id: recommendationId,
        stage: error.message
      });
    } else {
      console.error(`${LOG_PREFIX} unexpected_error`, {
        project_id: projectId,
        recommendation_id: recommendationId,
        error_name: error instanceof Error ? error.name : "unknown"
      });
    }
    return { success: false, error: GENERIC_AUDIT_FAILURE };
  }
}
