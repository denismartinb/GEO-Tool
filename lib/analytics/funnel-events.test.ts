import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { captureFunnelEvent, uuidFromKey } from "@/lib/analytics/funnel-events";

const ORIGINAL_ENV = { ...process.env };

describe("captureFunnelEvent", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com/" };
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts the event keyed by the user id, with no personal data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await captureFunnelEvent("checkout_started", "user-1", { plan_id: "pro" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://eu.i.posthog.com/capture/");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      api_key: "phc_test",
      event: "checkout_started",
      distinct_id: "user-1",
      properties: { plan_id: "pro", source: "server", $geoip_disable: true }
    });
    expect(body.uuid).toBeUndefined();
  });

  it("does nothing without a PostHog key", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await captureFunnelEvent("signup_completed", "user-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when PostHog is down or rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(captureFunnelEvent("scan_completed", "user-1")).resolves.toBeUndefined();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    await expect(captureFunnelEvent("scan_completed", "user-1")).resolves.toBeUndefined();
  });

  it("sends a stable uuid when given a dedupe key, so a retried webhook is one payment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await captureFunnelEvent("payment_completed", "user-1", {}, "evt_123");
    await captureFunnelEvent("payment_completed", "user-1", {}, "evt_123");
    const [a, b] = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string).uuid);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidFromKey("x")).not.toBe(uuidFromKey("y"));
  });
});
