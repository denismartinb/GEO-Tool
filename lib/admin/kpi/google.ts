import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { SITE_URL } from "@/lib/seo/metadata";
import { loadSearchConsoleOverview, type SearchConsoleOverview } from "@/lib/search-console/load";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * ADMIN-PANEL-1 — genscore.es in Google, read through the same Search Console
 * connection the operator made from their own GenScore project for
 * genscore.es (log §284). Nothing new is connected or stored here.
 *
 * Ids follow `.claude/rules/search-console.md`: the owner is the operator's
 * own session id (from `requireOperator()`), and the project is one that
 * owner owns, found with an owner-filtered query, never taken from the URL.
 */

export type GoogleSection =
  | { kind: "no_project" }
  | { kind: "state"; state: Exclude<SearchConsoleOverview, { kind: "ready" }> }
  | { kind: "ready"; report: Extract<SearchConsoleOverview, { kind: "ready" }>["report"] };

const OWN_DOMAIN = new URL(SITE_URL).hostname.replace(/^www\./, "");

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

export async function loadGoogleSection(service: ServiceClient, operatorUserId: string): Promise<GoogleSection> {
  const { data, error } = await service
    .from("projects")
    .select("id, domain")
    .eq("owner_user_id", operatorUserId)
    .eq("is_archived", false);
  if (error) return { kind: "state", state: { kind: "error", category: "unavailable" } };
  const project = (data ?? []).find((p) => normalizeDomain(String(p.domain ?? "")) === OWN_DOMAIN);
  if (!project) return { kind: "no_project" };
  try {
    const overview = await loadSearchConsoleOverview(project.id as string, operatorUserId, project.domain as string);
    return overview.kind === "ready" ? { kind: "ready", report: overview.report } : { kind: "state", state: overview };
  } catch (err) {
    console.error("[geo:admin] panel could not read Search Console", {
      message: err instanceof Error ? err.name : "unknown"
    });
    return { kind: "state", state: { kind: "error", category: "unavailable" } };
  }
}
