/**
 * TRIAL-REPORT-EMAIL-1 (log §254). Where to land after signing in, when a
 * link asked for somewhere other than the dashboard (the report link of the
 * last-day trial email goes through `/login?next=/informe/<id>`).
 *
 * Only a path on this same site: it must start with a single "/", and
 * anything a browser could read as another host ("//evil.com", "/\\evil.com")
 * or that carries control characters is refused. A refused or missing value
 * is `null`, and the caller falls back to `/dashboard` — never an open
 * redirect.
 */
const MAX_NEXT_LENGTH = 512;

export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/[\u0000-\u001F\u007F\\]/.test(raw)) return null;
  return raw;
}
