import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendTrialEndedOfferEmail = vi.fn(async (..._args: unknown[]): Promise<string> => "sent");
const sendWinbackD3Email = vi.fn(async (..._args: unknown[]): Promise<string> => "sent");
const sendWinbackD10Email = vi.fn(async (..._args: unknown[]): Promise<string> => "sent");
const sendTrialEndedEmail = vi.fn(async (..._args: unknown[]): Promise<string> => "sent");
vi.mock("@/lib/email/lifecycle/templates", () => ({
  sendTrialEndedOfferEmail: (...a: unknown[]) => sendTrialEndedOfferEmail(...a),
  sendWinbackD3Email: (...a: unknown[]) => sendWinbackD3Email(...a),
  sendWinbackD10Email: (...a: unknown[]) => sendWinbackD10Email(...a),
  formatDateLong: () => "31 de octubre"
}));
vi.mock("@/lib/email/transactional", () => ({ sendTrialEndedEmail: (...a: unknown[]) => sendTrialEndedEmail(...a) }));
let promoPlans: string[] = ["pro", "starter"];
vi.mock("@/lib/stripe", () => ({ getFounderOffer: async () => ({ planIds: promoPlans, remaining: 35, total: 38 }) }));

import {
  lifecycleIdempotencyKey,
  notifyTrialEndedOnDowngrade,
  runTrialEndEmails,
  runWinbackEmails,
  sendTrialEndEmailOnce
} from "./runner";

/**
 * LIFECYCLE-WINBACK-1 (log §238). The runner's contract over a fake
 * database: who is considered, which version goes out, and that a send is
 * recorded only when it happened. The rules themselves are
 * winback-schedule.test.ts's.
 */
type Tables = Record<string, { data?: unknown }>;

/**
 * `email_sends` behaves like the real table where it matters here: the
 * `(owner_user_id, kind)` unique index. An upsert with `ignoreDuplicates`
 * inserts only when the key is free, and `.select()` returns the row only to
 * the caller that inserted it (`ON CONFLICT DO NOTHING RETURNING`). The
 * check-and-insert runs in one step, as it does in Postgres, after a
 * microtask so that concurrent callers really interleave.
 */
function fakeService(tables: Tables) {
  const upserts: Array<{ table: string; row: unknown }> = [];
  const deletes: string[] = [];
  const claims = new Map<string, string>();
  for (const row of (tables.email_sends?.data ?? []) as Array<{ owner_user_id?: string; kind: string }>) {
    claims.set(`${row.owner_user_id ?? USER}|${row.kind}`, `seed-${claims.size}`);
  }
  let nextId = 0;

  const chain = (table: string): unknown => {
    const result = { data: tables[table]?.data ?? [], error: null, count: null };
    const node: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "gte", "lt", "is", "order", "limit"]) node[m] = () => node;
    node.maybeSingle = () => {
      const rows = result.data as unknown[];
      return Promise.resolve({ data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null });
    };
    node.upsert = (row: { owner_user_id: string; kind: string }) => {
      const insert = Promise.resolve().then(() => {
        const key = `${row.owner_user_id}|${row.kind}`;
        if (claims.has(key)) return null;
        const id = `claim-${nextId++}`;
        claims.set(key, id);
        upserts.push({ table, row });
        return id;
      });
      return {
        select: () => insert.then((id) => ({ data: id ? [{ id }] : [], error: null })),
        then: (resolve: (v: unknown) => unknown) => insert.then(() => resolve({ error: null }))
      };
    };
    node.delete = () => ({
      eq: (_column: string, id: string) => {
        deletes.push(id);
        for (const [key, value] of claims) if (value === id) claims.delete(key);
        return Promise.resolve({ error: null });
      }
    });
    node.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return node;
  };
  const held = () => [...claims.keys()].filter((key) => !claims.get(key)?.startsWith("seed-"));
  return { service: { from: chain } as never, upserts, deletes, held };
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
    expect(sendTrialEndedOfferEmail).toHaveBeenCalledWith("cliente@ejemplo.com", USER, expect.objectContaining({ late: false }), expect.anything());
    expect(upserts).toEqual([{ table: "email_sends", row: { owner_user_id: USER, kind: "trial_ended" } }]);
  });

  it("sends the «tardía» version to a trial that lapsed unannounced", async () => {
    const { service, upserts } = fakeService({ profiles: { data: [endedProfile(24 * 20)] } });
    await runTrialEndEmails({ service, now: NOW });
    expect(sendTrialEndedOfferEmail).toHaveBeenCalledWith("cliente@ejemplo.com", USER, expect.objectContaining({ late: true }), expect.anything());
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
    expect(sendTrialEndedEmail).toHaveBeenCalledWith("cliente@ejemplo.com", expect.anything());
    expect(upserts).toEqual([{ table: "email_sends", row: { owner_user_id: USER, kind: "trial_ended" } }]);
  });

  it("does not keep the record of a send Resend surely did not accept", async () => {
    sendTrialEndedOfferEmail.mockResolvedValueOnce("not_sent");
    const { service, held } = fakeService({ profiles: { data: [endedProfile(5)] } });
    await runTrialEndEmails({ service, now: NOW });
    expect(held()).toEqual([]);
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

describe("sendTrialEndEmailOnce · LIFECYCLE-DEDUPE-1 (log §308)", () => {
  const target = {
    userId: USER,
    email: "cliente@ejemplo.com",
    trialEndsAt: new Date(ago(5)),
    hasSubscription: false,
    lifecycleOptIn: true
  };
  const KEY = lifecycleIdempotencyKey("trial_ended", USER);

  it("sends once when two calls race for the same account (duplicated cron, or cron against console)", async () => {
    const { service, held } = fakeService({});
    const results = await Promise.all([
      sendTrialEndEmailOnce(service, target, NOW),
      sendTrialEndEmailOnce(service, target, NOW),
      sendTrialEndEmailOnce(service, target, NOW)
    ]);
    expect(sendTrialEndedOfferEmail).toHaveBeenCalledTimes(1);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(held()).toEqual([`${USER}|trial_ended`]);
  });

  it("sends once when the cron pass and the console downgrade cross", async () => {
    const { service } = fakeService({ profiles: { data: [{ ...endedProfile(5) }] } });
    await Promise.all([
      runTrialEndEmails({ service, now: NOW }),
      notifyTrialEndedOnDowngrade(service, { userId: USER, email: "cliente@ejemplo.com", trialEndsAt: new Date(ago(5)) }, NOW)
    ]);
    expect(sendTrialEndedOfferEmail).toHaveBeenCalledTimes(1);
  });

  it("does not touch Resend when the claim is already taken", async () => {
    // The read sees nothing (a pass that started before the other recorded),
    // but the unique index does.
    const { service } = fakeService({});
    await sendTrialEndEmailOnce(service, target, NOW);
    sendTrialEndedOfferEmail.mockClear();
    expect(await sendTrialEndEmailOnce(service, target, NOW)).toBe(false);
    expect(sendTrialEndedOfferEmail).not.toHaveBeenCalled();
  });

  it("passes a deterministic idempotency key to Resend", async () => {
    const { service } = fakeService({});
    await sendTrialEndEmailOnce(service, target, NOW);
    expect(sendTrialEndedOfferEmail).toHaveBeenCalledWith("cliente@ejemplo.com", USER, expect.anything(), { idempotencyKey: KEY });
    expect(KEY).toBe(`lifecycle/trial_ended/${USER}`);
  });

  it("releases the claim on a definitive rejection, so the next pass retries", async () => {
    sendTrialEndedOfferEmail.mockResolvedValueOnce("not_sent");
    const { service, held } = fakeService({});
    expect(await sendTrialEndEmailOnce(service, target, NOW)).toBe(false);
    expect(held()).toEqual([]);

    expect(await sendTrialEndEmailOnce(service, target, NOW)).toBe(true);
    expect(sendTrialEndedOfferEmail).toHaveBeenCalledTimes(2);
    expect(held()).toEqual([`${USER}|trial_ended`]);
  });

  it("retries an ambiguous failure once with the same key and payload, and the provider sends it once", async () => {
    // A provider that honours idempotency keys: it accepts the first request,
    // the answer is lost on the way back, the retry gets the cached answer.
    const delivered: string[] = [];
    sendTrialEndedOfferEmail.mockImplementation(async (...args: unknown[]) => {
      const { idempotencyKey } = args[3] as { idempotencyKey: string };
      if (delivered.includes(idempotencyKey)) return "sent";
      delivered.push(idempotencyKey);
      return "ambiguous";
    });
    const { service, held } = fakeService({});
    expect(await sendTrialEndEmailOnce(service, target, NOW)).toBe(true);

    expect(delivered).toEqual([KEY]);
    const [first, second] = sendTrialEndedOfferEmail.mock.calls;
    expect(second[2]).toBe(first[2]);
    expect(second[3]).toEqual(first[3]);
    expect(held()).toEqual([`${USER}|trial_ended`]);
    sendTrialEndedOfferEmail.mockImplementation(async () => "sent");
  });

  it("keeps the claim when the failure stays ambiguous: may lose the email, never sends it twice", async () => {
    sendTrialEndedOfferEmail.mockResolvedValueOnce("ambiguous").mockResolvedValueOnce("ambiguous");
    const { service, held } = fakeService({});
    expect(await sendTrialEndEmailOnce(service, target, NOW)).toBe(false);
    expect(sendTrialEndedOfferEmail).toHaveBeenCalledTimes(2);
    expect(held()).toEqual([`${USER}|trial_ended`]);

    expect(await sendTrialEndEmailOnce(service, target, NOW)).toBe(false);
    expect(sendTrialEndedOfferEmail).toHaveBeenCalledTimes(2);
  });

  it("a crash after the claim leaves it held: that email is lost (accepted miss), never repeated", async () => {
    sendTrialEndedOfferEmail.mockRejectedValueOnce(new Error("process died mid-send"));
    const { service, held } = fakeService({});
    await expect(sendTrialEndEmailOnce(service, target, NOW)).rejects.toThrow();
    expect(held()).toEqual([`${USER}|trial_ended`]);

    expect(await sendTrialEndEmailOnce(service, target, NOW)).toBe(false);
    expect(sendTrialEndedOfferEmail).toHaveBeenCalledTimes(1);
  });

  it("claims per kind: other kinds and other accounts never block it", async () => {
    const OTHER = "99999999-2222-4333-8444-555555555555";
    const { service, held } = fakeService({});
    // Another account already holds both end-of-trial kinds.
    expect(await sendTrialEndEmailOnce(service, { ...target, userId: OTHER }, NOW)).toBe(true);
    expect(await sendTrialEndEmailOnce(service, { ...target, userId: OTHER, trialEndsAt: new Date(ago(24 * 20)) }, NOW)).toBe(true);
    // The late version for this account claims its own key, and the on-time
    // one is a different key again: neither collides with the other.
    expect(await sendTrialEndEmailOnce(service, { ...target, trialEndsAt: new Date(ago(24 * 20)) }, NOW)).toBe(true);
    expect(await sendTrialEndEmailOnce(service, target, NOW)).toBe(true);
    expect(held()).toEqual([
      `${OTHER}|trial_ended`,
      `${OTHER}|trial_ended_late`,
      `${USER}|trial_ended_late`,
      `${USER}|trial_ended`
    ]);
    expect(sendTrialEndedOfferEmail.mock.calls[2][3]).toEqual({ idempotencyKey: lifecycleIdempotencyKey("trial_ended_late", USER) });
  });

  it("still sends and records the plain service email to whoever opted out of offers", async () => {
    const { service, held } = fakeService({});
    expect(await sendTrialEndEmailOnce(service, { ...target, lifecycleOptIn: false }, NOW)).toBe(true);
    expect(sendTrialEndedOfferEmail).not.toHaveBeenCalled();
    expect(sendTrialEndedEmail).toHaveBeenCalledWith("cliente@ejemplo.com", { idempotencyKey: KEY });
    expect(held()).toEqual([`${USER}|trial_ended`]);
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

  it("sends D+10 once when the cron run is delivered twice (LIFECYCLE-DEDUPE-1, log §309)", async () => {
    const tables = {
      profiles: { data: [winbackProfile] },
      email_sends: {
        data: [
          { owner_user_id: USER, kind: "trial_ended", sent_at: ago(250) },
          { owner_user_id: USER, kind: "winback_d3", sent_at: ago(170) }
        ]
      }
    };
    const { service } = fakeService(tables);
    await Promise.all([runWinbackEmails({ service, now: NOW }), runWinbackEmails({ service, now: NOW })]);
    expect(sendWinbackD10Email).toHaveBeenCalledTimes(1);
    expect(sendWinbackD10Email.mock.calls[0][3]).toEqual({ idempotencyKey: lifecycleIdempotencyKey("winback_d10", USER) });
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
