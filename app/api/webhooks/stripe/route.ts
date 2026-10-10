import "server-only";

import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { processStripeWebhookEvent, WebhookRegistryUnavailableError } from "@/lib/billing/webhook-registry";

export const dynamic = "force-dynamic";
// Bounded well under the registry lease (CLAIM_LEASE_MS = 5 min) so a live
// invocation can never outlast the claim/lease it holds.
export const maxDuration = 60;

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("[geo:billing:webhook] signature verification failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const service = createServiceClient();

  try {
    const result = await processStripeWebhookEvent(event, service);
    if (result.status === "in_progress") {
      // Another invocation holds this event right now. Non-2xx so Stripe
      // retries later instead of treating it as delivered.
      return NextResponse.json({ received: false, reason: "in_progress" }, { status: 409 });
    }
    if (result.status === "duplicate") {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (error) {
    if (error instanceof WebhookRegistryUnavailableError) {
      // Fail closed: never process a billing event without idempotency and
      // ordering. 503 is retried by Stripe, but only for a while: in LIVE mode
      // up to ~3 days (and a long outage can get the endpoint disabled); in
      // TEST mode only a few attempts over a few hours. So migration 0039 must
      // be applied BEFORE this code is deployed — otherwise events can be lost.
      console.error("[geo:billing:webhook] registry unavailable, refusing event (retryable)", {
        eventType: event.type,
        eventId: event.id
      });
      return NextResponse.json({ received: false, reason: "registry_unavailable" }, { status: 503, headers: { "Retry-After": "60" } });
    }
    console.error("[geo:billing:webhook] handler failed", {
      eventType: event.type,
      eventId: event.id,
      message: error instanceof Error ? error.message : String(error)
    });
    // Non-2xx so Stripe retries per its own backoff schedule (up to 3 days).
    // The registry marked the event `failed`, so the retry re-claims it; every
    // database write is idempotent and scoped to its subscription, and emails
    // only go out after a successful commit, so a retry never duplicates one.
    return NextResponse.json({ received: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
