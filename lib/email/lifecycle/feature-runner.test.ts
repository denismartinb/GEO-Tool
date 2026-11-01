import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendFeatureEmail = vi.fn(async (..._args: unknown[]): Promise<string> => "sent");
vi.mock("@/lib/email/lifecycle/feature-templates", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, sendFeatureEmail: (...a: unknown[]) => sendFeatureEmail(...a) };
});
let gscConfigured = true;
vi.mock("@/lib/search-console/crypto", () => ({ isSearchConsoleCryptoConfigured: () => gscConfigured }));
vi.mock("@/lib/search-console/google", () => ({ getOAuthClient: () => ({ clientId: "a", clientSecret: "b" }) }));

import { runFeatureEmails } from "./feature-runner";

/**
 * FEATURE-EMAILS-1 (log §417). The pass over a fake database: the switch,
 * who gets which email, and that another owner's rows never reach one.
 * The rules themselves are feature-schedule.test.ts's.
 */
type Tables = Record<string, { data?: unknown; error?: unknown }>;

function fakeService(tables: Tables) {
  const claims: Array<{ owner_user_id: string; kind: string }> = [];
  const chain = (table: string): unknown => {
    const result = { data: tables[table]?.data ?? [], error: tables[table]?.error ?? null };
    const node: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "not", "order", "limit"]) node[m] = () => node;
    node.upsert = (row: { owner_user_id: string; kind: string }) => ({
      select: async () => {
        claims.push(row);
        return { data: [{ id: `c${claims.length}` }], error: null };
      }
    });
    node.delete = () => ({ eq: async () => ({ error: null }) });
    node.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return node;
  };
  return { service: { from: chain } as never, claims };
}

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-04T07:45:00Z"); // Wednesday
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR).toISOString();
const A = "11111111-2222-4333-8444-555555555555";
const B = "99999999-2222-4333-8444-555555555555";

const profile = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  email: `${id.slice(0, 4)}@ejemplo.com`,
  created_at: ago(4 * 24),
  notify_lifecycle: true,
  current_plan: "pro",
  trial_ends_at: null,
  stripe_subscription_id: "sub_1",
  ...overrides
});

beforeEach(() => {
  vi.clearAllMocks();
  gscConfigured = true;
  process.env.LIFECYCLE_EMAILS_ENABLED = "true";
  process.env.FEATURE_EMAILS_ENABLED = "true";
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-with-enough-entropy-000000";
});
afterEach(() => {
  delete process.env.LIFECYCLE_EMAILS_ENABLED;
  delete process.env.FEATURE_EMAILS_ENABLED;
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
});

describe("runFeatureEmails", () => {
  it("does nothing until its own switch is on", async () => {
    delete process.env.FEATURE_EMAILS_ENABLED;
    const { service, claims } = fakeService({ profiles: { data: [profile(A)] } });
    expect(await runFeatureEmails({ service, now: NOW })).toEqual({ status: "disabled" });
    expect(claims).toEqual([]);
  });

  it("sends Search Console for the scanned domain, claimed once", async () => {
    const { service, claims } = fakeService({
      profiles: { data: [profile(A)] },
      projects: { data: [{ id: "p1", domain: "tuweb.es", owner_user_id: A, created_at: ago(90) }] },
      scan_runs: { data: [{ project_id: "p1" }] }
    });
    expect(await runFeatureEmails({ service, now: NOW })).toEqual({ status: "ok", sent: 1, failed: 0, deferred: 0 });
    expect(claims).toEqual([{ owner_user_id: A, kind: "feature_gsc" }]);
    const parts = sendFeatureEmail.mock.calls[0][2] as { body: string };
    expect(parts.body).toContain("projectId=p1");
  });

  it("skips Search Console when it is not configured and moves on", async () => {
    gscConfigured = false;
    const { service, claims } = fakeService({
      profiles: { data: [profile(A, { created_at: ago(8 * 24) })] },
      projects: { data: [{ id: "p1", domain: "tuweb.es", owner_user_id: A, created_at: ago(90) }] },
      scan_runs: { data: [{ project_id: "p1" }] }
    });
    await runFeatureEmails({ service, now: NOW });
    expect(claims).toEqual([{ owner_user_id: A, kind: "feature_extension" }]);
  });

  it("uses the owner's first scored review, never another owner's project", async () => {
    const result = { found: "product", score: 61, fixes: [], components: [] };
    const { service, claims } = fakeService({
      profiles: { data: [profile(A)] },
      projects: { data: [{ id: "p1", domain: "tuweb.es", owner_user_id: A, created_at: ago(90) }] },
      scan_runs: { data: [{ project_id: "p1" }] },
      search_console_connections: { data: [{ owner_user_id: A }] },
      agentic_audits: {
        data: [
          { project_id: "pB", owner_user_id: A, created_at: ago(50), result },
          { project_id: "p1", owner_user_id: A, created_at: ago(30), result }
        ]
      }
    });
    await runFeatureEmails({ service, now: NOW });
    expect(claims).toEqual([{ owner_user_id: A, kind: "feature_agentic" }]);
    const parts = sendFeatureEmail.mock.calls[0][2] as { body: string };
    expect(parts.body).toContain("/dashboard/projects/p1/agentic-audit");
    expect(parts.body).toContain("61<span");
  });

  it("skips read-only and opted-out accounts", async () => {
    const { service, claims } = fakeService({
      profiles: {
        data: [profile(A, { current_plan: "free", stripe_subscription_id: null }), profile(B, { notify_lifecycle: false })]
      },
      projects: {
        data: [
          { id: "p1", domain: "a.es", owner_user_id: A, created_at: ago(90) },
          { id: "p2", domain: "b.es", owner_user_id: B, created_at: ago(90) }
        ]
      },
      scan_runs: { data: [{ project_id: "p1" }, { project_id: "p2" }] }
    });
    await runFeatureEmails({ service, now: NOW });
    expect(claims).toEqual([]);
  });

  it("reports a failed account query", async () => {
    const { service } = fakeService({ profiles: { error: { message: "boom" } } });
    expect(await runFeatureEmails({ service, now: NOW })).toEqual({ status: "query_failed" });
  });
});
