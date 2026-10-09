import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendTrialD1Email = vi.fn(async (..._args: unknown[]) => true);
const sendTrialD3Email = vi.fn(async (..._args: unknown[]) => true);
const sendTrialD5Email = vi.fn(async (..._args: unknown[]) => true);
const sendFirstScanReadyEmail = vi.fn(async (..._args: unknown[]) => true);
vi.mock("@/lib/email/lifecycle/templates", () => ({
  sendTrialD1Email: (...a: unknown[]) => sendTrialD1Email(...a),
  sendTrialD3Email: (...a: unknown[]) => sendTrialD3Email(...a),
  sendTrialD5Email: (...a: unknown[]) => sendTrialD5Email(...a),
  sendFirstScanReadyEmail: (...a: unknown[]) => sendFirstScanReadyEmail(...a),
  formatDateLong: () => "31 de octubre"
}));
vi.mock("@/lib/stripe", () => ({
  getFounderOffer: async () => ({ planIds: ["pro", "starter"], remaining: 47, total: 50 })
}));

import { maybeSendFirstScanReadyEmail, runConfirmationReminders, runLifecycleEmails } from "./runner";

/**
 * LIFECYCLE-TRIAL-1 (log §233). The runner's own contract, over a fake
 * database: the switch, who is considered, and that a send is recorded only
 * when it happened. The per-email rules themselves are schedule.test.ts's.
 */

type Tables = Record<string, { data?: unknown; count?: number }>;

function fakeService(tables: Tables) {
  const upserts: Array<{ table: string; row: unknown }> = [];
  const chain = (table: string): unknown => {
    const result = { data: tables[table]?.data ?? [], error: null, count: tables[table]?.count ?? null };
    const node: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gte", "order", "limit"]) node[m] = () => node;
    node.maybeSingle = () => {
      const rows = result.data as unknown[];
      return Promise.resolve({ data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null });
    };
    node.upsert = (row: unknown) => {
      upserts.push({ table, row });
      return Promise.resolve({ error: null });
    };
    node.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return node;
  };
  return { service: { from: chain } as never, upserts };
}

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-09-30T07:45:00Z"); // Wednesday
const USER = "11111111-2222-4333-8444-555555555555";

function trialProfile(ageHours: number, overrides: Record<string, unknown> = {}) {
  const created = new Date(NOW.getTime() - ageHours * HOUR);
  return {
    id: USER,
    email: "cliente@ejemplo.com",
    created_at: created.toISOString(),
    trial_ends_at: new Date(created.getTime() + 7 * 24 * HOUR).toISOString(),
    stripe_subscription_id: null,
    notify_lifecycle: true,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LIFECYCLE_EMAILS_ENABLED = "true";
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-with-enough-entropy-000000";
});

afterEach(() => {
  delete process.env.LIFECYCLE_EMAILS_ENABLED;
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  delete process.env.COMPED_ACCOUNT_EMAILS;
});

describe("runLifecycleEmails", () => {
  it("does nothing while the switch is off", async () => {
    delete process.env.LIFECYCLE_EMAILS_ENABLED;
    const { service, upserts } = fakeService({ profiles: { data: [trialProfile(26)] } });
    expect(await runLifecycleEmails({ service, now: NOW })).toEqual({ status: "disabled" });
    expect(sendTrialD1Email).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
  });

  it("stays off without an unsubscribe secret even if the switch is on", async () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    const { service } = fakeService({ profiles: { data: [trialProfile(26)] } });
    expect(await runLifecycleEmails({ service, now: NOW })).toEqual({ status: "disabled" });
  });

  it("sends D1 to a day-1 trial with no domain, and records it", async () => {
    const { service, upserts } = fakeService({ profiles: { data: [trialProfile(26)] } });
    const result = await runLifecycleEmails({ service, now: NOW });

    expect(result).toMatchObject({ status: "ok", sent: 1, failed: 0 });
    expect(sendTrialD1Email).toHaveBeenCalledWith("cliente@ejemplo.com", USER, expect.objectContaining({ variant: "no_domain" }));
    expect(upserts).toEqual([{ table: "email_sends", row: { owner_user_id: USER, kind: "trial_d1" } }]);
  });

  it("does not record a send that Resend did not accept", async () => {
    sendTrialD1Email.mockResolvedValueOnce(false);
    const { service, upserts } = fakeService({ profiles: { data: [trialProfile(26)] } });
    expect(await runLifecycleEmails({ service, now: NOW })).toMatchObject({ sent: 0, failed: 1 });
    expect(upserts).toEqual([]);
  });

  it("never considers a comped account", async () => {
    process.env.COMPED_ACCOUNT_EMAILS = "cliente@ejemplo.com";
    const { service } = fakeService({ profiles: { data: [trialProfile(26)] } });
    expect(await runLifecycleEmails({ service, now: NOW })).toMatchObject({ considered: 0, sent: 0 });
  });

  it("sends D5 with real plan prices two days before the end", async () => {
    const { service } = fakeService({
      profiles: { data: [trialProfile(120)] },
      email_sends: { data: [{ owner_user_id: USER, kind: "trial_d3", sent_at: new Date(NOW.getTime() - 50 * HOUR).toISOString() }] }
    });
    await runLifecycleEmails({ service, now: NOW });
    const input = sendTrialD5Email.mock.calls[0][2] as { pro: { price: number; promo: { price: number } | null } };
    expect(input.pro.price).toBe(99);
    expect(input.pro.promo?.price).toBe(69);
  });
});

describe("maybeSendFirstScanReadyEmail", () => {
  const snapshotTables = {
    profiles: { data: [{ email: "cliente@ejemplo.com", notify_first_scan: true }] },
    projects: { data: [{ id: "p1" }] },
    run_scores: {
      data: [
        {
          run_id: "r1",
          created_at: NOW.toISOString(),
          visibility_score: 30,
          details_json: {
            brand_position: {
              ranking: [
                { name: "clinicaaurora", is_brand: true, mention_count: 6, prompt_count: 45 },
                { name: "Sonrisa Norte", is_brand: false, mention_count: 19, prompt_count: 45 }
              ]
            }
          }
        }
      ]
    },
    recommendations: { count: 6 }
  };

  it("sends on the account's first completed scan, with its own figures, and records it", async () => {
    const { service, upserts } = fakeService({ ...snapshotTables, email_sends: { data: [] }, scan_runs: { count: 1 } });
    await maybeSendFirstScanReadyEmail(service, { ownerUserId: USER, projectId: "p1", projectDomain: "clinicaaurora.es" });

    const snap = sendFirstScanReadyEmail.mock.calls[0][2] as { brandMentions: number; answers: number; topCompetitor: { name: string } };
    expect(snap.brandMentions).toBe(6);
    expect(snap.answers).toBe(45);
    expect(snap.topCompetitor.name).toBe("Sonrisa Norte");
    expect(upserts).toEqual([{ table: "email_sends", row: { owner_user_id: USER, kind: "first_scan" } }]);
  });

  it("stays silent on any later scan of an account that already scanned before", async () => {
    const { service } = fakeService({ ...snapshotTables, email_sends: { data: [] }, scan_runs: { count: 7 } });
    await maybeSendFirstScanReadyEmail(service, { ownerUserId: USER, projectId: "p1", projectDomain: "clinicaaurora.es" });
    expect(sendFirstScanReadyEmail).not.toHaveBeenCalled();
  });

  it("stays silent once it was already sent, or when the person opted out", async () => {
    const already = fakeService({ ...snapshotTables, email_sends: { data: [{ id: "x" }] }, scan_runs: { count: 1 } });
    await maybeSendFirstScanReadyEmail(already.service, { ownerUserId: USER, projectId: "p1", projectDomain: "d" });

    const optedOut = fakeService({
      ...snapshotTables,
      profiles: { data: [{ email: "cliente@ejemplo.com", notify_first_scan: false }] },
      email_sends: { data: [] },
      scan_runs: { count: 1 }
    });
    await maybeSendFirstScanReadyEmail(optedOut.service, { ownerUserId: USER, projectId: "p1", projectDomain: "d" });

    expect(sendFirstScanReadyEmail).not.toHaveBeenCalled();
  });
});

describe("runConfirmationReminders (CONFIRM-REMINDER-1, log §234)", () => {
  function authService(users: Array<Record<string, unknown>>, resendError: string | null = null) {
    const resent: Array<Record<string, unknown>> = [];
    const service = {
      auth: {
        admin: { listUsers: async () => ({ data: { users }, error: null }) },
        resend: async (params: Record<string, unknown>) => {
          resent.push(params);
          return { error: resendError ? { message: resendError } : null };
        }
      }
    } as never;
    return { service, resent };
  }

  const user = (ageHours: number, overrides: Record<string, unknown> = {}) => ({
    id: USER,
    email: "nuevo@ejemplo.com",
    created_at: new Date(NOW.getTime() - ageHours * HOUR).toISOString(),
    email_confirmed_at: null,
    ...overrides
  });

  it("re-sends Supabase's own confirmation to a day-old unconfirmed sign-up, back to the same callback", async () => {
    const { service, resent } = authService([user(26)]);
    expect(await runConfirmationReminders({ service, now: NOW })).toMatchObject({ status: "ok", reminded: 1, failed: 0 });
    expect(resent).toHaveLength(1);
    expect(resent[0]).toMatchObject({ type: "signup", email: "nuevo@ejemplo.com" });
    expect((resent[0].options as { emailRedirectTo: string }).emailRedirectTo).toMatch(/\/auth\/callback$/);
  });

  it("leaves confirmed, too-new, too-old and excluded accounts alone", async () => {
    process.env.COMPED_ACCOUNT_EMAILS = "comped@ejemplo.com";
    const { service, resent } = authService([
      user(26, { email_confirmed_at: NOW.toISOString() }),
      user(5),
      user(60),
      user(26, { email: "comped@ejemplo.com" })
    ]);
    await runConfirmationReminders({ service, now: NOW });
    expect(resent).toEqual([]);
  });

  it("counts a throttled resend as failed instead of retrying it", async () => {
    const { service } = authService([user(26)], "email rate limit exceeded");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runConfirmationReminders({ service, now: NOW })).toMatchObject({ reminded: 0, failed: 1 });
    spy.mockRestore();
  });

  it("does nothing while the lifecycle switch is off", async () => {
    delete process.env.LIFECYCLE_EMAILS_ENABLED;
    const { service, resent } = authService([user(26)]);
    expect(await runConfirmationReminders({ service, now: NOW })).toEqual({ status: "disabled" });
    expect(resent).toEqual([]);
  });
});
