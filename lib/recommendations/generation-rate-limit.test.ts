import { describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import {
  checkGenerationRateLimit,
  DEFAULT_GENERATION_RATE_LIMIT,
  type GenerationRateLimitConfig
} from "./generation-rate-limit";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * The guard only ever touches `.from(...)` on the client, so the fake only
 * needs to implement that one method. Routing through `unknown` (rather than
 * `any`) keeps the cast explicit and total without widening the type — the
 * fake's shape is verified structurally against the one method actually used.
 */
function asServiceClient(fake: { from: (table: string) => unknown }): ServiceClient {
  return fake as unknown as ServiceClient;
}

/**
 * Minimal fake of the slice of the Supabase query builder this guard uses:
 *
 *   service.from("generated_solutions")
 *          .select("id", { count: "exact", head: true })
 *          .eq("project_id", projectId)
 *          .gte("created_at", windowStart)
 *
 * `.eq` and `.gte` are recorded (so tests can assert the guard scopes the
 * count to the right project and window) and the chain resolves to whatever
 * `{ count, error }` the test configures — mirroring the real client, which
 * resolves a thenable query builder to a `PostgrestResponse`-shaped object.
 */
function fakeServiceClient(result: { count: number | null; error: { message: string } | null }) {
  const calls: { table?: string; eq?: [string, unknown]; gte?: [string, unknown] } = {};

  const builder = {
    eq(column: string, value: unknown) {
      calls.eq = [column, value];
      return builder;
    },
    gte(column: string, value: unknown) {
      calls.gte = [column, value];
      return Promise.resolve({ count: result.count, error: result.error });
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

const tightConfig: GenerationRateLimitConfig = { window: "day", maxPerWindow: 3 };

describe("checkGenerationRateLimit", () => {
  it("allows the generation and reports remaining slots when under the limit", async () => {
    const { service, calls } = fakeServiceClient({ count: 1, error: null });

    const result = await checkGenerationRateLimit(asServiceClient(service), "project-1", {
      now: () => FIXED_NOW,
      config: tightConfig
    });

    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.count).toBe(1);
    expect(result.limit).toBe(3);
    expect(result.remaining).toBe(2);
    expect(result.windowStart).toBe(new Date(FIXED_NOW - ONE_DAY_MS).toISOString());

    // Scoped to the right project and window — never a global count.
    expect(calls.table).toBe("generated_solutions");
    expect(calls.eq).toEqual(["project_id", "project-1"]);
    expect(calls.gte).toEqual(["created_at", new Date(FIXED_NOW - ONE_DAY_MS).toISOString()]);
  });

  it("treats a null count as zero and allows the generation", async () => {
    const { service } = fakeServiceClient({ count: null, error: null });

    const result = await checkGenerationRateLimit(asServiceClient(service), "project-1", {
      now: () => FIXED_NOW,
      config: tightConfig
    });

    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.count).toBe(0);
    expect(result.remaining).toBe(3);
  });

  it("blocks once the count reaches the configured limit (and never invents a misleading resetAt)", async () => {
    const { service } = fakeServiceClient({ count: 3, error: null });

    const result = await checkGenerationRateLimit(asServiceClient(service), "project-1", {
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

    const expectedWindowStart = new Date(FIXED_NOW - ONE_DAY_MS).toISOString();
    expect(result.windowStart).toBe(expectedWindowStart);
    // No `resetAt`/`retryAt` field: a precise reset instant cannot be derived
    // from a single count query (it would require the oldest row's timestamp),
    // and a naive `windowStart + windowLength` always collapses to "now" for a
    // rolling window — which would misleadingly tell a blocked caller "retry
    // immediately". The blocked variant intentionally only carries `windowStart`.
    expect("resetAt" in result).toBe(false);
  });

  it("blocks when the count exceeds the limit (defensive — should never happen but must fail closed)", async () => {
    const { service } = fakeServiceClient({ count: 99, error: null });

    const result = await checkGenerationRateLimit(asServiceClient(service), "project-1", {
      now: () => FIXED_NOW,
      config: tightConfig
    });

    expect(result.allowed).toBe(false);
    if (result.allowed || result.reason !== "rate_limit_exceeded") {
      throw new Error("expected a rate_limit_exceeded verdict");
    }
    expect(result.count).toBe(99);
  });

  it("fails closed (blocks) and sanitizes the error when the lookup itself errors", async () => {
    const { service } = fakeServiceClient({ count: null, error: { message: "raw postgres failure with secrets" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkGenerationRateLimit(asServiceClient(service), "project-1", {
      now: () => FIXED_NOW,
      config: tightConfig
    });

    expect(result.allowed).toBe(false);
    if (result.allowed || result.reason !== "rate_limit_check_failed") {
      throw new Error("expected a rate_limit_check_failed verdict");
    }
    expect(result.error).toBe("rate_limit_lookup_failed");

    // The raw Postgres error must never be forwarded — only the sanitized log line.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = errorSpy.mock.calls[0];
    expect(loggedArgs[0]).toBe("[geo:gensol-rate-limit] lookup_failed");
    expect(JSON.stringify(loggedArgs)).not.toContain("raw postgres failure with secrets");

    errorSpy.mockRestore();
  });

  it("uses DEFAULT_GENERATION_RATE_LIMIT when no config is supplied", async () => {
    const { service } = fakeServiceClient({ count: 5, error: null });

    const result = await checkGenerationRateLimit(asServiceClient(service), "project-1", { now: () => FIXED_NOW });

    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.limit).toBe(DEFAULT_GENERATION_RATE_LIMIT.maxPerWindow);
    expect(result.remaining).toBe(DEFAULT_GENERATION_RATE_LIMIT.maxPerWindow - 5);
  });

  it("is exactly at the boundary: count === limit - 1 still allows, count === limit blocks", async () => {
    const underLimit = fakeServiceClient({ count: 2, error: null });
    const underResult = await checkGenerationRateLimit(asServiceClient(underLimit.service), "project-1", {
      now: () => FIXED_NOW,
      config: tightConfig
    });
    expect(underResult.allowed).toBe(true);

    const atLimit = fakeServiceClient({ count: 3, error: null });
    const atResult = await checkGenerationRateLimit(asServiceClient(atLimit.service), "project-1", {
      now: () => FIXED_NOW,
      config: tightConfig
    });
    expect(atResult.allowed).toBe(false);
  });
});
