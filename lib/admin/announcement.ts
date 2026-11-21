import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { isCountedAccount } from "@/lib/admin/kpi/own-accounts";
import { LIFECYCLE_SPACED_KINDS } from "@/lib/email/lifecycle/schedule";
import { isExcludedAccount, latestSentAt, sendClaimedOnce } from "@/lib/email/lifecycle/runner";
import { extensionLaunchEmailParts, sendFeatureEmail } from "@/lib/email/lifecycle/feature-templates";
import { isAnnouncementDay, selectAnnouncementRecipients, type AnnouncementAudience } from "@/lib/admin/announcement-audience";

/**
 * EXT-REACH-1 (log §436): the one-off announcement of the Chrome extension,
 * sent by the operator from /admin/crm in batches. Who gets it is decided by
 * `selectAnnouncementRecipients` (pure, tested); this module only reads and
 * sends. Every send claims `feature_extension` in `email_sends` first
 * (`sendClaimedOnce`), so pressing twice, two operators or the automatic
 * feature email can never send it twice to the same account.
 */

type Service = ReturnType<typeof createServiceClient>;

export const ANNOUNCEMENT_CLAIM_KIND = "feature_extension";
export const ANNOUNCEMENT_LABEL = "Extensión de Chrome";
/** Sends per press: well inside the action's time and Resend's rate limit. */
export const ANNOUNCEMENT_BATCH = 25;
const AUTH_USERS_PAGE = 1000;
const BATCH_BUDGET_MS = 40_000;

export type AnnouncementRead = { ok: true; audience: AnnouncementAudience; authTruncated: boolean } | { ok: false };

export async function loadAnnouncementAudience(service: Service, now: Date): Promise<AnnouncementRead> {
  const [profilesResult, sendsResult, authResult] = await Promise.all([
    service.from("profiles").select("id, email, notify_lifecycle"),
    service.from("email_sends").select("owner_user_id, kind, sent_at"),
    service.auth.admin.listUsers({ page: 1, perPage: AUTH_USERS_PAGE })
  ]);
  if (profilesResult.error || sendsResult.error || authResult.error) {
    console.error("[geo:admin] announcement audience unreadable", {
      message: (profilesResult.error ?? sendsResult.error ?? authResult.error)?.message
    });
    return { ok: false };
  }

  const authUsers = authResult.data.users ?? [];
  const confirmed = new Set(authUsers.filter((u) => Boolean(u.email_confirmed_at)).map((u) => u.id));
  const sends = (sendsResult.data ?? []) as Array<{ owner_user_id: string; kind: string; sent_at: string }>;
  const sendsByOwner = new Map<string, typeof sends>();
  for (const row of sends) {
    const list = sendsByOwner.get(row.owner_user_id) ?? [];
    list.push(row);
    sendsByOwner.set(row.owner_user_id, list);
  }

  const accounts = ((profilesResult.data ?? []) as Array<{ id: string; email: string | null; notify_lifecycle: boolean | null }>).map(
    (p) => {
      const own = sendsByOwner.get(p.id) ?? [];
      return {
        id: p.id,
        email: p.email,
        excluded: !p.email || isExcludedAccount(p.email) || !isCountedAccount({ id: p.id, email: p.email }),
        optedOut: p.notify_lifecycle === false,
        confirmed: confirmed.has(p.id),
        alreadyClaimed: own.some((row) => row.kind === ANNOUNCEMENT_CLAIM_KIND),
        lastLifecycleSentAt: latestSentAt(own, LIFECYCLE_SPACED_KINDS)
      };
    }
  );

  return {
    ok: true,
    audience: selectAnnouncementRecipients(accounts, now),
    authTruncated: authUsers.length >= AUTH_USERS_PAGE
  };
}

export type BatchResult =
  | { status: "monday" }
  | { status: "unreadable" }
  | { status: "ok"; sent: number; failed: number; remaining: number };

export async function sendAnnouncementBatch(service: Service, now: Date = new Date()): Promise<BatchResult> {
  if (!isAnnouncementDay(now)) return { status: "monday" };
  const read = await loadAnnouncementAudience(service, now);
  if (!read.ok) return { status: "unreadable" };

  const parts = extensionLaunchEmailParts();
  const deadline = Date.now() + BATCH_BUDGET_MS;
  const batch = read.audience.ready.slice(0, ANNOUNCEMENT_BATCH);
  let sent = 0;
  let failed = 0;
  for (const account of batch) {
    if (Date.now() > deadline) break;
    try {
      const result = await sendClaimedOnce(service, account.id, ANNOUNCEMENT_CLAIM_KIND, async () => (options) =>
        sendFeatureEmail(account.email, account.id, parts, options)
      );
      if (result === "sent") sent += 1;
      else if (result === "failed") failed += 1;
    } catch (error) {
      failed += 1;
      console.error("[geo:admin] announcement send failed", { message: error instanceof Error ? error.message : "unknown" });
    }
  }
  return { status: "ok", sent, failed, remaining: Math.max(0, read.audience.ready.length - sent) };
}

/** A copy to the operator's own inbox, without claiming anything. */
export async function sendAnnouncementTest(to: string, userId: string) {
  return sendFeatureEmail(to, userId, extensionLaunchEmailParts());
}
