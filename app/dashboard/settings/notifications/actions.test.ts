import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

import { updateNotificationPreference } from "./actions";

type Row = Record<string, unknown>;

function fakeSupabase(updateError?: string) {
  const updates: Array<{ patch: Row; id: string }> = [];
  return {
    client: {
      from(table: string) {
        if (table !== "profiles") throw new Error(`unexpected table ${table}`);
        return {
          update(patch: Row) {
            return {
              eq(_column: string, id: string) {
                updates.push({ patch, id });
                return Promise.resolve({ error: updateError ? { message: updateError } : null });
              }
            };
          }
        };
      }
    },
    updates
  };
}

beforeEach(() => {
  requireUser.mockReset();
});

describe("updateNotificationPreference", () => {
  it("persists the given preference column scoped to the current user", async () => {
    const { client, updates } = fakeSupabase();
    requireUser.mockResolvedValue({ supabase: client, user: { id: "user-1" } });

    const result = await updateNotificationPreference("notify_score_drop_alert", false);

    expect(result).toEqual({ success: true });
    expect(updates).toEqual([{ patch: { notify_score_drop_alert: false }, id: "user-1" }]);
  });

  it("returns a safe error and doesn't throw when the write fails", async () => {
    const { client } = fakeSupabase("db down");
    requireUser.mockResolvedValue({ supabase: client, user: { id: "user-1" } });

    const result = await updateNotificationPreference("notify_weekly_digest", true);

    expect(result).toEqual({ success: false, error: "No se pudo guardar la preferencia. Inténtalo de nuevo." });
  });
});
