import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import type { AgenticCheckResult } from "@/lib/agentic-audit/api-contract";
import { browserReadIsFresh, isAgenticBrowserRead, type AgenticBrowserRead } from "@/lib/agentic-audit/browser-obstacles";
import { isAllowedAuditHost } from "@/lib/web-audit/fetch-page";

/**
 * AGENTS-BROWSER-1 (log §453): which agentic reviews still need the page as a
 * browser paints it, and where the result goes. The page is the one the
 * agentic audit already chose (one per project), so this adds one browser
 * render per project and week to the AI-READ-2 pass, never a crawl.
 *
 * No migration: the read lives in `agentic_audits.result.browser` (jsonb). A
 * new review is a new row, so a fresh read of the same page in an earlier row
 * is carried forward instead of rendering again.
 */

type Service = ReturnType<typeof createServiceClient>;

const TABLE = "agentic_audits";
const WINDOW_MS = 8 * 24 * 60 * 60 * 1000;
const SCAN_LIMIT = 200;

type Row = { id: string; project_id: string; url: string; created_at: string; result: AgenticCheckResult | null };

export type AgenticRenderTarget = {
  id: string;
  projectId: string;
  url: string;
  result: AgenticCheckResult;
  /** A fresh read of the same page in an earlier review: written as is, no render. */
  carry?: AgenticBrowserRead;
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function bareDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

/** Pure: from recent completed reviews (newest first) and live project domains, what to render or carry. */
export function pickAgenticTargets(rows: Row[], domains: Map<string, string>, now: number): AgenticRenderTarget[] {
  const byProject = new Map<string, Row[]>();
  for (const row of rows) {
    if (!row.result || typeof row.result !== "object" || !domains.has(row.project_id)) continue;
    const list = byProject.get(row.project_id) ?? [];
    list.push(row);
    byProject.set(row.project_id, list);
  }
  const out: AgenticRenderTarget[] = [];
  for (const [projectId, list] of byProject) {
    const newest = list[0];
    const result = newest.result as AgenticCheckResult;
    const own = isAgenticBrowserRead(result.browser) ? result.browser : undefined;
    if (browserReadIsFresh(own, now)) continue;
    if (result.found === "none" || !result.pageRead) continue;
    const host = hostOf(newest.url);
    if (!host || !isAllowedAuditHost(host, bareDomain(domains.get(projectId) ?? ""))) continue;
    const earlier = list
      .slice(1)
      .map((r) => (r.url === newest.url && isAgenticBrowserRead(r.result?.browser) ? r.result?.browser : undefined))
      .find((b): b is AgenticBrowserRead => Boolean(b) && browserReadIsFresh(b, now));
    out.push({ id: newest.id, projectId, url: newest.url, result, ...(earlier ? { carry: earlier } : {}) });
  }
  return out;
}

export async function loadAgenticTargets(service: Service, now: number): Promise<AgenticRenderTarget[]> {
  const { data, error } = await service
    .from(TABLE)
    .select("id, project_id, url, created_at, result")
    .eq("status", "completed")
    .gte("created_at", new Date(now - WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);
  if (error || !Array.isArray(data)) return [];
  const rows = (data as Row[]).filter((r) => r && typeof r.id === "string" && typeof r.url === "string");
  if (rows.length === 0) return [];
  const { data: live } = await service
    .from("projects")
    .select("id, domain")
    .in("id", [...new Set(rows.map((r) => r.project_id))])
    .eq("is_archived", false);
  const domains = new Map(((live ?? []) as Array<{ id: string; domain: string }>).map((p) => [p.id, p.domain]));
  return pickAgenticTargets(rows, domains, now);
}

export async function saveAgenticBrowserRead(service: Service, target: AgenticRenderTarget, read: AgenticBrowserRead): Promise<boolean> {
  const { error } = await service
    .from(TABLE)
    .update({ result: { ...target.result, browser: read } })
    .eq("id", target.id)
    .eq("project_id", target.projectId);
  return !error;
}
