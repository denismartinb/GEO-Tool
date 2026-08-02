import "server-only";

import { z } from "zod";
import { normalizeDomain } from "@/lib/domains/brand-domain";
import { type AuthenticatedContext } from "@/lib/scan/types";

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

/**
 * "+ Seguir" on an emerging brand: only the name is known (it came from
 * `other_brands_mentioned`), the system resolves the domain itself — the
 * user never types one (founder feedback, COMP-REDESIGN-1 review).
 */
export const followBrandInputSchema = z.object({
  projectId: z.string().uuid(),
  name: nameSchema
});

export type CompetitorRecord = { id: string; name: string; domain: string };

export type CreateCompetitorResult =
  | { success: true; competitor: CompetitorRecord; reactivated: boolean }
  | { success: false; error: string };

export type UpdateCompetitorResult = { success: true; competitor: CompetitorRecord } | { success: false; error: string };

export type DeactivateCompetitorResult = { success: true } | { success: false; error: string };

const GENERIC_WRITE_FAILURE = "No se pudo guardar el cambio. Inténtalo de nuevo en unos minutos.";
const PROJECT_NOT_FOUND = "No se ha encontrado el proyecto.";
const DOMAIN_NOT_RESOLVED =
  "No hemos podido identificar el dominio de esta marca. Añádela desde «Gestionar» indicando el dominio.";

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

/**
 * "+ Seguir" on an emerging brand. Resolves the domain via the injected
 * `resolveDomain` (Gemini, grounded — same source onboarding uses) and then
 * reuses `createCompetitorCore` verbatim, so reactivation of a previously
 * deactivated row, the duplicate guard and the ownership check all behave
 * identically to a manual add. `resolveDomain` is injected rather than
 * imported so this stays unit-testable without stubbing the LLM module.
 *
 * Honest failure: when the domain can't be resolved we say so and point at
 * the manual path — we never invent a plausible-looking domain, and never
 * persist a competitor with a made-up address.
 */
export async function followBrandCore(input: {
  projectId: string;
  name: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
  resolveDomain: (brandName: string) => Promise<string | null>;
}): Promise<CreateCompetitorResult> {
  const { projectId, name, supabase, user, resolveDomain } = input;

  if (!(await verifyProjectOwnership(supabase, projectId, user.id))) {
    return { success: false, error: PROJECT_NOT_FOUND };
  }

  let domain: string | null = null;
  try {
    domain = await resolveDomain(name);
  } catch {
    domain = null;
  }

  if (!domain) {
    return { success: false, error: DOMAIN_NOT_RESOLVED };
  }

  const parsedDomain = domainSchema.safeParse(domain);
  if (!parsedDomain.success) {
    return { success: false, error: DOMAIN_NOT_RESOLVED };
  }

  return createCompetitorCore({ projectId, name, domain: parsedDomain.data, supabase, user });
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
