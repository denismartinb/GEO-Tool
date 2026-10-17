/**
 * AGENTIC-COMMERCE-1 — did the site answer our bot with a block or a
 * challenge instead of the page? Pure.
 *
 * We ask as GenScore's own, identified bot (`AUDIT_USER_AGENT`), never
 * pretending to be ChatGPT or Claude. Anti-bot services verify the real
 * agents by IP range or signature, so a spoofed user-agent would not get
 * their answer anyway (`docs/adr/0043`). What this measures, and what the
 * product says, is narrower and true: «your site puts a challenge in front
 * of automated visits».
 */

export type ChallengeInput = {
  status: number;
  /** Lower-cased header names. */
  headers: Record<string, string | undefined>;
  body: string;
};

const CHALLENGE_BODY =
  /just a moment\.\.\.|cf-chl-|challenge-platform|cf_chl_opt|attention required! \| cloudflare|_incapsula_resource|incapsula incident|px-captcha|perimeterx|captcha-delivery\.com|datadome|access denied<\/title>|errors\.edgesuite\.net|verify you are human|verifica que eres (?:una persona|humano)/i;

export function isChallengeResponse(input: ChallengeInput): boolean {
  const mitigated = (input.headers["cf-mitigated"] ?? "").toLowerCase();
  if (mitigated.includes("challenge")) return true;

  const blockedStatus = input.status === 401 || input.status === 403 || input.status === 429 || input.status === 503;
  if (blockedStatus) return true;

  // A 200 that is really an interstitial: small page, challenge markup.
  return input.status >= 200 && input.status < 300 && input.body.length < 40_000 && CHALLENGE_BODY.test(input.body);
}
