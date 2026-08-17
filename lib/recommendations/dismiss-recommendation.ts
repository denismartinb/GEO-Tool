import "server-only";

import { z } from "zod";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import { type createServiceClient } from "@/lib/supabase/service";
import type { AuthenticatedContext } from "@/lib/auth";

/**
 * "Marcar como hecho / descartar" (Fase RECS-3): the user manually marks a
 * rule-based recommendation as `status='dismissed'` instead of waiting for
 * it to silently disappear from a future scan.
 *
 * `recommendations` has only a SELECT RLS policy for the user context
 * (0002_v0_rls.sql) — status changes must go through trusted server code
 * using the service role (reviewed by data-guardian for RECS-3; adding a
 * client-writable UPDATE policy was explicitly rejected in favor of this
 * pattern, already established by lib/recommendations/rewrite-recommendation.ts
 * for generated_solutions). Because the service role bypasses RLS entirely,
 * ownership is re-verified here in code — via the user-context client —
 * before the write, never trusting the client-supplied
 * projectId/recommendationId pairing alone.
 */

export const dismissRecommendationInputSchema = z.object({
  projectId: z.string().uuid(),
  recommendationId: z.string().uuid()
});

export type DismissRecommendationResult = { success: true } | { success: false; error: string };

const GENERIC_DISMISS_FAILURE =
  "No se ha podido actualizar la recomendación en este momento. Inténtalo de nuevo en unos minutos.";

const LOG_PREFIX = "[geo:recommendation-dismiss]";

export async function dismissRecommendationCore({
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
}): Promise<DismissRecommendationResult> {
  try {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (projectError || !project) {
      return { success: false, error: feedbackErrorMessages.project_not_found };
    }

    const { data: recommendation, error: recommendationError } = await supabase
      .from("recommendations")
      .select("id, status")
      .eq("id", recommendationId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (recommendationError || !recommendation) {
      return { success: false, error: "No se ha encontrado la recomendación solicitada." };
    }

    // Idempotent: already dismissed -> report success without a redundant write.
    if ((recommendation as { status: string }).status === "dismissed") {
      return { success: true };
    }

    const { error: updateError } = await service
      .from("recommendations")
      .update({ status: "dismissed" })
      .eq("id", recommendationId)
      .eq("project_id", projectId);

    if (updateError) {
      console.error(`${LOG_PREFIX} update_failed`, {
        project_id: projectId,
        recommendation_id: recommendationId,
        message: updateError.message
      });
      return { success: false, error: GENERIC_DISMISS_FAILURE };
    }

    return { success: true };
  } catch (error) {
    console.error(`${LOG_PREFIX} unexpected_error`, {
      project_id: projectId,
      recommendation_id: recommendationId,
      error_name: error instanceof Error ? error.name : "unknown"
    });
    return { success: false, error: GENERIC_DISMISS_FAILURE };
  }
}
