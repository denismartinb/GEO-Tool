import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { GSC_SCOPE, type GscErrorCategory } from "@/lib/search-console/google";

/**
 * SEARCH-SEO-1 Fase 3 (log §284). Reads and writes of
 * `search_console_connections` (migration 0041).
 *
 * Service-role only — the table has RLS and no policy. **Every function takes
 * ids the caller has ALREADY verified** (`requireActiveProject(projectId)` for
 * the project, `requireUser().user.id` for the owner) and filters by BOTH, so
 * nothing here trusts a bare project id. `tests/service-role-identity.test.ts`
 * only scans `app/`; this contract is what keeps the helpers in `lib/` safe.
 *
 * Never selects the ciphertext for display; only `readTokenCiphertext` returns
 * it, to the loader that decrypts it.
 */

export type VerifiedIds = { projectId: string; ownerUserId: string };

export type ConnectionStatus = "active" | "revoked" | "error";

export type ConnectionSummary = {
  property: string | null;
  status: ConnectionStatus;
  lastError: string | null;
  connectedAt: string;
};

export type ConnectionRead =
  | { kind: "unavailable" }
  | { kind: "none" }
  | { kind: "connected"; connection: ConnectionSummary };

const TABLE = "search_console_connections";

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST200";
}

export async function readConnection(ids: VerifiedIds): Promise<ConnectionRead> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("property, status, last_error, connected_at")
    .eq("project_id", ids.projectId)
    .eq("owner_user_id", ids.ownerUserId)
    .maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.warn("[search-console] read_failed", { projectId: ids.projectId });
    return { kind: "unavailable" };
  }
  if (!data) return { kind: "none" };
  return {
    kind: "connected",
    connection: {
      property: data.property,
      status: data.status as ConnectionStatus,
      lastError: data.last_error,
      connectedAt: data.connected_at
    }
  };
}

export async function readTokenCiphertext(ids: VerifiedIds): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("refresh_token_ciphertext")
    .eq("project_id", ids.projectId)
    .eq("owner_user_id", ids.ownerUserId)
    .maybeSingle();
  if (error || !data) return null;
  return data.refresh_token_ciphertext;
}

/**
 * Stores a fresh grant. A row for the same project but another owner cannot
 * exist while ownership never transfers; if it ever did, this refuses rather
 * than overwrite someone else's connection.
 */
export async function saveConnection(ids: VerifiedIds, ciphertext: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data: existing, error: readError } = await supabase
    .from(TABLE)
    .select("owner_user_id")
    .eq("project_id", ids.projectId)
    .maybeSingle();
  if (readError) return false;
  if (existing && existing.owner_user_id !== ids.ownerUserId) return false;

  const row = {
    refresh_token_ciphertext: ciphertext,
    scope: GSC_SCOPE,
    status: "active",
    last_error: null,
    property: null,
    connected_at: new Date().toISOString()
  };
  const { error } = existing
    ? await supabase.from(TABLE).update(row).eq("project_id", ids.projectId).eq("owner_user_id", ids.ownerUserId)
    : await supabase.from(TABLE).insert({ ...row, project_id: ids.projectId, owner_user_id: ids.ownerUserId });
  if (error) console.warn("[search-console] save_failed", { projectId: ids.projectId });
  return !error;
}

export async function saveProperty(ids: VerifiedIds, property: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ property, status: "active", last_error: null })
    .eq("project_id", ids.projectId)
    .eq("owner_user_id", ids.ownerUserId)
    .eq("status", "active")
    .select("id");
  return !error && (data?.length ?? 0) === 1;
}

export async function replaceCiphertext(ids: VerifiedIds, ciphertext: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from(TABLE)
    .update({ refresh_token_ciphertext: ciphertext })
    .eq("project_id", ids.projectId)
    .eq("owner_user_id", ids.ownerUserId);
}

/**
 * A revoked grant keeps no secret: the token is nulled (data-guardian
 * review). A permission error keeps it — access may come back when the
 * customer fixes the property in Search Console.
 */
export async function markConnectionFailed(ids: VerifiedIds, category: GscErrorCategory): Promise<void> {
  const revoked = category === "revoked";
  const supabase = createServiceClient();
  await supabase
    .from(TABLE)
    .update(
      revoked
        ? { status: "revoked", last_error: category, refresh_token_ciphertext: null }
        : { status: "error", last_error: category }
    )
    .eq("project_id", ids.projectId)
    .eq("owner_user_id", ids.ownerUserId);
}

export async function deleteConnection(ids: VerifiedIds): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("project_id", ids.projectId)
    .eq("owner_user_id", ids.ownerUserId);
  return !error;
}
