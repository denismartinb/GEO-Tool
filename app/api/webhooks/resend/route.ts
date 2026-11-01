import "server-only";

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/service";
import { recordEmailEvent, toEmailEventRow } from "@/lib/email/events";

export const dynamic = "force-dynamic";

/**
 * MAIL-METRICS-1 (log §419). Resend posts delivery, open, click, bounce and
 * complaint events here. The signature is checked before anything is read
 * (Svix scheme, `RESEND_WEBHOOK_SECRET`); only the email id, the event, the
 * email type and the time are stored (`lib/email/events.ts`).
 *
 * Nothing about the recipient goes to the logs: not the address, not the
 * subject, not the link.
 */

// Verification is local (HMAC over the body); the client never calls the
// API here, so it does not need the real key.
const verifier = new Resend(process.env.RESEND_API_KEY || "re_webhook_verify_only");

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "resend_webhook_not_configured" }, { status: 503 });
  }

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const payload = await request.text();

  let event: unknown;
  try {
    event = verifier.webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret });
  } catch {
    console.error("[geo:email:webhook] signature verification failed");
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const row = toEmailEventRow(id, event);
  if (!row) return NextResponse.json({ received: true, stored: false });

  const outcome = await recordEmailEvent(createServiceClient(), row);
  if (outcome === "stored") return NextResponse.json({ received: true, stored: true });

  // 5xx so Resend retries. `unavailable` is migration 0048 not applied yet.
  console.error("[geo:email:webhook] could not store event", { outcome, event: row.event, kind: row.kind });
  return NextResponse.json({ error: outcome === "unavailable" ? "email_events_unavailable" : "store_failed" }, { status: 503 });
}
