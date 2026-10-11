/**
 * ADMIN-PANEL-1 — our own accounts, by email, that never count in
 * /admin/panel (Denis, 2026-10-11). These are the founder's and the team's
 * test sign-ups: they open checkouts, start trials and run scans, and a funnel
 * that included them would celebrate our own activity.
 *
 * Matched on the local part's prefix, so `denis.martinb+prueba3@gmail.com`
 * counts as the founder too, and on any domain whose first label is
 * `instinct`. Kept apart from `INTERNAL_TEST_ACCOUNT_EMAILS`, which changes
 * product defaults and must stay an exact allow-list.
 */
const EXCLUDED_LOCAL_PREFIXES = ["denislagarteiru", "denis.martinb", "chuchibolu", "arangulina"];
const EXCLUDED_DOMAIN_LABELS = ["instinct"];

export function isPanelExcludedEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return false;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (EXCLUDED_LOCAL_PREFIXES.some((prefix) => local.startsWith(prefix))) return true;
  const firstLabel = domain.split(".")[0];
  return EXCLUDED_DOMAIN_LABELS.includes(firstLabel);
}
