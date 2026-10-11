import "server-only";

import type { AuthenticatedContext } from "@/lib/auth";
import { auditedPagesFromSnapshot } from "@/lib/search-console/audited-pages";
import type { AuditedPage } from "@/lib/search-console/insights";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";

/**
 * Our own data that `loadSearchConsoleScreen` reads next to Google's: the
 * pages of the latest technical audit and the active prompts. «Posición en
 * Google» and Recomendaciones read them the same way, so both pages ask for
 * the same audited URLs and share the 30-minute Google cache (log §289, §293).
 * RLS scopes both reads to the signed-in owner.
 */
export async function readSearchConsoleInputs(
  supabase: AuthenticatedContext["supabase"],
  projectId: string
): Promise<{ auditedPages: AuditedPage[]; trackedPrompts: string[] }> {
  const [{ data: snapshot }, { data: promptRows }] = await Promise.all([
    supabase
      .from("web_audit_snapshots")
      .select("pages")
      .eq("project_id", projectId)
      .not("pages", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("project_prompts").select("prompt_text").eq("project_id", projectId).eq("is_active", true)
  ]);
  return {
    auditedPages: auditedPagesFromSnapshot((snapshot?.pages ?? []) as PageAuditEntry[]),
    trackedPrompts: (promptRows ?? []).map((r) => r.prompt_text).filter((t): t is string => typeof t === "string")
  };
}
