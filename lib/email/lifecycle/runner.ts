import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { GEO_SCORE_LOOKBACK_ROWS, resolveGeoScore } from "@/lib/metrics/run-metrics";
import { isCompedAccountEmail } from "@/lib/billing/comped-accounts";
import { isInternalTestAccountEmail } from "@/lib/projects/internal-test-accounts";
import { recommendationEngineLabels } from "@/lib/recommendations/export-plan";
import { isLifecycleEmailEnabled } from "@/lib/email/lifecycle/flag";
import {
  decideTrialEmail,
  shouldRemindConfirmation,
  TRIAL_KINDS,
  trialDaysLeft,
  type TrialEmailDecision
} from "@/lib/email/lifecycle/schedule";
import { getSiteUrl } from "@/lib/site-url";
import { proVsFreeRows, resolvePlanOffer } from "@/lib/email/lifecycle/offers";
import {
  sendFirstScanReadyEmail,
  sendTrialD1Email,
  sendTrialD3Email,
  sendTrialD5Email,
  type RunSnapshot,
  type TopRecommendation
} from "@/lib/email/lifecycle/templates";

/**
 * LIFECYCLE-TRIAL-1 (log §233). The two entry points that send the trial
 * sequence: the daily cron (`runLifecycleEmails`) and the end of an
 * account's first scan (`maybeSendFirstScanReadyEmail`). Both are no-ops
 * while `isLifecycleEmailEnabled()` is false.
 *
 * Every figure is read here, from the account's own rows, at send time; the
 * templates never invent one. A send is recorded in `email_sends` only after
 * Resend accepted it, so a failed send is retried by the next pass.
 */

type Service = ReturnType<typeof createServiceClient>;

const RUN_BUDGET_MS = 45_000;

type RankingEntry = { name?: string; is_brand?: boolean; mention_count?: number; prompt_count?: number };

function isExcludedAccount(email: string | null | undefined): boolean {
  return isCompedAccountEmail(email) || isInternalTestAccountEmail(email);
}

/**
 * The latest scan of a project as the emails describe it: the same windowed
 * "Puntuación GEO" as the dashboard (`resolveGeoScore`), and mentions over
 * ANSWERS from the run's own ranking (`brand_position`), never over prompts —
 * the TRUST-METRICS-1 vocabulary (log §183). `null` when the run carries no
 * ranking: the first-scan email is then not sent rather than sent without
 * its numbers.
 */
export async function loadRunSnapshot(service: Service, projectId: string, domain: string): Promise<RunSnapshot | null> {
  const { data: rows, error } = await service
    .from("run_scores")
    .select("run_id, created_at, visibility_score, details_json")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(GEO_SCORE_LOOKBACK_ROWS);
  if (error || !rows || rows.length === 0) return null;

  const latest = rows[0];
  const ranking = (latest.details_json as { brand_position?: { ranking?: RankingEntry[] } } | null)?.brand_position
    ?.ranking;
  const brand = ranking?.find((entry) => entry.is_brand);
  if (!ranking || !brand || typeof brand.prompt_count !== "number" || brand.prompt_count === 0) return null;

  const topCompetitor = ranking
    .filter((entry) => !entry.is_brand && typeof entry.name === "string" && (entry.mention_count ?? 0) > 0)
    .sort((a, b) => (b.mention_count ?? 0) - (a.mention_count ?? 0))[0];

  const { count: activeRecommendations } = await service
    .from("recommendations")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("run_id", latest.run_id)
    .eq("status", "active");

  return {
    projectId,
    domain,
    geoScore: resolveGeoScore(rows).value,
    runDate: new Date(latest.created_at as string),
    brandMentions: brand.mention_count ?? 0,
    answers: brand.prompt_count,
    topCompetitor: topCompetitor
      ? { name: topCompetitor.name as string, mentions: topCompetitor.mention_count ?? 0 }
      : null,
    activeRecommendations: activeRecommendations ?? 0
  };
}

async function loadTopRecommendation(
  service: Service,
  projectId: string
): Promise<{ recommendation: TopRecommendation; others: number } | null> {
  const { data: latest } = await service
    .from("run_scores")
    .select("run_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest?.run_id) return null;

  const { data: recs } = await service
    .from("recommendations")
    .select("title, description, evidence_json")
    .eq("project_id", projectId)
    .eq("run_id", latest.run_id)
    .eq("status", "active")
    .order("priority_rank", { ascending: true });
  if (!recs || recs.length === 0) return null;

  const [top] = recs;
  return {
    recommendation: {
      title: top.title as string,
      description: top.description as string,
      engines: recommendationEngineLabels({ evidence_json: top.evidence_json } as Parameters<
        typeof recommendationEngineLabels
      >[0])
    },
    others: recs.length - 1
  };
}

async function recordSend(service: Service, ownerUserId: string, kind: string): Promise<void> {
  const { error } = await service
    .from("email_sends")
    .upsert({ owner_user_id: ownerUserId, kind }, { onConflict: "owner_user_id,kind", ignoreDuplicates: true });
  if (error) {
    // The email already went out; a missing row means the next pass could
    // send it again, so this is worth an operator's eye in the logs.
    console.error("[geo:lifecycle] email sent but not recorded", { kind, message: error.message });
  }
}

/* ------------------------------------------------------ primer escaneo */

/**
 * Called after a run is durably `completed` (lib/scan/executor.ts). Sends the
 * "primer escaneo listo" email only for the account's FIRST completed scan —
 * counted across all its projects, so an account that scanned for months
 * before this shipped never gets it on its next routine scan.
 */
export async function maybeSendFirstScanReadyEmail(
  service: Service,
  input: { ownerUserId: string; projectId: string; projectDomain: string }
): Promise<void> {
  if (!isLifecycleEmailEnabled()) return;

  try {
    const { data: profile } = await service
      .from("profiles")
      .select("email, notify_first_scan")
      .eq("id", input.ownerUserId)
      .maybeSingle();
    if (!profile?.email || profile.notify_first_scan === false || isExcludedAccount(profile.email)) return;

    const { data: already } = await service
      .from("email_sends")
      .select("id")
      .eq("owner_user_id", input.ownerUserId)
      .eq("kind", "first_scan")
      .maybeSingle();
    if (already) return;

    const { data: projects } = await service.from("projects").select("id").eq("owner_user_id", input.ownerUserId);
    const projectIds = (projects ?? []).map((p) => p.id as string);
    if (projectIds.length === 0) return;

    const { count: completedRuns } = await service
      .from("scan_runs")
      .select("id", { count: "exact", head: true })
      .in("project_id", projectIds)
      .eq("status", "completed");
    if (completedRuns !== 1) return;

    const snapshot = await loadRunSnapshot(service, input.projectId, input.projectDomain);
    if (!snapshot) return;

    const sent = await sendFirstScanReadyEmail(profile.email as string, input.ownerUserId, snapshot);
    if (sent) await recordSend(service, input.ownerUserId, "first_scan");
  } catch (error) {
    console.error("[geo:lifecycle] first-scan email failed; the scan itself completed", {
      projectId: input.projectId,
      message: error instanceof Error ? error.message : "unknown"
    });
  }
}

/* ---------------------------------------------------------- daily cron */

type ProfileRow = {
  id: string;
  email: string | null;
  created_at: string;
  trial_ends_at: string | null;
  stripe_subscription_id: string | null;
  notify_lifecycle: boolean | null;
};

export type LifecycleRunResult =
  | { status: "disabled" }
  | { status: "query_failed" }
  | { status: "ok"; considered: number; sent: number; failed: number; deferred: number };

export async function runLifecycleEmails({
  service,
  now = new Date()
}: {
  service: Service;
  now?: Date;
}): Promise<LifecycleRunResult> {
  if (!isLifecycleEmailEnabled()) return { status: "disabled" };
  const startedAt = Date.now();

  // Only accounts still inside their trial: the trial end is in the future.
  // (ALERTS-SCOPE-1 leaves `trial_ends_at` in place when a trial lapses
  // unseen, so the `gte` is what keeps lapsed trials out of this phase.)
  const { data: profiles, error } = await service
    .from("profiles")
    .select("id, email, created_at, trial_ends_at, stripe_subscription_id, notify_lifecycle")
    .gte("trial_ends_at", now.toISOString());
  if (error) {
    console.error("[geo:lifecycle] failed to load trial accounts", { message: error.message });
    return { status: "query_failed" };
  }

  const candidates = ((profiles ?? []) as ProfileRow[]).filter((p) => p.email && !isExcludedAccount(p.email));
  if (candidates.length === 0) return { status: "ok", considered: 0, sent: 0, failed: 0, deferred: 0 };
  const ownerIds = candidates.map((p) => p.id);

  const [{ data: sends }, { data: projects }] = await Promise.all([
    service.from("email_sends").select("owner_user_id, kind, sent_at").in("owner_user_id", ownerIds),
    service
      .from("projects")
      .select("id, domain, owner_user_id, created_at")
      .in("owner_user_id", ownerIds)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
  ]);

  const projectIds = (projects ?? []).map((p) => p.id as string);
  const { data: completedRuns } = projectIds.length
    ? await service.from("scan_runs").select("project_id").in("project_id", projectIds).eq("status", "completed")
    : { data: [] as Array<{ project_id: string }> };
  const scannedProjects = new Set((completedRuns ?? []).map((r) => r.project_id as string));

  let sent = 0;
  let failed = 0;
  let deferred = 0;

  for (const profile of candidates) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      // Not a loss: every account left out is still eligible tomorrow.
      deferred += 1;
      continue;
    }

    const ownSends = (sends ?? []).filter((s) => s.owner_user_id === profile.id);
    const lifecycleSends = ownSends.filter((s) => (TRIAL_KINDS as readonly string[]).includes(s.kind as string));
    const lastLifecycleSentAt = lifecycleSends.reduce<Date | null>((latest, s) => {
      const at = new Date(s.sent_at as string);
      return !latest || at > latest ? at : latest;
    }, null);

    const ownProjects = (projects ?? []).filter((p) => p.owner_user_id === profile.id);
    const scannedProject = ownProjects.find((p) => scannedProjects.has(p.id as string));
    const mainProject = scannedProject ?? ownProjects[0] ?? null;

    const decision = decideTrialEmail(
      {
        createdAt: new Date(profile.created_at),
        trialEndsAt: profile.trial_ends_at ? new Date(profile.trial_ends_at) : null,
        hasSubscription: Boolean(profile.stripe_subscription_id),
        isExcluded: false,
        lifecycleOptIn: profile.notify_lifecycle !== false,
        hasProject: ownProjects.length > 0,
        hasCompletedScan: Boolean(scannedProject)
      },
      { kinds: new Set(ownSends.map((s) => s.kind as string)), lastLifecycleSentAt },
      now
    );
    if (!decision) continue;

    const delivered = await sendDecision(service, decision, {
      email: profile.email as string,
      userId: profile.id,
      trialEndsAt: new Date(profile.trial_ends_at as string),
      project: mainProject ? { id: mainProject.id as string, domain: mainProject.domain as string } : null,
      now
    });

    if (delivered) {
      await recordSend(service, profile.id, decision.kind);
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return { status: "ok", considered: candidates.length, sent, failed, deferred };
}

async function sendDecision(
  service: Service,
  decision: TrialEmailDecision,
  ctx: { email: string; userId: string; trialEndsAt: Date; project: { id: string; domain: string } | null; now: Date }
): Promise<boolean> {
  const daysLeft = trialDaysLeft(ctx.trialEndsAt, ctx.now);

  if (decision.kind === "trial_d1") {
    return sendTrialD1Email(ctx.email, ctx.userId, {
      variant: decision.variant,
      daysLeft,
      projectId: ctx.project?.id ?? null,
      domain: ctx.project?.domain ?? null
    });
  }

  if (decision.kind === "trial_d3") {
    const top = decision.variant === "with_scan" && ctx.project ? await loadTopRecommendation(service, ctx.project.id) : null;
    return sendTrialD3Email(ctx.email, ctx.userId, {
      daysLeft,
      projectId: ctx.project?.id ?? null,
      domain: ctx.project?.domain ?? null,
      recommendation: top?.recommendation ?? null,
      otherRecommendations: top?.others ?? 0
    });
  }

  return sendTrialD5Email(ctx.email, ctx.userId, {
    trialEndsAt: ctx.trialEndsAt,
    domain: ctx.project?.domain ?? null,
    pro: await resolvePlanOffer("pro"),
    starter: await resolvePlanOffer("starter"),
    lossRows: proVsFreeRows()
  });
}

/* ------------------------------------------- recordatorio de confirmación */

/** `auth.admin.listUsers` page size; same scale reasoning as lib/admin/users.ts. */
const AUTH_USERS_PAGE = 1000;

export type ConfirmationReminderResult =
  | { status: "disabled" }
  | { status: "query_failed" }
  | { status: "ok"; reminded: number; failed: number; truncated: boolean };

/**
 * CONFIRM-REMINDER-1 (log §234). Re-sends Supabase's own confirmation email
 * ("Confirma tu cuenta en GenScore", the template already configured in
 * Supabase and delivered through Resend) to password sign-ups that never
 * clicked the link. `auth.resend` issues a fresh, valid link and the same
 * `emailRedirectTo` the sign-up used, so the flow after the click is exactly
 * the original one — welcome email included.
 *
 * Account email, not commercial: category `service`, no unsubscribe. It
 * still rides the lifecycle switch, so the whole sequence turns on at once.
 */
export async function runConfirmationReminders({
  service,
  now = new Date()
}: {
  service: Service;
  now?: Date;
}): Promise<ConfirmationReminderResult> {
  if (!isLifecycleEmailEnabled()) return { status: "disabled" };

  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: AUTH_USERS_PAGE });
  if (error || !data) {
    console.error("[geo:lifecycle] failed to list auth users for confirmation reminders", { message: error?.message });
    return { status: "query_failed" };
  }

  const due = data.users.filter(
    (user) =>
      typeof user.email === "string" &&
      shouldRemindConfirmation(
        {
          createdAt: new Date(user.created_at),
          emailConfirmedAt: user.email_confirmed_at ? new Date(user.email_confirmed_at) : null,
          isExcluded: isExcludedAccount(user.email)
        },
        now
      )
  );

  let reminded = 0;
  let failed = 0;
  for (const user of due) {
    const { error: resendError } = await service.auth.resend({
      type: "signup",
      email: user.email as string,
      options: { emailRedirectTo: `${getSiteUrl()}/auth/callback` }
    });
    if (resendError) {
      // Supabase's own throttle is the usual cause; the account stays
      // unconfirmed and simply gets no reminder — logged, never retried in a
      // loop against a rate limit.
      console.error("[geo:lifecycle] confirmation reminder failed", { message: resendError.message });
      failed += 1;
    } else {
      reminded += 1;
    }
  }

  return { status: "ok", reminded, failed, truncated: data.users.length >= AUTH_USERS_PAGE };
}
