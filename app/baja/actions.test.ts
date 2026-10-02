import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setEmailPreferenceAsService = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/email/unsubscribe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/unsubscribe")>();
  return { ...actual, setEmailPreferenceAsService: (...args: unknown[]) => setEmailPreferenceAsService(...args) };
});

import { signUnsubscribeToken } from "@/lib/email/unsubscribe";
import { setEmailPreferenceFromLink } from "./actions";

/**
 * EMAIL-UNSUB-1 (log §232). The page that rendered the form proves nothing:
 * the action re-verifies the signed link on every call, so a crafted POST
 * with someone else's account id reaches no write at all.
 */
const USER = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-with-enough-entropy-000000";
  setEmailPreferenceAsService.mockReset();
  setEmailPreferenceAsService.mockResolvedValue({ ok: true });
});

afterEach(() => {
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
});

describe("setEmailPreferenceFromLink", () => {
  it("applies an opt-out for the account and category the link was signed for", async () => {
    const token = signUnsubscribeToken(USER, "lifecycle") as string;
    const result = await setEmailPreferenceFromLink({ userId: USER, category: "lifecycle", token }, false);

    expect(result).toEqual({ success: true });
    expect(setEmailPreferenceAsService).toHaveBeenCalledWith(expect.anything(), {
      userId: USER,
      category: "lifecycle",
      enabled: false,
      source: "email_link"
    });
  });

  it("undoes it with the same link", async () => {
    const token = signUnsubscribeToken(USER, "lifecycle") as string;
    await setEmailPreferenceFromLink({ userId: USER, category: "lifecycle", token }, true);
    expect(setEmailPreferenceAsService.mock.calls[0][1]).toMatchObject({ enabled: true });
  });

  it("writes nothing for a token signed for another category", async () => {
    const token = signUnsubscribeToken(USER, "weekly_digest") as string;
    const result = await setEmailPreferenceFromLink({ userId: USER, category: "lifecycle", token }, false);

    expect(result.success).toBe(false);
    expect(setEmailPreferenceAsService).not.toHaveBeenCalled();
  });

  it("writes nothing for an unknown category or a malformed account id", async () => {
    const token = signUnsubscribeToken(USER, "lifecycle") as string;
    await setEmailPreferenceFromLink({ userId: USER, category: "current_plan", token }, false);
    await setEmailPreferenceFromLink({ userId: "not-a-uuid", category: "lifecycle", token }, false);
    expect(setEmailPreferenceAsService).not.toHaveBeenCalled();
  });

  it("returns a safe message when the write fails", async () => {
    setEmailPreferenceAsService.mockResolvedValue({ ok: false });
    const token = signUnsubscribeToken(USER, "score_drop") as string;
    const result = await setEmailPreferenceFromLink({ userId: USER, category: "score_drop", token }, false);
    expect(result).toEqual({ success: false, error: expect.stringContaining("No hemos podido") });
  });
});
