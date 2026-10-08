import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * CONTRACT-99 B2 (log §237) — the account prompt pool, enforced in ONE place.
 *
 * Every path of the APPLICATION that writes `project_prompts` goes through here, so
 * the account-wide cap is checked and the rows inserted in the same transaction by
 * `public.add_project_prompts` (migration 0039), under a per-account lock. This is
 * NOT a guarantee about the data: RLS (`prompts_insert_owner`, `prompts_update_owner`)
 * still lets an owner insert or re-activate prompts through the REST API, and that
 * is a separate change that needs its own approval (log §237).
 * Before this, three paths each did a read followed by a write (or no check at
 * all), which is a race by construction: see `scripts/verify-prompt-pool-sql.sh`,
 * where the same twelve concurrent writers push the old pattern to 120 prompts
 * against a cap of 75 and the function never past 70.
 *
 * FAILS CLOSED. The function is a service-role-only RPC, so a missing migration,
 * a missing service key or any transport error means NO prompt is written — never
 * "write it unchecked". The caller turns `unavailable` into its own safe error.
 */
export type PoolPromptRow = {
  prompt_text: string;
  category: string | null;
  sort_order?: number;
};

export type AddToPoolResult =
  | { ok: true; inserted: number; ids: string[] }
  | { ok: false; reason: "pool_full"; remaining: number; cap: number }
  | { ok: false; reason: "project_not_found" | "invalid" | "unavailable" };

type Service = ReturnType<typeof createServiceClient>;

/** `project_prompts.prompts_text_len_chk` (migration 0001). */
const MIN_PROMPT_TEXT_LENGTH = 10;
const MAX_PROMPT_TEXT_LENGTH = 3000;

export async function addPromptsToPool(input: {
  ownerId: string;
  projectId: string;
  /** The owner's EFFECTIVE plan cap, computed by the caller (trial expiry, comped…). */
  cap: number;
  rows: PoolPromptRow[];
  /** Injected in tests; otherwise the service client. */
  service?: Service;
}): Promise<AddToPoolResult> {
  if (!input.rows.length) return { ok: true, inserted: 0, ids: [] };

  // Mirror the table's own CHECK (10-3000 characters) and the integer column, so
  // a malformed row is reported as `invalid` instead of surfacing as a database
  // error that reads like "the pool is unavailable".
  const malformed = input.rows.some(
    (row) =>
      row.prompt_text.length < MIN_PROMPT_TEXT_LENGTH ||
      row.prompt_text.length > MAX_PROMPT_TEXT_LENGTH ||
      (row.sort_order !== undefined && !Number.isInteger(row.sort_order))
  );
  if (malformed) return { ok: false, reason: "invalid" };

  let service: Service;
  try {
    service = input.service ?? createServiceClient();
  } catch (configError) {
    console.error("[geo:prompt-pool] service client unavailable, writing no prompts", {
      message: configError instanceof Error ? configError.message : String(configError)
    });
    return { ok: false, reason: "unavailable" };
  }

  const { data, error } = await service.rpc("add_project_prompts", {
    p_owner: input.ownerId,
    p_project: input.projectId,
    p_cap: input.cap,
    p_rows: input.rows.map((row) => ({
      prompt_text: row.prompt_text,
      category: row.category ?? "",
      sort_order: row.sort_order ?? 0
    }))
  });

  if (error) {
    // The cap enforced INSIDE the database (proposal B's row trigger, which derives the cap from the
    // owner's plan) can be tighter than the one the caller computed, e.g. a comped account without an
    // override row. That is a full pool, not an outage, and must read as one.
    if (error.code === "23514" && /prompt_pool_full/.test(error.message ?? "")) {
      return { ok: false, reason: "pool_full", remaining: 0, cap: input.cap };
    }
    // 42883 / PGRST202: the function is not there (migration 0039 not applied).
    console.error("[geo:prompt-pool] add_project_prompts failed, writing no prompts", {
      code: error.code,
      message: error.message
    });
    return { ok: false, reason: "unavailable" };
  }

  const answer = data as Record<string, unknown> | null;
  if (answer?.ok === true && Array.isArray(answer.ids)) {
    return { ok: true, inserted: answer.ids.length, ids: answer.ids.map(String) };
  }
  if (answer?.ok === false && answer.reason === "pool_full") {
    return {
      ok: false,
      reason: "pool_full",
      remaining: Number(answer.remaining ?? 0),
      cap: Number(answer.cap ?? input.cap)
    };
  }
  if (answer?.ok === false && (answer.reason === "project_not_found" || answer.reason === "invalid")) {
    return { ok: false, reason: answer.reason };
  }

  console.error("[geo:prompt-pool] unexpected answer from add_project_prompts", { answer });
  return { ok: false, reason: "unavailable" };
}

/**
 * Prompts still free in the account's pool, as a HINT used to trim a batch before
 * asking. It is a plain read, so it can be stale by the time the write happens —
 * which is why the write is the authority and this is only a courtesy. `null`
 * means "unknown": the caller must not trim, and the function still decides.
 */
export async function remainingPoolHint(
  supabase: { from: (table: string) => unknown },
  cap: number
): Promise<number | null> {
  const query = (supabase.from("project_prompts") as {
    select: (cols: string, opts: { count: "exact"; head: true }) => {
      eq: (column: string, value: boolean) => Promise<{ count: number | null; error: unknown }>;
    };
  }).select("id", { count: "exact", head: true });
  const { count, error } = await query.eq("is_active", true);
  if (error || count === null) return null;
  return Math.max(0, cap - count);
}
