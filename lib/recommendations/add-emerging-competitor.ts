import "server-only";

import { z } from "zod";
import { ALREADY_TRACKED_ERROR, createCompetitorCore } from "@/lib/competitors/manage-competitors";
import { parseCompetitorDomain } from "@/lib/competitors/competitor-domain";
import { dismissRecommendationCore } from "@/lib/recommendations/dismiss-recommendation";
import { type createServiceClient } from "@/lib/supabase/service";
import type { AuthenticatedContext } from "@/lib/auth";

/**
 * "Añadir X a competidores" (RECS-ADD-COMPETITOR-1): the whole of a
 * `track_emerging_competitor` card is one action, so it is one button instead
 * of a generated four-paragraph plan telling the user to go and do it
 * (founder, 2026-10-18: «un botón de añadir a competidores y ya está»).
 *
 * The brand name is read from the recommendation's own persisted evidence,
 * never from the client: the button can only add the brand the engine found.
 * Only the website comes from the user (prefilled from the cited sources when
 * they match the name exactly). The alta itself is `createCompetitorCore`, the
 * same path as the Competidores form, with its ownership check and its
 * refusal of AI assistants and generic terms. Then the card is marked done
 * through `dismissRecommendationCore`, so it lands in "Resueltas" with the
 * usual "Deshacer".
 */

export const addEmergingCompetitorInputSchema = z.object({
  projectId: z.string().uuid(),
  recommendationId: z.string().uuid(),
  domain: z.string().max(255)
});

export type AddEmergingCompetitorResult =
  | { success: true; name: string; alreadyTracked: boolean }
  | { success: false; error: string };

const NOT_FOUND = "No se ha encontrado la recomendación solicitada.";
const INVALID_DOMAIN = "El dominio no es válido.";
const LOG_PREFIX = "[geo:recommendation-add-competitor]";

export async function addEmergingCompetitorCore({
  projectId,
  recommendationId,
  domain,
  supabase,
  service,
  user
}: {
  projectId: string;
  recommendationId: string;
  domain: string;
  supabase: AuthenticatedContext["supabase"];
  service: ReturnType<typeof createServiceClient>;
  user: AuthenticatedContext["user"];
}): Promise<AddEmergingCompetitorResult> {
  const parsedDomain = parseCompetitorDomain(domain);
  if (!parsedDomain) return { success: false, error: INVALID_DOMAIN };

  // User-context client: RLS already limits this select to the owner's rows.
  const { data: rec, error: recError } = await supabase
    .from("recommendations")
    .select("id, recommendation_type, evidence_json")
    .eq("id", recommendationId)
    .eq("project_id", projectId)
    .maybeSingle();

  const row = rec as { recommendation_type: string; evidence_json: Record<string, unknown> | null } | null;
  const name = typeof row?.evidence_json?.emerging_competitor === "string" ? row.evidence_json.emerging_competitor.trim() : "";
  if (recError || !row || row.recommendation_type !== "track_emerging_competitor" || !name) {
    return { success: false, error: NOT_FOUND };
  }

  const created = await createCompetitorCore({ projectId, name, domain: parsedDomain, supabase, user });
  const alreadyTracked = !created.success && created.error === ALREADY_TRACKED_ERROR;
  if (!created.success && !alreadyTracked) return { success: false, error: created.error };

  // The competitor is in; the card follows it into "Resueltas". If that write
  // fails the add still stands (and the next scan stops suggesting the brand),
  // so it is logged, not reported as a failure of what the user asked for.
  const dismissed = await dismissRecommendationCore({ projectId, recommendationId, supabase, service, user });
  if (!dismissed.success) {
    console.error(`${LOG_PREFIX} mark_done_failed`, { project_id: projectId, recommendation_id: recommendationId });
  }

  return { success: true, name, alreadyTracked };
}
