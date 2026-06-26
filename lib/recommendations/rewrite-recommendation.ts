import "server-only";

import { z } from "zod";
import { rewriteRecommendation } from "@/lib/llm/gemini";
import { validateRewriteAgainstEvidence } from "@/lib/recommendations/rewrite-validation";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import { type AuthenticatedContext } from "@/lib/scan/types";

/**
 * Core business logic for "Mejorar redacción con IA" (Slice 2 of the hybrid
 * recommendation architecture): rewrites a single rule-based recommendation's
 * title/description into more specific, natural prose via Gemini, strictly
 * anchored to that recommendation's own evidence_json (Slice 1 —
 * lib/recommendations/recommendation-engine.ts) and re-validated against it
 * (lib/recommendations/rewrite-validation.ts) before being persisted.
 *
 * On-demand only, never eager during a scan (ADR-0003: scans are sync and
 * maxDuration-bounded). Idempotent: re-running on an already `llm_rewrite` row
 * is a no-op success, not a second Gemini call. Any Gemini failure or
 * validation rejection leaves the original rule-based row untouched and
 * returns a sanitized error — never a raw provider error, never a fake
 * success (.claude/rules/gemini.md, .claude/rules/server-actions.md).
 */

export const rewriteRecommendationInputSchema = z.object({
  projectId: z.string().uuid(),
  recommendationId: z.string().uuid()
});

export type RewriteRecommendationResult =
  | { success: true; title: string; description: string }
  | { success: false; error: string };

type EvidenceJson = {
  why_this_matters?: string;
  affected_prompts?: string[];
  mentioned_competitors?: string[];
  citation_domains?: string[];
  evidence_snippets?: string[];
  dominant_competitor?: string;
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

const GENERIC_REWRITE_FAILURE =
  "No se ha podido mejorar la redacción en este momento. Inténtalo de nuevo en unos minutos.";

const LOG_PREFIX = "[geo:recommendation-rewrite]";

export async function rewriteRecommendationCore({
  projectId,
  recommendationId,
  supabase,
  user
}: {
  projectId: string;
  recommendationId: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<RewriteRecommendationResult> {
  const { data: projectRaw, error: projectError } = await supabase
    .from("projects")
    .select("id, brand, domain, language, is_archived")
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  const project = projectRaw as unknown as ProjectRow | null;

  if (projectError || !project) {
    return { success: false, error: feedbackErrorMessages.project_not_found };
  }

  if (project.is_archived) {
    return { success: false, error: feedbackErrorMessages.project_archived };
  }

  const { data: recommendationRaw, error: recommendationError } = await supabase
    .from("recommendations")
    .select("id, title, description, recommendation_type, source_type, evidence_json")
    .eq("id", recommendationId)
    .eq("project_id", projectId)
    .maybeSingle();

  const recommendation = recommendationRaw as unknown as RecommendationRow | null;

  if (recommendationError || !recommendation) {
    return { success: false, error: "No se ha encontrado la recomendación solicitada." };
  }

  if (recommendation.source_type === "llm_rewrite") {
    return { success: true, title: recommendation.title, description: recommendation.description };
  }

  const evidence: EvidenceJson = recommendation.evidence_json ?? {};
  const mentionedCompetitors = evidence.mentioned_competitors ?? [];
  const citationDomains = evidence.citation_domains ?? [];
  const allowedCompetitors = evidence.dominant_competitor
    ? [...mentionedCompetitors, evidence.dominant_competitor]
    : mentionedCompetitors;

  const { data: trackedCompetitorRowsRaw } = await supabase
    .from("project_competitors")
    .select("name")
    .eq("project_id", projectId);

  const trackedCompetitors = ((trackedCompetitorRowsRaw ?? []) as unknown as Array<{ name: string }>).map(
    (row) => row.name
  );

  let rewrite: { title: string; description: string } | null;
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
      evidenceSnippets: evidence.evidence_snippets ?? []
    });
  } catch {
    console.error(`${LOG_PREFIX} gemini_call_failed`, { project_id: projectId, recommendation_id: recommendationId });
    return { success: false, error: GENERIC_REWRITE_FAILURE };
  }

  if (!rewrite) {
    return { success: false, error: GENERIC_REWRITE_FAILURE };
  }

  const validation = validateRewriteAgainstEvidence({
    title: rewrite.title,
    description: rewrite.description,
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

  const { error: updateError } = await supabase
    .from("recommendations")
    .update({
      title: rewrite.title,
      description: rewrite.description,
      source_type: "llm_rewrite",
      evidence_json: {
        ...evidence,
        rule_title: recommendation.title,
        rule_description: recommendation.description
      }
    })
    .eq("id", recommendationId)
    .eq("project_id", projectId);

  if (updateError) {
    return { success: false, error: GENERIC_REWRITE_FAILURE };
  }

  return { success: true, title: rewrite.title, description: rewrite.description };
}
