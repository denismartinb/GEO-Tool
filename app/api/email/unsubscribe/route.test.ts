import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const setEmailPreferenceAsService = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/email/unsubscribe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/unsubscribe")>();
  return { ...actual, setEmailPreferenceAsService: (...args: unknown[]) => setEmailPreferenceAsService(...args) };
});

import { signUnsubscribeToken } from "@/lib/email/unsubscribe";
import { GET, POST } from "./route";

/**
 * EMAIL-UNSUB-1 (log §232). RFC 8058: a POST with a valid signed URL
 * unsubscribes immediately; a GET never does (link scanners fetch URLs on
 * their own), it only sends the person to the confirmation page.
 */
const USER = "11111111-2222-4333-8444-555555555555";

function url(category: string, token: string | null, user = USER) {
  const params = new URLSearchParams({ u: user, c: category });
  if (token !== null) params.set("t", token);
  return `https://www.genscore.es/api/email/unsubscribe?${params.toString()}`;
}

beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-with-enough-entropy-000000";
  setEmailPreferenceAsService.mockReset();
  setEmailPreferenceAsService.mockResolvedValue({ ok: true });
});

afterEach(() => {
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
});

describe("POST /api/email/unsubscribe", () => {
  it("applies the opt-out for a validly signed link", async () => {
    const token = signUnsubscribeToken(USER, "weekly_digest") as string;
    const response = await POST(new NextRequest(url("weekly_digest", token), { method: "POST", body: "List-Unsubscribe=One-Click" }));

    expect(response.status).toBe(200);
    expect(setEmailPreferenceAsService).toHaveBeenCalledWith(expect.anything(), {
      userId: USER,
      category: "weekly_digest",
      enabled: false,
      source: "one_click"
    });
  });

  it("rejects a bad token, a missing token and an unknown category without writing", async () => {
    const token = signUnsubscribeToken(USER, "weekly_digest") as string;
    for (const target of [url("lifecycle", token), url("weekly_digest", null), url("current_plan", token)]) {
      const response = await POST(new NextRequest(target, { method: "POST" }));
      expect(response.status).toBe(400);
    }
    expect(setEmailPreferenceAsService).not.toHaveBeenCalled();
  });

  it("reports a failed write as a server error, not a success", async () => {
    setEmailPreferenceAsService.mockResolvedValue({ ok: false });
    const token = signUnsubscribeToken(USER, "score_drop") as string;
    const response = await POST(new NextRequest(url("score_drop", token), { method: "POST" }));
    expect(response.status).toBe(500);
  });
});

describe("GET /api/email/unsubscribe", () => {
  it("never unsubscribes; redirects to the confirmation page with the same parameters", async () => {
    const token = signUnsubscribeToken(USER, "lifecycle") as string;
    const response = await GET(new NextRequest(url("lifecycle", token)));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/baja");
    expect(location.searchParams.get("t")).toBe(token);
    expect(setEmailPreferenceAsService).not.toHaveBeenCalled();
  });
});
