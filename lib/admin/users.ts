import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { PLANS } from "@/app/pricing/plans-data";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type AdminUserStatus = "trial" | "trial_expired" | "paid" | "free";

export type AdminUserRow = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  planId: string;
  planLabel: string;
  planPrice: number;
  status: AdminUserStatus;
  trialEndsAt: string | null;
  projectCount: number;
  scanCount30d: number;
};

export type AdminUsersPage = {
  users: AdminUserRow[];
  /**
   * True when `auth.admin.listUsers` reported more users than this fetch
   * covers — `last_sign_in_at` will read as "—" for whichever rows fell
   * outside the page instead of a wrong value. Stated on the page rather
   * than hidden, same reasoning as `scan.md`'s "never cap the work by row
   * count": an invisible truncation reads as complete when it isn't.
   */
  authUsersTruncated: boolean;
};

export type AdminUserProject = {
  id: string;
  name: string;
  domain: string;
  createdAt: string;
  isArchived: boolean;
  latestScan: { status: string; createdAt: string } | null;
};

export type AdminUserDetail = AdminUserRow & {
  stripeCustomerId: string | null;
  cancelAt: string | null;
  projects: AdminUserProject[];
};

/**
 * `auth.admin.listUsers` defaults to 50/page; this repo is pre-launch beta
 * scale (dozens to low hundreds of accounts), so a single generous page
 * covers every real account today. `AdminUsersPage.authUsersTruncated`
 * makes it visible on the day that stops being true, rather than silently
 * dropping `lastSignInAt` for whoever falls past it.
 */
const AUTH_USERS_FETCH_CAP = 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function planLabel(planId: string): string {
  return PLANS.find((plan) => plan.id === planId)?.name ?? planId;
}

function planPrice(planId: string): number {
  return PLANS.find((plan) => plan.id === planId)?.price ?? 0;
}

/**
 * Display-only status, derived the same way `lib/billing.ts` reads plan
 * truth — a real Stripe subscription beats a trial beats the base plan —
 * but never writes anything (no lazy trial-expiry downgrade here): this is
 * a read-only console, and running that write for every row on every page
 * load would turn a listing into 100+ silent database writes.
 */
function deriveStatus(row: {
  current_plan: string | null;
  trial_ends_at: string | null;
  stripe_subscription_id: string | null;
}): AdminUserStatus {
  if (row.stripe_subscription_id) return "paid";
  if (row.trial_ends_at) {
    return new Date(row.trial_ends_at).getTime() > Date.now() ? "trial" : "trial_expired";
  }
  return "free";
}

function toRow(
  profile: {
    id: string;
    email: string;
    created_at: string;
    current_plan: string | null;
    trial_ends_at: string | null;
    stripe_subscription_id: string | null;
  },
  lastSignInAt: string | null,
  projectCount: number,
  scanCount30d: number
): AdminUserRow {
  const planId = profile.current_plan ?? "free";
  return {
    id: profile.id,
    email: profile.email,
    createdAt: profile.created_at,
    lastSignInAt,
    planId,
    planLabel: planLabel(planId),
    planPrice: planPrice(planId),
    status: deriveStatus(profile),
    trialEndsAt: profile.trial_ends_at ?? null,
    projectCount,
    scanCount30d
  };
}

/**
 * The full, unfiltered user list plus the per-owner aggregates (active
 * projects, scans in the last 30 days) needed to render it. Filtering by
 * search/status happens in the caller (`app/admin/users/page.tsx`) against
 * this same array — at this account scale a second round trip per filter
 * change buys nothing.
 */
export async function listOperatorUsers(service: ServiceClient): Promise<AdminUsersPage> {
  const cutoffIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const [profilesResult, authResult, projectsResult, scansResult] = await Promise.all([
    service
      .from("profiles")
      .select("id, email, created_at, current_plan, trial_ends_at, stripe_subscription_id")
      .order("created_at", { ascending: false }),
    service.auth.admin.listUsers({ page: 1, perPage: AUTH_USERS_FETCH_CAP }),
    service.from("projects").select("id, owner_user_id, is_archived"),
    service.from("scan_runs").select("project_id, created_at").gte("created_at", cutoffIso)
  ]);

  if (profilesResult.error) {
    throw new Error(`admin users: failed to read profiles — ${profilesResult.error.message}`);
  }
  if (authResult.error) {
    throw new Error(`admin users: failed to read auth users — ${authResult.error.message}`);
  }
  if (projectsResult.error) {
    throw new Error(`admin users: failed to read projects — ${projectsResult.error.message}`);
  }
  if (scansResult.error) {
    throw new Error(`admin users: failed to read scan_runs — ${scansResult.error.message}`);
  }

  const authUsers = authResult.data.users ?? [];
  const authTotal = "total" in authResult.data ? (authResult.data.total as number) : authUsers.length;
  const authUsersTruncated = authTotal > authUsers.length;
  if (authUsersTruncated) {
    console.error("[geo:admin] auth.admin.listUsers truncated — some rows will show no last-sign-in date", {
      total: authTotal,
      fetched: authUsers.length
    });
  }
  const lastSignInById = new Map(authUsers.map((user) => [user.id, user.last_sign_in_at ?? null]));

  const projectOwnerById = new Map<string, string>();
  const projectCountByOwner = new Map<string, number>();
  for (const project of projectsResult.data ?? []) {
    projectOwnerById.set(project.id, project.owner_user_id);
    if (!project.is_archived) {
      projectCountByOwner.set(project.owner_user_id, (projectCountByOwner.get(project.owner_user_id) ?? 0) + 1);
    }
  }

  const scanCountByOwner = new Map<string, number>();
  for (const scan of scansResult.data ?? []) {
    const owner = projectOwnerById.get(scan.project_id);
    if (!owner) continue;
    scanCountByOwner.set(owner, (scanCountByOwner.get(owner) ?? 0) + 1);
  }

  const users = (profilesResult.data ?? []).map((profile) =>
    toRow(
      profile,
      lastSignInById.get(profile.id) ?? null,
      projectCountByOwner.get(profile.id) ?? 0,
      scanCountByOwner.get(profile.id) ?? 0
    )
  );

  return { users, authUsersTruncated };
}

export async function getOperatorUserDetail(service: ServiceClient, userId: string): Promise<AdminUserDetail | null> {
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, email, created_at, current_plan, trial_ends_at, stripe_subscription_id, stripe_customer_id, cancel_at")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`admin user detail: failed to read profile — ${profileError.message}`);
  }
  if (!profile) return null;

  const [authResult, projectsResult] = await Promise.all([
    service.auth.admin.getUserById(userId),
    service
      .from("projects")
      .select("id, name, domain, created_at, is_archived")
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: false })
  ]);

  if (projectsResult.error) {
    throw new Error(`admin user detail: failed to read projects — ${projectsResult.error.message}`);
  }

  const projects = projectsResult.data ?? [];
  const projectIds = projects.map((project) => project.id);

  const latestScanByProject = new Map<string, { status: string; createdAt: string }>();
  let scanCount30d = 0;

  if (projectIds.length > 0) {
    const cutoffMs = Date.now() - THIRTY_DAYS_MS;
    const { data: scans, error: scansError } = await service
      .from("scan_runs")
      .select("project_id, status, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });

    if (scansError) {
      throw new Error(`admin user detail: failed to read scan_runs — ${scansError.message}`);
    }

    for (const scan of scans ?? []) {
      if (!latestScanByProject.has(scan.project_id)) {
        latestScanByProject.set(scan.project_id, { status: scan.status, createdAt: scan.created_at });
      }
      if (new Date(scan.created_at).getTime() >= cutoffMs) scanCount30d += 1;
    }
  }

  const row = toRow(
    profile,
    authResult.data?.user?.last_sign_in_at ?? null,
    projects.filter((project) => !project.is_archived).length,
    scanCount30d
  );

  return {
    ...row,
    stripeCustomerId: profile.stripe_customer_id ?? null,
    cancelAt: profile.cancel_at ?? null,
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      domain: project.domain,
      createdAt: project.created_at,
      isArchived: project.is_archived,
      latestScan: latestScanByProject.get(project.id) ?? null
    }))
  };
}
