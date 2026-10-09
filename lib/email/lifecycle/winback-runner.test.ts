import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendTrialEndedOfferEmail = vi.fn(async (..._args: unknown[]) => true);
const sendWinbackD3Email = vi.fn(async (..._args: unknown[]) => true);
const sendWinbackD10Email = vi.fn(async (..._args: unknown[]) => true);
const sendTrialEndedEmail = vi.fn(async (..._args: unknown[]) => true);
vi.mock("@/lib/email/lifecycle/templates", () => ({
  sendTrialEndedOfferEmail: (...a: unknown[]) => sendTrialEndedOfferEmail(...a),
  sendWinbackD3Email: (...a: unknown[]) => sendWinbackD3Email(...a),
  sendWinbackD10Email: (...a: unknown[]) => sendWinbackD10Email(...a),
  formatDateLong: () => "31 de octubre"
}));
vi.mock("@/lib/email/transactional", () => ({ sendTrialEndedEmail: (...a: unknown[]) => sendTrialEndedEmail(...a) }));
let promoPlans: string[] = ["pro", "starter"];
vi.mock("@/lib/stripe", () => ({ getFounderOffer: async () => ({ planIds: promoPlans, remaining: 35, total: 38 }) }));

import { notifyTrialEndedOnDowngrade, runTrialEndEmails, runWinbackEmails } from "./runner";

/**
 * LIFECYCLE-WINBACK-1 (log §238). The runner's contract over a fake
 * database: who is considered, which version goes out, and that a send is
 * recorded only when it happened. The rules themselves are
 * winback-schedule.test.ts's.
 */
type Tables = Record<string, { data?: unknown }>;

function fakeService(tables: Tables) {
  const upserts: Array<{ table: string; row: unknown }> = [];
  const chain = (table: string): unknown => {
    const result = { data: tables[table]?.data ?? [], error: null, count: null };
    const node: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gte", "lt", "is", "order", "limit"]) node[m] = () => node;
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
const NOW = new Date("2026-10-14T07:45:00Z"); // Wednesday
const USER = "11111111-2222-4333-8444-555555555555";
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR).toISOString();

function endedProfile(hoursAgo: number, overrides: Record<string, unknown> = {}) {
  return {
    id: USER,
    email: "cliente@ejemplo.com",
    trial_ends_at: ago(hoursAgo),
    stripe_subscription_id: null,
    notify_lifecycle: true,
    current_plan: "pro",
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  promoPlans = ["pro", "starter"];
  process.env.LIFECYCLE_EMAILS_ENABLED = "true";
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-with-enough-entropy-000000";
});
afterEach(() => {
  delete process.env.LIFECYCLE_EMAILS_ENABLED;
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  delete process.env.COMPED_ACCOUNT_EMAILS;
});

describe("runTrialEndEmails", () => {
  it("does nothing while the switch is off", async () => {
    delete process.env.LIFECYCLE_EMAILS_ENABLED;
    const { service, upserts } = fakeService({ profiles: { data: [endedProfile(5)] } });
    expect(await runTrialEndEmails({ service, now: NOW })).toEqual({ status: "disabled" });
    expect(upserts).toEqual([]);
  });

  it("sends the end-of-trial email on the day, and records it", async () => {
    const { service, upserts } = fakeService({ profiles: { data: [endedProfile(5)] } });
    expect(await runTrialEndEmails({ service, now: NOW })).toMatchObject({ status: "ok", sent: 1 });
    expect(sendTrialEndedOfferEmail).toHaveBeenCalledWith("cliente@ejemplo.com", USER, expect.objectContaining({ late: false }));
    expect(upserts).toEqual([{ table: "email_sends", row: { owner_user_id: USER, kind: "trial_ended" } }]);
  });

  it("sends the «tardía» version to a trial that lapsed unannounced", async () => {
    const { service, upserts } = fakeService({ profiles: { data: [endedProfile(24 * 20)] } });
    await runTrialEndEmails({ service, now: NOW });
    expect(sendTrialEndedOfferEmail).toHaveBeenCalledWith("cliente@ejemplo.com", USER, expect.objectContaining({ late: true }));
    expect(upserts).toEqual([{ table: "email_sends", row: { owner_user_id: USER, kind: "trial_ended_late" } }]);
  });

  it("skips an account the console already downgraded (it was told on that visit)", async () => {
    const { service } = fakeService({ profiles: { data: [endedProfile(24 * 20, { current_plan: "free" })] } });
    await runTrialEndEmails({ service, now: NOW });
    expect(sendTrialEndedOfferEmail).not.toHaveBeenCalled();
  });

  it("does not repeat once recorded", async () => {
    const { service } = fakeService({
      profiles: { data: [endedProfile(5)] },
      email_sends: { data: [{ kind: "trial_ended" }] }
    });
    await runTrialEndEmails({ service, now: NOW });
    expect(sendTrialEndedOfferEmail).not.toHaveBeenCalled();
  });

  it("sends the plain service email, without an offer, to someone who opted out of offers", async () => {
    const { service, upserts } = fakeService({ profiles: { data: [endedProfile(5, { notify_lifecycle: false })] } });
    await runTrialEndEmails({ service, now: NOW });
    expect(sendTrialEndedOfferEmail).not.toHaveBeenCalled();
    expect(sendTrialEndedEmail).toHaveBeenCalledWith("cliente@ejemplo.com");
    expect(upserts).toEqual([{ table: "email_sends", row: { owner_user_id: USER, kind: "trial_ended" } }]);
  });

  it("does not record a send Resend did not accept", async () => {
    sendTrialEndedOfferEmail.mockResolvedValueOnce(false);
    const { service, upserts } = fakeService({ profiles: { data: [endedProfile(5)] } });
    await runTrialEndEmails({ service, now: NOW });
    expect(upserts).toEqual([]);
  });

  it("never writes to a comped account", async () => {
    process.env.COMPED_ACCOUNT_EMAILS = "cliente@ejemplo.com";
    const { service } = fakeService({ profiles: { data: [endedProfile(5)] } });
    await runTrialEndEmails({ service, now: NOW });
    expect(sendTrialEndedOfferEmail).not.toHaveBeenCalled();
  });
});

describe("notifyTrialEndedOnDowngrade", () => {
  it("sends from the console path when the cron has not, and records it", async () => {
    const { service, upserts } = fakeService({ profiles: { data: [{ notify_lifecycle: true }] } });
    expect(
      await notifyTrialEndedOnDowngrade(service, { userId: USER, email: "cliente@ejemplo.com", trialEndsAt: new Date(ago(3)) }, NOW)
    ).toBe(true);
    expect(upserts).toEqual([{ table: "email_sends", row: { owner_user_id: USER, kind: "trial_ended" } }]);
  });
});

describe("runWinbackEmails", () => {
  const winbackProfile = { id: USER, email: "cliente@ejemplo.com", stripe_subscription_id: null, notify_lifecycle: true };

  it("sends nothing without a scan to quote at D+3", async () => {
    const { service, upserts } = fakeService({
      profiles: { data: [winbackProfile] },
      email_sends: { data: [{ owner_user_id: USER, kind: "trial_ended", sent_at: ago(80) }] }
    });
    expect(await runWinbackEmails({ service, now: NOW })).toMatchObject({ status: "ok", sent: 0, failed: 0 });
    expect(sendWinbackD3Email).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
  });

  it("sends D+10 while founder slots remain, and records it", async () => {
    const { service, upserts } = fakeService({
      profiles: { data: [winbackProfile] },
      email_sends: {
        data: [
          { owner_user_id: USER, kind: "trial_ended", sent_at: ago(250) },
          { owner_user_id: USER, kind: "winback_d3", sent_at: ago(170) }
        ]
      }
    });
    await runWinbackEmails({ service, now: NOW });
    expect(sendWinbackD10Email).toHaveBeenCalled();
    expect(upserts).toEqual([{ table: "email_sends", row: { owner_user_id: USER, kind: "winback_d10" } }]);
  });

  it("sends no D+10 once the founder slots are gone", async () => {
    promoPlans = [];
    const { service } = fakeService({
      profiles: { data: [winbackProfile] },
      email_sends: {
        data: [
          { owner_user_id: USER, kind: "trial_ended", sent_at: ago(250) },
          { owner_user_id: USER, kind: "winback_d3", sent_at: ago(170) }
        ]
      }
    });
    await runWinbackEmails({ service, now: NOW });
    expect(sendWinbackD10Email).not.toHaveBeenCalled();
  });

  it("stops at a subscription", async () => {
    const { service } = fakeService({
      profiles: { data: [{ ...winbackProfile, stripe_subscription_id: "sub_1" }] },
      email_sends: { data: [{ owner_user_id: USER, kind: "trial_ended", sent_at: ago(250) }] }
    });
    await runWinbackEmails({ service, now: NOW });
    expect(sendWinbackD10Email).not.toHaveBeenCalled();
  });
});
