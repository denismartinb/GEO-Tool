import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { PLANS } from "@/app/pricing/plans-data";
import { loadAutomationSnapshot, type AccountAutomation, type ProjectAutomation } from "@/lib/admin/automation";
import { deriveAccountHealth, type AccountHealth, type HealthRun } from "@/lib/admin/account-health";
import { resolvePlan, resolveSystemPlanId } from "@/lib/billing";

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
  /**
   * ADMIN-CONSOLE-2a. `null` cuando los automatismos no se pudieron leer
   * (migración pendiente) — la pantalla muestra "sin dato", nunca un cero que
   * parecería una respuesta.
   */
  automation: AccountAutomation | null;
  /** ADMIN-HEALTH-1 (§230): is any domain of this account not getting the data it should, right now? */
  health: AccountHealth;
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
  /**
   * ADMIN-CONSOLE-2a. `"unmigrated"` cuando las columnas de automatismos no se
   * pudieron leer — la pantalla lo dice en vez de pintar ceros.
   */
  automationAvailability: "ok" | "unmigrated";
};

export type AdminUserProject = {
  id: string;
  name: string;
  domain: string;
  createdAt: string;
  isArchived: boolean;
  latestScan: { status: string; createdAt: string } | null;
  /** ADMIN-CONSOLE-2a. `null` si no se pudo leer, o si el proyecto está archivado (el barrido no lo toca). */
  automation: ProjectAutomation | null;
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
  scanCount30d: number,
  automation: AccountAutomation | null = null,
  health: AccountHealth = { hasError: false, reasons: [] }
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
    scanCount30d,
    automation,
    health
  };
}

type HealthScanRow = HealthRun & { project_id: string };

/** Columns `deriveAccountHealth` needs from `scan_runs`, plus `project_id` to group them. */
const HEALTH_SCAN_COLUMNS = "project_id, status, created_at, updated_at, error_summary, triggered_by_user_id";

/**
 * Groups runs by project (keeping newest-first order) and derives one
 * account's health. The plan is the EFFECTIVE one (§229): an expired trial
 * reads as Free here exactly as it does for the sweep and the watchdog.
 */
function healthFor(input: {
  profile: { current_plan: string | null; trial_ends_at: string | null; stripe_subscription_id: string | null; email: string };
  projects: ReadonlyArray<{ id: string; domain: string }>;
  runs: readonly HealthScanRow[];
  recurringEnabledByProject: (projectId: string) => boolean;
}): AccountHealth {
  const runsByProject = new Map<string, HealthScanRow[]>();
  for (const run of input.runs) {
    const list = runsByProject.get(run.project_id) ?? [];
    list.push(run);
    runsByProject.set(run.project_id, list);
  }
  return deriveAccountHealth({
    planId: resolvePlan(resolveSystemPlanId(input.profile) as string | undefined).id,
    now: Date.now(),
    projects: input.projects.map((project) => ({
      domain: project.domain,
      recurringEnabled: input.recurringEnabledByProject(project.id),
      runs: runsByProject.get(project.id) ?? []
    }))
  });
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
    service.from("projects").select("id, owner_user_id, is_archived, domain"),
    service
      .from("scan_runs")
      .select(HEALTH_SCAN_COLUMNS)
      .gte("created_at", cutoffIso)
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

  // ADMIN-CONSOLE-2a. Después de `profiles` porque necesita el plan de cada
  // dueño para saber si su escaneo recurrente surte efecto — el barrido
  // descarta los proyectos Free.
  // ALERTS-SCOPE-1 / ADMIN-HEALTH-1: the effective plan, so an expired trial
  // reads "recurrente sin efecto" here exactly as the sweep treats it (§229).
  const planIdByOwnerId = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.id,
      resolvePlan(resolveSystemPlanId(profile) as string | undefined).id
    ])
  );
  const automation = await loadAutomationSnapshot(service, planIdByOwnerId);

  // ADMIN-HEALTH-1: active projects and their recent runs, grouped by owner.
  const activeProjectsByOwner = new Map<string, Array<{ id: string; domain: string }>>();
  for (const project of projectsResult.data ?? []) {
    if (project.is_archived) continue;
    const list = activeProjectsByOwner.get(project.owner_user_id) ?? [];
    list.push({ id: project.id, domain: project.domain as string });
    activeProjectsByOwner.set(project.owner_user_id, list);
  }
  const runsByOwner = new Map<string, HealthScanRow[]>();
  // Newest first: `deriveAccountHealth` reads each project's first run as its latest.
  const scansNewestFirst = [...((scansResult.data ?? []) as HealthScanRow[])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  for (const scan of scansNewestFirst) {
    const owner = projectOwnerById.get(scan.project_id);
    if (!owner) continue;
    const list = runsByOwner.get(owner) ?? [];
    list.push(scan);
    runsByOwner.set(owner, list);
  }
  const recurringEnabledByProject = (projectId: string) =>
    automation.availability === "ok" ? automation.byProject.get(projectId)?.recurringScansEnabled === true : false;

  const users = (profilesResult.data ?? []).map((profile) =>
    toRow(
      profile,
      lastSignInById.get(profile.id) ?? null,
      projectCountByOwner.get(profile.id) ?? 0,
      scanCountByOwner.get(profile.id) ?? 0,
      // Una cuenta sin proyectos no aparece en el agregado: se le da el cero
      // explícito, que no es lo mismo que "sin dato" (eso es `null`).
      automation.availability === "ok"
        ? automation.byOwner.get(profile.id) ?? {
            recurringActive: 0,
            auditActive: 0,
            technicalAuditActive: 0,
            totalProjects: 0,
            recurringInertOnFree: 0,
            monthlyUsd: 0,
            provenance: "estimado" as const,
            availability: "ok" as const
          }
        : null,
      healthFor({
        profile,
        projects: activeProjectsByOwner.get(profile.id) ?? [],
        runs: runsByOwner.get(profile.id) ?? [],
        recurringEnabledByProject
      })
    )
  );

  return { users, authUsersTruncated, automationAvailability: automation.availability };
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
  let detailRuns: HealthScanRow[] = [];

  if (projectIds.length > 0) {
    const cutoffMs = Date.now() - THIRTY_DAYS_MS;
    const { data: scans, error: scansError } = await service
      .from("scan_runs")
      .select(HEALTH_SCAN_COLUMNS)
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });

    if (scansError) {
      throw new Error(`admin user detail: failed to read scan_runs — ${scansError.message}`);
    }

    detailRuns = (scans ?? []) as HealthScanRow[];
    for (const scan of detailRuns) {
      if (!latestScanByProject.has(scan.project_id)) {
        latestScanByProject.set(scan.project_id, { status: scan.status, createdAt: scan.created_at });
      }
      if (new Date(scan.created_at).getTime() >= cutoffMs) scanCount30d += 1;
    }
  }

  // Acotado a este dueño: la ficha no necesita el estado de todos los
  // proyectos de la plataforma (señalado por la QA de ADMIN-CONSOLE-2a).
  const automation = await loadAutomationSnapshot(
    service,
    new Map([[userId, resolvePlan(resolveSystemPlanId(profile) as string | undefined).id]]),
    userId
  );

  const row = toRow(
    profile,
    authResult.data?.user?.last_sign_in_at ?? null,
    projects.filter((project) => !project.is_archived).length,
    scanCount30d,
    automation.availability === "ok" ? automation.byOwner.get(userId) ?? null : null,
    healthFor({
      profile,
      projects: projects.filter((project) => !project.is_archived),
      runs: detailRuns,
      recurringEnabledByProject: (projectId) =>
        automation.availability === "ok" ? automation.byProject.get(projectId)?.recurringScansEnabled === true : false
    })
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
      latestScan: latestScanByProject.get(project.id) ?? null,
      automation: automation.byProject.get(project.id) ?? null
    }))
  };
}
