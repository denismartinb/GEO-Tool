/**
 * MAIL-METRICS-1 (log §419). Every email this codebase sends carries one of
 * these as a Resend tag (`kind`), so delivery, opens and clicks can be read
 * per email type from the webhook (`app/api/webhooks/resend`) instead of
 * guessed from the subject.
 *
 * Names reuse the `email_sends.kind` value where one exists, so the two
 * tables join on the same word. Operator-only emails start with `ops_`,
 * which is how the panel leaves them out of customer figures.
 *
 * A Resend tag value only accepts ASCII letters, numbers, `_` and `-`
 * (`tests` check the list). Adding a kind is a code change, never a guess at
 * read time: the webhook stores an unknown tag value as `null`.
 */
export const EMAIL_KINDS = [
  // Account and billing
  "welcome",
  "plan_confirmed",
  "payment_failed",
  "trial_ended_plain",
  "cancellation_scheduled",
  "account_deleted",
  // Monitoring
  "score_drop",
  "weekly_digest",
  // Pro trial sequence and win-back (same names as email_sends)
  "first_scan",
  "trial_d1",
  "trial_d3",
  "trial_d5",
  "trial_ended",
  "trial_ended_late",
  "winback_d3",
  "winback_d10",
  // Feature emails (same names as email_sends)
  "feature_gsc",
  "feature_extension",
  "feature_agentic",
  // Replies to people who asked for something on the public site
  "free_report_confirmation",
  "demo_confirmation",
  "affiliate_confirmation",
  // Operator only
  "ops_free_report",
  "ops_demo",
  "ops_affiliate",
  "ops_affiliate_report",
  "ops_affiliate_report_failure",
  "ops_web_audit_failed",
  "ops_scan_health",
  "ops_llm_incident",
  "ops_new_signup",
  "ops_automation_change",
  "ops_sweep_health",
  "ops_chain_rejected",
  "ops_watchdog",
  "ops_seo_tracking"
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number];

const KNOWN = new Set<string>(EMAIL_KINDS);

export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === "string" && KNOWN.has(value);
}

export function isOperatorEmailKind(kind: EmailKind): boolean {
  return kind.startsWith("ops_");
}

/** The tag Resend receives with every send. */
export function emailKindTags(kind: EmailKind): { name: string; value: string }[] {
  return [{ name: "kind", value: kind }];
}
