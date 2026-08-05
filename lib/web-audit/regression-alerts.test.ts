import { describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import { emitAuditRegressionNotifications } from "./regression-alerts";
import type { BotAccessReport } from "./robots";
import type { PageAuditEntry } from "./technical-audit";

type ServiceClient = ReturnType<typeof createServiceClient>;
type Upsert = { type: string; severity: string; dedupe_key: string; payload_json: Record<string, unknown>; owner_user_id: string; project_id: string };

type CoverageTopic = { promptId: string; topic: string; found: boolean; note?: string };

/** A persisted coverage-map row, as `generated_solutions.sanitized_content`. */
function coverageRow(scanId: string, generatedAt: string, topics: CoverageTopic[]) {
  return {
    sanitized_content: JSON.stringify({
      scanId,
      generatedAt,
      topics: topics.map((t) => ({ pages: [], note: "", ...t }))
    })
  };
}

/** A scan result that cites the project's own domain for `promptId`, or does not. */
function resultRow(runId: string, promptId: string, cited: boolean) {
  return {
    run_id: runId,
    prompt_id: promptId,
    provider: "gemini",
    mentioned_competitors_count: 0,
    extracted_json: cited ? { citations: [{ domain: "acme.com", source: "grounding" }] } : { citations: [] }
  };
}

function bots(overrides: Partial<BotAccessReport> = {}): BotAccessReport {
  return {
    robotsFound: true,
    bots: [{ agent: "GPTBot", allowed: true }],
    llmsTxtFound: true,
    llmsTxtBytes: 100,
    sitemapFound: true,
    ...overrides
  };
}

function page(url: string, status: PageAuditEntry["status"]): PageAuditEntry {
  return { url, contextLabel: "", status, check: null, fetchMs: null, htmlBytes: null };
}

function makeService({
  coverageRows = [] as unknown[],
  resultRows: results = [] as unknown[],
  coverageError = false,
  resultsHang = false
} = {}) {
  const upserts: Upsert[] = [];

  const builder = (result: { data: unknown; error: unknown }, hang = false) => {
    const self: Record<string, unknown> = {
      eq: () => self,
      is: () => self,
      in: () => self,
      order: () => self,
      limit: () => self,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        hang ? new Promise(() => {}).then(resolve, reject) : Promise.resolve(result).then(resolve)
    };
    return self;
  };

  const service = {
    from(table: string) {
      if (table === "notifications") {
        return {
          upsert: (payload: Upsert) => {
            upserts.push(payload);
            return Promise.resolve({ error: null });
          }
        };
      }
      if (table === "generated_solutions") {
        return {
          select: () =>
            coverageError
              ? builder({ data: null, error: { message: "boom" } })
              : builder({ data: coverageRows, error: null })
        };
      }
      if (table === "scan_prompt_results") {
        return { select: () => builder({ data: results, error: null }, resultsHang) };
      }
      throw new Error(`unexpected table ${table}`);
    }
  } as unknown as ServiceClient;

  return { service, upserts };
}

const BASE = {
  projectId: "project-1",
  ownerUserId: "user-1",
  projectDomain: "acme.com",
  snapshotId: "snapshot-2"
};

describe("emitAuditRegressionNotifications", () => {
  it("emits nothing when nothing regressed", async () => {
    const { service, upserts } = makeService();

    const emitted = await emitAuditRegressionNotifications({
      ...BASE,
      service,
      previousSnapshot: { pages: [], bots: bots() },
      currentSnapshot: { pages: [], bots: bots() }
    });

    expect(emitted).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it("emits nothing on a project's first audit", async () => {
    const { service, upserts } = makeService();

    const emitted = await emitAuditRegressionNotifications({
      ...BASE,
      service,
      previousSnapshot: null,
      currentSnapshot: { pages: [], bots: bots({ llmsTxtFound: false, sitemapFound: false }) }
    });

    expect(emitted).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it("writes a critical ai_bot_blocked keyed on the snapshot and the agent", async () => {
    const { service, upserts } = makeService();

    await emitAuditRegressionNotifications({
      ...BASE,
      service,
      previousSnapshot: { pages: [], bots: bots() },
      currentSnapshot: { pages: [], bots: bots({ bots: [{ agent: "GPTBot", allowed: false }] }) }
    });

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      owner_user_id: "user-1",
      project_id: "project-1",
      type: "ai_bot_blocked",
      severity: "critical",
      dedupe_key: "ai_bot_blocked:snapshot-2:GPTBot",
      payload_json: { agent: "GPTBot", snapshotId: "snapshot-2" }
    });
  });

  it("writes a critical llms_txt_lost and a warning sitemap_lost", async () => {
    const { service, upserts } = makeService();

    await emitAuditRegressionNotifications({
      ...BASE,
      service,
      previousSnapshot: { pages: [], bots: bots() },
      currentSnapshot: { pages: [], bots: bots({ llmsTxtFound: false, llmsTxtBytes: null, sitemapFound: false }) }
    });

    expect(upserts.map((u) => [u.type, u.severity, u.dedupe_key])).toEqual([
      ["llms_txt_lost", "critical", "llms_txt_lost:snapshot-2"],
      ["sitemap_lost", "warning", "sitemap_lost:snapshot-2"]
    ]);
  });

  it("aggregates unreachable pages into one notification", async () => {
    const { service, upserts } = makeService();

    await emitAuditRegressionNotifications({
      ...BASE,
      service,
      previousSnapshot: { pages: [page("https://acme.com/a", "analyzed"), page("https://acme.com/b", "analyzed")], bots: bots() },
      currentSnapshot: { pages: [page("https://acme.com/a", "skipped_error"), page("https://acme.com/b", "skipped_timeout")], bots: bots() }
    });

    expect(upserts).toHaveLength(1);
    expect(upserts[0].type).toBe("page_unreachable");
    expect(upserts[0].payload_json).toMatchObject({ count: 2, snapshotId: "snapshot-2" });
  });

  it("keys coverage regressions on the SCAN, so re-auditing the same scan never notifies twice", async () => {
    // The technical audit re-runs against an unchanged coverage map (a
    // 24h-old cache expiring with no new scan): a snapshot-keyed notice would
    // be a second row for one regression.
    const { service, upserts } = makeService({
      coverageRows: [
        coverageRow("scan-2", "2026-08-04T06:00:00.000Z", [{ promptId: "p1", topic: "precios", found: false }]),
        coverageRow("scan-1", "2026-08-03T06:00:00.000Z", [{ promptId: "p1", topic: "precios", found: true }])
      ],
      resultRows: [resultRow("scan-2", "p1", false), resultRow("scan-1", "p1", true)]
    });

    await emitAuditRegressionNotifications({
      ...BASE,
      service,
      previousSnapshot: { pages: [], bots: bots() },
      currentSnapshot: { pages: [], bots: bots() }
    });

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      type: "coverage_dropped",
      severity: "warning",
      dedupe_key: "coverage_dropped:scan-2",
      payload_json: { scanId: "scan-2", count: 1, sampleTopics: ["precios"] }
    });
  });

  it("emits surfacing_dropped only once the citation majority actually flips", async () => {
    // Four scans, because both sides are classified over a majority window of
    // the three scans at-or-before them (opportunity-matrix.ts): current
    // reads 4-3-2, previous reads 3-2-1. Cited in 1 and 2, not in 3 and 4 —
    // so previous is `performing` (2 of 3) and current is `invisible` (1 of
    // 3). This is exactly why the alert cannot fire off one noisy scan, and
    // exactly why the loader reads four coverage maps and not two.
    const found = [{ promptId: "p1", topic: "integraciones", found: true }];
    const { service, upserts } = makeService({
      coverageRows: [
        coverageRow("scan-4", "2026-08-04T06:00:00.000Z", found),
        coverageRow("scan-3", "2026-08-03T06:00:00.000Z", found),
        coverageRow("scan-2", "2026-08-02T06:00:00.000Z", found),
        coverageRow("scan-1", "2026-08-01T06:00:00.000Z", found)
      ],
      resultRows: [
        resultRow("scan-4", "p1", false),
        resultRow("scan-3", "p1", false),
        resultRow("scan-2", "p1", true),
        resultRow("scan-1", "p1", true)
      ]
    });

    await emitAuditRegressionNotifications({
      ...BASE,
      service,
      previousSnapshot: { pages: [], bots: bots() },
      currentSnapshot: { pages: [], bots: bots() }
    });

    expect(upserts.map((u) => u.type)).toEqual(["surfacing_dropped"]);
    expect(upserts[0].payload_json).toMatchObject({ scanId: "scan-4", count: 1, sampleTopics: ["integraciones"] });
  });

  it("compares nothing on the coverage side with a single coverage map", async () => {
    const { service, upserts } = makeService({
      coverageRows: [coverageRow("scan-1", "2026-08-04T06:00:00.000Z", [{ promptId: "p1", topic: "precios", found: false }])]
    });

    await emitAuditRegressionNotifications({
      ...BASE,
      service,
      previousSnapshot: { pages: [], bots: bots() },
      currentSnapshot: { pages: [], bots: bots() }
    });

    expect(upserts).toEqual([]);
  });

  it("still emits the technical half when the coverage load fails", async () => {
    // The half that needs no queries is the half that must survive.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { service, upserts } = makeService({ coverageError: true });

    const emitted = await emitAuditRegressionNotifications({
      ...BASE,
      service,
      previousSnapshot: { pages: [], bots: bots() },
      currentSnapshot: { pages: [], bots: bots({ llmsTxtFound: false, llmsTxtBytes: null }) }
    });

    expect(emitted).toEqual(["llms_txt_lost"]);
    expect(upserts.map((u) => u.type)).toEqual(["llms_txt_lost"]);
    warn.mockRestore();
  });

  it("still emits the technical half when a coverage query hangs past its timeout", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { service, upserts } = makeService({
      coverageRows: [
        coverageRow("scan-2", "2026-08-04T06:00:00.000Z", [{ promptId: "p1", topic: "precios", found: false }]),
        coverageRow("scan-1", "2026-08-03T06:00:00.000Z", [{ promptId: "p1", topic: "precios", found: true }])
      ],
      resultsHang: true
    });

    const pending = emitAuditRegressionNotifications({
      ...BASE,
      service,
      previousSnapshot: { pages: [], bots: bots() },
      currentSnapshot: { pages: [], bots: bots({ llmsTxtFound: false, llmsTxtBytes: null }) }
    });

    await vi.advanceTimersByTimeAsync(5_000);
    const emitted = await pending;

    expect(emitted).toEqual(["llms_txt_lost"]);
    expect(upserts.map((u) => u.type)).toEqual(["llms_txt_lost"]);
    vi.useRealTimers();
    warn.mockRestore();
  });

  it("never throws, whatever the client does", async () => {
    // A failing client must not turn a persisted audit into a failed one.
    // The result still lists the regression: emitNotification is fail-soft by
    // contract and logs its own write failures, so this list is what was
    // found and attempted, not a delivery receipt.
    const exploding = {
      from() {
        throw new Error("connection reset");
      }
    } as unknown as ServiceClient;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      emitAuditRegressionNotifications({
        ...BASE,
        service: exploding,
        previousSnapshot: { pages: [], bots: bots() },
        currentSnapshot: { pages: [], bots: bots({ llmsTxtFound: false, llmsTxtBytes: null }) }
      })
    ).resolves.toEqual(["llms_txt_lost"]);

    warn.mockRestore();
    error.mockRestore();
  });

  it("skips snapshot-keyed notices when the insert returned no id, rather than writing an unkeyable row", async () => {
    const { service, upserts } = makeService();

    const emitted = await emitAuditRegressionNotifications({
      ...BASE,
      service,
      snapshotId: null,
      previousSnapshot: { pages: [], bots: bots() },
      currentSnapshot: { pages: [], bots: bots({ llmsTxtFound: false, llmsTxtBytes: null }) }
    });

    expect(emitted).toEqual([]);
    expect(upserts).toEqual([]);
  });
});
