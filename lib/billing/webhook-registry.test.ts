import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { createServiceClient } from "@/lib/supabase/service";

const sendPlanConfirmedEmail = vi.fn();
const sendPaymentFailedEmail = vi.fn();
const sendCancellationScheduledEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendPlanConfirmedEmail: (...args: unknown[]) => sendPlanConfirmedEmail(...args),
  sendPaymentFailedEmail: (...args: unknown[]) => sendPaymentFailedEmail(...args),
  sendCancellationScheduledEmail: (...args: unknown[]) => sendCancellationScheduledEmail(...args)
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.STRIPE_PRICE_ID_PRO = "price_pro_test";
  sendPlanConfirmedEmail.mockReset();
  sendPaymentFailedEmail.mockReset();
  sendCancellationScheduledEmail.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.restoreAllMocks();
});

type Row = Record<string, unknown>;

/**
 * In-memory stand-in for the three tables the processor touches. Implements
 * just the query shapes webhook-registry.ts / stripe-webhook.ts issue,
 * including the unique violation on a repeated primary key and the "UPDATE only
 * matches if the row is unchanged" compare-and-set the reclaim/takeover rely on.
 *
 * `gate` makes the FIRST profile write block until released, which is what lets
 * the concurrency test hold one event mid-apply deterministically — no timers,
 * no sleeps: ordering is decided by promises the test resolves itself.
 */
function fakeDb(
  opts: {
    registryMissing?: boolean;
    profile?: Row;
    failProfileWrite?: boolean;
    gate?: { entered: () => void; release: Promise<void> };
  } = {}
) {
  const events = new Map<string, Row>();
  const locks = new Map<string, Row>();
  const profile: Row = { id: "user-1", current_plan: "free", email: "a@b.c", stripe_subscription_id: null, ...opts.profile };
  const profileWrites: Row[] = [];
  let gateUsed = false;

  type Filter = (row: Row) => boolean;
  const eqFilter = (c: string, v: unknown): Filter => (r) => (r[c] ?? null) === v;
  /** Parses the one `.or()` shape the guard uses: "col.is.null,col.eq.value". */
  const orFilter = (expr: string): Filter => {
    const parts = expr.split(",").map((term) => {
      const [col, op, ...rest] = term.split(".");
      const value = rest.join(".");
      return (r: Row) => (op === "is" ? (r[col] ?? null) === null : (r[col] ?? null) === value);
    });
    return (r) => parts.some((f) => f(r));
  };

  function table(rows: Map<string, Row>, pk: string, missing: boolean) {
    const missingErr = { code: "PGRST205", message: "no table" };
    function query(kind: "select" | "update" | "delete", patch?: Row) {
      const filters: Filter[] = [];
      const b = {
        eq(c: string, v: unknown) {
          filters.push(eqFilter(c, v));
          return b;
        },
        select() {
          return b;
        },
        maybeSingle() {
          return b.then((raw: unknown) => {
            const r = raw as { data: Row[] | null; error: unknown };
            return { data: r.data?.[0] ?? null, error: r.error };
          }) as Promise<unknown>;
        },
        then(resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) {
          if (missing) return Promise.resolve({ data: null, error: missingErr }).then(resolve, reject);
          const hit = [...rows.values()].filter((r) => filters.every((f) => f(r)));
          if (kind === "update") hit.forEach((r) => Object.assign(r, patch));
          if (kind === "delete") hit.forEach((r) => rows.delete(r[pk] as string));
          return Promise.resolve({ data: hit.map((r) => ({ ...r })), error: null }).then(resolve, reject);
        }
      };
      return b;
    }
    return {
      insert(row: Row) {
        if (missing) return Promise.resolve({ error: missingErr });
        if (rows.has(row[pk] as string)) return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
        rows.set(row[pk] as string, { attempts: 1, claimed_at: new Date().toISOString(), locked_at: new Date().toISOString(), ...row });
        return Promise.resolve({ error: null });
      },
      select: () => query("select"),
      update: (patch: Row) => query("update", patch),
      delete: () => query("delete")
    };
  }

  const eventsTable = table(events, "event_id", Boolean(opts.registryMissing));
  const locksTable = table(locks, "subject_id", Boolean(opts.registryMissing));

  const client = {
    from(name: string) {
      if (name === "stripe_webhook_events") return eventsTable;
      if (name === "stripe_subscription_locks") return locksTable;
      if (name === "profiles") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { ...profile }, error: null }) }) }),
          update(patch: Row) {
            const filters: Filter[] = [];
            const b = {
              eq(c: string, v: unknown) {
                filters.push(eqFilter(c, v));
                return b;
              },
              or(expr: string) {
                filters.push(orFilter(expr));
                return b;
              },
              select() {
                return b;
              },
              then(resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) {
                const run = async () => {
                  if (opts.gate && !gateUsed) {
                    gateUsed = true;
                    opts.gate.entered();
                    await opts.gate.release;
                  }
                  if (opts.failProfileWrite) return { data: null, error: { message: "db down" } };
                  const hit = filters.every((f) => f(profile));
                  if (hit) {
                    Object.assign(profile, patch);
                    profileWrites.push(patch);
                  }
                  return { data: hit ? [{ id: "user-1" }] : [], error: null };
                };
                return run().then(resolve, reject);
              }
            };
            return b;
          }
        };
      }
      throw new Error(`unexpected table ${name}`);
    }
  } as unknown as ReturnType<typeof createServiceClient>;

  return { client, events, locks, profile, profileWrites };
}

function checkout(id: string, created: number, sub = "sub_1"): Stripe.Event {
  return {
    id,
    type: "checkout.session.completed",
    created,
    data: {
      object: {
        metadata: { user_id: "user-1", plan_id: "pro" },
        payment_status: "paid",
        customer: "cus_1",
        subscription: sub,
        customer_details: { email: "a@b.c" }
      }
    }
  } as unknown as Stripe.Event;
}

function subscriptionEvent(id: string, type: "updated" | "deleted", created: number, sub: string, status = "active"): Stripe.Event {
  return {
    id,
    type: `customer.subscription.${type}`,
    created,
    data: {
      object: {
        id: sub,
        status,
        metadata: { user_id: "user-1" },
        items: { data: [{ price: { id: "price_pro_test" } }] },
        cancel_at: null
      }
    }
  } as unknown as Stripe.Event;
}

describe("processStripeWebhookEvent — idempotency", () => {
  it("applies once and answers duplicate for a retry of the same event id, sending the email only once", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, profileWrites } = fakeDb();
    const event = checkout("evt_1", 1000);

    const first = await processStripeWebhookEvent(event, client);
    const second = await processStripeWebhookEvent(event, client);

    expect(first).toEqual({ status: "processed", outcome: "applied" });
    expect(second).toEqual({ status: "duplicate" });
    expect(profileWrites).toHaveLength(1);
    expect(sendPlanConfirmedEmail).toHaveBeenCalledTimes(1);
  });

  it("a failed DB write marks the event failed, throws, and the retry succeeds without a duplicate email", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const failing = fakeDb({ failProfileWrite: true });
    const event = checkout("evt_1", 1000);

    await expect(processStripeWebhookEvent(event, failing.client)).rejects.toThrow("profiles update failed");
    expect(failing.events.get("evt_1")).toMatchObject({ status: "failed", last_error: "handler_failed" });
    expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();

    // Same registry, healthy DB this time: re-claims the failed event.
    const healthy = fakeDb();
    healthy.events.set("evt_1", failing.events.get("evt_1")!);
    const retry = await processStripeWebhookEvent(event, healthy.client);

    expect(retry).toEqual({ status: "processed", outcome: "applied" });
    expect(healthy.events.get("evt_1")).toMatchObject({ status: "processed", attempts: 2 });
    expect(sendPlanConfirmedEmail).toHaveBeenCalledTimes(1);
  });

  it("an event another invocation is processing right now is in_progress (route answers non-2xx)", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, events } = fakeDb();
    events.set("evt_1", { event_id: "evt_1", status: "processing", claimed_at: new Date().toISOString(), attempts: 1 });

    expect(await processStripeWebhookEvent(checkout("evt_1", 1000), client)).toEqual({ status: "in_progress" });
    expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();
  });

  it("takes over a claim abandoned past its lease", async () => {
    const { processStripeWebhookEvent, CLAIM_LEASE_MS } = await import("./webhook-registry");
    const { client, events } = fakeDb();
    events.set("evt_1", {
      event_id: "evt_1",
      status: "processing",
      claimed_at: new Date(Date.now() - CLAIM_LEASE_MS - 1000).toISOString(),
      attempts: 1
    });

    expect(await processStripeWebhookEvent(checkout("evt_1", 1000), client)).toEqual({ status: "processed", outcome: "applied" });
  });

  it("a failing email does not fail the webhook nor get retried (the write is already committed)", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, events } = fakeDb();
    sendPlanConfirmedEmail.mockRejectedValue(new Error("resend down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await processStripeWebhookEvent(checkout("evt_1", 1000), client);

    expect(result.status).toBe("processed");
    expect(events.get("evt_1")).toMatchObject({ status: "processed" });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("FAILS CLOSED when migration 0038 isn't applied: throws a retryable error and writes nothing", async () => {
    const { processStripeWebhookEvent, WebhookRegistryUnavailableError } = await import("./webhook-registry");
    const { client, profileWrites } = fakeDb({ registryMissing: true });

    await expect(processStripeWebhookEvent(checkout("evt_1", 1000), client)).rejects.toBeInstanceOf(
      WebhookRegistryUnavailableError
    );
    expect(profileWrites).toHaveLength(0);
    expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();
  });
});

describe("processStripeWebhookEvent — ordering per subscription", () => {
  it("a delete for an OLD subscription arriving after a newer checkout does not touch the newer plan", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, profile } = fakeDb();

    await processStripeWebhookEvent(checkout("evt_new", 2000, "sub_new"), client);
    await processStripeWebhookEvent(subscriptionEvent("evt_old_del", "deleted", 1500, "sub_old", "canceled"), client);

    expect(profile).toMatchObject({ current_plan: "pro", stripe_subscription_id: "sub_new" });
  });

  it("an older update delivered after a newer one for the same subscription is skipped as stale", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, events, profile } = fakeDb({ profile: { stripe_subscription_id: "sub_1", current_plan: "pro" } });

    await processStripeWebhookEvent(subscriptionEvent("evt_b", "updated", 2000, "sub_1", "canceled"), client);
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });

    const stale = await processStripeWebhookEvent(subscriptionEvent("evt_a", "updated", 1000, "sub_1", "active"), client);

    expect(stale).toEqual({ status: "processed", outcome: "skipped_stale" });
    expect(events.get("evt_a")).toMatchObject({ outcome: "skipped_stale" });
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });
  });

  it("nothing is applied for a subscription after its delete, even a replayed checkout with a newer timestamp", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, profile } = fakeDb({ profile: { stripe_subscription_id: "sub_1", current_plan: "pro" } });

    await processStripeWebhookEvent(subscriptionEvent("evt_del", "deleted", 3000, "sub_1", "canceled"), client);
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });

    const replay = await processStripeWebhookEvent(checkout("evt_replay", 4000, "sub_1"), client);

    expect(replay).toEqual({ status: "processed", outcome: "skipped_terminal" });
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });
    expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();
  });

  it("a delete that arrives BEFORE its checkout (ignored, nothing linked yet) still blocks the late checkout", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, events, profile } = fakeDb();

    const del = await processStripeWebhookEvent(subscriptionEvent("evt_del", "deleted", 3000, "sub_1", "canceled"), client);
    expect(del).toEqual({ status: "processed", outcome: "ignored" });

    const late = await processStripeWebhookEvent(checkout("evt_late", 2000, "sub_1"), client);

    expect(late).toEqual({ status: "processed", outcome: "skipped_terminal" });
    expect(events.get("evt_late")).toMatchObject({ outcome: "skipped_terminal" });
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });
    expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();
  });

  it("a delete is never skipped for being 'older' than another event: it is terminal truth", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, profile } = fakeDb({ profile: { stripe_subscription_id: "sub_1", current_plan: "pro" } });

    await processStripeWebhookEvent(subscriptionEvent("evt_up", "updated", 5000, "sub_1", "active"), client);
    const del = await processStripeWebhookEvent(subscriptionEvent("evt_del", "deleted", 4000, "sub_1", "canceled"), client);

    expect(del).toEqual({ status: "processed", outcome: "applied" });
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });
  });

  it("invoice.payment_failed emails once per event id, however many times Stripe retries it", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client } = fakeDb();
    const event = {
      id: "evt_inv",
      type: "invoice.payment_failed",
      created: 1000,
      data: { object: { customer_email: "a@b.c" } }
    } as unknown as Stripe.Event;

    await processStripeWebhookEvent(event, client);
    await processStripeWebhookEvent(event, client);
    await processStripeWebhookEvent(event, client);

    expect(sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
  });
});

describe("processStripeWebhookEvent — serialization per subscription", () => {
  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  }

  it("a second event for the same subscription cannot run while the first is mid-apply: it answers in_progress, then applies in order on retry", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const entered = deferred();
    const release = deferred();
    const { client, events, locks, profile } = fakeDb({
      profile: { stripe_subscription_id: "sub_1", current_plan: "starter" },
      gate: { entered: entered.resolve, release: release.promise }
    });
    const first = subscriptionEvent("evt_first", "updated", 1000, "sub_1", "active");
    const second = subscriptionEvent("evt_second", "updated", 2000, "sub_1", "canceled");

    // 1) The first event enters apply and parks inside its profile write.
    const firstRun = processStripeWebhookEvent(first, client);
    await entered.promise;
    expect(locks.get("sub_1")).toMatchObject({ event_id: "evt_first" });

    // 2) A newer event for the SAME subscription arrives meanwhile: it must not
    //    touch the profile, and must hand its claim back so Stripe's retry takes it.
    const secondRun = await processStripeWebhookEvent(second, client);
    expect(secondRun).toEqual({ status: "in_progress" });
    expect(profile).toMatchObject({ current_plan: "starter", stripe_subscription_id: "sub_1" });
    expect(events.get("evt_second")).toMatchObject({ status: "failed", last_error: "subscription_busy" });

    // 3) The first one finishes and releases the lease.
    release.resolve();
    expect(await firstRun).toEqual({ status: "processed", outcome: "applied" });
    expect(locks.size).toBe(0);
    expect(profile).toMatchObject({ current_plan: "pro" });

    // 4) Stripe's retry of the second event now applies, after the first.
    expect(await processStripeWebhookEvent(second, client)).toEqual({ status: "processed", outcome: "applied" });
    expect(profile).toMatchObject({ current_plan: "free", stripe_subscription_id: null });
  });

  it("events for DIFFERENT subscriptions don't block each other", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const entered = deferred();
    const release = deferred();
    const { client } = fakeDb({
      profile: { stripe_subscription_id: "sub_1", current_plan: "pro" },
      gate: { entered: entered.resolve, release: release.promise }
    });

    const firstRun = processStripeWebhookEvent(subscriptionEvent("evt_a", "updated", 1000, "sub_1"), client);
    await entered.promise;
    const other = await processStripeWebhookEvent(subscriptionEvent("evt_b", "deleted", 1100, "sub_other", "canceled"), client);

    expect(other.status).toBe("processed");
    release.resolve();
    await firstRun;
  });

  it("takes over a lease abandoned past its timeout (a dead invocation can't block a subscription forever)", async () => {
    const { processStripeWebhookEvent, CLAIM_LEASE_MS } = await import("./webhook-registry");
    const { client, locks } = fakeDb({ profile: { stripe_subscription_id: "sub_1", current_plan: "pro" } });
    locks.set("sub_1", {
      subject_id: "sub_1",
      event_id: "evt_dead",
      locked_at: new Date(Date.now() - CLAIM_LEASE_MS - 1000).toISOString()
    });

    const result = await processStripeWebhookEvent(subscriptionEvent("evt_x", "updated", 1000, "sub_1"), client);

    expect(result.status).toBe("processed");
    expect(locks.size).toBe(0);
  });

  it("releases the lease when applying throws, so the retry isn't blocked", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, locks } = fakeDb({ profile: { stripe_subscription_id: "sub_1", current_plan: "pro" }, failProfileWrite: true });

    await expect(
      processStripeWebhookEvent(subscriptionEvent("evt_x", "updated", 1000, "sub_1"), client)
    ).rejects.toThrow("profiles update failed");
    expect(locks.size).toBe(0);
  });
});

describe("processStripeWebhookEvent — an old checkout never overwrites the current subscription", () => {
  it("old checkout AFTER a newer one: the profile keeps the newer subscription, no email, loud log", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, profile, profileWrites } = fakeDb();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await processStripeWebhookEvent(checkout("evt_new", 3000, "sub_new"), client);
    sendPlanConfirmedEmail.mockClear();
    const old = await processStripeWebhookEvent(checkout("evt_old", 2000, "sub_old"), client);

    expect(old).toEqual({ status: "processed", outcome: "ignored" });
    expect(profile).toMatchObject({ stripe_subscription_id: "sub_new", current_plan: "pro" });
    expect(profileWrites).toHaveLength(1);
    expect(sendPlanConfirmedEmail).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("ORPHAN_SUBSCRIPTION_CANDIDATE"), expect.anything());
  });

  it("the same checkout redelivered under a NEW event id is still harmless (same subscription is allowed)", async () => {
    const { processStripeWebhookEvent } = await import("./webhook-registry");
    const { client, profile } = fakeDb();

    await processStripeWebhookEvent(checkout("evt_1", 1000, "sub_1"), client);
    const again = await processStripeWebhookEvent(checkout("evt_2", 1000, "sub_1"), client);

    expect(again.status).toBe("processed");
    expect(profile).toMatchObject({ stripe_subscription_id: "sub_1" });
  });
});
