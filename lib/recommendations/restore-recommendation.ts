import "server-only";

import { z } from "zod";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import { type createServiceClient } from "@/lib/supabase/service";
import type { AuthenticatedContext } from "@/lib/auth";

/**
 * "Deshacer" on "Marcar como hecho" (ACTIONS-OBSERVABLE-1 slice 4a,
 * docs/external-audit-2026-08.md, Fase 4, P0-04) — the exact mirror of
 * dismissRecommendationCore, restoring `status='active'`. Same ownership
 * re-verification, same service-role write, same idempotency — see that
 * file's own doc comment for the reasoning, unchanged here.
 *
 * No migration: `rec_status_chk` (0010_recommendations_history.sql) already
 * allows 'active'. The undo window this is called from is a client-local,
 * ephemeral acknowledgement (RecCard keeps showing "Deshacer" until the user
 * navigates away, never a persisted deadline) — deliberately NOT anchored to
 * `run_id`/`latestCompletedRun`, because the client never receives `run_id`
 * per recommendation today (recommendations/page.tsx trims it before sending
 * props) and anchoring server-side here would need to widen that trim, out
 * of scope for this slice. The risk that motivated considering an anchor —
 * restoring a row after a NEWER completed scan already ran — cannot happen
 * within an ephemeral, same-render undo: the row was never removed from the
 * DOM in the first place, so there's nothing later to reconcile against.
 */

export const restoreRecommendationInputSchema = z.object({
  projectId: z.string().uuid(),
  recommendationId: z.string().uuid()
});

export type RestoreRecommendationResult = { success: true } | { success: false; error: string };

const GENERIC_RESTORE_FAILURE =
  "No se ha podido deshacer en este momento. Inténtalo de nuevo en unos minutos.";

const LOG_PREFIX = "[geo:recommendation-restore]";

export async function restoreRecommendationCore({
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
}): Promise<RestoreRecommendationResult> {
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

    // Idempotent: already active -> report success without a redundant write.
    if ((recommendation as { status: string }).status === "active") {
      return { success: true };
    }

    const { error: updateError } = await service
      .from("recommendations")
      .update({ status: "active" })
      .eq("id", recommendationId)
      .eq("project_id", projectId);

    if (updateError) {
      console.error(`${LOG_PREFIX} update_failed`, {
        project_id: projectId,
        recommendation_id: recommendationId,
        message: updateError.message
      });
      return { success: false, error: GENERIC_RESTORE_FAILURE };
    }

    return { success: true };
  } catch (error) {
    console.error(`${LOG_PREFIX} unexpected_error`, {
      project_id: projectId,
      recommendation_id: recommendationId,
      error_name: error instanceof Error ? error.name : "unknown"
    });
    return { success: false, error: GENERIC_RESTORE_FAILURE };
  }
}
