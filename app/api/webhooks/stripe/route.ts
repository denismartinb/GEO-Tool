import "server-only";

import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { processStripeWebhookEvent } from "@/lib/billing/webhook-registry";

export const dynamic = "force-dynamic";

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
