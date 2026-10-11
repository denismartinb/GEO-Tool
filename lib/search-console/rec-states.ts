import "server-only";

import { z } from "zod";
import type { AuthenticatedContext } from "@/lib/auth";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import { googleRecKey } from "@/lib/search-console/recommendations";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * «Marcar como hecho» and «Ahora no» on the Google recommendations
 * (SEARCH-SEO-1 Fase 3e, log §294, migration 0042).
 *
 * The cards are still computed live (§293); this only remembers what the
 * customer did with one, so the next load skips it and offers the next case
 * of the same kind. The owner can read the table (RLS select policy); writes
 * go through the service role after ownership is checked here with the
 * user's own client, and always filter by project_id AND owner_user_id.
 */

const TABLE = "search_console_rec_states";
const LOG_PREFIX = "[search-console:rec-state]";

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST200";
}

export type RecStatesRead = { available: false } | { available: true; hidden: Set<string> };

/**
 * The handled cards of a project. `available: false` while migration 0042 is
 * not applied (or the read fails): the screen then shows the cards without
 * the two buttons, because a button that cannot save is worse than none.
 */
export async function readRecStates(
  supabase: AuthenticatedContext["supabase"],
  projectId: string,
  ownerUserId: string
): Promise<RecStatesRead> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("kind, query")
    .eq("project_id", projectId)
    .eq("owner_user_id", ownerUserId);
  if (error) {
    if (!isMissingTable(error)) console.warn(`${LOG_PREFIX} read_failed`, { project_id: projectId });
    return { available: false };
  }
  const hidden = new Set<string>();
  for (const row of (data ?? []) as Array<{ kind: string; query: string }>) {
    if (row.kind === "push_page_one" || row.kind === "improve_snippet" || row.kind === "watch_in_ai") {
      hidden.add(googleRecKey(row.kind, row.query));
    }
  }
  return { available: true, hidden };
}

const kindSchema = z.enum(["push_page_one", "improve_snippet", "watch_in_ai"]);

export const markGoogleRecInputSchema = z.object({
  projectId: z.string().uuid(),
  kind: kindSchema,
  query: z.string().trim().min(1).max(500),
  status: z.enum(["done", "dismissed"]),
  position: z.number().finite().min(0).max(1000).nullable(),
  impressions: z.number().int().min(0).nullable(),
  ctr: z.number().finite().min(0).max(1).nullable()
});

export const undoGoogleRecInputSchema = z.object({
  projectId: z.string().uuid(),
  kind: kindSchema,
  query: z.string().trim().min(1).max(500)
});

export type GoogleRecStateResult = { success: true } | { success: false; error: string };

const GENERIC_FAILURE = "No se ha podido guardar ahora mismo. Inténtalo de nuevo en unos minutos.";

type Deps = {
  supabase: AuthenticatedContext["supabase"];
  service: ReturnType<typeof createServiceClient>;
  user: AuthenticatedContext["user"];
};

async function ownsProject(deps: Deps, projectId: string): Promise<boolean> {
  const { data, error } = await deps.supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_user_id", deps.user.id)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function markGoogleRecCore(
  input: z.infer<typeof markGoogleRecInputSchema>,
  deps: Deps
): Promise<GoogleRecStateResult> {
  if (!(await ownsProject(deps, input.projectId))) {
    return { success: false, error: feedbackErrorMessages.project_not_found };
  }
  // Upsert on (project, kind, query): pressing twice, or «Ahora no» after a
  // «Marcar como hecho» from another tab, keeps one row with the last word.
  const { error } = await deps.service.from(TABLE).upsert(
    {
      project_id: input.projectId,
      owner_user_id: deps.user.id,
      kind: input.kind,
      query: input.query,
      status: input.status,
      position_at: input.position,
      impressions_at: input.impressions,
      ctr_at: input.ctr
    },
    { onConflict: "project_id,kind,query" }
  );
  if (error) {
    console.error(`${LOG_PREFIX} write_failed`, { project_id: input.projectId, kind: input.kind, code: error.code });
    return { success: false, error: GENERIC_FAILURE };
  }
  return { success: true };
}

export async function undoGoogleRecCore(
  input: z.infer<typeof undoGoogleRecInputSchema>,
  deps: Deps
): Promise<GoogleRecStateResult> {
  if (!(await ownsProject(deps, input.projectId))) {
    return { success: false, error: feedbackErrorMessages.project_not_found };
  }
  const { error } = await deps.service
    .from(TABLE)
    .delete()
    .eq("project_id", input.projectId)
    .eq("owner_user_id", deps.user.id)
    .eq("kind", input.kind)
    .eq("query", input.query);
  if (error) {
    console.error(`${LOG_PREFIX} undo_failed`, { project_id: input.projectId, kind: input.kind, code: error.code });
    return { success: false, error: GENERIC_FAILURE };
  }
  return { success: true };
}
