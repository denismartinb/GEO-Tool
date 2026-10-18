import "server-only";

import { z } from "zod";
import type { AuthenticatedContext } from "@/lib/auth";
import type { AgenticCheckResult } from "@/lib/agentic-audit/api-contract";
import {
  AGENTIC_DISCOVER_BUDGET_MS,
  normalizeTarget,
  runAgenticAudit,
  type RunAgenticAuditDeps
} from "@/lib/agentic-audit/run-audit";
import { isProOrAbove, resolveSystemPlanId, SYSTEM_PLAN_COLUMNS } from "@/lib/billing";
import { isSameOrSubdomain } from "@/lib/domains/brand-domain";
import { cleanDomain } from "@/lib/projects/project-form";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * AGENTIC-COMMERCE-1 Fase 2a (log §322, migration 0043): the «Auditoría
 * agéntica» screen of the console.
 *
 * The review is the free checker's engine (`runAgenticAudit`) with
 * `discover` on (log §323): the same fixed list of URLs on the store's own
 * domain plus, when the page is not a product page, exactly one product page
 * found in bytes already downloaded. No link followed beyond that, no LLM.
 *
 * Nobody pastes a URL: the review runs by itself after each scan (the web
 * audit job, `runScheduledAgenticAudit`) and the first time the screen opens
 * (`runConsoleAgenticAuditCore` without `url`). It keeps the same product
 * page while it still is one, so one day's score compares with the next.
 * «Elegir otra página» passes a `url` and counts against the daily limit like
 * every other review.
 *
 * The owner can read `agentic_audits` (RLS select policy). Writes go through
 * the service role after ownership and plan are checked here with the user's
 * own client, always filtering by project_id AND owner_user_id (same pattern
 * as `lib/search-console/rec-states.ts`). The row is written BEFORE the
 * requests go out, so a review that dies halfway still counts.
 */

const TABLE = "agentic_audits";
const LOG_PREFIX = "[agentic-audit:console]";

/** Reviews the customer asks for («Elegir otra página») per project in any 24 hours. */
export const AGENTIC_REVIEW_DAILY_LIMIT = 5;
/**
 * Automatic reviews per project in any 24 hours (after a scan, on opening the
 * screen). Separate from the customer's 5 so that relaunching a review that
 * found nothing never uses up «Elegir otra página» (log §325). Each review is
 * about ten requests to the customer's own site, with no AI cost, and two are
 * never less than AGENTIC_SCREEN_MIN_GAP_MS apart.
 */
export const AGENTIC_AUTO_DAILY_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST200";
}

export type StoredAgenticAudit = { url: string; createdAt: string; result: AgenticCheckResult };

export type AgenticAuditsRead =
  | { available: false }
  | {
      available: true;
      latest: StoredAgenticAudit | null;
      /** The newest row of any status: a review in flight or one that failed is newer than `latest`. */
      lastAttempt: { createdAt: string; status: "pending" | "completed" | "failed" } | null;
      /** Reviews the customer asked for in the last 24 hours (failed and in flight included). */
      usedToday: number;
      /** Automatic reviews in the last 24 hours. */
      autoToday: number;
    };

/**
 * An automatic review is marked in `result` from the moment its row is
 * written (`{ automatic: true }` while pending, kept on the completed result
 * and on a failed row), so the two limits can be told apart without a new
 * column. Only completed rows are ever read as a result. A row without the
 * mark counts as the customer's, which is the safe direction.
 */
type RecentRow = { status: "pending" | "completed" | "failed"; created_at: string; automatic: unknown };
const RECENT_COLUMNS = "status, created_at, automatic:result->automatic";
const isAutomaticRow = (r: RecentRow) => r.automatic === true;

/** The screen starts a review by itself when there is none, or the last one is older than this. */
export const AGENTIC_SCREEN_STALE_MS = 48 * 60 * 60 * 1000;
/** A review started less than this ago is not started again from the screen (two tabs, a reload). */
export const AGENTIC_SCREEN_MIN_GAP_MS = 10 * 60 * 1000;
/** After a scan, at most one automatic review per project in this window. */
export const AGENTIC_SCHEDULED_MIN_GAP_MS = 20 * 60 * 60 * 1000;
/**
 * A saved product page that answers fast with an error (404, gone) leaves
 * time to look for a new one from the home page. One that timed out does not.
 */
const FALLBACK_IF_FAILED_WITHIN_MS = 6_000;

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
      .select(RECENT_COLUMNS)
      .eq("project_id", projectId)
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT)
  ]);
  const error = latestRes.error ?? recentRes.error;
  if (error) {
    if (!isMissingTable(error)) console.warn(`${LOG_PREFIX} read_failed`, { project_id: projectId, code: error.code });
    return { available: false };
  }
  const row = latestRes.data as { url: string; created_at: string; result: AgenticCheckResult | null } | null;
  const recent = (recentRes.data ?? []) as RecentRow[];
  const today = recent.filter((r) => r.created_at >= since);
  return {
    available: true,
    latest: row?.result ? { url: row.url, createdAt: row.created_at, result: row.result } : null,
    lastAttempt: recent[0] ? { createdAt: recent[0].created_at, status: recent[0].status } : null,
    usedToday: today.filter((r) => !isAutomaticRow(r)).length,
    autoToday: today.filter(isAutomaticRow).length
  };
}

/** Enough rows to cover both limits in 24 hours. */
const RECENT_LIMIT = AGENTIC_REVIEW_DAILY_LIMIT + AGENTIC_AUTO_DAILY_LIMIT + 5;

/**
 * Whether opening the screen should start a review by itself. Pure, so the
 * page and its test agree. A review that found nothing to sell is started
 * again on every visit (founder, 2026-10-18, log §325): otherwise a site that
 * changed, or a review made by an older engine, stays stuck on «No hemos
 * encontrado qué vendes» for two days. The 10-minute gap keeps a reload or a
 * second tab from starting another.
 */
export function shouldAutoReview(read: Extract<AgenticAuditsRead, { available: true }>, now: number): boolean {
  if (read.autoToday >= AGENTIC_AUTO_DAILY_LIMIT) return false;
  if (read.lastAttempt && now - Date.parse(read.lastAttempt.createdAt) < AGENTIC_SCREEN_MIN_GAP_MS) return false;
  if (read.latest === null || read.latest.result.found === "none") return true;
  return now - Date.parse(read.latest.createdAt) >= AGENTIC_SCREEN_STALE_MS;
}

export const runConsoleAgenticAuditInputSchema = z.object({
  projectId: z.string().uuid(),
  /** Present only for «Elegir otra página». Without it the review finds the product page by itself. */
  url: z.string().trim().min(1).max(2048).optional()
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

export type ConsoleAgenticAuditResult =
  | { success: true; skipped?: "recent" }
  | { success: false; error: ConsoleAgenticAuditError; message: string };

const MESSAGES: Record<ConsoleAgenticAuditError, string> = {
  project_not_found: feedbackErrorMessages.project_not_found,
  plan_required: "La auditoría agéntica está en Pro y Agencia.",
  invalid_url: "Escribe la dirección completa de una página de tu web.",
  other_domain: "La página tiene que ser de tu dominio o de un subdominio suyo.",
  limit_reached: `Ya has hecho ${AGENTIC_REVIEW_DAILY_LIMIT} revisiones en las últimas 24 horas. Vuelve a intentarlo mañana.`,
  unavailable: "La auditoría agéntica todavía no está disponible. Vuelve a intentarlo en un rato.",
  site_unreachable: "No hemos podido abrir esa página. Comprueba que la dirección es correcta y que la página está publicada.",
  failed: "No se ha podido revisar ahora mismo. Inténtalo de nuevo en unos minutos."
};

function fail(error: ConsoleAgenticAuditError): ConsoleAgenticAuditResult {
  return { success: false, error, message: MESSAGES[error] };
}

type ServiceClient = ReturnType<typeof createServiceClient>;

type ReviewArgs = {
  service: ServiceClient;
  projectId: string;
  ownerUserId: string;
  projectDomain: string;
  /** `null` = find the product page by itself. */
  url: string | null;
  /** Automatic reviews only: skip when the last review of any status is newer than this. */
  minGapMs: number | null;
  audit: RunAgenticAuditDeps;
  now: () => number;
};

/**
 * The review itself, once ownership and plan are proven by the caller.
 * Every query filters by project_id AND owner_user_id.
 */
async function performReview(args: ReviewArgs): Promise<ConsoleAgenticAuditResult> {
  const { service, projectId, ownerUserId } = args;
  const projectBase = cleanDomain(args.projectDomain);

  let manualTarget: string | null = null;
  if (args.url !== null) {
    const target = normalizeTarget(args.url);
    if (!target) return fail("invalid_url");
    if (!isSameOrSubdomain(target.baseDomain, projectBase)) return fail("other_domain");
    manualTarget = target.url;
  }

  const automatic = args.url === null;
  const since = new Date(args.now() - DAY_MS).toISOString();
  const [countRes, recentRes] = await Promise.all([
    service
      .from(TABLE)
      .select(RECENT_COLUMNS)
      .eq("project_id", projectId)
      .eq("owner_user_id", ownerUserId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
    service
      .from(TABLE)
      .select("status, created_at, result")
      .eq("project_id", projectId)
      .eq("owner_user_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(10)
  ]);
  const readError = countRes.error ?? recentRes.error;
  if (readError) {
    if (!isMissingTable(readError)) console.error(`${LOG_PREFIX} count_failed`, { project_id: projectId, code: readError.code });
    return fail("unavailable");
  }
  const recent = (recentRes.data ?? []) as Array<{ status: string; created_at: string; result: AgenticCheckResult | null }>;
  if (args.minGapMs !== null && recent[0] && args.now() - Date.parse(recent[0].created_at) < args.minGapMs) {
    return { success: true, skipped: "recent" };
  }
  const today = (countRes.data ?? []) as RecentRow[];
  if (automatic) {
    if (today.filter(isAutomaticRow).length >= AGENTIC_AUTO_DAILY_LIMIT) return { success: true, skipped: "recent" };
  } else if (today.filter((r) => !isAutomaticRow(r)).length >= AGENTIC_REVIEW_DAILY_LIMIT) {
    return fail("limit_reached");
  }

  // The same product page while it still is one: the last review that found a product.
  const previous = recent.find((r) => r.status === "completed" && r.result && r.result.found !== "none")?.result ?? null;
  const savedProduct = previous && previous.pageKind === "product" ? normalizeTarget(previous.url) : null;
  const homeTarget = normalizeTarget(args.projectDomain);
  const startUrl = manualTarget ?? savedProduct?.url ?? homeTarget?.url ?? null;
  if (!startUrl) return fail("invalid_url");

  const { data: inserted, error: insertError } = await service
    .from(TABLE)
    .insert({
      project_id: projectId,
      owner_user_id: ownerUserId,
      url: startUrl,
      status: "pending",
      ...(automatic ? { result: { automatic: true } } : {})
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    console.error(`${LOG_PREFIX} insert_failed`, { project_id: projectId, code: insertError?.code });
    return fail("unavailable");
  }

  const startedAt = args.now();
  let outcome = await runAgenticAudit(startUrl, args.audit, { discover: true });
  const fromSaved = manualTarget === null && savedProduct !== null;
  if (fromSaved && outcome.status === "failed" && homeTarget && args.now() - startedAt < FALLBACK_IF_FAILED_WITHIN_MS) {
    // The saved page is gone: look for another from the home page, once, inside the same budget,
    // so the whole review never takes longer than AGENTIC_DISCOVER_BUDGET_MS (the job runner counts on it).
    outcome = await runAgenticAudit(homeTarget.url, args.audit, {
      discover: true,
      budgetMs: AGENTIC_DISCOVER_BUDGET_MS - (args.now() - startedAt)
    });
  } else if (fromSaved && outcome.status === "completed" && outcome.result.found === "given" && previous?.found) {
    // Still the page found automatically before: keep saying where it came from.
    outcome = { status: "completed", result: { ...outcome.result, found: previous.found } };
  }

  const { error: closeError } = await service
    .from(TABLE)
    .update(
      outcome.status === "completed"
        ? {
            status: "completed",
            url: outcome.result.url,
            score: outcome.result.score,
            result: automatic ? { ...outcome.result, automatic: true } : outcome.result,
            error_category: null
          }
        : { status: "failed", error_category: outcome.error }
    )
    .eq("id", (inserted as { id: string }).id)
    .eq("project_id", projectId)
    .eq("owner_user_id", ownerUserId);
  if (closeError) {
    console.error(`${LOG_PREFIX} close_failed`, { project_id: projectId, code: closeError.code });
    return fail("failed");
  }

  if (outcome.status === "failed") return fail(outcome.error === "invalid_url" ? "invalid_url" : "site_unreachable");
  return { success: true };
}

type Deps = {
  supabase: AuthenticatedContext["supabase"];
  service: ServiceClient;
  user: AuthenticatedContext["user"];
  audit: RunAgenticAuditDeps;
  now?: () => number;
};

/** From the screen: ownership and plan checked with the user's own client first. */
export async function runConsoleAgenticAuditCore(
  input: z.infer<typeof runConsoleAgenticAuditInputSchema>,
  deps: Deps
): Promise<ConsoleAgenticAuditResult> {
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

  return performReview({
    service: deps.service,
    projectId: input.projectId,
    ownerUserId: deps.user.id,
    projectDomain: (project as { domain: string }).domain,
    url: input.url ?? null,
    minGapMs: input.url ? null : AGENTIC_SCREEN_MIN_GAP_MS,
    audit: deps.audit,
    now: deps.now ?? Date.now
  });
}

/**
 * After a scan, from the web audit job (`audit-job-runner.ts`). No user
 * session: the project id comes from the job row and the owner from the
 * project row, both read on the server, same posture as the job's other
 * cores. Plan read with `resolveSystemPlanId`, failing closed. Never throws:
 * an agentic review that fails must not fail the web audit.
 */
export async function runScheduledAgenticAudit(args: {
  service: ServiceClient;
  projectId: string;
  ownerUserId: string;
  projectDomain: string;
  audit: RunAgenticAuditDeps;
  now?: () => number;
}): Promise<ConsoleAgenticAuditResult | { success: false; error: "skipped_plan" }> {
  try {
    const { data: profile, error } = await args.service
      .from("profiles")
      .select(SYSTEM_PLAN_COLUMNS)
      .eq("id", args.ownerUserId)
      .maybeSingle();
    if (error || !isProOrAbove(resolveSystemPlanId(profile as Parameters<typeof resolveSystemPlanId>[0]))) {
      return { success: false, error: "skipped_plan" };
    }
    return await performReview({
      service: args.service,
      projectId: args.projectId,
      ownerUserId: args.ownerUserId,
      projectDomain: args.projectDomain,
      url: null,
      minGapMs: AGENTIC_SCHEDULED_MIN_GAP_MS,
      audit: args.audit,
      now: args.now ?? Date.now
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} scheduled_threw`, {
      project_id: args.projectId,
      message: error instanceof Error ? error.name : "unknown"
    });
    return fail("failed");
  }
}
