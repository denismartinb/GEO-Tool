import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { createServiceClient } from "@/lib/supabase/service";
import { SITE_URL } from "@/lib/seo/metadata";
import { PREFERENCE_COLUMN, type OptionalEmailCategory } from "@/lib/email/categories";

/**
 * EMAIL-UNSUB-1 (log §232). One-click unsubscribe without logging in.
 *
 * An email link carries `(u, c, t)`: the account id, the category and an
 * HMAC-SHA256 of both under `EMAIL_UNSUBSCRIBE_SECRET`. The token is the
 * identity: whoever holds the link can change ONE preference column of ONE
 * account, which is exactly what the person who received the email is
 * entitled to do. There is no token table and no expiry on purpose — a link
 * in an email from six months ago must still work (Gmail and the LSSI both
 * expect that), and a token that cannot be forged needs neither.
 *
 * Versioned (`v1:`) so the scheme can change without breaking old links: a
 * new version would verify both.
 *
 * Without the secret nothing here signs, so no email carries an unsubscribe
 * link, and `sendEmail` refuses to send the `lifecycle` category at all —
 * never a commercial email without a working way out.
 */

const TOKEN_VERSION = "v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getUnsubscribeSecret(): string | null {
  const raw = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  return raw ? raw : null;
}

export function isUnsubscribeConfigured(): boolean {
  return getUnsubscribeSecret() !== null;
}

function sign(secret: string, userId: string, category: OptionalEmailCategory): string {
  return createHmac("sha256", secret).update(`${TOKEN_VERSION}:${userId}:${category}`, "utf8").digest("base64url");
}

/** Same constant-time shape as `lib/api/internal-auth.ts`: hash both sides so length never leaks. */
function secureEquals(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

export function signUnsubscribeToken(userId: string, category: OptionalEmailCategory): string | null {
  const secret = getUnsubscribeSecret();
  if (!secret || !UUID_PATTERN.test(userId)) return null;
  return sign(secret, userId, category);
}

/**
 * The identity check for every no-session write in this feature. `false` for
 * anything malformed, for a missing secret and for a token that does not
 * match — never an exception, so a hostile link can only ever get a refusal.
 */
export function verifyUnsubscribeToken(input: {
  userId: unknown;
  category: OptionalEmailCategory;
  token: unknown;
}): boolean {
  const secret = getUnsubscribeSecret();
  if (!secret) return false;
  if (typeof input.userId !== "string" || !UUID_PATTERN.test(input.userId)) return false;
  if (typeof input.token !== "string" || input.token.length === 0 || input.token.length > 128) return false;
  return secureEquals(sign(secret, input.userId, input.category), input.token);
}

export type UnsubscribeLinks = {
  /** The page a person lands on from the footer link: asks to confirm. */
  pageUrl: string;
  /** RFC 8058 target for `List-Unsubscribe` + `List-Unsubscribe-Post`: applies on POST. */
  oneClickUrl: string;
};

export function buildUnsubscribeLinks(userId: string, category: OptionalEmailCategory): UnsubscribeLinks | null {
  const token = signUnsubscribeToken(userId, category);
  if (!token) return null;
  const query = new URLSearchParams({ u: userId, c: category, t: token }).toString();
  return {
    pageUrl: `${SITE_URL}/baja?${query}`,
    oneClickUrl: `${SITE_URL}/api/email/unsubscribe?${query}`
  };
}

export type EmailPreferenceSource = "settings" | "email_link" | "one_click";

/**
 * Writes one preference and its audit row. Only ever called after
 * `verifyUnsubscribeToken` (email paths, service role) — the settings screen
 * writes through the user's own session instead. The flag is what stops the
 * next email, so it is written first and its failure is the result; a failed
 * audit row is logged but does not undo an opt-out the person asked for.
 */
export async function setEmailPreferenceAsService(
  service: ReturnType<typeof createServiceClient>,
  input: { userId: string; category: OptionalEmailCategory; enabled: boolean; source: EmailPreferenceSource }
): Promise<{ ok: true } | { ok: false }> {
  const column = PREFERENCE_COLUMN[input.category];
  const { error } = await service.from("profiles").update({ [column]: input.enabled }).eq("id", input.userId);
  if (error) {
    console.error("[geo:email:unsubscribe] preference update failed", { category: input.category, message: error.message });
    return { ok: false };
  }

  const { error: eventError } = await service.from("email_preference_events").insert({
    owner_user_id: input.userId,
    category: input.category,
    enabled: input.enabled,
    source: input.source
  });
  if (eventError) {
    console.error("[geo:email:unsubscribe] audit row insert failed", { category: input.category, message: eventError.message });
  }

  return { ok: true };
}
