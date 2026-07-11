import { describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import { checkSnapshotRateLimit, DEFAULT_SNAPSHOT_RATE_LIMIT, type SnapshotRateLimitConfig } from "./snapshot-rate-limit";

type ServiceClient = ReturnType<typeof createServiceClient>;

function asServiceClient(fake: { from: (table: string) => unknown }): ServiceClient {
  return fake as unknown as ServiceClient;
}

/** Mirrors the fake in generation-rate-limit.test.ts — same query shape, one table. */
function fakeServiceClient(result: { count: number | null; error: { message: string } | null }) {
  const calls: { table?: string; eq: Array<[string, unknown]>; gte?: [string, unknown] } = { eq: [] };

  const builder = {
    eq(column: string, value: unknown) {
      calls.eq.push([column, value]);
      return builder;
    },
    gte(column: string, value: unknown) {
      calls.gte = [column, value];
      return builder;
    },
    then(resolve: (value: { count: number | null; error: { message: string } | null }) => unknown) {
      return Promise.resolve({ count: result.count, error: result.error }).then(resolve);
    }
  };

  const service = {
    from(table: string) {
      calls.table = table;
      return {
        select: vi.fn(() => builder)
      };
    }
  };

  return { service, calls };
}

const FIXED_NOW = Date.parse("2026-06-07T12:00:00.000Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const tightConfig: SnapshotRateLimitConfig = { window: "day", maxPerWindow: 3 };

describe("checkSnapshotRateLimit", () => {
  it("allows the audit and reports remaining slots when under the limit", async () => {
    const { service, calls } = fakeServiceClient({ count: 1, error: null });

    const result = await checkSnapshotRateLimit(asServiceClient(service), "project-1", {
      now: () => FIXED_NOW,
      config: tightConfig
    });

    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.count).toBe(1);
    expect(result.limit).toBe(3);
    expect(result.remaining).toBe(2);
    expect(result.windowStart).toBe(new Date(FIXED_NOW - ONE_DAY_MS).toISOString());

    expect(calls.table).toBe("web_audit_snapshots");
    expect(calls.eq).toEqual([["project_id", "project-1"]]);
    expect(calls.gte).toEqual(["created_at", new Date(FIXED_NOW - ONE_DAY_MS).toISOString()]);
  });

  it("treats a null count as zero and allows the audit", async () => {
    const { service } = fakeServiceClient({ count: null, error: null });

    const result = await checkSnapshotRateLimit(asServiceClient(service), "project-1", {
      now: () => FIXED_NOW,
      config: tightConfig
    });

    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.count).toBe(0);
    expect(result.remaining).toBe(3);
  });

  it("blocks once the count reaches the configured limit", async () => {
    const { service } = fakeServiceClient({ count: 3, error: null });

    const result = await checkSnapshotRateLimit(asServiceClient(service), "project-1", {
      now: () => FIXED_NOW,
      config: tightConfig
    });

    expect(result.allowed).toBe(false);
    if (result.allowed || result.reason !== "rate_limit_exceeded") {
      throw new Error("expected a rate_limit_exceeded verdict");
    }
    expect(result.count).toBe(3);
    expect(result.limit).toBe(3);
    expect(result.remaining).toBe(0);
    expect("resetAt" in result).toBe(false);
  });

  it("is exactly at the boundary: count === limit - 1 still allows, count === limit blocks", async () => {
    const underLimit = fakeServiceClient({ count: 2, error: null });
    const underResult = await checkSnapshotRateLimit(asServiceClient(underLimit.service), "project-1", {
      now: () => FIXED_NOW,
      config: tightConfig
    });
    expect(underResult.allowed).toBe(true);

    const atLimit = fakeServiceClient({ count: 3, error: null });
    const atResult = await checkSnapshotRateLimit(asServiceClient(atLimit.service), "project-1", {
      now: () => FIXED_NOW,
      config: tightConfig
    });
    expect(atResult.allowed).toBe(false);
  });

  it("fails closed (blocks) and sanitizes the error when the lookup itself errors", async () => {
    const { service } = fakeServiceClient({ count: null, error: { message: "raw postgres failure with secrets" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkSnapshotRateLimit(asServiceClient(service), "project-1", {
      now: () => FIXED_NOW,
      config: tightConfig
    });

    expect(result.allowed).toBe(false);
    if (result.allowed || result.reason !== "rate_limit_check_failed") {
      throw new Error("expected a rate_limit_check_failed verdict");
    }
    expect(result.error).toBe("rate_limit_lookup_failed");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = errorSpy.mock.calls[0];
    expect(JSON.stringify(loggedArgs)).not.toContain("raw postgres failure with secrets");

    errorSpy.mockRestore();
  });

  it("uses DEFAULT_SNAPSHOT_RATE_LIMIT when no config is supplied", async () => {
    const { service } = fakeServiceClient({ count: 2, error: null });

    const result = await checkSnapshotRateLimit(asServiceClient(service), "project-1", { now: () => FIXED_NOW });

    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.limit).toBe(DEFAULT_SNAPSHOT_RATE_LIMIT.maxPerWindow);
    expect(result.remaining).toBe(DEFAULT_SNAPSHOT_RATE_LIMIT.maxPerWindow - 2);
  });
});
