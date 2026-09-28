import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildUnsubscribeLinks,
  isUnsubscribeConfigured,
  setEmailPreferenceAsService,
  signUnsubscribeToken,
  verifyUnsubscribeToken
} from "./unsubscribe";

/**
 * EMAIL-UNSUB-1 (log §232). The token IS the identity of every sessionless
 * write in this feature, so what matters is what it refuses: another account,
 * another category, a tampered or truncated token, a missing secret. A token
 * that verified for the wrong (account, category) pair would let one email's
 * link unsubscribe someone else.
 */

const USER = "11111111-2222-4333-8444-555555555555";
const OTHER_USER = "99999999-2222-4333-8444-555555555555";

beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-with-enough-entropy-000000";
});

afterEach(() => {
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
});

describe("verifyUnsubscribeToken", () => {
  it("accepts the token it signed for the same account and category", () => {
    const token = signUnsubscribeToken(USER, "lifecycle");
    expect(verifyUnsubscribeToken({ userId: USER, category: "lifecycle", token })).toBe(true);
  });

  it("refuses it for another account", () => {
    const token = signUnsubscribeToken(USER, "lifecycle");
    expect(verifyUnsubscribeToken({ userId: OTHER_USER, category: "lifecycle", token })).toBe(false);
  });

  it("refuses it for another category", () => {
    const token = signUnsubscribeToken(USER, "weekly_digest");
    expect(verifyUnsubscribeToken({ userId: USER, category: "lifecycle", token })).toBe(false);
  });

  it("refuses a tampered, truncated, empty or oversized token", () => {
    const token = signUnsubscribeToken(USER, "lifecycle") as string;
    const flipped = (token[0] === "A" ? "B" : "A") + token.slice(1);
    for (const bad of [flipped, token.slice(0, -2), "", "x".repeat(500), null, 42]) {
      expect(verifyUnsubscribeToken({ userId: USER, category: "lifecycle", token: bad })).toBe(false);
    }
  });

  it("refuses a malformed account id without throwing", () => {
    expect(verifyUnsubscribeToken({ userId: "../../etc", category: "lifecycle", token: "abc" })).toBe(false);
    expect(verifyUnsubscribeToken({ userId: undefined, category: "lifecycle", token: "abc" })).toBe(false);
  });

  it("refuses everything once the secret changes (rotation invalidates old links)", () => {
    const token = signUnsubscribeToken(USER, "lifecycle");
    process.env.EMAIL_UNSUBSCRIBE_SECRET = "another-secret-entirely-000000000000";
    expect(verifyUnsubscribeToken({ userId: USER, category: "lifecycle", token })).toBe(false);
  });
});

describe("without a secret nothing is signed or verified", () => {
  beforeEach(() => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  });

  it("is reported as not configured and builds no links", () => {
    expect(isUnsubscribeConfigured()).toBe(false);
    expect(signUnsubscribeToken(USER, "lifecycle")).toBeNull();
    expect(buildUnsubscribeLinks(USER, "lifecycle")).toBeNull();
    expect(verifyUnsubscribeToken({ userId: USER, category: "lifecycle", token: "anything" })).toBe(false);
  });
});

describe("buildUnsubscribeLinks", () => {
  it("points the page and the one-click target at the same signed (u, c, t)", () => {
    const links = buildUnsubscribeLinks(USER, "first_scan");
    expect(links?.pageUrl.startsWith("https://www.genscore.es/baja?")).toBe(true);
    expect(links?.oneClickUrl.startsWith("https://www.genscore.es/api/email/unsubscribe?")).toBe(true);

    const params = new URL(links!.oneClickUrl).searchParams;
    expect(params.get("u")).toBe(USER);
    expect(params.get("c")).toBe("first_scan");
    expect(verifyUnsubscribeToken({ userId: USER, category: "first_scan", token: params.get("t") })).toBe(true);
    expect(new URL(links!.pageUrl).search).toBe(new URL(links!.oneClickUrl).search);
  });
});

describe("setEmailPreferenceAsService", () => {
  function fakeService(opts: { updateError?: string; insertError?: string } = {}) {
    const updates: Array<{ patch: Record<string, unknown>; id: string }> = [];
    const events: Array<Record<string, unknown>> = [];
    const client = {
      from(table: string) {
        if (table === "profiles") {
          return {
            update: (patch: Record<string, unknown>) => ({
              eq: (_col: string, id: string) => {
                updates.push({ patch, id });
                return Promise.resolve({ error: opts.updateError ? { message: opts.updateError } : null });
              }
            })
          };
        }
        return {
          insert: (row: Record<string, unknown>) => {
            events.push(row);
            return Promise.resolve({ error: opts.insertError ? { message: opts.insertError } : null });
          }
        };
      }
    };
    return { client: client as never, updates, events };
  }

  it("changes exactly one column of exactly that account, then records it", async () => {
    const { client, updates, events } = fakeService();
    const result = await setEmailPreferenceAsService(client, {
      userId: USER,
      category: "lifecycle",
      enabled: false,
      source: "one_click"
    });

    expect(result).toEqual({ ok: true });
    expect(updates).toEqual([{ patch: { notify_lifecycle: false }, id: USER }]);
    expect(events).toEqual([{ owner_user_id: USER, category: "lifecycle", enabled: false, source: "one_click" }]);
  });

  it("reports a failed flag write and records nothing", async () => {
    const { client, events } = fakeService({ updateError: "down" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await setEmailPreferenceAsService(client, {
      userId: USER,
      category: "score_drop",
      enabled: false,
      source: "email_link"
    });
    spy.mockRestore();

    expect(result).toEqual({ ok: false });
    expect(events).toEqual([]);
  });

  it("keeps an applied opt-out even if only the audit row fails", async () => {
    const { client } = fakeService({ insertError: "down" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await setEmailPreferenceAsService(client, {
      userId: USER,
      category: "weekly_digest",
      enabled: false,
      source: "email_link"
    });
    spy.mockRestore();

    expect(result).toEqual({ ok: true });
  });
});
