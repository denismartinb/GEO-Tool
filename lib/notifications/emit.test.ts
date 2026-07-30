import { describe, expect, it, vi } from "vitest";
import { emitNotification } from "./emit";

type UpsertCall = { row: Record<string, unknown>; options: Record<string, unknown> };

/**
 * Fake service client covering exactly the shape emitNotification issues:
 * `service.from("notifications").upsert(row, options)`. `behavior` lets
 * individual tests make the call return a Supabase-style error, or throw
 * outright (network failure), without emitNotification ever propagating
 * either.
 */
function fakeService(behavior: "ok" | "error" | "throws" = "ok") {
  const calls: UpsertCall[] = [];
  const service = {
    from(table: string) {
      if (table !== "notifications") throw new Error(`unexpected table ${table}`);
      return {
        upsert: (row: Record<string, unknown>, options: Record<string, unknown>) => {
          calls.push({ row, options });
          if (behavior === "throws") throw new Error("connection reset");
          if (behavior === "error") return Promise.resolve({ error: { message: "constraint violation" } });
          return Promise.resolve({ error: null });
        }
      };
    }
  };
  return { service, calls };
}

const BASE_INPUT = {
  ownerUserId: "owner-1",
  projectId: "project-1",
  type: "scan_completed" as const,
  severity: "success" as const,
  dedupeKey: "scan_completed:run-1",
  payload: {
    runId: "run-1",
    promptsProcessed: 20,
    providers: ["gemini"],
    visibilityScore: 64,
    visibilityDelta: 6,
    newRecommendations: 5,
    resolvedGaps: 2
  }
};

describe("emitNotification", () => {
  it("upserts a row idempotently against (owner_user_id, dedupe_key)", async () => {
    const { service, calls } = fakeService();

    await emitNotification(service as never, BASE_INPUT);

    expect(calls).toHaveLength(1);
    expect(calls[0].row).toMatchObject({
      owner_user_id: "owner-1",
      project_id: "project-1",
      type: "scan_completed",
      severity: "success",
      dedupe_key: "scan_completed:run-1",
      payload_json: BASE_INPUT.payload
    });
    expect(calls[0].options).toEqual({ onConflict: "owner_user_id,dedupe_key", ignoreDuplicates: true });
  });

  it("calling twice with the same dedupeKey issues two idempotent upserts, not two distinct rows", async () => {
    const { service, calls } = fakeService();

    await emitNotification(service as never, BASE_INPUT);
    await emitNotification(service as never, BASE_INPUT);

    // The idempotency guarantee lives in the DB unique index + ignoreDuplicates
    // (asserted above via the upsert options); at this layer we only assert
    // emitNotification issues the same upsert call both times rather than
    // growing extra writes on a retry.
    expect(calls).toHaveLength(2);
    expect(calls[0].row.dedupe_key).toBe(calls[1].row.dedupe_key);
  });

  it("resolves without throwing when the client reports an error", async () => {
    const { service } = fakeService("error");

    await expect(emitNotification(service as never, BASE_INPUT)).resolves.toBeUndefined();
  });

  it("resolves without throwing when the client itself throws", async () => {
    const { service } = fakeService("throws");

    await expect(emitNotification(service as never, BASE_INPUT)).resolves.toBeUndefined();
  });

  it("never logs the payload in full, even on failure", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = fakeService("error");

    await emitNotification(service as never, BASE_INPUT);

    expect(consoleErrorSpy).toHaveBeenCalled();
    for (const call of consoleErrorSpy.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain("promptsProcessed");
      expect(serialized).not.toContain("visibilityScore");
    }

    consoleErrorSpy.mockRestore();
  });
});
