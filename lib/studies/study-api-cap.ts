import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";

/**
 * STUDY-API-1 — daily spend ceiling for the internal study API.
 *
 * The study engine writes nothing, so without this the only bound on an
 * authenticated caller is the per-request input limits: a loop with a valid
 * secret would be unbounded spend. The ceiling reuses `public_checks` (its
 * `engine` column is free text) instead of a new table, so it needs no
 * migration: one row per LLM unit, written BEFORE spending, same rule as the
 * free checker — a call that dies halfway still counts, which is the safe
 * direction. The free checker's counters exclude these rows
 * (`lib/free-checker/rate-limit.ts`).
 *
 * Fails closed: a counting error denies.
 */
export const STUDY_API_ENGINE = "study_api";
export const STUDY_API_DEFAULT_DAILY_CAP = 600;

const DAY_MS = 24 * 60 * 60 * 1000;
const LOG_PREFIX = "[geo:study-api]";

export function studyApiDailyCap(raw = process.env.STUDY_API_DAILY_CAP): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : STUDY_API_DEFAULT_DAILY_CAP;
}

export type StudyApiReservation =
  | { allowed: true; usedToday: number; cap: number }
  | { allowed: false; reason: "daily_cap_reached" | "cap_check_failed"; usedToday?: number; cap: number };

/**
 * Reserves `units` LLM calls against the rolling 24 h ceiling and records
 * them. `label` (the study's domain or sector id) only makes the rows
 * readable in the table; it is not a limit.
 */
export async function reserveStudyApiUnits(
  service: ReturnType<typeof createServiceClient>,
  input: { units: number; label: string },
  deps: { now?: () => number; cap?: number } = {}
): Promise<StudyApiReservation> {
  const cap = deps.cap ?? studyApiDailyCap();
  const nowMs = (deps.now ?? Date.now)();
  const windowStart = new Date(nowMs - DAY_MS).toISOString();

  const { count, error } = await service
    .from("public_checks")
    .select("id", { count: "exact", head: true })
    .gte("created_at", windowStart)
    .eq("engine", STUDY_API_ENGINE);
  if (error) {
    console.error(`${LOG_PREFIX} cap_lookup_failed`);
    return { allowed: false, reason: "cap_check_failed", cap };
  }
  const usedToday = count ?? 0;
  if (usedToday + input.units > cap) {
    console.warn(`${LOG_PREFIX} daily_cap_reached`, { used: usedToday, units: input.units, cap });
    return { allowed: false, reason: "daily_cap_reached", usedToday, cap };
  }

  const rows = Array.from({ length: input.units }, () => ({
    domain: input.label.slice(0, 255),
    ip_hash: STUDY_API_ENGINE,
    status: "pending",
    engine: STUDY_API_ENGINE
  }));
  const { error: insertError } = await service.from("public_checks").insert(rows);
  if (insertError) {
    console.error(`${LOG_PREFIX} reserve_insert_failed`);
    return { allowed: false, reason: "cap_check_failed", cap };
  }
  return { allowed: true, usedToday: usedToday + input.units, cap };
}
