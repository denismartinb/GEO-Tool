import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

import { updateNotificationPreference, type NotificationPreferenceKey } from "./actions";

type Row = Record<string, unknown>;

function fakeSupabase(opts: { updateError?: string; insertError?: string } = {}) {
  const updates: Array<{ patch: Row; id: string }> = [];
  const events: Row[] = [];
  return {
    client: {
      from(table: string) {
        if (table === "profiles") {
          return {
            update(patch: Row) {
              return {
                eq(_column: string, id: string) {
                  updates.push({ patch, id });
                  return Promise.resolve({ error: opts.updateError ? { message: opts.updateError } : null });
                }
              };
            }
          };
        }
        if (table === "email_preference_events") {
          return {
            insert(row: Row) {
              events.push(row);
              return Promise.resolve({ error: opts.insertError ? { message: opts.insertError } : null });
            }
          };
        }
        throw new Error(`unexpected table ${table}`);
      }
    },
    updates,
    events
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

  it("records the change in the audit trail with its category and source", async () => {
    const { client, events } = fakeSupabase();
    requireUser.mockResolvedValue({ supabase: client, user: { id: "user-1" } });

    await updateNotificationPreference("notify_lifecycle", false);

    expect(events).toEqual([{ owner_user_id: "user-1", category: "lifecycle", enabled: false, source: "settings" }]);
  });

  it("accepts the two EMAIL-UNSUB-1 columns", async () => {
    const { client, updates } = fakeSupabase();
    requireUser.mockResolvedValue({ supabase: client, user: { id: "user-1" } });

    await updateNotificationPreference("notify_first_scan", true);
    await updateNotificationPreference("notify_lifecycle", true);

    expect(updates.map((u) => u.patch)).toEqual([{ notify_first_scan: true }, { notify_lifecycle: true }]);
  });

  it("keeps the saved preference when only the audit row fails", async () => {
    const { client } = fakeSupabase({ insertError: "audit down" });
    requireUser.mockResolvedValue({ supabase: client, user: { id: "user-1" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await updateNotificationPreference("notify_weekly_digest", false);

    expect(result).toEqual({ success: true });
    errorSpy.mockRestore();
  });

  it("refuses a column that is not an email preference, without touching the database", async () => {
    const { client, updates } = fakeSupabase();
    requireUser.mockResolvedValue({ supabase: client, user: { id: "user-1" } });

    const result = await updateNotificationPreference("current_plan" as NotificationPreferenceKey, true);

    expect(result.success).toBe(false);
    expect(updates).toEqual([]);
  });

  it("returns a safe error and doesn't throw when the write fails", async () => {
    const { client, events } = fakeSupabase({ updateError: "db down" });
    requireUser.mockResolvedValue({ supabase: client, user: { id: "user-1" } });

    const result = await updateNotificationPreference("notify_weekly_digest", true);

    expect(result).toEqual({ success: false, error: "No se pudo guardar la preferencia. Inténtalo de nuevo." });
    expect(events).toEqual([]);
  });
});
