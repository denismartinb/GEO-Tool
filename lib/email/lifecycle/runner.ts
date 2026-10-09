import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { GEO_SCORE_LOOKBACK_ROWS, resolveGeoScore } from "@/lib/metrics/run-metrics";
import { isCompedAccountEmail } from "@/lib/billing/comped-accounts";
import { isInternalTestAccountEmail } from "@/lib/projects/internal-test-accounts";
import { recommendationEngineLabels } from "@/lib/recommendations/export-plan";
import { isLifecycleEmailEnabled } from "@/lib/email/lifecycle/flag";
import {
  decideTrialEmail,
  decideTrialEndEmail,
  decideWinbackEmail,
  LIFECYCLE_SPACED_KINDS,
  shouldRemindConfirmation,
  TRIAL_END_KINDS,
  TRIAL_KINDS,
  trialDaysLeft,
  type TrialEmailDecision
} from "@/lib/email/lifecycle/schedule";
import { sendTrialEndedEmail } from "@/lib/email/transactional";
import { getSiteUrl } from "@/lib/site-url";
import { proVsFreeRows, resolvePlanOffer } from "@/lib/email/lifecycle/offers";
import {
  sendFirstScanReadyEmail,
  sendTrialD1Email,
  sendTrialD3Email,
  sendTrialD5Email,
  sendTrialEndedOfferEmail,
  sendWinbackD3Email,
  sendWinbackD10Email,
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

/**
 * The whole cron shares ONE deadline (`lifecycleDeadline`): the trial pass,
 * the end-of-trial pass and the win-back pass run in the same 60 s
 * invocation, so none of them may give itself its own 45 s.
 */
const RUN_BUDGET_MS = 45_000;

export function lifecycleDeadline(startedAt: number = Date.now()): number {
  return startedAt + RUN_BUDGET_MS;
}

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
  now = new Date(),
  deadline = lifecycleDeadline()
}: {
  service: Service;
  now?: Date;
  deadline?: number;
}): Promise<LifecycleRunResult> {
  if (!isLifecycleEmailEnabled()) return { status: "disabled" };

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
    if (Date.now() > deadline) {
      // Not a loss: every account left out is still eligible tomorrow.
      deferred += 1;
      continue;
    }

    const ownSends = (sends ?? []).filter((s) => s.owner_user_id === profile.id);
    const lastLifecycleSentAt = latestSentAt(ownSends, TRIAL_KINDS);

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

type SendRow = { owner_user_id: string; kind: string; sent_at: string };

function latestSentAt(rows: ReadonlyArray<{ kind: unknown; sent_at: unknown }>, kinds: readonly string[]): Date | null {
  return rows
    .filter((row) => kinds.includes(row.kind as string))
    .reduce<Date | null>((latest, row) => {
      const at = new Date(row.sent_at as string);
      return !latest || at > latest ? at : latest;
    }, null);
}

/* ------------------------------------------- fin de prueba y recuperación */

/** The project the post-trial emails talk about: the newest one with a completed scan, else none. */
async function loadMainSnapshot(service: Service, ownerUserId: string): Promise<RunSnapshot | null> {
  const { data: projects } = await service
    .from("projects")
    .select("id, domain, created_at")
    .eq("owner_user_id", ownerUserId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  for (const project of projects ?? []) {
    const snapshot = await loadRunSnapshot(service, project.id as string, project.domain as string);
    if (snapshot) return snapshot;
  }
  return null;
}

type TrialEndTarget = {
  userId: string;
  email: string;
  trialEndsAt: Date;
  hasSubscription: boolean;
  lifecycleOptIn: boolean;
};

/**
 * LIFECYCLE-WINBACK-1 (log §238). Sends the end-of-trial email once, either
 * version, and records it — which is what anchors D+3 and D+10. Shared by
 * the daily cron and by `applyTrialExpiry` (the customer opening the console
 * after the end), so whichever gets there first sends it and the other sees
 * the `email_sends` row. Whoever opted out of "consejos y ofertas" gets the
 * plain service email without an offer (log §232), recorded the same way so
 * it is not repeated; the win-back emails then skip them.
 *
 * Returns whether an email went out.
 */
export async function sendTrialEndEmailOnce(
  service: Service,
  target: TrialEndTarget,
  now: Date = new Date()
): Promise<boolean> {
  if (!isLifecycleEmailEnabled()) return false;

  const { data: sends } = await service
    .from("email_sends")
    .select("kind")
    .eq("owner_user_id", target.userId)
    .in("kind", [...TRIAL_END_KINDS]);
  const decision = decideTrialEndEmail(
    { trialEndsAt: target.trialEndsAt, hasSubscription: target.hasSubscription, isExcluded: isExcludedAccount(target.email) },
    new Set((sends ?? []).map((row) => row.kind as string)),
    now
  );
  if (!decision) return false;

  const delivered = target.lifecycleOptIn
    ? await sendTrialEndedOfferEmail(target.email, target.userId, {
        late: decision.kind === "trial_ended_late",
        trialEndsAt: target.trialEndsAt,
        snapshot: await loadMainSnapshot(service, target.userId),
        pro: await resolvePlanOffer("pro"),
        starter: await resolvePlanOffer("starter")
      })
    : await sendTrialEndedEmail(target.email);
  if (delivered) await recordSend(service, target.userId, decision.kind);
  return delivered;
}

/**
 * The console half: `applyTrialExpiry` (lib/billing.ts) calls this when the
 * customer opens the console after the end and the account is downgraded.
 * Reads the customer's own opt-out, then defers to `sendTrialEndEmailOnce`.
 */
export async function notifyTrialEndedOnDowngrade(
  service: Service,
  input: { userId: string; email: string; trialEndsAt: Date },
  now: Date = new Date()
): Promise<boolean> {
  if (!isLifecycleEmailEnabled()) return false;
  const { data: profile } = await service
    .from("profiles")
    .select("notify_lifecycle")
    .eq("id", input.userId)
    .maybeSingle();
  return sendTrialEndEmailOnce(
    service,
    { ...input, hasSubscription: false, lifecycleOptIn: profile?.notify_lifecycle !== false },
    now
  );
}

export type PassResult = { status: "disabled" } | { status: "query_failed" } | { status: "ok"; sent: number; failed: number; deferred: number };

/**
 * The cron half of the end-of-trial email: trials whose end is in the past
 * and were never downgraded (`current_plan` is still the trial's). The
 * console downgrades lazily on the next visit and clears `trial_ends_at`, so
 * an account still matching here is, by construction, one nobody told.
 */
export async function runTrialEndEmails({
  service,
  now = new Date(),
  deadline = lifecycleDeadline()
}: {
  service: Service;
  now?: Date;
  deadline?: number;
}): Promise<PassResult> {
  if (!isLifecycleEmailEnabled()) return { status: "disabled" };

  const { data: profiles, error } = await service
    .from("profiles")
    .select("id, email, trial_ends_at, stripe_subscription_id, notify_lifecycle, current_plan")
    .lt("trial_ends_at", now.toISOString())
    .is("stripe_subscription_id", null);
  if (error) {
    console.error("[geo:lifecycle] failed to load ended trials", { message: error.message });
    return { status: "query_failed" };
  }

  let sent = 0;
  let failed = 0;
  let deferred = 0;
  for (const profile of (profiles ?? []) as Array<ProfileRow & { current_plan: string | null }>) {
    if (!profile.email || !profile.trial_ends_at || profile.current_plan === "free") continue;
    if (Date.now() > deadline) {
      deferred += 1;
      continue;
    }
    try {
      const delivered = await sendTrialEndEmailOnce(
        service,
        {
          userId: profile.id,
          email: profile.email,
          trialEndsAt: new Date(profile.trial_ends_at),
          hasSubscription: Boolean(profile.stripe_subscription_id),
          lifecycleOptIn: profile.notify_lifecycle !== false
        },
        now
      );
      if (delivered) sent += 1;
    } catch (sendError) {
      failed += 1;
      console.error("[geo:lifecycle] end-of-trial email failed", {
        message: sendError instanceof Error ? sendError.message : "unknown"
      });
    }
  }
  return { status: "ok", sent, failed, deferred };
}

/**
 * D+3 and D+10. Candidates are the accounts with an end-of-trial email on
 * record (that send is the anchor, not `trial_ends_at`, which the console
 * clears on downgrade). Stops at a subscription, an opt-out, or 30 days.
 */
export async function runWinbackEmails({
  service,
  now = new Date(),
  deadline = lifecycleDeadline()
}: {
  service: Service;
  now?: Date;
  deadline?: number;
}): Promise<PassResult> {
  if (!isLifecycleEmailEnabled()) return { status: "disabled" };

  const { data: anchors, error } = await service
    .from("email_sends")
    .select("owner_user_id, kind, sent_at")
    .in("kind", [...TRIAL_END_KINDS]);
  if (error) {
    console.error("[geo:lifecycle] failed to load end-of-trial sends", { message: error.message });
    return { status: "query_failed" };
  }
  const ownerIds = [...new Set(((anchors ?? []) as SendRow[]).map((row) => row.owner_user_id))];
  if (ownerIds.length === 0) return { status: "ok", sent: 0, failed: 0, deferred: 0 };

  const [{ data: profiles, error: profilesError }, { data: sends }] = await Promise.all([
    service.from("profiles").select("id, email, stripe_subscription_id, notify_lifecycle").in("id", ownerIds),
    service.from("email_sends").select("owner_user_id, kind, sent_at").in("owner_user_id", ownerIds)
  ]);
  if (profilesError) {
    console.error("[geo:lifecycle] failed to load win-back accounts", { message: profilesError.message });
    return { status: "query_failed" };
  }

  const [pro, starter] = await Promise.all([resolvePlanOffer("pro"), resolvePlanOffer("starter")]);
  let sent = 0;
  let failed = 0;
  let deferred = 0;

  for (const profile of (profiles ?? []) as Array<Pick<ProfileRow, "id" | "email" | "stripe_subscription_id" | "notify_lifecycle">>) {
    if (!profile.email || isExcludedAccount(profile.email)) continue;
    if (Date.now() > deadline) {
      deferred += 1;
      continue;
    }

    const own = ((sends ?? []) as SendRow[]).filter((row) => row.owner_user_id === profile.id);
    const decision = decideWinbackEmail(
      {
        hasSubscription: Boolean(profile.stripe_subscription_id),
        isExcluded: false,
        lifecycleOptIn: profile.notify_lifecycle !== false,
        endEmailSentAt: latestSentAt(own, TRIAL_END_KINDS)
      },
      {
        kinds: new Set(own.map((row) => row.kind)),
        d3SentAt: latestSentAt(own, ["winback_d3"]),
        lastLifecycleSentAt: latestSentAt(own, LIFECYCLE_SPACED_KINDS)
      },
      pro.promo !== null,
      now
    );
    if (!decision) continue;

    const snapshot = await loadMainSnapshot(service, profile.id);
    let delivered = false;
    if (decision.kind === "winback_d3") {
      // Its whole content is the last scan's ranking; without one, nothing to say.
      if (!snapshot) continue;
      delivered = await sendWinbackD3Email(profile.email, profile.id, { snapshot, pro, starter });
    } else {
      delivered = await sendWinbackD10Email(profile.email, profile.id, { domain: snapshot?.domain ?? null, pro });
    }

    if (delivered) {
      await recordSend(service, profile.id, decision.kind);
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return { status: "ok", sent, failed, deferred };
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
