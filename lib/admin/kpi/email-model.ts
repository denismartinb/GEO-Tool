/**
 * ADMIN-EMAIL-1 — the email-capture tab of the operator console (/admin/crm), as pure functions.
 *
 * A contact is a counted account (`isCountedAccount`): today nothing else
 * stores an email (free-report and video-call requests only reach the
 * operator's inbox, and the free checker never writes `public_checks.email`).
 * Unsubscribes come from `email_preference_events` (EMAIL-UNSUB-1, log §232),
 * emails sent from Resend's own list, because `email_sends` only records the
 * lifecycle and feature sequences, not the weekly digest, alerts or billing.
 *
 * No clock and no I/O here: the loader passes `now`, the window and the rows.
 */

import { lastMadridDates, madridDateKey, type PanelWindow } from "@/lib/admin/kpi/period";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Resend keeps every sent email for 30 days on every plan (resend.com/pricing). */
export const RESEND_RETENTION_DAYS = 30;

export type ContactUser = { id: string; email: string; createdAt: string };

export type PrefEvent = {
  ownerId: string;
  category: string;
  enabled: boolean;
  source: string;
  createdAt: string;
};

export type ResendEmail = {
  /** Resend's email id, the key of `email_events` (MAIL-METRICS-1, log §419). */
  id: string;
  to: string[];
  createdAt: string;
  lastEvent: string;
  subject: string;
  /**
   * The `kind` tag the email was sent with, read from `email_events`. Absent
   * for emails sent before the tag existed or when the table is unreadable;
   * they keep being named by `email_sends` and the subject.
   */
  kind?: string | null;
};

export type SendRecord = { ownerId: string; kind: string; sentAt: string };

function inRange(ms: number, from: Date, to: Date): boolean {
  return ms >= from.getTime() && ms < to.getTime();
}

// ── Contacts ────────────────────────────────────────────────────────────────

export type ContactDay = { date: string; total: number; added: number; unsubscribed: number };

export type ContactsView = {
  total: number;
  addedInWindow: number;
  addedPrevious: number;
  /** Last 28 Madrid days: accounts alive today created up to that day, sign-ups and unsubscribes. */
  daily: ContactDay[];
};

export function buildContacts(input: {
  users: ContactUser[];
  unsubscribes: PrefEvent[] | null;
  window: PanelWindow;
  now: Date;
}): ContactsView {
  const { users, window, now } = input;
  const dates = lastMadridDates(now, 28);
  const addedByDate = new Map<string, number>();
  const createdKeys: string[] = [];
  for (const user of users) {
    const key = madridDateKey(new Date(user.createdAt));
    createdKeys.push(key);
    addedByDate.set(key, (addedByDate.get(key) ?? 0) + 1);
  }
  const unsubByDate = new Map<string, number>();
  for (const event of input.unsubscribes ?? []) {
    if (event.enabled) continue;
    const key = madridDateKey(new Date(event.createdAt));
    unsubByDate.set(key, (unsubByDate.get(key) ?? 0) + 1);
  }
  const daily = dates.map((date) => ({
    date,
    total: createdKeys.filter((key) => key <= date).length,
    added: addedByDate.get(date) ?? 0,
    unsubscribed: unsubByDate.get(date) ?? 0
  }));
  return {
    total: users.length,
    addedInWindow: users.filter((u) => inRange(Date.parse(u.createdAt), window.from, window.to)).length,
    addedPrevious: users.filter((u) => inRange(Date.parse(u.createdAt), window.prevFrom, window.prevTo)).length,
    daily
  };
}

// ── Unsubscribes ────────────────────────────────────────────────────────────

/** Same order and names as Ajustes → Notificaciones (`lib/email/categories.ts`). */
export const UNSUB_CATEGORIES = ["lifecycle", "weekly_digest", "score_drop", "first_scan"] as const;
export const UNSUB_SOURCES = ["email_link", "one_click", "settings"] as const;

export type UnsubscribesView = {
  inWindow: number;
  previous: number;
  /** People who switched a category back on inside the window. */
  resubscribed: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
};

/** `events` must already be limited to counted accounts. */
export function buildUnsubscribes(events: PrefEvent[], window: PanelWindow): UnsubscribesView {
  const byCategory: Record<string, number> = Object.fromEntries(UNSUB_CATEGORIES.map((c) => [c, 0]));
  const bySource: Record<string, number> = Object.fromEntries(UNSUB_SOURCES.map((s) => [s, 0]));
  let inWindow = 0;
  let previous = 0;
  let resubscribed = 0;
  for (const event of events) {
    const at = Date.parse(event.createdAt);
    if (inRange(at, window.from, window.to)) {
      if (event.enabled) {
        resubscribed += 1;
        continue;
      }
      inWindow += 1;
      byCategory[event.category] = (byCategory[event.category] ?? 0) + 1;
      bySource[event.source] = (bySource[event.source] ?? 0) + 1;
    } else if (!event.enabled && inRange(at, window.prevFrom, window.prevTo)) {
      previous += 1;
    }
  }
  return { inWindow, previous, resubscribed, byCategory, bySource };
}

// ── Emails sent ─────────────────────────────────────────────────────────────

export type EmailGroup = "trial" | "winback" | "feature" | "digest" | "other";

export const EMAIL_GROUPS: Array<{ id: EmailGroup; label: string; detail: string }> = [
  { id: "trial", label: "Secuencia de la prueba", detail: "primer escaneo, día 1, día 3 y último día" },
  { id: "winback", label: "Recuperación", detail: "fin de prueba, día +3 y día +10" },
  { id: "feature", label: "Funcionalidades", detail: "Search Console, extensión, auditoría agéntica" },
  { id: "digest", label: "Resumen semanal", detail: "" },
  { id: "other", label: "Avisos y cuenta", detail: "caída de puntuación, bienvenida, pagos y el resto" }
];

const KIND_GROUP: Record<string, EmailGroup> = {
  first_scan: "trial",
  trial_d1: "trial",
  trial_d3: "trial",
  trial_d5: "trial",
  trial_ended: "winback",
  trial_ended_late: "winback",
  winback_d3: "winback",
  winback_d10: "winback",
  feature_gsc: "feature",
  feature_extension: "feature",
  feature_agentic: "feature"
};

/** The weekly digest's subject (`sendWeeklyDigestEmail`): the only group read from the subject. */
const DIGEST_SUBJECT = /^Tu resumen semanal de /;

/**
 * How far apart an `email_sends` row and the Resend email it records can be.
 * The runner claims the row right before sending (LIFECYCLE-DEDUPE-1, §311).
 */
export const SEND_MATCH_WINDOW_MS = 15 * 60 * 1000;

const NOT_SENT = new Set(["canceled", "scheduled"]);
const DELIVERED = new Set(["delivered", "opened", "clicked", "complained"]);
const OPENED = new Set(["opened", "clicked"]);
const BOUNCED = new Set(["bounced", "suppressed"]);

export type GroupCounts = { sent: number; delivered: number; opened: number; clicked: number; bounced: number };

export type Tracking = "on" | "off" | "unknown";

export type SendingView = {
  /** Whether Resend still holds the whole window (and the previous one). */
  windowCovered: boolean;
  previousCovered: boolean;
  totals: GroupCounts;
  groups: Array<{ id: EmailGroup; label: string; detail: string } & GroupCounts>;
  /** Emails per contact per week inside the window; null with no contact-time to divide by. */
  perContactWeek: number | null;
  perContactWeekPrevious: number | null;
  tracking: Tracking;
};

function emptyCounts(): GroupCounts {
  return { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
}

/** Sum over contacts of the time each one existed inside [from, to), in weeks. */
export function contactWeeks(users: ContactUser[], from: Date, to: Date): number {
  let ms = 0;
  for (const user of users) {
    const start = Math.max(Date.parse(user.createdAt), from.getTime());
    if (to.getTime() > start) ms += to.getTime() - start;
  }
  return ms / WEEK_MS;
}

/**
 * Each Resend email to a contact, with its group. Its `kind` tag names it when
 * known (MAIL-METRICS-1, log §419). Otherwise an `email_sends` row of the
 * same account within `SEND_MATCH_WINDOW_MS` names it (each row used once,
 * closest first), the digest is known by its subject, the rest is "other".
 */
export function classifyEmails(input: {
  emails: ResendEmail[];
  userIdByEmail: Map<string, string>;
  sends: SendRecord[];
}): Array<{ email: ResendEmail; ownerId: string; group: EmailGroup }> {
  const sendsByOwner = new Map<string, SendRecord[]>();
  for (const send of input.sends) {
    if (!KIND_GROUP[send.kind]) continue;
    const list = sendsByOwner.get(send.ownerId) ?? [];
    list.push(send);
    sendsByOwner.set(send.ownerId, list);
  }
  const used = new Set<SendRecord>();
  const out: Array<{ email: ResendEmail; ownerId: string; group: EmailGroup }> = [];
  for (const email of input.emails) {
    const ownerId = email.to.map((to) => input.userIdByEmail.get(to.trim().toLowerCase())).find(Boolean);
    if (!ownerId) continue;
    let group: EmailGroup = "other";
    if (email.kind) {
      // The tag names the email exactly, and it never takes an `email_sends` row.
      group = email.kind === "weekly_digest" ? "digest" : (KIND_GROUP[email.kind] ?? "other");
    } else if (DIGEST_SUBJECT.test(email.subject)) {
      group = "digest";
    } else {
      const at = Date.parse(email.createdAt);
      let best: SendRecord | null = null;
      let bestGap = Infinity;
      for (const send of sendsByOwner.get(ownerId) ?? []) {
        if (used.has(send)) continue;
        const gap = Math.abs(Date.parse(send.sentAt) - at);
        if (gap <= SEND_MATCH_WINDOW_MS && gap < bestGap) {
          best = send;
          bestGap = gap;
        }
      }
      if (best) {
        used.add(best);
        group = KIND_GROUP[best.kind];
      }
    }
    out.push({ email, ownerId, group });
  }
  return out;
}

export function buildSending(input: {
  emails: ResendEmail[];
  users: ContactUser[];
  sends: SendRecord[];
  window: PanelWindow;
  now: Date;
  /** What the sending domain says about tracking; null when it could not be read. */
  domainTracking: { open: boolean | null; click: boolean | null } | null;
}): SendingView {
  const { window, now } = input;
  const retentionStart = now.getTime() - RESEND_RETENTION_DAYS * DAY_MS;
  const userIdByEmail = new Map(input.users.map((u) => [u.email.trim().toLowerCase(), u.id]));
  const classified = classifyEmails({ emails: input.emails, userIdByEmail, sends: input.sends });

  const totals = emptyCounts();
  const byGroup = new Map<EmailGroup, GroupCounts>(EMAIL_GROUPS.map((g) => [g.id, emptyCounts()]));
  let previousSent = 0;
  let sawOpen = false;
  for (const { email, group } of classified) {
    if (NOT_SENT.has(email.lastEvent)) continue;
    const at = Date.parse(email.createdAt);
    if (OPENED.has(email.lastEvent)) sawOpen = true;
    if (inRange(at, window.prevFrom, window.prevTo)) previousSent += 1;
    if (!inRange(at, window.from, window.to)) continue;
    for (const counts of [totals, byGroup.get(group) as GroupCounts]) {
      counts.sent += 1;
      if (DELIVERED.has(email.lastEvent)) counts.delivered += 1;
      if (OPENED.has(email.lastEvent)) counts.opened += 1;
      if (email.lastEvent === "clicked") counts.clicked += 1;
      if (BOUNCED.has(email.lastEvent)) counts.bounced += 1;
    }
  }

  const windowCovered = window.from.getTime() >= retentionStart;
  const previousCovered = window.prevFrom.getTime() >= retentionStart;
  const weeks = contactWeeks(input.users, window.from, window.to);
  const previousWeeks = contactWeeks(input.users, window.prevFrom, window.prevTo);

  // Opens and clicks exist only with tracking on. An observed open proves it;
  // the domain's own flag can prove it off; anything else stays unknown.
  const flags = input.domainTracking;
  const tracking: Tracking =
    sawOpen || flags?.open === true ? "on" : flags && flags.open === false ? "off" : "unknown";

  return {
    windowCovered,
    previousCovered,
    totals,
    groups: EMAIL_GROUPS.map((g) => ({ ...g, ...(byGroup.get(g.id) as GroupCounts) })),
    perContactWeek: weeks > 0 ? totals.sent / weeks : null,
    perContactWeekPrevious: previousCovered && previousWeeks > 0 ? previousSent / previousWeeks : null,
    tracking
  };
}

/** One decimal, Spanish comma: 1.62 → "1,6". */
export function formatRate(value: number): string {
  return value.toFixed(1).replace(".", ",");
}
