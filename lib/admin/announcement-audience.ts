/**
 * EXT-REACH-1 (log §436): who receives a one-off announcement. Pure, so the
 * rules Denis approved are tested without Supabase:
 *
 *  - every account that ever signed up, whatever its plan, including read-only
 *    ones (Denis, 2026-11-02: «toda la base de datos que alguna vez se ha
 *    registrado»);
 *  - never our own, internal or comped accounts;
 *  - never someone who unsubscribed from «consejos, novedades y ofertas»;
 *  - never an address that was not confirmed: it may not be theirs;
 *  - once per account (the claim in `email_sends`);
 *  - not within 48 h of another lifecycle email: those wait for a later press;
 *  - never on a Monday (Madrid), the same rule as the lifecycle emails.
 */

const SPACING_MS = 48 * 60 * 60 * 1000;

export type AnnouncementAccount = {
  id: string;
  email: string | null;
  excluded: boolean;
  optedOut: boolean;
  confirmed: boolean;
  alreadyClaimed: boolean;
  lastLifecycleSentAt: Date | null;
};

export type AnnouncementAudience = {
  ready: Array<{ id: string; email: string }>;
  counts: {
    ready: number;
    waiting: number;
    alreadySent: number;
    optedOut: number;
    unconfirmed: number;
  };
};

export function selectAnnouncementRecipients(accounts: readonly AnnouncementAccount[], now: Date): AnnouncementAudience {
  const ready: Array<{ id: string; email: string }> = [];
  const counts = { ready: 0, waiting: 0, alreadySent: 0, optedOut: 0, unconfirmed: 0 };
  for (const a of accounts) {
    if (a.excluded || !a.email) continue;
    if (a.alreadyClaimed) {
      counts.alreadySent += 1;
      continue;
    }
    if (a.optedOut) {
      counts.optedOut += 1;
      continue;
    }
    if (!a.confirmed) {
      counts.unconfirmed += 1;
      continue;
    }
    if (a.lastLifecycleSentAt && now.getTime() - a.lastLifecycleSentAt.getTime() < SPACING_MS) {
      counts.waiting += 1;
      continue;
    }
    ready.push({ id: a.id, email: a.email });
  }
  counts.ready = ready.length;
  return { ready, counts };
}

const madridWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", weekday: "short" });

/** Lifecycle emails never go out on a Monday; neither does an announcement. */
export function isAnnouncementDay(now: Date): boolean {
  return madridWeekday.format(now) !== "Mon";
}
