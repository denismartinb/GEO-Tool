import "server-only";

import { emitNotification } from "@/lib/notifications/emit";
import { aiBotBlockedKey, auditRegressionKey } from "@/lib/notifications/dedupe-keys";
import { dedupeMapsByScanId, parseCoverageMap, type DomainCoverageMap } from "@/lib/web-audit/coverage-map";
import { buildCitationWindowCandidates, buildWebAuditSummary, CITATION_WINDOW_SIZE, type PromptResultLite } from "@/lib/web-audit/opportunity-matrix";
import { detectAuditRegressions, type AuditSide } from "@/lib/web-audit/regressions";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * WEB-AUDIT-ALERTS-1 — the I/O half of the audit regression alerts: load what
 * the pure comparator (lib/web-audit/regressions.ts) needs, run it, and write
 * one notification per finding.
 *
 * Called from lib/web-audit/technical-audit.ts immediately AFTER the snapshot
 * insert, never before — the same "only emit once the event it describes is
 * durable" rule every other emitter in this codebase follows
 * (docs/specs/notifications/notifications-v1.md section 3.2). A notice about
 * an audit whose row failed to persist would point at nothing.
 *
 * ------------------------------------------------------------------------
 * Fail-soft, in both directions
 * ------------------------------------------------------------------------
 *
 * Nothing here may fail the audit that produced it: an audit that ran and
 * persisted is a success even if the bell stays empty. So the whole body is
 * wrapped, and the two halves degrade independently — the technical half
 * (bots, llms.txt, sitemap, unreachable pages) needs NO queries at all, since
 * both snapshots are already in hand, so it survives a coverage load that
 * times out or comes back empty. The expensive half is the one that gets
 * dropped under pressure, which is the right way round.
 *
 * ------------------------------------------------------------------------
 * Budget (ADR 0003 / .claude/rules/web-audit.md)
 * ------------------------------------------------------------------------
 *
 * This runs inside the same ~60s invocation as everything else, so it takes a
 * bounded, absolute allowance rather than its own open-ended clock — the
 * mistake ADR 0029's addendum documents. `REGRESSION_ALERTS_BUDGET_MS` is
 * what runTechnicalAuditCore's caller reserves for it (see
 * TECHNICAL_RESERVE_MS in audit-job-runner.ts); overrun it and the coverage
 * half is skipped, not the invocation killed.
 */

const LOG_PREFIX = "[geo:web-audit:alerts]";

/**
 * Wall-clock the whole alert pass may spend. Two bounded Supabase reads plus
 * pure comparison; the emits themselves are small upserts. Anything beyond
 * this and the coverage half is abandoned in favour of finishing.
 */
export const REGRESSION_ALERTS_BUDGET_MS = 4_000;

/** Per-query ceiling, well inside the total so one slow read cannot eat it all. */
const QUERY_TIMEOUT_MS = 2_500;

/**
 * Coverage-map history rows read.
 *
 * The comparison needs 4 DISTINCT scans, not 2: the `performing`/`invisible`
 * verdicts each side is compared on are decided over a citation window of the
 * CITATION_WINDOW_SIZE (3) scans at-or-before that side's own date
 * (opportunity-matrix.ts). Current uses maps 0-2, previous uses maps 1-3.
 * Reading fewer would make the bell classify topics differently from the
 * Auditoría web screen, which loads the full history — a notice that
 * contradicts the page it links to is worse than no notice.
 *
 * Over-fetched because re-auditing the same scan writes another row for the
 * same scanId, and `dedupeMapsByScanId` collapses those.
 */
const COVERAGE_HISTORY_ROWS = 8;
const COVERAGE_SCANS_COMPARED = CITATION_WINDOW_SIZE + 1;

type ServiceClient = ReturnType<typeof createServiceClient>;

/** One side of the technical comparison, straight off a `web_audit_snapshots` row. */
export type SnapshotSide = {
  pages: PageAuditEntry[];
  bots: BotAccessReport | null;
};

function withTimeout<T>(promise: PromiseLike<T>, stage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${stage}`)), QUERY_TIMEOUT_MS);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * The last few completed coverage maps, newest first, one per scan.
 *
 * Mirrors the Auditoría web page's own history query exactly (same table,
 * same four filters, same ordering) so both read the identical artifact —
 * `status = 'completed'` in particular, because a campaign still `running`
 * holds a partial topic list that would read as mass coverage loss.
 */
async function loadRecentCoverageMaps(service: ServiceClient, projectId: string): Promise<DomainCoverageMap[]> {
  const { data } = await withTimeout(
    service
      .from("generated_solutions")
      .select("sanitized_content")
      .eq("project_id", projectId)
      .eq("generation_type", "domain_coverage")
      .is("recommendation_id", null)
      .eq("status", "completed")
      .eq("is_sanitized", true)
      .order("created_at", { ascending: false })
      .limit(COVERAGE_HISTORY_ROWS),
    "load_coverage_history"
  );

  const maps = ((data ?? []) as Array<{ sanitized_content: string | null }>)
    .map((row) => parseCoverageMap(row.sanitized_content))
    .filter((map): map is DomainCoverageMap => map !== null);

  return dedupeMapsByScanId(maps)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, COVERAGE_SCANS_COMPARED);
}

async function loadResultsByScanId(
  service: ServiceClient,
  projectId: string,
  scanIds: string[]
): Promise<Map<string, PromptResultLite[]>> {
  const byScanId = new Map<string, PromptResultLite[]>();
  if (scanIds.length === 0) return byScanId;

  const { data } = await withTimeout(
    service
      .from("scan_prompt_results")
      .select("prompt_id, run_id, extracted_json, provider, mentioned_competitors_count")
      .eq("project_id", projectId)
      .in("run_id", scanIds)
      .eq("status", "completed"),
    "load_scan_results"
  );

  for (const row of (data ?? []) as Array<PromptResultLite & { run_id: string }>) {
    const list = byScanId.get(row.run_id) ?? [];
    list.push(row);
    byScanId.set(row.run_id, list);
  }
  return byScanId;
}

/**
 * Builds the coverage side of both audits, or `null` when there is nothing to
 * compare (fewer than two scans with a completed coverage map — a project on
 * its first audit, which has no yesterday and therefore no regression).
 */
async function loadCoverageSides(
  service: ServiceClient,
  projectId: string,
  projectDomain: string
): Promise<{ previous: AuditSide["summary"]; current: AuditSide["summary"]; scanId: string } | null> {
  const maps = await loadRecentCoverageMaps(service, projectId);
  if (maps.length < 2) return null;

  const resultsByScanId = await loadResultsByScanId(
    service,
    projectId,
    maps.map((map) => map.scanId)
  );
  const citationWindowCandidates = buildCitationWindowCandidates(maps, resultsByScanId);

  return {
    current: buildWebAuditSummary({ coverage: maps[0], citationWindowCandidates, projectDomain }),
    previous: buildWebAuditSummary({ coverage: maps[1], citationWindowCandidates, projectDomain }),
    scanId: maps[0].scanId
  };
}

/**
 * Compare this audit with the previous one and emit a notification per
 * regression. Returns the kinds found and written, for logging and tests —
 * not a delivery receipt: `emitNotification` is fail-soft by contract and
 * logs its own write failures rather than reporting them back.
 *
 * Never throws and never rejects.
 */
export async function emitAuditRegressionNotifications({
  service,
  projectId,
  ownerUserId,
  projectDomain,
  snapshotId,
  previousSnapshot,
  currentSnapshot,
  budgetMs = REGRESSION_ALERTS_BUDGET_MS
}: {
  service: ServiceClient;
  projectId: string;
  ownerUserId: string;
  projectDomain: string;
  /** `web_audit_snapshots.id` of the row just inserted. */
  snapshotId: string | null;
  /** The project's previous snapshot, or null when this is its first. */
  previousSnapshot: SnapshotSide | null;
  currentSnapshot: SnapshotSide;
  budgetMs?: number;
}): Promise<string[]> {
  const startedAt = Date.now();

  try {
    // The coverage half is optional and is what gets dropped when anything
    // goes wrong: a failed read leaves both summaries null, and the pure
    // comparator then simply produces no coverage findings.
    let coverage: Awaited<ReturnType<typeof loadCoverageSides>> = null;
    try {
      coverage = await loadCoverageSides(service, projectId, projectDomain);
    } catch (error) {
      console.warn(`${LOG_PREFIX} coverage comparison skipped`, {
        projectId,
        message: error instanceof Error ? error.message : String(error)
      });
    }

    if (Date.now() - startedAt > budgetMs) {
      // Out of budget: the comparison is already done, so this only guards
      // the emits. Log it rather than dropping them silently — a phase that
      // quietly stops alerting is indistinguishable from a healthy site.
      console.warn(`${LOG_PREFIX} over budget before emitting`, { projectId, elapsedMs: Date.now() - startedAt });
    }

    const previous: AuditSide = {
      summary: coverage?.previous ?? null,
      bots: previousSnapshot?.bots ?? null,
      pages: previousSnapshot?.pages ?? []
    };
    const current: AuditSide = {
      summary: coverage?.current ?? null,
      bots: currentSnapshot.bots,
      pages: currentSnapshot.pages
    };

    const regressions = detectAuditRegressions(previous, current);
    if (regressions.length === 0) return [];

    const emitted: string[] = [];

    for (const regression of regressions) {
      switch (regression.kind) {
        case "ai_bot_blocked": {
          // Keyed on the snapshot, per the existing 0021 contract. This is the
          // type NOTIF-SERVER phase 2 declared and never wired up; the
          // "bot_blocked" notice of the WEB-AUDIT-3 design is this one.
          if (!snapshotId) break;
          await emitNotification(service, {
            ownerUserId,
            projectId,
            type: "ai_bot_blocked",
            severity: "critical",
            dedupeKey: aiBotBlockedKey(snapshotId, regression.agent),
            payload: { agent: regression.agent, snapshotId }
          });
          emitted.push(`ai_bot_blocked:${regression.agent}`);
          break;
        }

        case "llms_txt_lost":
        case "sitemap_lost": {
          if (!snapshotId) break;
          await emitNotification(service, {
            ownerUserId,
            projectId,
            type: regression.kind,
            // llms.txt is the file that exists solely to steer AI readers, so
            // losing it is a direct hit to the thing this product measures.
            // A missing sitemap degrades discovery rather than removing it.
            severity: regression.kind === "llms_txt_lost" ? "critical" : "warning",
            dedupeKey: auditRegressionKey(regression.kind, snapshotId),
            payload: { snapshotId }
          });
          emitted.push(regression.kind);
          break;
        }

        case "page_unreachable": {
          if (!snapshotId) break;
          await emitNotification(service, {
            ownerUserId,
            projectId,
            type: "page_unreachable",
            severity: "warning",
            dedupeKey: auditRegressionKey("page_unreachable", snapshotId),
            payload: { snapshotId, count: regression.count, sampleUrls: regression.sampleUrls }
          });
          emitted.push("page_unreachable");
          break;
        }

        case "coverage_dropped":
        case "surfacing_dropped": {
          // Keyed on the scan, not the snapshot — see auditRegressionKey.
          if (!coverage) break;
          await emitNotification(service, {
            ownerUserId,
            projectId,
            type: regression.kind,
            severity: "warning",
            dedupeKey: auditRegressionKey(regression.kind, coverage.scanId),
            payload: { scanId: coverage.scanId, count: regression.count, sampleTopics: regression.sampleTopics }
          });
          emitted.push(regression.kind);
          break;
        }
      }
    }

    if (emitted.length > 0) {
      // Kinds only — never the payloads, which carry topic labels derived
      // from the user's own prompt text (emit.ts's logging rule).
      console.info(`${LOG_PREFIX} emitted`, { projectId, kinds: emitted, elapsedMs: Date.now() - startedAt });
    }

    return emitted;
  } catch (error) {
    console.error(`${LOG_PREFIX} threw`, {
      projectId,
      message: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}
