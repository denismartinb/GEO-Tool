import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const serviceClientHolder: { current: unknown } = { current: null };
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => serviceClientHolder.current }));

import { markAllNotificationsRead } from "./actions";

type Call = { patch: Record<string, unknown>; ownerUserId?: string; readAtFilter?: unknown };

function fakeService(updateError?: string) {
  const calls: Call[] = [];
  const service = {
    from(table: string) {
      if (table !== "notifications") throw new Error(`unexpected table ${table}`);
      return {
        update(patch: Record<string, unknown>) {
          const call: Call = { patch };
          calls.push(call);
          return {
            eq(column: string, value: string) {
              if (column === "owner_user_id") call.ownerUserId = value;
              return this;
            },
            is(column: string, value: unknown) {
              if (column === "read_at") call.readAtFilter = value;
              return Promise.resolve({ error: updateError ? { message: updateError } : null });
            }
          };
        }
      };
    }
  };
  return { service, calls };
}

beforeEach(() => {
  requireUser.mockReset();
  revalidatePath.mockReset();
});

describe("markAllNotificationsRead", () => {
  it("sets read_at only for the current user's still-unread notifications", async () => {
    const { service, calls } = fakeService();
    serviceClientHolder.current = service;
    requireUser.mockResolvedValue({ user: { id: "owner-1" } });

    const result = await markAllNotificationsRead();

    expect(result).toEqual({ success: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].ownerUserId).toBe("owner-1");
    expect(calls[0].readAtFilter).toBeNull();
    expect(typeof calls[0].patch.read_at).toBe("string");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("returns a safe failure and does not revalidate when the write errors", async () => {
    const { service } = fakeService("db down");
    serviceClientHolder.current = service;
    requireUser.mockResolvedValue({ user: { id: "owner-1" } });

    const result = await markAllNotificationsRead();

    expect(result).toEqual({ success: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
