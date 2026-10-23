import { describe, expect, it } from "vitest";
import type { SerpResult } from "@/lib/seo-data/dataforseo-parse";
import { CALL_TIMEOUT_MS, runSerpPass, type PendingKeyword, type SerpFetchResult, type SnapshotRow } from "@/lib/seo-tracking/serp-pass";

const kw = (n: number): PendingKeyword => ({ keywordId: `k${n}`, projectId: "p1", ownerUserId: "u1", keyword: `palabra ${n}`, ownDomain: "genscore.es" });

const serp = (keyword: string): SerpResult => ({
  keyword,
  organic: Array.from({ length: 15 }, (_, i) => ({ position: i + 1, domain: `d${i}.es`, url: `https://d${i}.es/`, title: null })),
  ownPosition: 12,
  ownUrl: "https://genscore.es/geo",
  ownTitle: "Qué es GEO · GenScore",
  hasLocalPack: false,
  questions: ["¿Qué es GEO?"]
});

/** A fake clock that only moves when a call "takes" time. */
function harness(opts: { pending: PendingKeyword[]; budgetMs?: number; callMs?: number; spendCeilingUsd?: number; fetch?: (keyword: string, timeoutMs: number) => SerpFetchResult }) {
  let clock = 0;
  const saved: SnapshotRow[] = [];
  const timeouts: number[] = [];
  const deps = {
    pending: opts.pending,
    weekStart: "2026-10-19",
    now: () => clock,
    sleep: async () => {},
    deadline: opts.budgetMs ?? 48_000,
    spendCeilingUsd: opts.spendCeilingUsd ?? 2,
    concurrency: 1,
    save: async (row: SnapshotRow) => {
      saved.push(row);
      return true;
    },
    fetchSerp: async (keyword: string, _own: string, timeoutMs: number) => {
      timeouts.push(timeoutMs);
      clock += opts.callMs ?? 3_000;
      return opts.fetch ? opts.fetch(keyword, timeoutMs) : ({ ok: true, cost: 0.004, serp: serp(keyword) } as SerpFetchResult);
    }
  };
  return { deps, saved, timeouts };
}

describe("runSerpPass", () => {
  it("saves one snapshot per keyword with only the Top 10", async () => {
    const h = harness({ pending: [kw(1), kw(2)] });
    const result = await runSerpPass(h.deps);
    expect(result).toMatchObject({ saved: 2, deferred: 0, stoppedBy: "done" });
    expect(h.saved[0]).toMatchObject({ keyword_id: "k1", week_start: "2026-10-19", status: "ok", own_position: 12, own_url: "https://genscore.es/geo", own_title: "Qué es GEO · GenScore" });
    expect(h.saved[0].top10).toHaveLength(10);
    expect(result.spentUsd).toBeCloseTo(0.008);
  });

  it("stops at the deadline and leaves the rest pending, never as errors", async () => {
    const h = harness({ pending: [kw(1), kw(2), kw(3), kw(4)], budgetMs: 20_000, callMs: 6_000 });
    const result = await runSerpPass(h.deps);
    expect(result.stoppedBy).toBe("deadline");
    // Starts at 0, 6 and 12 s (each with >= 8 s of room); at 18 s only 2 s remain.
    expect(result.saved).toBe(3);
    expect(result.deferred).toBe(1);
    expect(h.saved.every((row) => row.status === "ok")).toBe(true);
  });

  it("trims the timeout of a call to the deadline", async () => {
    const h = harness({ pending: [kw(1)], budgetMs: 12_000 });
    await runSerpPass(h.deps);
    expect(h.timeouts[0]).toBe(11_000);
  });

  it("does not persist a timeout caused by our own trimmed budget", async () => {
    const h = harness({ pending: [kw(1)], budgetMs: 12_000, fetch: () => ({ ok: false, cost: 0, category: "timeout" }) });
    const result = await runSerpPass(h.deps);
    expect(h.saved).toHaveLength(0);
    expect(result.deferred).toBe(1);
  });

  it("retries a provider error once, then persists a categorized error", async () => {
    let calls = 0;
    const h = harness({
      pending: [kw(1)],
      fetch: () => {
        calls += 1;
        return { ok: false, cost: 0, category: "provider" };
      }
    });
    const result = await runSerpPass(h.deps);
    expect(calls).toBe(2);
    expect(h.saved[0]).toMatchObject({ status: "error", error: "provider: DataForSEO devolvió un error" });
    expect(result.errors.provider).toBe(1);
  });

  it("succeeds on the retry without persisting the first failure", async () => {
    let calls = 0;
    const h = harness({
      pending: [kw(1)],
      fetch: (keyword) => (++calls === 1 ? { ok: false, cost: 0, category: "timeout" } : { ok: true, cost: 0.004, serp: serp(keyword) })
    });
    expect(h.timeouts.length).toBe(0);
    const result = await runSerpPass(h.deps);
    expect(result.saved).toBe(1);
    expect(h.saved).toHaveLength(1);
    expect(h.timeouts[0]).toBe(CALL_TIMEOUT_MS);
  });

  it("stops the whole pass on a balance error, without retrying", async () => {
    let calls = 0;
    const h = harness({
      pending: [kw(1), kw(2), kw(3)],
      fetch: () => {
        calls += 1;
        return { ok: false, cost: 0, category: "balance" };
      }
    });
    const result = await runSerpPass(h.deps);
    expect(calls).toBe(1);
    expect(result).toMatchObject({ stoppedBy: "operator", operatorCategory: "balance", deferred: 3 });
    expect(h.saved).toHaveLength(0);
  });

  it("counts a timed-out call at the unit price toward the ceiling", async () => {
    const h = harness({ pending: [kw(1)], fetch: () => ({ ok: false, cost: 0, category: "timeout" }) });
    const result = await runSerpPass(h.deps);
    // First try plus the one retry, both possibly billed.
    expect(result.spentUsd).toBeCloseTo(0.008);
    expect(h.saved[0]).toMatchObject({ status: "error" });
  });

  it("stops at the spend ceiling", async () => {
    const h = harness({ pending: [kw(1), kw(2), kw(3)], spendCeilingUsd: 0.008 });
    const result = await runSerpPass(h.deps);
    expect(result).toMatchObject({ saved: 2, deferred: 1, stoppedBy: "spend" });
  });

  it("does nothing with nothing pending", async () => {
    const h = harness({ pending: [] });
    expect(await runSerpPass(h.deps)).toMatchObject({ saved: 0, deferred: 0, stoppedBy: "done" });
  });
});
