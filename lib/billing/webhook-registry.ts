import "server-only";

import type Stripe from "stripe";
import type { createServiceClient } from "@/lib/supabase/service";
import { applyStripeWebhookEvent, getEventSubjectId } from "@/lib/billing/stripe-webhook";

type Service = ReturnType<typeof createServiceClient>;

/**
 * SEC-WEBHOOK-REGISTRY-1 — durable idempotency and per-subscription ordering
 * for Stripe webhooks (table: 0038_stripe_webhook_events.sql).
 *
 * Stripe is at-least-once and unordered. The handler's writes were already
 * idempotent, but its emails were not (a retry re-sent them), and nothing
 * stopped an old event for a subscription from landing after a newer one.
 *
 * Contract of `processStripeWebhookEvent`:
 *  - claim the event id first; a processed event is a no-op (`duplicate`), one
 *    another invocation is working on is `in_progress` (route answers non-2xx
 *    so Stripe retries later), a `failed` or abandoned one is re-claimed
 *    atomically;
 *  - an event older than one already applied for the same subscription, or
 *    arriving after that subscription's `deleted`, is recorded as skipped and
 *    changes nothing (`customer.subscription.deleted` itself is never skipped:
 *    it is terminal truth);
 *  - DB writes happen, the event is marked processed, and ONLY THEN do emails
 *    go out — at most once per event. A crash between the two loses an email;
 *    it can never duplicate one. A failed email does not fail the webhook.
 */

/** A `processing` claim older than this is considered abandoned (the invocation died). */
export const CLAIM_LEASE_MS = 5 * 60 * 1000;

const ORDERED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted"
]);

/** Constant, self-authored error category — never a raw provider/DB message. */
const HANDLER_FAILED = "handler_failed";

export type ProcessResult =
  | { status: "processed"; outcome: string }
  | { status: "duplicate" }
  | { status: "in_progress" };

type ClaimResult = { kind: "claimed" } | { kind: "duplicate" } | { kind: "in_progress" } | { kind: "unavailable" };

type DbError = { code?: string; message?: string } | null;

/** The table doesn't exist yet (migration 0038 not applied): degrade, don't reject every webhook. */
function isRegistryMissing(error: DbError): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST200";
}

async function claimEvent(service: Service, event: Stripe.Event, subjectId: string | null): Promise<ClaimResult> {
  const table = service.from("stripe_webhook_events");
  const { error } = await table.insert({
    event_id: event.id,
    event_type: event.type,
    subject_id: subjectId,
    stripe_created: new Date(event.created * 1000).toISOString(),
    status: "processing"
  });

  if (!error) return { kind: "claimed" };
  if (isRegistryMissing(error)) return { kind: "unavailable" };
  if (error.code !== "23505") throw new Error(`webhook registry insert failed: ${error.message}`);

  const { data: existing, error: readError } = await service
    .from("stripe_webhook_events")
    .select("status, claimed_at, attempts")
    .eq("event_id", event.id)
    .maybeSingle();
  if (readError || !existing) throw new Error(`webhook registry read failed: ${readError?.message ?? "row vanished"}`);

  if (existing.status === "processed") return { kind: "duplicate" };

  const claimedAtMs = new Date(existing.claimed_at as string).getTime();
  const abandoned = existing.status === "processing" && Date.now() - claimedAtMs > CLAIM_LEASE_MS;
  if (existing.status === "processing" && !abandoned) return { kind: "in_progress" };

  // `failed`, or `processing` past its lease: take it over atomically. The
  // UPDATE only matches if nobody changed the row since we read it.
  const { data: taken, error: takeError } = await service
    .from("stripe_webhook_events")
    .update({
      status: "processing",
      claimed_at: new Date().toISOString(),
      attempts: (existing.attempts as number) + 1,
      last_error: null
    })
    .eq("event_id", event.id)
    .eq("status", existing.status)
    .eq("claimed_at", existing.claimed_at)
    .select("event_id");
  if (takeError) throw new Error(`webhook registry reclaim failed: ${takeError.message}`);
  return taken && taken.length === 1 ? { kind: "claimed" } : { kind: "in_progress" };
}

async function settleEvent(
  service: Service,
  eventId: string,
  patch: { status: "processed" | "failed"; outcome?: string; last_error?: string }
): Promise<void> {
  const { error } = await service
    .from("stripe_webhook_events")
    .update({ ...patch, ...(patch.status === "processed" ? { processed_at: new Date().toISOString() } : {}) })
    .eq("event_id", eventId);
  if (error) throw new Error(`webhook registry settle failed: ${error.message}`);
}

/**
 * What has already happened to this subscription. The ordering watermark only
 * moves on APPLIED events (skipped ones don't), but a processed `deleted`
 * terminates the subscription whatever its outcome: a `deleted` that arrives
 * before the checkout that links it finds no profile to clear and is recorded
 * `ignored`, yet the subscription is still dead — the late checkout must not
 * resurrect it (data-guardian review, P1).
 */
async function readSubjectHistory(
  service: Service,
  subjectId: string
): Promise<{ latestCreatedMs: number | null; terminated: boolean }> {
  const { data, error } = await service
    .from("stripe_webhook_events")
    .select("event_type, stripe_created, outcome")
    .eq("subject_id", subjectId)
    .eq("status", "processed");
  if (error) throw new Error(`webhook registry history failed: ${error.message}`);

  let latestCreatedMs: number | null = null;
  let terminated = false;
  for (const row of data ?? []) {
    if (row.event_type === "customer.subscription.deleted") terminated = true;
    if (row.outcome !== "applied") continue;
    const createdMs = new Date(row.stripe_created as string).getTime();
    if (latestCreatedMs === null || createdMs > latestCreatedMs) latestCreatedMs = createdMs;
  }
  return { latestCreatedMs, terminated };
}

export async function processStripeWebhookEvent(event: Stripe.Event, service: Service): Promise<ProcessResult> {
  const subjectId = getEventSubjectId(event);
  const claim = await claimEvent(service, event, subjectId);

  if (claim.kind === "duplicate") return { status: "duplicate" };
  if (claim.kind === "in_progress") return { status: "in_progress" };

  const registered = claim.kind === "claimed";
  if (!registered) {
    console.error(
      "[geo:billing:webhook] stripe_webhook_events unavailable (migration 0038 not applied?) — processing UNREGISTERED: no event-level idempotency, no ordering",
      { eventId: event.id, eventType: event.type }
    );
  }

  try {
    if (registered && subjectId && ORDERED_EVENT_TYPES.has(event.type) && event.type !== "customer.subscription.deleted") {
      const history = await readSubjectHistory(service, subjectId);
      const createdMs = event.created * 1000;
      const skipReason = history.terminated
        ? "skipped_terminal"
        : history.latestCreatedMs !== null && createdMs < history.latestCreatedMs
          ? "skipped_stale"
          : null;
      if (skipReason) {
        await settleEvent(service, event.id, { status: "processed", outcome: skipReason });
        return { status: "processed", outcome: skipReason };
      }
    }

    const { outcome, afterCommit } = await applyStripeWebhookEvent(event, service);

    if (registered) {
      await settleEvent(service, event.id, { status: "processed", outcome });
    }

    for (const effect of afterCommit) {
      try {
        await effect();
      } catch (emailError) {
        // The DB write is committed and the event settled: surfacing this as a
        // 500 would only make Stripe replay a write that already happened.
        console.error("[geo:billing:webhook] post-commit side effect failed (not retried)", {
          eventId: event.id,
          eventType: event.type,
          message: emailError instanceof Error ? emailError.message : String(emailError)
        });
      }
    }
    return { status: "processed", outcome };
  } catch (error) {
    if (registered) {
      try {
        await settleEvent(service, event.id, { status: "failed", last_error: HANDLER_FAILED });
      } catch (settleError) {
        console.error("[geo:billing:webhook] could not mark event failed (lease will expire)", {
          eventId: event.id,
          message: settleError instanceof Error ? settleError.message : String(settleError)
        });
      }
    }
    throw error;
  }
}
