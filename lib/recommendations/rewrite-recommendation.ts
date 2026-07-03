import "server-only";

import { z } from "zod";
import { rewriteRecommendation } from "@/lib/llm/gemini";
import { validateRewriteAgainstEvidence } from "@/lib/recommendations/rewrite-validation";
import { checkGenerationRateLimit } from "@/lib/recommendations/generation-rate-limit";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import { type createServiceClient } from "@/lib/supabase/service";
import { type AuthenticatedContext } from "@/lib/scan/types";

/**
 * Core business logic for "Mejorar redacción con IA" (the on-demand AI rewrite
 * of one rule-based recommendation, anchored to its own evidence_json).
 *
 * Persistence model (Fase A — the corrected architecture): the rule-based
 * recommendation row is NEVER mutated. RLS on `recommendations` is select-only
 * for the browser/user context (0002_v0_rls.sql), so a user-context UPDATE
 * matches zero rows and silently reports success — which is exactly why the
 * earlier evidence_json-mutation approach never actually persisted anything.
 *
 * Instead the generated solution is written to `generated_solutions`
 * (0005_generated_solutions.sql, founder-approved): untrusted LLM output goes
 * to `raw_content`, is sanitized server-side here, and only the sanitized copy
 * is ever marked renderable (`is_sanitized`/`status='completed'`). The write
 * goes through the service-role client — the trusted-server path the RLS design
 * explicitly prescribes for this table — after the user-context client has
 * already proven ownership of the project and recommendation.
 *
 * Idempotent: a recommendation that already has a completed, sanitized solution
 * returns it without a second Gemini call. Rate-limited per project
 * (checkGenerationRateLimit) before any Gemini spend. Any Gemini failure,
 * validation rejection, or empty-after-sanitization result persists nothing and
 * returns a sanitized error — never a raw provider error, never a fake success
 * (.claude/rules/gemini.md, .claude/rules/server-actions.md).
 */

export const rewriteRecommendationInputSchema = z.object({
  projectId: z.string().uuid(),
  recommendationId: z.string().uuid()
});

export type GeneratedSolutionExample = { label: string; content: string };

export type GeneratedSolution = {
  title: string;
  summary: string;
  steps: string[];
  examples: GeneratedSolutionExample[];
};

export type RewriteRecommendationResult =
  | { success: true; solution: GeneratedSolution }
  | { success: false; error: string };

type EvidenceJson = {
  why_this_matters?: string;
  affected_prompts?: string[];
  mentioned_competitors?: string[];
  citation_domains?: string[];
  evidence_snippets?: string[];
  dominant_competitor?: string;
  // RECS-2B / N2 (pursue_citation_sources only) — specific pages the AI
  // already cites among citation_domains, so the digital-PR asset can name
  // an exact article instead of only a bare domain.
  citation_pages?: { domain: string; title: string; url: string }[];
  [key: string]: unknown;
};

type RecommendationRow = {
  id: string;
  title: string;
  description: string;
  recommendation_type: string;
  source_type: string;
  evidence_json: EvidenceJson | null;
};

type ProjectRow = {
  id: string;
  brand: string;
  domain: string;
  language: string;
  is_archived: boolean;
};

type SolutionContent = GeneratedSolution;

const GENERIC_REWRITE_FAILURE =
  "No se ha podido mejorar la redacción en este momento. Inténtalo de nuevo en unos minutos.";

const RATE_LIMIT_FAILURE =
  "Has alcanzado el límite de mejoras con IA para este proyecto por hoy. Vuelve a intentarlo más tarde.";

const LOG_PREFIX = "[geo:recommendation-rewrite]";

// generated_solutions.generation_type for a recommendation-copy rewrite
// (gensol_generation_type_chk allows brand_copy_suggestion).
const GENERATION_TYPE = "brand_copy_suggestion";

// Mirrors the length bounds the Gemini prompt itself asks for, enforced again
// server-side so sanitized content can never exceed what the UI expects.
const TITLE_MAX = 140;
const SUMMARY_MAX = 400;
const STEP_MAX = 200;
const MAX_STEPS = 6;
const EXAMPLE_LABEL_MAX = 80;
const EXAMPLE_CONTENT_MAX = 1200;
const MAX_EXAMPLES = 3;

// Only the Gemini fetch is bounded inside lib/llm/gemini.ts; the Supabase
// reads/writes below have no library-level timeout, so each is bounded here and
// tagged with its stage. A stall surfaces a sanitized error within seconds
// instead of hanging the whole action with nothing past a "start" log.
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

/**
 * Server-side sanitization gate for untrusted LLM output (0005 invariant: this
 * content can be copied/exported to the user's own site, so it is only ever
 * marked renderable after trusted code cleans it). Strips HTML tags and control
 * characters, collapses whitespace, and caps length. Returns null if either
 * field is empty after cleaning, so an empty rewrite is never persisted as a
 * "completed" solution.
 */
function sanitizeField(input: string, maxLen: number): string {
  let stripped = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    // Replace C0 control chars and DEL with a space; keep everything else.
    stripped += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return stripped
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * Sanitizer for a pasteable example's content. Unlike sanitizeField, it
 * PRESERVES newlines, tabs and angle brackets, because an example may be a code
 * artifact (an HTML snippet or a JSON-LD schema block) whose formatting and tags
 * are the whole point. It is safe to keep them: the UI renders this as escaped
 * React text in a <pre>, so nothing executes. Only non-newline/tab C0 control
 * characters are stripped, trailing per-line spaces and 3+ blank lines are
 * collapsed, and the length is capped.
 */
function sanitizeExampleContent(input: string, maxLen: number): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || ch === "\t") {
      out += ch;
    } else {
      out += code < 0x20 || code === 0x7f ? " " : ch;
    }
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLen);
}

function sanitizeSolution(raw: SolutionContent): SolutionContent | null {
  const title = sanitizeField(raw.title, TITLE_MAX);
  const summary = sanitizeField(raw.summary, SUMMARY_MAX);
  if (!title || !summary) {
    return null;
  }

  const steps = (raw.steps ?? [])
    .map((step) => sanitizeField(step, STEP_MAX))
    .filter((step) => step.length > 0)
    .slice(0, MAX_STEPS);

  const examples = (raw.examples ?? [])
    .map((example) => ({
      label: sanitizeField(example.label, EXAMPLE_LABEL_MAX),
      content: sanitizeExampleContent(example.content, EXAMPLE_CONTENT_MAX)
    }))
    .filter((example) => example.label.length > 0 && example.content.length > 0)
    .slice(0, MAX_EXAMPLES);

  return { title, summary, steps, examples };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function toExample(value: unknown): GeneratedSolutionExample | null {
  const candidate = value as { label?: unknown; content?: unknown } | null | undefined;
  if (candidate && typeof candidate.label === "string" && typeof candidate.content === "string") {
    return { label: candidate.label, content: candidate.content };
  }
  return null;
}

function parseSolutionContent(raw: string | null): SolutionContent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed?.title !== "string" || typeof parsed?.summary !== "string") {
      return null;
    }
    const steps = isStringArray(parsed.steps) ? parsed.steps : [];
    // Back-compat: read the new `examples` array, falling back to a legacy
    // single `example` object persisted by the first copy-paste version.
    const examples = Array.isArray(parsed.examples)
      ? parsed.examples.map(toExample).filter((item): item is GeneratedSolutionExample => item !== null)
      : [toExample(parsed.example)].filter((item): item is GeneratedSolutionExample => item !== null);
    return { title: parsed.title, summary: parsed.summary, steps, examples };
  } catch {
    // Stored content unexpectedly unparseable — treat as no usable solution.
  }
  return null;
}

export async function rewriteRecommendationCore({
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
}): Promise<RewriteRecommendationResult> {
  let stage = "load_project";
  try {
    const { data: projectRaw, error: projectError } = await withTimeout(
      supabase
        .from("projects")
        .select("id, brand, domain, language, is_archived")
        .eq("id", projectId)
        .eq("owner_user_id", user.id)
        .maybeSingle(),
      stage
    );

    const project = projectRaw as unknown as ProjectRow | null;

    if (projectError || !project) {
      return { success: false, error: feedbackErrorMessages.project_not_found };
    }

    if (project.is_archived) {
      return { success: false, error: feedbackErrorMessages.project_archived };
    }

    stage = "load_recommendation";
    const { data: recommendationRaw, error: recommendationError } = await withTimeout(
      supabase
        .from("recommendations")
        .select("id, title, description, recommendation_type, source_type, evidence_json")
        .eq("id", recommendationId)
        .eq("project_id", projectId)
        .maybeSingle(),
      stage
    );

    const recommendation = recommendationRaw as unknown as RecommendationRow | null;

    if (recommendationError || !recommendation) {
      return { success: false, error: "No se ha encontrado la recomendación solicitada." };
    }

    // Idempotency: a completed, sanitized solution already exists -> return it,
    // no second Gemini call. Read via the service client (the same trusted path
    // that writes it).
    stage = "load_existing_solution";
    const { data: existingRaw } = await withTimeout(
      service
        .from("generated_solutions")
        .select("sanitized_content")
        .eq("project_id", projectId)
        .eq("recommendation_id", recommendationId)
        .eq("status", "completed")
        .eq("is_sanitized", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      stage
    );

    const existing = parseSolutionContent(
      (existingRaw as unknown as { sanitized_content: string | null } | null)?.sanitized_content ?? null
    );
    if (existing) {
      return { success: true, solution: existing };
    }

    console.info(`${LOG_PREFIX} start`, { project_id: projectId, recommendation_id: recommendationId });

    // Bound Gemini cost/abuse per project before spending an LLM call.
    stage = "rate_limit";
    const rateLimit = await checkGenerationRateLimit(service, projectId);
    if (!rateLimit.allowed) {
      console.warn(`${LOG_PREFIX} rate_limited`, {
        project_id: projectId,
        recommendation_id: recommendationId,
        reason: rateLimit.reason
      });
      return {
        success: false,
        error: rateLimit.reason === "rate_limit_exceeded" ? RATE_LIMIT_FAILURE : GENERIC_REWRITE_FAILURE
      };
    }

    const evidence: EvidenceJson = recommendation.evidence_json ?? {};
    const mentionedCompetitors = evidence.mentioned_competitors ?? [];
    const citationDomains = evidence.citation_domains ?? [];
    const allowedCompetitors = evidence.dominant_competitor
      ? [...mentionedCompetitors, evidence.dominant_competitor]
      : mentionedCompetitors;

    stage = "load_competitors";
    const { data: trackedCompetitorRowsRaw } = await withTimeout(
      supabase.from("project_competitors").select("name").eq("project_id", projectId),
      stage
    );

    const trackedCompetitors = ((trackedCompetitorRowsRaw ?? []) as unknown as Array<{ name: string }>).map(
      (row) => row.name
    );

    console.info(`${LOG_PREFIX} evidence_loaded`, {
      project_id: projectId,
      recommendation_id: recommendationId,
      tracked_competitors_count: trackedCompetitors.length
    });

    stage = "gemini_call";
    let rewrite: SolutionContent | null;
    const geminiCallStartedAt = Date.now();
    try {
      rewrite = await rewriteRecommendation({
        brand: project.brand,
        domain: project.domain,
        language: project.language,
        recommendationType: recommendation.recommendation_type,
        ruleTitle: recommendation.title,
        ruleDescription: recommendation.description,
        whyThisMatters: evidence.why_this_matters ?? "",
        affectedPrompts: evidence.affected_prompts ?? [],
        mentionedCompetitors,
        citationDomains,
        dominantCompetitor: evidence.dominant_competitor,
        evidenceSnippets: evidence.evidence_snippets ?? [],
        citationPages: evidence.citation_pages
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} gemini_call_failed`, {
        project_id: projectId,
        recommendation_id: recommendationId,
        duration_ms: Date.now() - geminiCallStartedAt,
        error_name: error instanceof Error ? error.name : "unknown"
      });
      return { success: false, error: GENERIC_REWRITE_FAILURE };
    }

    console.info(`${LOG_PREFIX} gemini_call_succeeded`, {
      project_id: projectId,
      recommendation_id: recommendationId,
      duration_ms: Date.now() - geminiCallStartedAt,
      rewrite_returned: rewrite !== null
    });

    if (!rewrite) {
      return { success: false, error: GENERIC_REWRITE_FAILURE };
    }

    // Validate ALL generated text (title + summary + every step + every
    // pasteable example, label and content) against the evidence, so a
    // fabricated competitor/domain anywhere in the asset — not just the title —
    // is caught before persisting.
    const exampleText = rewrite.examples.flatMap((example) => [example.label, example.content]);
    const validation = validateRewriteAgainstEvidence({
      title: rewrite.title,
      description: [rewrite.summary, ...rewrite.steps, ...exampleText].join(" "),
      allowedCompetitors,
      allowedDomains: citationDomains,
      trackedCompetitors,
      brandDomain: project.domain
    });

    if (!validation.valid) {
      console.warn(`${LOG_PREFIX} rejected`, {
        project_id: projectId,
        recommendation_id: recommendationId,
        reason: validation.reason
      });
      return { success: false, error: GENERIC_REWRITE_FAILURE };
    }

    const sanitized = sanitizeSolution(rewrite);
    if (!sanitized) {
      console.warn(`${LOG_PREFIX} empty_after_sanitize`, {
        project_id: projectId,
        recommendation_id: recommendationId
      });
      return { success: false, error: GENERIC_REWRITE_FAILURE };
    }

    const sanitizedAt = new Date().toISOString();
    stage = "persist_solution";
    const { data: insertedRaw, error: insertError } = await withTimeout(
      service
        .from("generated_solutions")
        .insert({
          recommendation_id: recommendationId,
          project_id: projectId,
          rule_id: recommendation.recommendation_type,
          generation_type: GENERATION_TYPE,
          status: "completed",
          raw_content: JSON.stringify(rewrite),
          sanitized_content: JSON.stringify(sanitized),
          is_sanitized: true,
          sanitized_at: sanitizedAt,
          provider: "gemini",
          evidence_json: {
            rule_title: recommendation.title,
            rule_description: recommendation.description,
            mentioned_competitors: mentionedCompetitors,
            citation_domains: citationDomains,
            dominant_competitor: evidence.dominant_competitor ?? null,
            affected_prompts: evidence.affected_prompts ?? []
          }
        })
        .select("id")
        .maybeSingle(),
      stage
    );

    if (insertError || !insertedRaw) {
      console.error(`${LOG_PREFIX} persist_failed`, { project_id: projectId, recommendation_id: recommendationId });
      return { success: false, error: GENERIC_REWRITE_FAILURE };
    }

    console.info(`${LOG_PREFIX} persisted`, { project_id: projectId, recommendation_id: recommendationId });

    return { success: true, solution: sanitized };
  } catch (error) {
    if (error instanceof OperationTimeoutError) {
      console.error(`${LOG_PREFIX} stage_timed_out`, {
        project_id: projectId,
        recommendation_id: recommendationId,
        stage
      });
    } else {
      console.error(`${LOG_PREFIX} unexpected_error`, {
        project_id: projectId,
        recommendation_id: recommendationId,
        stage,
        error_name: error instanceof Error ? error.name : "unknown"
      });
    }
    return { success: false, error: GENERIC_REWRITE_FAILURE };
  }
}
