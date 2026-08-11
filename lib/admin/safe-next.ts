/**
 * `next` on `/mfa/challenge?next=...` is attacker-controllable (a crafted
 * link, not just our own `requireOperator()` redirect), so it is validated
 * before ever reaching a real `redirect()` — otherwise a link like
 * `/mfa/challenge?next=https://evil.example` would send a just-authenticated
 * operator session off-site right after they type a real TOTP code.
 * Only a same-origin relative path is accepted; anything else falls back to
 * `/admin`.
 */
export function safeAdminNext(value: string | null | undefined): string {
  if (!value) return "/admin";
  if (!value.startsWith("/") || value.startsWith("//")) return "/admin";
  return value;
}
