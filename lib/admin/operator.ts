import "server-only";

import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { createClient } from "@/lib/supabase/server";

/**
 * ADMIN-CONSOLE-1 (Task Intake approved 2026-08-11). `/admin` and `/mfa/*`
 * are gated by a UUID allow-list in an env var, never by email or by a
 * database column: the email on `profiles`/`auth.users` is the one field a
 * user can change themselves from Ajustes, and a service-role RLS bypass or
 * SQL injection can't grant a privilege that lives in no table at all. The
 * UUID is `auth.users.id`, immutable, read from the caller's own verified
 * session — never from anything the client sends.
 *
 * `ADMIN_USER_IDS` is a comma-separated list of `auth.users.id` UUIDs, so
 * the same code works if a second operator is ever added without a schema
 * change. Compared case-insensitively — UUIDs are canonically lowercase but
 * nothing enforces that on how someone pastes one into Vercel.
 */
function operatorIdAllowList(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isOperatorUserId(userId: string): boolean {
  return operatorIdAllowList().has(userId.trim().toLowerCase());
}

type OperatorCandidate = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string | null };
};

/**
 * Session + allow-list only — deliberately weaker than `requireOperator()`.
 * `/mfa/enroll` and `/mfa/challenge` need to be reachable by the operator
 * BEFORE they hold an `aal2` session (that's the whole point of enrolling
 * or completing a challenge), so they gate on this instead of the full
 * check. Every other caller must use `requireOperator()`.
 *
 * Whoever is not on the allow-list gets `notFound()` (404), not a redirect
 * or a 403 — a 403 confirms the route exists and is worth attacking; 404
 * says nothing.
 */
export async function requireOperatorCandidate(): Promise<OperatorCandidate> {
  const { supabase, user } = await requireUser();
  if (!isOperatorUserId(user.id)) notFound();
  return { supabase, user };
}

export type Operator = {
  user: { id: string; email?: string | null };
  /** Service-role client — every privileged read in `/admin` goes through this, and only through `requireOperator()`. */
  service: ReturnType<typeof createServiceClient>;
};

/**
 * Full gate for every `/admin` page and server action: session, allow-list,
 * AND a verified `aal2` (TOTP) session. A stolen password alone is not
 * enough to reach this.
 *
 * Does not 404 an operator who is merely mid-setup — they're already known
 * to be the operator, so there is nothing left to hide from them. Instead
 * it routes them to finish enrolling (no verified TOTP factor yet) or to
 * complete the code challenge (factor exists, session just isn't elevated
 * yet — e.g. it predates enrollment, or predates today's login).
 */
export async function requireOperator(next: string = "/admin"): Promise<Operator> {
  const { supabase, user } = await requireOperatorCandidate();

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") {
    return { user, service: createServiceClient() };
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerifiedTotp = (factors?.totp ?? []).some((factor) => factor.status === "verified");

  redirect(hasVerifiedTotp ? `/mfa/challenge?next=${encodeURIComponent(next)}` : "/mfa/enroll");
}
