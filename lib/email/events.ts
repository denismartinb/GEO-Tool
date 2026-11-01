import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmailKind, type EmailKind } from "@/lib/email/kinds";

/**
 * MAIL-METRICS-1 (log §419). What one Resend webhook delivery becomes in
 * `email_events` (migration 0048). Pure on purpose: the route verifies the
 * signature, this decides what is kept, and what is kept is only this.
 * The recipient, the subject, the clicked link, the IP and the user agent
 * arrive in the payload and are never copied out of it.
 */
export const EMAIL_EVENTS = [
  "sent",
  "delivered",
  "delivery_delayed",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "failed",
  "suppressed"
] as const;

export type EmailEvent = (typeof EMAIL_EVENTS)[number];

export type EmailEventRow = {
  webhook_id: string;
  resend_email_id: string;
  event: EmailEvent;
  kind: EmailKind | null;
  occurred_at: string;
};

const EVENT_BY_TYPE = new Map<string, EmailEvent>(EMAIL_EVENTS.map((event) => [`email.${event}`, event]));

function readKind(tags: unknown): EmailKind | null {
  // The webhook sends tags as an object; the send API takes them as a list.
  // Both shapes are read so a change on Resend's side does not drop the type.
  if (Array.isArray(tags)) {
    const tag = tags.find((item) => item && typeof item === "object" && (item as { name?: unknown }).name === "kind");
    const value = tag ? (tag as { value?: unknown }).value : undefined;
    return isEmailKind(value) ? value : null;
  }
  if (tags && typeof tags === "object") {
    const value = (tags as Record<string, unknown>).kind;
    return isEmailKind(value) ? value : null;
  }
  return null;
}

function validIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * `null` means "nothing to keep": a contact or domain event, a received
 * email, or a payload without an email id. The route answers 200 to those,
 * so Resend stops retrying something we will never store.
 */
export function toEmailEventRow(webhookId: string, payload: unknown): EmailEventRow | null {
  if (!webhookId || !payload || typeof payload !== "object") return null;
  const { type, created_at: createdAt, data } = payload as { type?: unknown; created_at?: unknown; data?: unknown };
  const event = typeof type === "string" ? EVENT_BY_TYPE.get(type) : undefined;
  if (!event || !data || typeof data !== "object") return null;

  const fields = data as { email_id?: unknown; created_at?: unknown; tags?: unknown };
  if (typeof fields.email_id !== "string" || fields.email_id.length === 0) return null;

  const occurredAt = validIso(createdAt) ?? validIso(fields.created_at);
  if (!occurredAt) return null;

  return {
    webhook_id: webhookId,
    resend_email_id: fields.email_id,
    event,
    kind: readKind(fields.tags),
    occurred_at: occurredAt
  };
}

export type RecordOutcome = "stored" | "unavailable" | "error";

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST200";
}

/**
 * Inserts once per `webhook_id`: a retried delivery is a no-op. `unavailable`
 * (migration 0048 not applied) and `error` both make the route answer 5xx,
 * so Resend retries instead of the event being lost.
 */
export async function recordEmailEvent(service: SupabaseClient, row: EmailEventRow): Promise<RecordOutcome> {
  const { error } = await service
    .from("email_events")
    .upsert(row, { onConflict: "webhook_id", ignoreDuplicates: true });
  if (!error) return "stored";
  return isMissingTable(error) ? "unavailable" : "error";
}
