import "server-only";

import { isInternalTestAccountEmail } from "@/lib/projects/internal-test-accounts";

/**
 * Cheap column defaults so the first-scan mission can be exercised end to end
 * without paying for it. Since PROJECT-DEFAULTS-BY-ACCOUNT-1 these reach only
 * the internal test accounts (`newProjectDefaults` below), and still only
 * outside production — both gates apply, in that order.
 *
 * Why this exists: the mission's audit half (the band, and the re-entry beat
 * on Auditoría web) needs a `web_audit` job, and `enqueueWebAuditJob` only
 * creates one when the project has the audit switched on. WEB-AUDIT-AUTO-SPLIT-1
 * (log §52) made both halves default to `false` — a deliberate cost decision —
 * so every new domain is born unable to show that half of the mission. And the
 * switch lives in `/debug`, which cannot be reached before the project exists:
 * by the time it can be flipped, the scan has finished and the auto-audit
 * moment has passed. The founder burned several real scans on that loop
 * (2026-08-11) before we found it.
 *
 * Gated on `VERCEL_ENV` rather than a comment asking someone to remember: this
 * CANNOT reach production even if the branch merges, which is the only version
 * of "temporary" that is actually true.
 *
 * - **Technical audit on, coverage off.** The technical half spends no LLM at
 *   all (ADR 0035) and is what the re-entry beat narrates — the sixteen checks.
 *   Coverage is grounded Gemini calls, one per active prompt, so it stays off:
 *   the point of this is to make testing cheap, not to move the bill.
 * - **Gemini only.** One engine instead of three cuts a test scan's LLM cost to
 *   a third.
 */
function previewTestingDefaults(): Record<string, boolean> {
  // Allow-list, not a deny-list, and the direction matters. Written as "if
  // production, do nothing" it failed OPEN: an unset or renamed `VERCEL_ENV`
  // would have handed production the cheap defaults — the one environment the
  // founder was explicit about ("en main nada de lo de probar barato",
  // 2026-08-11). Now anything that is not demonstrably a preview or a local
  // dev server behaves exactly like production.
  const env = process.env.VERCEL_ENV;
  if (env !== "preview" && env !== "development") return {};

  return {
    auto_technical_audit_enabled: true,
    auto_coverage_audit_enabled: false,
    engine_gemini_enabled: true,
    engine_claude_enabled: false,
    engine_openai_enabled: false
  };
}

/**
 * PROJECT-DEFAULTS-BY-ACCOUNT-1 (founder-approved 2026-08-25) — the column
 * defaults a real customer account's new domain is born with.
 *
 * `sampling_enabled` (0032), `auto_coverage_audit_enabled` and
 * `auto_technical_audit_enabled` (0031) all default to `false` in the schema
 * on purpose: those migrations were written pre-launch, when the stated need
 * was cheap internal test scans and the product had no paying customers whose
 * score reliability the schema default could silently degrade — a question
 * each migration's own comment left open "for whenever real customers
 * arrive". This is that revisit, scoped to account creation only: it does not
 * touch any project that already exists.
 *
 * **`engine_*_enabled` IS set here, even though 0033 already defaults all
 * three to `true`.** Being explicit is what makes this function the single
 * answer to "what does a real account's project start with", instead of an
 * answer that is only complete once you have also read the schema and
 * whatever else might narrow it — which is exactly how the founder ended up
 * looking at Claude and OpenAI switched off on a brand-new domain
 * (2026-08-27, see `newProjectDefaults`).
 */
function productionDefaultsForAccount(): Record<string, boolean> {
  return {
    sampling_enabled: true,
    auto_coverage_audit_enabled: true,
    auto_technical_audit_enabled: true,
    engine_gemini_enabled: true,
    engine_claude_enabled: true,
    engine_openai_enabled: true
  };
}

/**
 * Which set of defaults a new domain gets, decided by WHO owns it — never by
 * which deployment it was created on.
 *
 * The first version of this got the precedence backwards: `previewTestingDefaults`
 * won on any preview, for anyone. The founder created a fresh account on a
 * preview, scanned a new domain, and found Cobertura, Suelo de muestreo,
 * Claude and OpenAI all switched off (2026-08-27) — the cheap-testing set,
 * exactly as coded, and exactly not what this phase is for. Two things were
 * wrong with that: the preview is where this phase gets verified before the
 * Human Gate, so the environment gate made the change unverifiable; and a
 * real account is a real account whatever host it was created on.
 *
 * So the fork is the account, not the environment. Cheap testing survives
 * where it was always aimed — the internal test accounts
 * (`INTERNAL_TEST_ACCOUNT_EMAILS`) — and it still cannot reach production,
 * because `previewTestingDefaults` keeps its own `VERCEL_ENV` guard. That
 * preserves the founder's 2026-08-11 rule ("en main nada de lo de probar
 * barato") while removing the part that silently overrode this phase.
 *
 * Lives here rather than in `app/dashboard/projects/actions.ts` because that
 * file is `"use server"`, where every export must be an async server action —
 * so these could not be exported, and therefore could not be tested. That is
 * not incidental to the bug above: it shipped precisely because nothing could
 * assert on it.
 */
export function newProjectDefaults(email: string | null | undefined): Record<string, boolean> {
  if (isInternalTestAccountEmail(email)) return previewTestingDefaults();
  return productionDefaultsForAccount();
}
