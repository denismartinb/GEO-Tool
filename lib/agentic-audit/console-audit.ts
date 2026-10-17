import "server-only";

import { z } from "zod";
import type { AuthenticatedContext } from "@/lib/auth";
import type { AgenticCheckResult } from "@/lib/agentic-audit/api-contract";
import { normalizeTarget, runAgenticAudit, type RunAgenticAuditDeps } from "@/lib/agentic-audit/run-audit";
import { isProOrAbove, resolveSystemPlanId, SYSTEM_PLAN_COLUMNS } from "@/lib/billing";
import { isSameOrSubdomain } from "@/lib/domains/brand-domain";
import { cleanDomain } from "@/lib/projects/project-form";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * AGENTIC-COMMERCE-1 Fase 2a (log §322, migration 0043): the «Auditoría
 * agéntica» screen of the console.
 *
 * The review is the free checker's engine (`runAgenticAudit`), unchanged: the
 * same fixed list of URLs on the store's own domain, no link followed, no LLM.
 * What the console adds is that the result is kept, so the screen opens with
 * the last review, and that it is limited per project, not per IP.
 *
 * The owner can read `agentic_audits` (RLS select policy). Writes go through
 * the service role after ownership and plan are checked here with the user's
 * own client, always filtering by project_id AND owner_user_id (same pattern
 * as `lib/search-console/rec-states.ts`). The row is written BEFORE the
 * requests go out, so a review that dies halfway still counts.
 */

const TABLE = "agentic_audits";
const LOG_PREFIX = "[agentic-audit:console]";

/** Reviews per project in any 24 hours. Each one is about ten requests to the store, with no AI cost. */
export const AGENTIC_REVIEW_DAILY_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST200";
}

export type StoredAgenticAudit = { url: string; createdAt: string; result: AgenticCheckResult };

export type AgenticAuditsRead =
  | { available: false }
  | { available: true; latest: StoredAgenticAudit | null; savedUrl: string | null; usedToday: number };

/**
 * The last completed review and how many reviews the last 24 hours used.
 * `available: false` while migration 0043 is not applied (or the read fails):
 * the screen then says the audit is not available yet, never an error.
 */
export async function readAgenticAudits(
  supabase: AuthenticatedContext["supabase"],
  projectId: string,
  ownerUserId: string,
  now: number = Date.now()
): Promise<AgenticAuditsRead> {
  const since = new Date(now - DAY_MS).toISOString();
  const [latestRes, recentRes] = await Promise.all([
    supabase
      .from(TABLE)
      .select("url, created_at, result")
      .eq("project_id", projectId)
      .eq("owner_user_id", ownerUserId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from(TABLE)
      .select("url, created_at")
      .eq("project_id", projectId)
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(50)
  ]);
  const error = latestRes.error ?? recentRes.error;
  if (error) {
    if (!isMissingTable(error)) console.warn(`${LOG_PREFIX} read_failed`, { project_id: projectId, code: error.code });
    return { available: false };
  }
  const row = latestRes.data as { url: string; created_at: string; result: AgenticCheckResult | null } | null;
  const recent = (recentRes.data ?? []) as Array<{ url: string; created_at: string }>;
  const usedToday = recent.filter((r) => r.created_at >= since).length;
  return {
    available: true,
    latest: row?.result ? { url: row.url, createdAt: row.created_at, result: row.result } : null,
    // The URL the customer asked for last, even if that review failed: it is the one to retry.
    savedUrl: recent[0]?.url ?? row?.url ?? null,
    usedToday
  };
}

export const runConsoleAgenticAuditInputSchema = z.object({
  projectId: z.string().uuid(),
  url: z.string().trim().min(1).max(2048)
});

export type ConsoleAgenticAuditError =
  | "project_not_found"
  | "plan_required"
  | "invalid_url"
  | "other_domain"
  | "limit_reached"
  | "unavailable"
  | "site_unreachable"
  | "failed";

export type ConsoleAgenticAuditResult = { success: true } | { success: false; error: ConsoleAgenticAuditError; message: string };

const MESSAGES: Record<ConsoleAgenticAuditError, string> = {
  project_not_found: feedbackErrorMessages.project_not_found,
  plan_required: "La auditoría agéntica está en Pro y Agencia.",
  invalid_url: "Escribe la dirección completa de una ficha de producto de tu tienda.",
  other_domain: "La ficha tiene que ser de tu dominio o de un subdominio suyo.",
  limit_reached: `Ya has hecho ${AGENTIC_REVIEW_DAILY_LIMIT} revisiones en las últimas 24 horas. Vuelve a intentarlo mañana.`,
  unavailable: "La auditoría agéntica todavía no está disponible. Vuelve a intentarlo en un rato.",
  site_unreachable: "No hemos podido abrir esa página. Comprueba que la dirección es correcta y que la página está publicada.",
  failed: "No se ha podido revisar ahora mismo. Inténtalo de nuevo en unos minutos."
};

function fail(error: ConsoleAgenticAuditError): ConsoleAgenticAuditResult {
  return { success: false, error, message: MESSAGES[error] };
}

type Deps = {
  supabase: AuthenticatedContext["supabase"];
  service: ReturnType<typeof createServiceClient>;
  user: AuthenticatedContext["user"];
  audit: RunAgenticAuditDeps;
  now?: () => number;
};

export async function runConsoleAgenticAuditCore(
  input: z.infer<typeof runConsoleAgenticAuditInputSchema>,
  deps: Deps
): Promise<ConsoleAgenticAuditResult> {
  const now = deps.now ?? Date.now;

  const { data: project, error: projectError } = await deps.supabase
    .from("projects")
    .select("id, domain")
    .eq("id", input.projectId)
    .eq("owner_user_id", deps.user.id)
    .maybeSingle();
  if (projectError || !project) return fail("project_not_found");

  // Fails closed: a missing or unreadable profile is not Pro.
  const { data: profile } = await deps.supabase
    .from("profiles")
    .select(SYSTEM_PLAN_COLUMNS)
    .eq("id", deps.user.id)
    .maybeSingle();
  if (!isProOrAbove(resolveSystemPlanId(profile as Parameters<typeof resolveSystemPlanId>[0]))) return fail("plan_required");

  const target = normalizeTarget(input.url);
  if (!target) return fail("invalid_url");
  if (!isSameOrSubdomain(target.baseDomain, cleanDomain((project as { domain: string }).domain))) return fail("other_domain");

  const since = new Date(now() - DAY_MS).toISOString();
  const { count, error: countError } = await deps.service
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("project_id", input.projectId)
    .eq("owner_user_id", deps.user.id)
    .gte("created_at", since);
  if (countError) {
    if (!isMissingTable(countError)) console.error(`${LOG_PREFIX} count_failed`, { project_id: input.projectId, code: countError.code });
    return fail("unavailable");
  }
  if ((count ?? 0) >= AGENTIC_REVIEW_DAILY_LIMIT) return fail("limit_reached");

  const { data: inserted, error: insertError } = await deps.service
    .from(TABLE)
    .insert({ project_id: input.projectId, owner_user_id: deps.user.id, url: target.url, status: "pending" })
    .select("id")
    .single();
  if (insertError || !inserted) {
    console.error(`${LOG_PREFIX} insert_failed`, { project_id: input.projectId, code: insertError?.code });
    return fail("unavailable");
  }

  const outcome = await runAgenticAudit(target.url, deps.audit);

  const { error: closeError } = await deps.service
    .from(TABLE)
    .update(
      outcome.status === "completed"
        ? { status: "completed", score: outcome.result.score, result: outcome.result, error_category: null }
        : { status: "failed", error_category: outcome.error }
    )
    .eq("id", (inserted as { id: string }).id)
    .eq("project_id", input.projectId)
    .eq("owner_user_id", deps.user.id);
  if (closeError) {
    console.error(`${LOG_PREFIX} close_failed`, { project_id: input.projectId, code: closeError.code });
    return fail("failed");
  }

  if (outcome.status === "failed") return fail(outcome.error === "invalid_url" ? "invalid_url" : "site_unreachable");
  return { success: true };
}
