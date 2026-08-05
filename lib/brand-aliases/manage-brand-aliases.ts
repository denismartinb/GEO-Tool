import "server-only";

import { z } from "zod";
import { type AuthenticatedContext } from "@/lib/scan/types";
import { removeAliasFromList, validateNewAlias } from "@/lib/brand-aliases/normalize-aliases";

/**
 * Core logic behind the manual brand-alias management surface (Fase −1c,
 * docs/geo-score-variability-2026-08.md §3): add/remove UI for
 * `projects.brand_aliases`, which already exists (migration 0025) and
 * already moves the GEO Score via `verifyMention` (ADR 0021/0025) but, until
 * this phase, could only be inspected or changed with a direct SQL query.
 *
 * Same shape as `lib/competitors/manage-competitors.ts`: `projects` already
 * has owner-scoped RLS (`is_project_owner`/`owner_user_id`,
 * supabase/migrations/0002_v0_rls.sql), so the regular user-context client
 * is correct here — no service-role shortcut. Every write below still adds
 * an explicit `.eq("owner_user_id", ...)` on top of RLS, per
 * `.claude/rules/server-actions.md` ("Scope every DB write by
 * owner_user_id") and `.claude/rules/supabase.md` ("Ownership scoping is
 * mandatory... Never rely on the client to scope").
 */

export const addBrandAliasInputSchema = z.object({
  projectId: z.string().uuid(),
  alias: z.string().min(1).max(200)
});

export const removeBrandAliasInputSchema = z.object({
  projectId: z.string().uuid(),
  alias: z.string().min(1).max(200)
});

export type ManageBrandAliasesResult = { success: true; aliases: string[] } | { success: false; error: string };

const GENERIC_WRITE_FAILURE = "No se pudo guardar el cambio. Inténtalo de nuevo en unos minutos.";
const PROJECT_NOT_FOUND = "No se ha encontrado el proyecto.";

async function loadOwnedProject(
  supabase: AuthenticatedContext["supabase"],
  projectId: string,
  userId: string
): Promise<{ brand: string; brand_aliases: string[] } | null> {
  const { data } = await supabase
    .from("projects")
    .select("brand, brand_aliases")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .eq("is_archived", false)
    .maybeSingle();

  if (!data) return null;
  return { brand: data.brand as string, brand_aliases: (data.brand_aliases as string[] | null) ?? [] };
}

export async function addBrandAliasCore(input: {
  projectId: string;
  alias: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<ManageBrandAliasesResult> {
  const { projectId, alias, supabase, user } = input;

  const project = await loadOwnedProject(supabase, projectId, user.id);
  if (!project) {
    return { success: false, error: PROJECT_NOT_FOUND };
  }

  const validation = validateNewAlias({ raw: alias, brand: project.brand, existingAliases: project.brand_aliases });
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const nextAliases = [...project.brand_aliases, validation.alias];

  const { data, error } = await supabase
    .from("projects")
    .update({ brand_aliases: nextAliases })
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .eq("is_archived", false)
    .select("brand_aliases")
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: GENERIC_WRITE_FAILURE };
  }

  return { success: true, aliases: (data.brand_aliases as string[] | null) ?? nextAliases };
}

export async function removeBrandAliasCore(input: {
  projectId: string;
  alias: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<ManageBrandAliasesResult> {
  const { projectId, alias, supabase, user } = input;

  const project = await loadOwnedProject(supabase, projectId, user.id);
  if (!project) {
    return { success: false, error: PROJECT_NOT_FOUND };
  }

  const nextAliases = removeAliasFromList(project.brand_aliases, alias);

  const { data, error } = await supabase
    .from("projects")
    .update({ brand_aliases: nextAliases })
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .eq("is_archived", false)
    .select("brand_aliases")
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: GENERIC_WRITE_FAILURE };
  }

  return { success: true, aliases: (data.brand_aliases as string[] | null) ?? nextAliases };
}
