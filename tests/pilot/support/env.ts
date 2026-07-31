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
 * Redact anything secret-shaped before it can reach a log line, a Playwright
 * report, or a PR comment. The pilot's output is published to GitHub, so this
 * is the last line of defence against leaking the pilot account's password.
 */
export function redact(text: string): string {
  const password = process.env.PILOT_PASSWORD;
  const email = process.env.PILOT_EMAIL;
  let safe = text;
  if (password) safe = safe.split(password).join("«redacted-password»");
  if (email) safe = safe.split(email).join("«redacted-email»");
  return safe;
}
