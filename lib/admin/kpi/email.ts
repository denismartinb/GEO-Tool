import "server-only";

import { unstable_cache } from "next/cache";
import type { createServiceClient } from "@/lib/supabase/service";
import type { AdminUserRow } from "@/lib/admin/users";
import { getEmailFromAddress, getResendClient } from "@/lib/email/resend";
import {
  buildContacts,
  buildSending,
  buildUnsubscribes,
  RESEND_RETENTION_DAYS,
  type ContactsView,
  type ContactUser,
  type PrefEvent,
  type ResendEmail,
  type SendingView,
  type SendRecord,
  type UnsubscribesView
} from "@/lib/admin/kpi/email-model";
import type { PanelWindow } from "@/lib/admin/kpi/period";
import { PANEL_CACHE_SECONDS, PANEL_CACHE_TAG } from "@/lib/admin/kpi/posthog";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * ADMIN-EMAIL-1 — the email-capture section of /admin/panel. Read-only.
 * Each source fails on its own and says so; nothing unreadable becomes a zero
 * (`.claude/rules/admin.md`).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Resend list pages read at most (100 emails each); hitting it is said on screen. */
const RESEND_PAGE_CAP = 20;
/** Resend allows about 2 requests per second per team. */
const RESEND_PAGE_GAP_MS = 550;
/** Supabase `.in()` filters go in chunks so a long id list never overflows the URL. */
const ID_CHUNK = 200;

export type ResendRead =
  | { kind: "not_configured" }
  | { kind: "restricted" }
  | { kind: "error" }
  | {
      kind: "ready";
      emails: ResendEmail[];
      truncated: boolean;
      domainTracking: { open: boolean | null; click: boolean | null } | null;
    };

export type EmailSection =
  | { kind: "error" }
  | {
      kind: "ready";
      contacts: ContactsView;
      /** Contacts with «Consejos, novedades y ofertas» on; null when profiles could not be read. */
      lifecycleSubscribed: number | null;
      /** Null when `email_preference_events` could not be read (migration 0036). */
      unsubscribes: UnsubscribesView | null;
      sending:
        | { kind: "not_configured" }
        | { kind: "restricted" }
        | { kind: "error" }
        | ({ kind: "ready"; truncated: boolean } & SendingView);
      authUsersTruncated: boolean;
    };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A Resend read that is not worth caching: thrown out of the cache, mapped back below. */
class ResendReadFailure extends Error {
  constructor(readonly kind: "restricted" | "error") {
    super(kind);
  }
}

/**
 * Every email Resend still holds, newest first, back to its retention limit.
 * Started before the accounts are read so the two run side by side, and kept
 * in the panel's 10-minute cache (same tag «Actualizar» clears). Failures are
 * never cached.
 */
export async function readResendEmails(now: Date): Promise<ResendRead> {
  if (!getResendClient()) return { kind: "not_configured" };
  const bucket = Math.floor(now.getTime() / (PANEL_CACHE_SECONDS * 1000));
  try {
    const data = await unstable_cache(() => fetchResendEmails(now.getTime()), ["admin-panel-resend", String(bucket)], {
      revalidate: PANEL_CACHE_SECONDS,
      tags: [PANEL_CACHE_TAG]
    })();
    return { kind: "ready", ...data };
  } catch (error) {
    if (error instanceof ResendReadFailure) return { kind: error.kind };
    console.error("[geo:admin] panel could not list Resend emails", {
      message: error instanceof Error ? error.message : "unknown"
    });
    return { kind: "error" };
  }
}

async function fetchResendEmails(nowMs: number): Promise<Omit<Extract<ResendRead, { kind: "ready" }>, "kind">> {
  const resend = getResendClient();
  if (!resend) throw new ResendReadFailure("error");
  const since = nowMs - RESEND_RETENTION_DAYS * DAY_MS;
  const emails: ResendEmail[] = [];
  let after: string | undefined;
  let truncated = false;
  for (let page = 0; ; page += 1) {
    if (page >= RESEND_PAGE_CAP) {
      truncated = true;
      break;
    }
    if (page > 0) await sleep(RESEND_PAGE_GAP_MS);
    let result = await resend.emails.list(after ? { limit: 100, after } : { limit: 100 });
    if (result.error?.name === "rate_limit_exceeded") {
      await sleep(1100);
      result = await resend.emails.list(after ? { limit: 100, after } : { limit: 100 });
    }
    if (result.error) {
      if (result.error.name === "restricted_api_key") throw new ResendReadFailure("restricted");
      console.error("[geo:admin] panel could not list Resend emails", { name: result.error.name });
      throw new ResendReadFailure("error");
    }
    const data = result.data?.data ?? [];
    let reachedEnd = false;
    for (const item of data) {
      if (Date.parse(item.created_at) < since) {
        reachedEnd = true;
        break;
      }
      emails.push({ to: item.to ?? [], createdAt: item.created_at, lastEvent: item.last_event, subject: item.subject ?? "" });
    }
    if (reachedEnd || !result.data?.has_more || data.length === 0) break;
    after = data[data.length - 1].id;
  }
  return { emails, truncated, domainTracking: await readDomainTracking() };
}

/** Open/click tracking of the sending domain; null when it could not be read. */
async function readDomainTracking(): Promise<{ open: boolean | null; click: boolean | null } | null> {
  const resend = getResendClient();
  if (!resend) return null;
  const fromDomain = getEmailFromAddress().match(/@([^>\s]+)/)?.[1]?.toLowerCase();
  if (!fromDomain) return null;
  try {
    const { data, error } = await resend.domains.list();
    if (error || !data) return null;
    const domain = data.data.find((d) => d.name.toLowerCase() === fromDomain);
    if (!domain) return null;
    return { open: domain.open_tracking ?? null, click: domain.click_tracking ?? null };
  } catch {
    return null;
  }
}

export async function loadEmailSection(input: {
  service: ServiceClient;
  window: PanelWindow;
  now: Date;
  /** Counted accounts (`isCountedAccount`), or null when they could not be read. */
  users: AdminUserRow[] | null;
  authUsersTruncated: boolean;
  resend: Promise<ResendRead>;
}): Promise<EmailSection> {
  const { service, window, now } = input;
  if (!input.users) return { kind: "error" };
  const users: ContactUser[] = input.users.map((u) => ({ id: u.id, email: u.email, createdAt: u.createdAt }));
  const ids = users.map((u) => u.id);

  const [prefEvents, lifecycleSubscribed, sends, resend] = await Promise.all([
    readPrefEvents(service, ids, new Date(Math.min(window.prevFrom.getTime(), now.getTime() - 28 * DAY_MS))),
    readLifecycleSubscribed(service, ids),
    readSends(service, ids, new Date(now.getTime() - RESEND_RETENTION_DAYS * DAY_MS - DAY_MS)),
    input.resend
  ]);

  let sending: Extract<EmailSection, { kind: "ready" }>["sending"];
  if (resend.kind !== "ready") {
    sending = resend;
  } else {
    sending = {
      kind: "ready",
      truncated: resend.truncated,
      ...buildSending({
        emails: resend.emails,
        users,
        sends: sends ?? [],
        window,
        now,
        domainTracking: resend.domainTracking
      })
    };
  }

  return {
    kind: "ready",
    contacts: buildContacts({ users, unsubscribes: prefEvents, window, now }),
    lifecycleSubscribed,
    unsubscribes: prefEvents ? buildUnsubscribes(prefEvents, window) : null,
    sending,
    authUsersTruncated: input.authUsersTruncated
  };
}

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += ID_CHUNK) out.push(list.slice(i, i + ID_CHUNK));
  return out;
}

/** Preference changes of counted accounts since `since`; null when unreadable. */
async function readPrefEvents(service: ServiceClient, ids: string[], since: Date): Promise<PrefEvent[] | null> {
  const out: PrefEvent[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await service
      .from("email_preference_events")
      .select("owner_user_id, category, enabled, source, created_at")
      .in("owner_user_id", part)
      .gte("created_at", since.toISOString());
    if (error) return null;
    for (const row of data ?? []) {
      out.push({
        ownerId: row.owner_user_id as string,
        category: row.category as string,
        enabled: Boolean(row.enabled),
        source: row.source as string,
        createdAt: row.created_at as string
      });
    }
  }
  return out;
}

/** Counted accounts that still get «Consejos, novedades y ofertas»; null when unreadable. */
async function readLifecycleSubscribed(service: ServiceClient, ids: string[]): Promise<number | null> {
  let count = 0;
  for (const part of chunks(ids)) {
    const { data, error } = await service.from("profiles").select("id, notify_lifecycle").in("id", part);
    if (error) return null;
    count += (data ?? []).filter((row) => row.notify_lifecycle !== false).length;
  }
  return count;
}

/** `email_sends` rows of counted accounts, to name the lifecycle emails; null when unreadable. */
async function readSends(service: ServiceClient, ids: string[], since: Date): Promise<SendRecord[] | null> {
  const out: SendRecord[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await service
      .from("email_sends")
      .select("owner_user_id, kind, sent_at")
      .in("owner_user_id", part)
      .gte("sent_at", since.toISOString());
    if (error) return null;
    for (const row of data ?? []) {
      out.push({ ownerId: row.owner_user_id as string, kind: row.kind as string, sentAt: row.sent_at as string });
    }
  }
  return out;
}
