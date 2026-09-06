import "server-only";

import { z } from "zod";
import { normalizeDomain } from "@/lib/domains/brand-domain";
import { isGenericEntity } from "@/lib/entity-hygiene/generic-entities";
import type { AuthenticatedContext } from "@/lib/auth";

/**
 * Core logic behind competitor management (COMP-REDESIGN-1) — alta/edición/
 * baja never had a UI before this (docs/brand/design-decisions-log.md §4:
 * "No hay gestión de competidores post-creación en la app"). `project_competitors`
 * already has owner-scoped RLS on select/insert/update
 * (supabase/migrations/0002_v0_rls.sql, `is_project_owner(project_id)`), so
 * unlike lib/recommendations/dismiss-recommendation.ts this does NOT need
 * the service-role-plus-manual-ownership-check pattern — the regular
 * user-context client is both sufficient and correct. Ownership is still
 * verified explicitly up front purely for a clean, specific error message
 * instead of a bare RLS-denied null.
 */

const DOMAIN_FORMAT = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const domainSchema = z
  .string()
  .transform((v) => normalizeDomain(v))
  .refine((v) => v.length >= 3 && v.length <= 255, "El dominio no es válido.")
  .refine((v) => DOMAIN_FORMAT.test(v), "El dominio no es válido.");

const nameSchema = z.string().trim().min(1, "El nombre es obligatorio.").max(120, "El nombre es demasiado largo.");

/** Exposed for unit testing the normalize→validate pipeline in isolation. */
export const domainSchemaForTests = domainSchema;

export const createCompetitorInputSchema = z.object({
  projectId: z.string().uuid(),
  name: nameSchema,
  domain: domainSchema
});

export const updateCompetitorInputSchema = z.object({
  projectId: z.string().uuid(),
  competitorId: z.string().uuid(),
  name: nameSchema,
  domain: domainSchema
});

export const deactivateCompetitorInputSchema = z.object({
  projectId: z.string().uuid(),
  competitorId: z.string().uuid()
});

export type CompetitorRecord = { id: string; name: string; domain: string };

export type CreateCompetitorResult =
  | { success: true; competitor: CompetitorRecord; reactivated: boolean }
  | { success: false; error: string };

export type UpdateCompetitorResult = { success: true; competitor: CompetitorRecord } | { success: false; error: string };

export type DeactivateCompetitorResult = { success: true } | { success: false; error: string };

const GENERIC_WRITE_FAILURE = "No se pudo guardar el cambio. Inténtalo de nuevo en unos minutos.";
const PROJECT_NOT_FOUND = "No se ha encontrado el proyecto.";
// ENTITY-HYGIENE-1 (P1-02): "ChatGPT" is not a competitor GenScore can lose
// or win visibility against — it's the medium being measured, not a rival in
// it. Same message for both create and update, both name and domain match.
const GENERIC_ENTITY_ERROR =
  "Esto es un asistente de IA o un término genérico del sector, no un competidor real. No se puede seguir.";

async function verifyProjectOwnership(
  supabase: AuthenticatedContext["supabase"],
  projectId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .eq("is_archived", false)
    .maybeSingle();
  return Boolean(data);
}

export async function createCompetitorCore(input: {
  projectId: string;
  name: string;
  domain: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<CreateCompetitorResult> {
  const { projectId, name, domain, supabase, user } = input;

  if (!(await verifyProjectOwnership(supabase, projectId, user.id))) {
    return { success: false, error: PROJECT_NOT_FOUND };
  }

  if (isGenericEntity({ name, domain })) {
    return { success: false, error: GENERIC_ENTITY_ERROR };
  }

  const { data: existing } = await supabase
    .from("project_competitors")
    .select("id, is_active")
    .eq("project_id", projectId)
    .eq("domain", domain)
    .maybeSingle();

  if (existing) {
    if ((existing as { is_active: boolean }).is_active) {
      return { success: false, error: "Ya estás siguiendo este dominio." };
    }

    // Reactivate rather than insert — a second row with the same
    // (project_id, domain) would hit competitors_project_domain_uniq
    // (0001_v0_schema.sql), and deactivating-then-re-adding the same rival
    // is the expected flow now that management UI exists.
    const { data, error } = await supabase
      .from("project_competitors")
      .update({ name, is_active: true })
      .eq("id", (existing as { id: string }).id)
      .eq("project_id", projectId)
      .select("id, name, domain")
      .maybeSingle();

    if (error || !data) {
      return { success: false, error: GENERIC_WRITE_FAILURE };
    }
    return { success: true, competitor: data as CompetitorRecord, reactivated: true };
  }

  const { data, error } = await supabase
    .from("project_competitors")
    .insert({ project_id: projectId, name, domain })
    .select("id, name, domain")
    .single();

  if (error || !data) {
    return { success: false, error: GENERIC_WRITE_FAILURE };
  }

  return { success: true, competitor: data as CompetitorRecord, reactivated: false };
}

export async function updateCompetitorCore(input: {
  projectId: string;
  competitorId: string;
  name: string;
  domain: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<UpdateCompetitorResult> {
  const { projectId, competitorId, name, domain, supabase, user } = input;

  if (!(await verifyProjectOwnership(supabase, projectId, user.id))) {
    return { success: false, error: PROJECT_NOT_FOUND };
  }

  if (isGenericEntity({ name, domain })) {
    return { success: false, error: GENERIC_ENTITY_ERROR };
  }

  const { data, error } = await supabase
    .from("project_competitors")
    .update({ name, domain })
    .eq("id", competitorId)
    .eq("project_id", projectId)
    .select("id, name, domain")
    .maybeSingle();

  if (error) {
    // Postgres unique_violation on competitors_project_domain_uniq.
    if ((error as { code?: string }).code === "23505") {
      return { success: false, error: "Ya tienes otro competidor con ese dominio." };
    }
    return { success: false, error: GENERIC_WRITE_FAILURE };
  }

  if (!data) {
    return { success: false, error: "No se ha encontrado el competidor." };
  }

  return { success: true, competitor: data as CompetitorRecord };
}

export async function deactivateCompetitorCore(input: {
  projectId: string;
  competitorId: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<DeactivateCompetitorResult> {
  const { projectId, competitorId, supabase, user } = input;

  if (!(await verifyProjectOwnership(supabase, projectId, user.id))) {
    return { success: false, error: PROJECT_NOT_FOUND };
  }

  const { data, error } = await supabase
    .from("project_competitors")
    .update({ is_active: false })
    .eq("id", competitorId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: "No se ha encontrado el competidor." };
  }

  return { success: true };
}
