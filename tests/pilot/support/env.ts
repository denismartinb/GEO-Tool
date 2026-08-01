/**
 * Environment contract for the agentic user pilot.
 *
 * Every value here is injected from outside the repository. Nothing in
 * `tests/pilot/**` may ever hardcode a credential, a project id, or a
 * deployment URL — see `docs/agentic-user-pilot.md`.
 */

export interface PilotEnv {
  baseUrl: string;
  email: string;
  password: string;
  /** Optional. When unset, journeys discover the first project on the account. */
  projectId: string | undefined;
}

class MissingPilotEnvError extends Error {
  constructor(missing: string[]) {
    super(
      `Pilot environment incomplete — missing: ${missing.join(", ")}.\n` +
        "Set these before running the pilot (see docs/agentic-user-pilot.md).\n" +
        "Never commit them and never echo them to stdout."
    );
    this.name = "MissingPilotEnvError";
  }
}

export function readPilotEnv(): PilotEnv {
  const baseUrl = process.env.PILOT_BASE_URL?.trim() ?? "";
  const email = process.env.PILOT_EMAIL?.trim() ?? "";
  const password = process.env.PILOT_PASSWORD ?? "";

  const missing: string[] = [];
  if (!baseUrl) missing.push("PILOT_BASE_URL");
  if (!email) missing.push("PILOT_EMAIL");
  if (!password) missing.push("PILOT_PASSWORD");
  if (missing.length > 0) throw new MissingPilotEnvError(missing);

  return {
    baseUrl,
    email,
    password,
    projectId: process.env.PILOT_PROJECT_ID?.trim() || undefined
  };
}

/**
 * Optional pin for the project the write journeys (UX-PILOT-2a) mutate.
 *
 * When unset, `resolveOrCreateWriteProject` (tests/pilot/support/write-guard.ts)
 * finds the project matching the reserved `PILOT_WRITE_DOMAIN` and creates it
 * if absent. That is a reserved-convention lookup on an exact domain, not the
 * "pick whatever project is first" auto-discovery this harness refuses to do —
 * that could select a real project like `mahou.es`.
 *
 * Set this only to override the convention (e.g. to point the write journeys
 * at a different project temporarily).
 */
export function readPilotWriteProjectIdOverride(): string | undefined {
  return process.env.PILOT_WRITE_PROJECT_ID?.trim() || undefined;
}

/**
 * Substrings shorter than this are not redacted. A 1–5 character "secret" would
 * match inside ordinary words and corrupt the very diagnostics this harness
 * depends on — observed live: a one-character test password turned
 * "deployment" into "deplo«redacted»ment" in a failure message.
 *
 * Real credentials are far longer than this, so nothing meaningful is left
 * exposed. A secret this short is not protectable by string replacement anyway.
 */
const MIN_REDACTABLE_LENGTH = 6;

/**
 * Redact anything secret-shaped before it can reach a log line, a Playwright
 * report, or a PR comment. The pilot's output is published to GitHub, so this
 * is the last line of defence against leaking the pilot account's password.
 */
export function redact(text: string): string {
  const password = process.env.PILOT_PASSWORD;
  const email = process.env.PILOT_EMAIL;
  let safe = text;
  if (password && password.length >= MIN_REDACTABLE_LENGTH) {
    safe = safe.split(password).join("«redacted-password»");
  }
  if (email && email.length >= MIN_REDACTABLE_LENGTH) {
    safe = safe.split(email).join("«redacted-email»");
  }
  return safe;
}
