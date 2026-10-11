import "server-only";

import type Stripe from "stripe";
import type { createServiceClient } from "@/lib/supabase/service";
import { listOperatorUsers, type AdminUserRow } from "@/lib/admin/users";
import { isOperatorUserId } from "@/lib/admin/operator";
import { isInternalTestAccountEmail } from "@/lib/projects/internal-test-accounts";
import { isCompedAccountEmail } from "@/lib/billing/comped-accounts";
import { getFounderOffer, getStripeClient } from "@/lib/stripe";
import { daysLeft, monthlyCents, trialSignal, type TrialSignal } from "@/lib/admin/kpi/model";
import { lastMadridDates, madridDateKey, madridStartOfMonth, type PanelWindow } from "@/lib/admin/kpi/period";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * ADMIN-PANEL-1 — the business half of /admin/panel: accounts and trials from
 * Supabase (through the service client `requireOperator()` returned), money
 * from Stripe. Read-only, like the rest of /admin.
 *
 * Our own accounts are left out of every figure: operators
 * (`ADMIN_USER_IDS`), internal test accounts (`INTERNAL_TEST_ACCOUNT_EMAILS`)
 * and comped accounts (`COMPED_ACCOUNT_EMAILS`). A count that included them
 * would celebrate our own sign-ups.
 *
 * Each source fails on its own: Stripe down still shows the accounts, and the
 * other way round. A section that could not be read says so; it never shows
 * a zero that would look like an answer (`.claude/rules/admin.md`).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Stripe pages fetched at most; hitting it is said on screen. */
const STRIPE_LIST_CAP = 500;

export function isCountedAccount(row: { id: string; email: string }): boolean {
  return !isOperatorUserId(row.id) && !isInternalTestAccountEmail(row.email) && !isCompedAccountEmail(row.email);
}

function inWindow(iso: string, from: Date, to: Date): boolean {
  const t = Date.parse(iso);
  return t >= from.getTime() && t < to.getTime();
}

export type TrialRow = {
  id: string;
  email: string;
  domain: string | null;
  daysLeft: number;
  signal: TrialSignal;
};

export type AccountsSection =
  | { kind: "error" }
  | {
      kind: "ready";
      signups: number;
      previousSignups: number;
      /** Of `signups`, how many already have a completed scan; null if scans could not be read. */
      firstScan: number | null;
      /** Sign-ups per Madrid day, same 28 days as the visits chart. */
      dailySignups: Array<{ date: string; signups: number }>;
      activeTrials: number;
      trialsEndingIn7Days: number;
      trials: TrialRow[];
      /** Accounts with a Stripe subscription, as /admin/users counts them. */
      payingAccounts: number;
      authUsersTruncated: boolean;
    };

export type RevenueSection =
  | { kind: "not_configured" }
  | { kind: "error" }
  | {
      kind: "ready";
      /** Distinct people who opened a Stripe checkout in the window. */
      checkoutsStarted: number;
      checkoutsCompleted: number;
      activeSubscriptions: number;
      /** Sum of each active subscription's last invoice, brought to a month. VAT included. */
      mrrCents: number;
      /** Paid invoices since the 1st of this month (Madrid). VAT included. */
      collectedThisMonthCents: number;
      founderRemaining: number;
      founderTotal: number;
      truncated: boolean;
    };

export type BusinessData = { accounts: AccountsSection; revenue: RevenueSection };

export async function loadBusinessSections(input: {
  service: ServiceClient;
  window: PanelWindow;
  now: Date;
}): Promise<BusinessData> {
  const { service, window, now } = input;
  const stripeData = loadStripe(window, now);
  const accounts = await loadAccounts(service, window, now, stripeData);
  const stripe = await stripeData;
  return { accounts, revenue: stripe.section };
}

type StripeRead = {
  section: RevenueSection;
  /** User ids with a checkout opened and not finished in the last 30 days. */
  openCheckoutUserIds: Set<string>;
};

async function loadStripe(window: PanelWindow, now: Date): Promise<StripeRead> {
  const stripe = getStripeClient();
  if (!stripe) return { section: { kind: "not_configured" }, openCheckoutUserIds: new Set() };
  try {
    const since = Math.min(window.from.getTime(), now.getTime() - 30 * DAY_MS);
    const monthStart = madridStartOfMonth(now);
    const [sessions, subscriptions, invoices, founder] = await Promise.all([
      stripe.checkout.sessions
        .list({ created: { gte: Math.floor(since / 1000) }, limit: 100 })
        .autoPagingToArray({ limit: STRIPE_LIST_CAP }),
      stripe.subscriptions
        .list({ status: "active", expand: ["data.latest_invoice"], limit: 100 })
        .autoPagingToArray({ limit: STRIPE_LIST_CAP }),
      stripe.invoices
        .list({ status: "paid", created: { gte: Math.floor(monthStart.getTime() / 1000) }, limit: 100 })
        .autoPagingToArray({ limit: STRIPE_LIST_CAP }),
      getFounderOffer(now.getTime())
    ]);

    const started = new Set<string>();
    const completed = new Set<string>();
    const openCheckoutUserIds = new Set<string>();
    for (const session of sessions) {
      const who = session.client_reference_id ?? session.customer_email ?? session.id;
      const email = session.customer_details?.email ?? session.customer_email ?? "";
      if (session.client_reference_id && isOperatorUserId(session.client_reference_id)) continue;
      if (isInternalTestAccountEmail(email) || isCompedAccountEmail(email)) continue;
      const created = new Date(session.created * 1000);
      if (created >= window.from && created < window.to) {
        started.add(who);
        if (session.status === "complete") completed.add(who);
      }
      if (session.client_reference_id && session.status !== "complete") openCheckoutUserIds.add(session.client_reference_id);
    }
    // A later completed session cancels an earlier abandoned one.
    for (const session of sessions) {
      if (session.client_reference_id && session.status === "complete") openCheckoutUserIds.delete(session.client_reference_id);
    }

    let mrrCents = 0;
    for (const subscription of subscriptions) {
      mrrCents += subscriptionMonthlyCents(subscription);
    }

    const collectedThisMonthCents = invoices.reduce((sum, invoice) => sum + (invoice.amount_paid ?? 0), 0);
    const truncated = [sessions, subscriptions, invoices].some((list) => list.length >= STRIPE_LIST_CAP);

    return {
      section: {
        kind: "ready",
        checkoutsStarted: started.size,
        checkoutsCompleted: completed.size,
        activeSubscriptions: subscriptions.length,
        mrrCents: Math.round(mrrCents),
        collectedThisMonthCents,
        founderRemaining: founder.remaining,
        founderTotal: founder.total,
        truncated
      },
      openCheckoutUserIds
    };
  } catch (error) {
    console.error("[geo:admin] panel could not read Stripe", {
      message: error instanceof Error ? error.message : "unknown"
    });
    return { section: { kind: "error" }, openCheckoutUserIds: new Set() };
  }
}

function subscriptionMonthlyCents(subscription: Stripe.Subscription): number {
  const invoice = subscription.latest_invoice;
  if (!invoice || typeof invoice === "string") return 0;
  const recurring = subscription.items.data[0]?.price?.recurring;
  return monthlyCents(invoice.total ?? 0, recurring?.interval ?? "month", recurring?.interval_count ?? 1);
}

async function loadAccounts(
  service: ServiceClient,
  window: PanelWindow,
  now: Date,
  stripeData: Promise<StripeRead>
): Promise<AccountsSection> {
  let users: AdminUserRow[];
  let authUsersTruncated = false;
  try {
    const page = await listOperatorUsers(service);
    users = page.users.filter(isCountedAccount);
    authUsersTruncated = page.authUsersTruncated;
  } catch (error) {
    console.error("[geo:admin] panel could not read accounts", {
      message: error instanceof Error ? error.message : "unknown"
    });
    return { kind: "error" };
  }

  const cohort = users.filter((u) => inWindow(u.createdAt, window.from, window.to));
  const previousSignups = users.filter((u) => inWindow(u.createdAt, window.prevFrom, window.prevTo)).length;

  const signupsByDate = new Map<string, number>();
  for (const user of users) {
    const key = madridDateKey(new Date(user.createdAt));
    signupsByDate.set(key, (signupsByDate.get(key) ?? 0) + 1);
  }
  const dailySignups = lastMadridDates(now, 28).map((date) => ({ date, signups: signupsByDate.get(date) ?? 0 }));

  const trialUsers = users
    .filter((u) => u.status === "trial" && u.trialEndsAt)
    .sort((a, b) => Date.parse(a.trialEndsAt as string) - Date.parse(b.trialEndsAt as string));
  const ownerIds = [...new Set([...cohort, ...trialUsers].map((u) => u.id))];

  const [scanned, domains] = await Promise.all([
    ownersWithCompletedScan(service, cohort.map((u) => u.id)),
    firstDomainByOwner(service, ownerIds)
  ]);
  const { openCheckoutUserIds } = await stripeData;

  const nowMs = now.getTime();
  const trials: TrialRow[] = trialUsers.map((u) => ({
    id: u.id,
    email: u.email,
    domain: domains.get(u.id) ?? null,
    daysLeft: daysLeft(u.trialEndsAt as string, nowMs),
    signal: trialSignal({
      checkoutOpened: openCheckoutUserIds.has(u.id),
      lastSignInAt: u.lastSignInAt,
      scanCount30d: u.scanCount30d,
      now: nowMs
    })
  }));

  return {
    kind: "ready",
    signups: cohort.length,
    previousSignups,
    firstScan: scanned === null ? null : scanned.size,
    dailySignups,
    activeTrials: trials.length,
    trialsEndingIn7Days: trials.filter((t) => t.daysLeft <= 7).length,
    trials,
    payingAccounts: users.filter((u) => u.status === "paid").length,
    authUsersTruncated
  };
}

/** Owners (of the given ids) with at least one completed scan, ever. Null when it could not be read. */
async function ownersWithCompletedScan(service: ServiceClient, ownerIds: string[]): Promise<Set<string> | null> {
  if (ownerIds.length === 0) return new Set();
  const projects = await service.from("projects").select("id, owner_user_id").in("owner_user_id", ownerIds);
  if (projects.error) return null;
  const ownerByProject = new Map((projects.data ?? []).map((p) => [p.id as string, p.owner_user_id as string]));
  if (ownerByProject.size === 0) return new Set();
  const runs = await service
    .from("scan_runs")
    .select("project_id")
    .eq("status", "completed")
    .in("project_id", [...ownerByProject.keys()]);
  if (runs.error) return null;
  const owners = new Set<string>();
  for (const run of runs.data ?? []) {
    const owner = ownerByProject.get(run.project_id as string);
    if (owner) owners.add(owner);
  }
  return owners;
}

/** Each owner's oldest active domain, to name a trial by its website. */
async function firstDomainByOwner(service: ServiceClient, ownerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ownerIds.length === 0) return out;
  const { data, error } = await service
    .from("projects")
    .select("owner_user_id, domain, created_at")
    .in("owner_user_id", ownerIds)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });
  if (error) return out;
  for (const row of data ?? []) {
    const owner = row.owner_user_id as string;
    if (!out.has(owner) && row.domain) out.set(owner, row.domain as string);
  }
  return out;
}
