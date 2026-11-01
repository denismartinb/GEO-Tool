import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { resolveSystemPlanId, SYSTEM_PLAN_COLUMNS } from "@/lib/billing";
import type { AgenticCheckResult } from "@/lib/agentic-audit/api-contract";
import { firstSteps } from "@/lib/agentic-audit/console-model";
import { isSearchConsoleCryptoConfigured } from "@/lib/search-console/crypto";
import { getOAuthClient } from "@/lib/search-console/google";
import { isFeatureEmailEnabled } from "@/lib/email/lifecycle/flag";
import { decideFeatureEmail, type FeatureEmailDecision } from "@/lib/email/lifecycle/feature-schedule";
import {
  agenticEmailParts,
  extensionEmailParts,
  gscEmailParts,
  sendFeatureEmail,
  type EmailParts
} from "@/lib/email/lifecycle/feature-templates";
import { LIFECYCLE_SPACED_KINDS } from "@/lib/email/lifecycle/schedule";
import {
  isExcludedAccount,
  latestSentAt,
  lifecycleDeadline,
  sendClaimedOnce,
  type PassResult
} from "@/lib/email/lifecycle/runner";

/**
 * FEATURE-EMAILS-1 (log §417). The cron pass that sends the three feature
 * emails: Search Console, the agentic audit and the Chrome extension. Off
 * unless `isFeatureEmailEnabled()`. It runs after the trial, end-of-trial and
 * win-back passes of the same firing, so it reads their sends of today and
 * the 48 h spacing holds across all of them.
 *
 * The service client skips RLS: every project, connection and review read
 * here is filtered by the same `owner_user_id` set that chose the
 * recipients, and each email only names that owner's own domain.
 */

type Service = ReturnType<typeof createServiceClient>;

type Profile = {
  id: string;
  email: string | null;
  created_at: string;
  notify_lifecycle: boolean | null;
  current_plan: string | null;
  trial_ends_at: string | null;
  stripe_subscription_id: string | null;
};

type ProjectRow = { id: string; domain: string; owner_user_id: string; created_at: string };
type AgenticRow = { project_id: string; owner_user_id: string; created_at: string; result: AgenticCheckResult | null };

/** A review that scored something the site sells (same gate as Visión general). */
function isScoredResult(result: AgenticCheckResult | null): result is AgenticCheckResult & { score: number } {
  return Boolean(result && result.found !== "none" && typeof result.score === "number");
}

function gscConfigured(): boolean {
  return isSearchConsoleCryptoConfigured() && getOAuthClient() !== null;
}

export async function runFeatureEmails({
  service,
  now = new Date(),
  deadline = lifecycleDeadline()
}: {
  service: Service;
  now?: Date;
  deadline?: number;
}): Promise<PassResult> {
  if (!isFeatureEmailEnabled()) return { status: "disabled" };

  const { data: profileRows, error } = await service
    .from("profiles")
    .select(`id, created_at, notify_lifecycle, ${SYSTEM_PLAN_COLUMNS}`);
  if (error) {
    console.error("[geo:lifecycle] failed to load accounts for feature emails", { message: error.message });
    return { status: "query_failed" };
  }

  const profiles = ((profileRows ?? []) as Profile[]).filter(
    (p) => p.email && !isExcludedAccount(p.email) && p.notify_lifecycle !== false
  );
  if (profiles.length === 0) return { status: "ok", sent: 0, failed: 0, deferred: 0 };
  const ownerIds = profiles.map((p) => p.id);

  const [{ data: sends, error: sendsError }, { data: projects, error: projectsError }] = await Promise.all([
    service.from("email_sends").select("owner_user_id, kind, sent_at").in("owner_user_id", ownerIds),
    service
      .from("projects")
      .select("id, domain, owner_user_id, created_at")
      .in("owner_user_id", ownerIds)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
  ]);
  if (sendsError || projectsError) {
    console.error("[geo:lifecycle] failed to load sends or projects for feature emails", {
      message: (sendsError ?? projectsError)?.message
    });
    return { status: "query_failed" };
  }

  const projectRows = (projects ?? []) as ProjectRow[];
  const projectIds = projectRows.map((p) => p.id);
  const projectById = new Map(projectRows.map((p) => [p.id, p]));

  const [{ data: completedRuns }, gsc, agentic] = await Promise.all([
    projectIds.length
      ? service.from("scan_runs").select("project_id").in("project_id", projectIds).eq("status", "completed")
      : Promise.resolve({ data: [] as Array<{ project_id: string }> }),
    loadGscConnections(service, ownerIds),
    loadFirstAgenticResults(service, ownerIds, projectById)
  ]);
  const scanned = new Set(((completedRuns ?? []) as Array<{ project_id: string }>).map((r) => r.project_id));

  let sent = 0;
  let failed = 0;
  let deferred = 0;

  for (const profile of profiles) {
    if (Date.now() > deadline) {
      deferred += 1;
      continue;
    }

    const own = ((sends ?? []) as Array<{ owner_user_id: string; kind: string; sent_at: string }>).filter(
      (row) => row.owner_user_id === profile.id
    );
    const ownProjects = projectRows.filter((p) => p.owner_user_id === profile.id);
    const scannedProject = ownProjects.find((p) => scanned.has(p.id)) ?? null;
    const firstAgentic = agentic.get(profile.id) ?? null;

    const decision = decideFeatureEmail(
      {
        createdAt: new Date(profile.created_at),
        planId: resolveSystemPlanId(profile),
        isExcluded: false,
        lifecycleOptIn: true,
        hasCompletedScan: scannedProject !== null,
        gscAvailable: gsc !== null,
        gscConnected: gsc?.has(profile.id) ?? false,
        firstAgenticResultAt: firstAgentic ? new Date(firstAgentic.createdAt) : null
      },
      { kinds: new Set(own.map((row) => row.kind)), lastLifecycleSentAt: latestSentAt(own, LIFECYCLE_SPACED_KINDS) },
      now
    );
    if (!decision) continue;

    const parts = composeParts(decision, scannedProject, firstAgentic);
    if (!parts) continue;

    const email = profile.email as string;
    try {
      const result = await sendClaimedOnce(service, profile.id, decision.kind, async () => (options) =>
        sendFeatureEmail(email, profile.id, parts, options)
      );
      if (result === "sent") sent += 1;
      else if (result === "failed") failed += 1;
    } catch (sendError) {
      failed += 1;
      console.error("[geo:lifecycle] feature email failed", {
        kind: decision.kind,
        message: sendError instanceof Error ? sendError.message : "unknown"
      });
    }
  }

  return { status: "ok", sent, failed, deferred };
}

type FirstAgentic = { projectId: string; domain: string; createdAt: string; result: AgenticCheckResult & { score: number } };

function composeParts(
  decision: FeatureEmailDecision,
  scannedProject: ProjectRow | null,
  firstAgentic: FirstAgentic | null
): EmailParts | null {
  if (decision.kind === "feature_gsc") {
    return scannedProject ? gscEmailParts({ projectId: scannedProject.id, domain: scannedProject.domain }) : null;
  }
  if (decision.kind === "feature_extension") {
    return scannedProject ? extensionEmailParts({ domain: scannedProject.domain }) : null;
  }
  if (decision.variant === "upgrade") {
    return scannedProject ? agenticEmailParts({ variant: "upgrade", domain: scannedProject.domain }) : null;
  }
  if (!firstAgentic) return null;
  const [step] = firstSteps(firstAgentic.result, 1);
  return agenticEmailParts({
    variant: "result",
    projectId: firstAgentic.projectId,
    domain: firstAgentic.domain,
    score: firstAgentic.result.score,
    firstFix: step?.title ?? null
  });
}

/**
 * Owners with an active Search Console connection on any domain. `null` when
 * Search Console is not configured here or its table cannot be read
 * (migration 0041 missing): then the Search Console email is not sent at all,
 * because its button could not work.
 */
async function loadGscConnections(service: Service, ownerIds: string[]): Promise<Set<string> | null> {
  if (!gscConfigured()) return null;
  const { data, error } = await service
    .from("search_console_connections")
    .select("owner_user_id")
    .in("owner_user_id", ownerIds)
    .eq("status", "active");
  if (error) {
    console.warn("[geo:lifecycle] search console connections unreadable; skipping its email", { code: error.code });
    return null;
  }
  return new Set(((data ?? []) as Array<{ owner_user_id: string }>).map((row) => row.owner_user_id));
}

/**
 * The first completed review per account that scored something the site
 * sells, on one of the owner's own active projects. A missing table (0043)
 * or a failed read means no result email this pass, never a made-up one.
 */
async function loadFirstAgenticResults(
  service: Service,
  ownerIds: string[],
  projectById: Map<string, ProjectRow>
): Promise<Map<string, FirstAgentic>> {
  const first = new Map<string, FirstAgentic>();
  const { data, error } = await service
    .from("agentic_audits")
    .select("project_id, owner_user_id, created_at, result")
    .in("owner_user_id", ownerIds)
    .eq("status", "completed")
    .not("score", "is", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[geo:lifecycle] agentic audits unreadable; skipping its email", { code: error.code });
    return first;
  }
  for (const row of (data ?? []) as AgenticRow[]) {
    if (first.has(row.owner_user_id) || !isScoredResult(row.result)) continue;
    const project = projectById.get(row.project_id);
    if (!project || project.owner_user_id !== row.owner_user_id) continue;
    first.set(row.owner_user_id, {
      projectId: project.id,
      domain: project.domain,
      createdAt: row.created_at,
      result: row.result
    });
  }
  return first;
}
