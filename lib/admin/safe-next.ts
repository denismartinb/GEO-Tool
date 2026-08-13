/**
 * `next` on `/mfa/challenge?next=...` is attacker-controllable (a crafted
 * link, not just our own `requireOperator()` redirect), so it is validated
 * before ever reaching a real `redirect()` — otherwise a link like
 * `/mfa/challenge?next=https://evil.example` would send a just-authenticated
 * operator session off-site right after they type a real TOTP code. Only a
 * same-origin absolute path is accepted; anything else falls back to `/admin`.
 *
 * VALIDATED WITH A URL PARSER, NOT WITH STRING PREFIXES, and that is the whole
 * point of this function. The first implementation checked
 * `startsWith("/") && !startsWith("//")`, which looks airtight and is not:
 * browsers follow the WHATWG URL spec, where a backslash after the leading
 * slash is treated as a slash, so `/\evil.example/steal` passed that check and
 * still resolved to the host `evil.example` (caught by the `qa` agent on
 * PR #387 before merge; verified end-to-end). The same class of bypass covers
 * tabs and newlines, which the parser strips before resolving. Anything that
 * hand-rolls the rules the browser applies will keep losing this race — so we
 * resolve the candidate against a fixed sentinel origin and demand the result
 * still live there.
 *
 * The sentinel uses the reserved `.invalid` TLD (RFC 2606): it can never be a
 * real host, so it cannot collide with a legitimate destination.
 */
const SENTINEL_ORIGIN = "https://same-origin-check.invalid";

export function safeAdminNext(value: string | null | undefined): string {
  if (!value) return "/admin";

  // Keeps the contract narrow: only absolute in-app paths, never a relative
  // one like "admin/users" (which would resolve against whatever page it was
  // used from). Redundant with the origin check below for the attacks above,
  // deliberately kept as the explicit statement of what shape is allowed.
  if (!value.startsWith("/")) return "/admin";

  let resolved: URL;
  try {
    resolved = new URL(value, SENTINEL_ORIGIN);
  } catch {
    return "/admin";
  }

  if (resolved.origin !== SENTINEL_ORIGIN) return "/admin";

  // Rebuilt from the parsed URL rather than returned verbatim, so whatever
  // reaches `redirect()` is the already-normalized path the parser agreed on.
  const candidate = `${resolved.pathname}${resolved.search}${resolved.hash}`;

  // Second pass, and NOT paranoia: `/..//evil.example` resolves to a pathname
  // of `//evil.example`, which sits inside the sentinel origin (so the check
  // above passes) but is protocol-relative on its own and escapes again the
  // moment `redirect()` hands it to a browser resolving against the real
  // origin. Checking the value we are about to RETURN — not just the one we
  // were given — is what closes that. Found by this file's own exhaustive
  // test while fixing the backslash bypass; both are one class of bug.
  try {
    if (new URL(candidate, SENTINEL_ORIGIN).origin !== SENTINEL_ORIGIN) return "/admin";
  } catch {
    return "/admin";
  }

  return candidate;
}
