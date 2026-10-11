/**
 * SEARCH-SEO-1 Fase 3 (log §283) — incident response, never routine.
 *
 * If GSC_TOKEN_ENCRYPTION_KEY and the database leak together, rotating the
 * key does not help: whoever holds both can already decrypt every refresh
 * token. The response is to revoke every token at Google, which this does,
 * and then delete the rows so every customer is asked to reconnect.
 *
 * Usage (needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the
 * GSC_TOKEN_ENCRYPTION_KEY[_PREVIOUS] in force, in .env.local):
 *   pnpm search-console:revoke-all            (dry run: counts only)
 *   pnpm search-console:revoke-all --confirm  (revokes and deletes)
 *
 * Prints counts only, never a token.
 */

import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvLocal(file = ".env.local"): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const unquoted = raw.replace(/^(['"])(.*)\1$/, "$2");
    if (key && process.env[key] === undefined) process.env[key] = unquoted;
  }
}

async function main() {
  loadDotEnvLocal();
  const confirm = process.argv.includes("--confirm");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local).");

  const { decryptRefreshToken } = await import("../lib/search-console/crypto");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase
    .from("search_console_connections")
    .select("id, project_id, owner_user_id, refresh_token_ciphertext");
  if (error) throw new Error(`Could not read connections (${error.code ?? "unknown"}).`);

  let revoked = 0;
  let undecryptable = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const token = row.refresh_token_ciphertext
      ? decryptRefreshToken(row.refresh_token_ciphertext, row.project_id, row.owner_user_id)?.token
      : null;
    if (!token) {
      undecryptable += 1;
      continue;
    }
    if (!confirm) continue;
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(10_000)
    }).catch(() => null);
    if (response?.ok) revoked += 1;
    else failed += 1;
  }

  if (confirm) {
    const { error: deleteError } = await supabase.from("search_console_connections").delete().not("id", "is", null);
    if (deleteError) throw new Error(`Revoked ${revoked}, but the delete failed (${deleteError.code ?? "unknown"}).`);
  }
  console.log(
    JSON.stringify({ mode: confirm ? "revoked_and_deleted" : "dry_run", rows: data?.length ?? 0, revoked, failed, undecryptable })
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "failed");
  process.exit(1);
});
