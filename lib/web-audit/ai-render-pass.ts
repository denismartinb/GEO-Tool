import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { fetchPageSafely, isAllowedAuditHost } from "@/lib/web-audit/fetch-page";
import { compareRender, renderIsFresh, isPageRender, type PageRender } from "@/lib/web-audit/ai-render";
import { BROWSER_RUN_MIN_GAP_MS, browserRunConfigured, renderWithBrowserRun, type BrowserRunOutcome } from "@/lib/web-audit/browser-run";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { readBrowserObstacles, BROWSER_READ_RULES } from "@/lib/agentic-audit/browser-obstacles";
import { loadAgenticTargets, saveAgenticBrowserRead, type AgenticRenderTarget } from "@/lib/agentic-audit/browser-pass";

/**
 * AI-READ-2 (log §451): measures, with a real browser, the pages the latest
 * technical audit of each project already analyzed, and writes the result
 * into that snapshot's `pages` (`PageAuditEntry.render`). No migration: the
 * column is jsonb and every reader treats `render` as optional.
 *
 * Runs at the tail of the run-audit cron (every 10 minutes, pg_cron), only
 * with time left over, and never blocks an audit. The free Browser Run plan
 * allows one request every 10 seconds and 10 browser minutes a day, so a pass
 * measures a few pages and the next pass carries on: anything not reached
 * stays eligible. A quota or config answer stops the pass.
 *
 * AGENTS-BROWSER-1 (log §453): before the audit pages, the product page each
 * project's agentic audit chose is rendered once a week too, and what stands
 * in front of the product goes into that review (`result.browser`). It goes
 * first because it is one render per project, and it shares this pacing.
 */

type Service = ReturnType<typeof createServiceClient>;

const LOG_PREFIX = "[geo:ai-render]";
/** Snapshots older than this are not worth measuring: a newer audit will come. */
const SNAPSHOT_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;
const SNAPSHOT_SCAN_LIMIT = 200;
/** Worst case of one page: the raw fetch plus one browser render. */
const RENDER_TIMEOUT_MS = 25_000;
const PAGE_WORST_MS = RENDER_TIMEOUT_MS + 5_000;

type SnapshotRow = { id: string; project_id: string; pages: PageAuditEntry[]; created_at: string };

export type AiRenderPassResult = {
  skipped?: "not_configured";
  measured: number;
  /** Agentic product pages read (rendered or carried forward). */
  agentic?: number;
  stopped?: "quota" | "config" | "budget";
};

type AgenticDeps = {
  load: () => Promise<AgenticRenderTarget[]>;
  save: (target: AgenticRenderTarget, read: ReturnType<typeof readBrowserObstacles>) => Promise<boolean>;
};

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The next page to measure in a snapshot, home page first, or null. */
export function nextPageToMeasure(pages: PageAuditEntry[], now: Date): number | null {
  let best: number | null = null;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (p.status !== "analyzed") continue;
    if (renderIsFresh(isPageRender(p.render) ? p.render : undefined, now)) continue;
    if (best === null) best = i;
    if (p.contextLabel === "portada") return i;
  }
  return best;
}

export async function runAiRenderPass(input: {
  service: Service;
  deadlineAt: number;
  now?: () => number;
  render?: (url: string, timeoutMs: number) => Promise<BrowserRunOutcome>;
  fetchRaw?: (url: string, domain: string) => Promise<string | null>;
  sleep?: (ms: number) => Promise<void>;
  agentic?: AgenticDeps | false;
}): Promise<AiRenderPassResult> {
  const now = input.now ?? Date.now;
  if (!input.render && !browserRunConfigured()) return { skipped: "not_configured", measured: 0 };
  const render = input.render ?? ((url: string, timeoutMs: number) => renderWithBrowserRun(url, { timeoutMs }));
  const fetchRaw =
    input.fetchRaw ??
    (async (url: string, domain: string) => {
      const r = await fetchPageSafely(url, domain);
      return r.status === "analyzed" ? r.html : null;
    });
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastCallAt = 0;

  let agentic = 0;
  const agenticDeps: AgenticDeps | false =
    input.agentic ?? {
      load: () => loadAgenticTargets(input.service, now()),
      save: (target, read) => saveAgenticBrowserRead(input.service, target, read)
    };
  if (agenticDeps) {
    for (const target of await agenticDeps.load().catch(() => [] as AgenticRenderTarget[])) {
      let read = target.carry;
      if (!read) {
        const wait = lastCallAt ? Math.max(0, lastCallAt + BROWSER_RUN_MIN_GAP_MS - now()) : 0;
        if (now() + wait + PAGE_WORST_MS > input.deadlineAt) return { measured: 0, agentic, stopped: "budget" };
        if (wait) await sleep(wait);
        lastCallAt = now();
        const rendered = await render(target.url, RENDER_TIMEOUT_MS);
        if (rendered.kind === "quota" || rendered.kind === "config") {
          console.info(`${LOG_PREFIX} stopped`, { reason: rendered.kind, agentic });
          return { measured: 0, agentic, stopped: rendered.kind };
        }
        const measuredAt = new Date(now()).toISOString();
        read = rendered.kind === "ok" ? readBrowserObstacles(rendered.html, measuredAt, target.url) : { state: "unmeasured", measuredAt, rules: BROWSER_READ_RULES };
      }
      if (await agenticDeps.save(target, read)) agentic++;
      else console.error(`${LOG_PREFIX} agentic_write_failed`, { project_id: target.projectId });
    }
  }

  const since = new Date(now() - SNAPSHOT_WINDOW_MS).toISOString();
  const { data, error } = await input.service
    .from("web_audit_snapshots")
    .select("id, project_id, pages, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(SNAPSHOT_SCAN_LIMIT);
  if (error || !data) return { measured: 0, agentic };

  // Only each project's newest audit: the next audit carries the measurement forward.
  const latest = new Map<string, SnapshotRow>();
  for (const row of data as SnapshotRow[]) if (!latest.has(row.project_id)) latest.set(row.project_id, row);

  const { data: live } = await input.service
    .from("projects")
    .select("id, domain")
    .in("id", [...latest.keys()])
    .eq("is_archived", false);
  const domains = new Map(((live ?? []) as Array<{ id: string; domain: string }>).map((p) => [p.id, p.domain]));

  // Projects whose newest snapshot has the oldest pending page go first.
  const queue = [...latest.values()].filter((s) => domains.has(s.project_id) && Array.isArray(s.pages)).sort((a, b) => a.created_at.localeCompare(b.created_at));

  let measured = 0;
  for (const snap of queue) {
    const domain = String(domains.get(snap.project_id) ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    for (;;) {
      const i = nextPageToMeasure(snap.pages, new Date(now()));
      if (i === null) break;
      const wait = lastCallAt ? Math.max(0, lastCallAt + BROWSER_RUN_MIN_GAP_MS - now()) : 0;
      if (now() + wait + PAGE_WORST_MS > input.deadlineAt) return { measured, agentic, stopped: "budget" };
      if (wait) await sleep(wait);

      const page = snap.pages[i];
      const host = domainOf(page.url);
      const measuredAt = new Date(now()).toISOString();
      let result: PageRender;
      if (!host || !isAllowedAuditHost(host, domain)) {
        result = { state: "unmeasured", measuredAt };
      } else {
        lastCallAt = now();
        const [raw, rendered] = await Promise.all([fetchRaw(page.url, domain), render(page.url, RENDER_TIMEOUT_MS)]);
        if (rendered.kind === "quota" || rendered.kind === "config") {
          console.info(`${LOG_PREFIX} stopped`, { reason: rendered.kind, measured });
          return { measured, agentic, stopped: rendered.kind };
        }
        result = rendered.kind === "ok" && raw ? compareRender(raw, rendered.html, measuredAt) : { state: "unmeasured", measuredAt };
      }
      const prev = isPageRender(page.render) && page.render.state === "ok" ? page.render.pct : undefined;
      if (result.state === "ok" && prev !== undefined) result.prevPct = prev;
      snap.pages[i] = { ...page, render: result };

      const { error: writeError } = await input.service
        .from("web_audit_snapshots")
        .update({ pages: snap.pages })
        .eq("id", snap.id)
        .eq("project_id", snap.project_id);
      if (writeError) {
        console.error(`${LOG_PREFIX} write_failed`, { project_id: snap.project_id });
        break;
      }
      measured++;
    }
  }
  return { measured, agentic };
}
