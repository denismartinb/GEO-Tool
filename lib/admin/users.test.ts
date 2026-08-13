import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOperatorUserDetail, listOperatorUsers } from "./users";

const NOW = new Date("2026-08-11T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function daysFromNow(n: number): string {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}

type Row = Record<string, unknown>;

function fakeListService(options: {
  profiles?: Row[];
  authUsers?: Array<{ id: string; last_sign_in_at: string | null }>;
  authTotal?: number;
  projects?: Row[];
  scans?: Row[];
}) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: options.profiles ?? [], error: null })
          })
        };
      }
      if (table === "projects") {
        return { select: () => Promise.resolve({ data: options.projects ?? [], error: null }) };
      }
      if (table === "scan_runs") {
        return { select: () => ({ gte: () => Promise.resolve({ data: options.scans ?? [], error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        listUsers: async () => ({
          data: { users: options.authUsers ?? [], total: options.authTotal ?? (options.authUsers ?? []).length },
          error: null
        })
      }
    }
  };
}

describe("listOperatorUsers", () => {
  it("joins profiles with last sign-in, active project count and 30-day scan count", async () => {
    const service = fakeListService({
      profiles: [
        { id: "u1", email: "a@example.com", created_at: daysAgo(10), current_plan: "pro", trial_ends_at: daysFromNow(2), stripe_subscription_id: null }
      ],
      authUsers: [{ id: "u1", last_sign_in_at: daysAgo(1) }],
      projects: [
        { id: "p1", owner_user_id: "u1", is_archived: false },
        { id: "p2", owner_user_id: "u1", is_archived: true }
      ],
      scans: [
        { project_id: "p1", created_at: daysAgo(2) },
        { project_id: "p1", created_at: daysAgo(5) }
      ]
    });

    const result = await listOperatorUsers(service as never);

    expect(result.users).toHaveLength(1);
    expect(result.users[0]).toMatchObject({
      id: "u1",
      lastSignInAt: daysAgo(1),
      status: "trial",
      planLabel: "Pro",
      projectCount: 1,
      scanCount30d: 2
    });
    expect(result.authUsersTruncated).toBe(false);
  });

  it("derives 'paid' from a real Stripe subscription even with a stale trial_ends_at", async () => {
    const service = fakeListService({
      profiles: [
        { id: "u1", email: "a@example.com", created_at: daysAgo(40), current_plan: "pro", trial_ends_at: daysAgo(33), stripe_subscription_id: "sub_123" }
      ],
      authUsers: []
    });

    const result = await listOperatorUsers(service as never);
    expect(result.users[0].status).toBe("paid");
  });

  it("derives 'trial_expired' from a trial_ends_at in the past with no subscription", async () => {
    const service = fakeListService({
      profiles: [
        { id: "u1", email: "a@example.com", created_at: daysAgo(40), current_plan: "pro", trial_ends_at: daysAgo(1), stripe_subscription_id: null }
      ],
      authUsers: []
    });

    const result = await listOperatorUsers(service as never);
    expect(result.users[0].status).toBe("trial_expired");
  });

  it("derives 'free' with no trial and no subscription", async () => {
    const service = fakeListService({
      profiles: [{ id: "u1", email: "a@example.com", created_at: daysAgo(40), current_plan: "free", trial_ends_at: null, stripe_subscription_id: null }],
      authUsers: []
    });

    const result = await listOperatorUsers(service as never);
    expect(result.users[0].status).toBe("free");
  });

  it("flags authUsersTruncated when listUsers reports more than it returned, without dropping rows", async () => {
    const service = fakeListService({
      profiles: [{ id: "u1", email: "a@example.com", created_at: daysAgo(1), current_plan: "free", trial_ends_at: null, stripe_subscription_id: null }],
      authUsers: [],
      authTotal: 5000
    });

    const result = await listOperatorUsers(service as never);
    expect(result.authUsersTruncated).toBe(true);
    expect(result.users).toHaveLength(1);
  });

  it("never counts an archived project or a scan belonging to another owner", async () => {
    const service = fakeListService({
      profiles: [{ id: "u1", email: "a@example.com", created_at: daysAgo(1), current_plan: "free", trial_ends_at: null, stripe_subscription_id: null }],
      authUsers: [],
      projects: [{ id: "p1", owner_user_id: "u1", is_archived: true }],
      scans: [{ project_id: "p-of-someone-else", created_at: daysAgo(1) }]
    });

    const result = await listOperatorUsers(service as never);
    expect(result.users[0].projectCount).toBe(0);
    expect(result.users[0].scanCount30d).toBe(0);
  });
});

function fakeDetailService(options: {
  profile: Row | null;
  authUser?: { last_sign_in_at: string | null };
  projects?: Row[];
  scans?: Row[];
}) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: options.profile, error: null }) }) }) };
      }
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: options.projects ?? [], error: null }) })
          })
        };
      }
      if (table === "scan_runs") {
        return {
          select: () => ({
            in: () => ({ order: () => Promise.resolve({ data: options.scans ?? [], error: null }) })
          })
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: options.authUser ?? null }, error: null })
      }
    }
  };
}

describe("getOperatorUserDetail", () => {
  it("returns null when the profile doesn't exist", async () => {
    const service = fakeDetailService({ profile: null });
    expect(await getOperatorUserDetail(service as never, "missing")).toBeNull();
  });

  it("attaches each project's latest scan and a real 30-day scan count", async () => {
    const service = fakeDetailService({
      profile: { id: "u1", email: "a@example.com", created_at: daysAgo(20), current_plan: "pro", trial_ends_at: null, stripe_subscription_id: "sub_1", stripe_customer_id: "cus_1", cancel_at: null },
      authUser: { last_sign_in_at: daysAgo(1) },
      projects: [{ id: "p1", name: "Acme", domain: "acme.com", created_at: daysAgo(15), is_archived: false }],
      scans: [
        { project_id: "p1", status: "completed", created_at: daysAgo(2) },
        { project_id: "p1", status: "failed", created_at: daysAgo(40) }
      ]
    });

    const detail = await getOperatorUserDetail(service as never, "u1");

    expect(detail?.scanCount30d).toBe(1);
    expect(detail?.projects).toEqual([
      {
        id: "p1",
        name: "Acme",
        domain: "acme.com",
        createdAt: daysAgo(15),
        isArchived: false,
        latestScan: { status: "completed", createdAt: daysAgo(2) }
      }
    ]);
  });
});
