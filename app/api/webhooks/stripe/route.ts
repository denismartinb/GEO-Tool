import "server-only";

import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { handleStripeWebhookEvent } from "@/lib/billing/stripe-webhook";

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
    await handleStripeWebhookEvent(event, service);
  } catch (error) {
    console.error("[geo:billing:webhook] handler failed", {
      eventType: event.type,
      eventId: event.id,
      message: error instanceof Error ? error.message : String(error)
    });
    // Non-2xx so Stripe retries per its own backoff schedule (up to 3 days)
    // — every write in handleStripeWebhookEvent is idempotent, so a retry of
    // an already-partially-processed event is safe, and a transient failure
    // (e.g. a momentary DB blip) gets a real chance to recover on its own
    // instead of silently losing the plan sync forever.
    return NextResponse.json({ received: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
