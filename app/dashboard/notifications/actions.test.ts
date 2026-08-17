import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const serviceClientHolder: { current: unknown } = { current: null };
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => serviceClientHolder.current }));

import { markNotificationsRead } from "./actions";

type Call = {
  patch: Record<string, unknown>;
  ownerUserId?: string;
  ids?: string[];
  readAtFilter?: unknown;
};

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
            in(column: string, values: string[]) {
              if (column === "id") call.ids = values;
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

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  requireUser.mockReset();
  revalidatePath.mockReset();
  serviceClientHolder.current = null;
});

describe("markNotificationsRead", () => {
  it("sets read_at only for the ids given, scoped to the current user and still unread", async () => {
    const { service, calls } = fakeService();
    serviceClientHolder.current = service;
    requireUser.mockResolvedValue({ user: { id: "owner-1" } });

    const result = await markNotificationsRead([ID_A, ID_B]);

    expect(result).toEqual({ success: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].ownerUserId).toBe("owner-1");
    expect(calls[0].ids).toEqual([ID_A, ID_B]);
    expect(calls[0].readAtFilter).toBeNull();
    expect(typeof calls[0].patch.read_at).toBe("string");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });

  it("returns a safe failure and does not revalidate when the write errors", async () => {
    const { service } = fakeService("db down");
    serviceClientHolder.current = service;
    requireUser.mockResolvedValue({ user: { id: "owner-1" } });

    const result = await markNotificationsRead([ID_A]);

    expect(result).toEqual({ success: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an invalid id list before touching auth or the database", async () => {
    const { service, calls } = fakeService();
    serviceClientHolder.current = service;
    requireUser.mockResolvedValue({ user: { id: "owner-1" } });

    expect(await markNotificationsRead([])).toEqual({ success: false });
    expect(await markNotificationsRead(["not-a-uuid"])).toEqual({ success: false });
    expect(await markNotificationsRead(Array.from({ length: 51 }, () => ID_A))).toEqual({ success: false });

    expect(requireUser).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
