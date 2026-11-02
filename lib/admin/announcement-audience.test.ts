import { describe, expect, it } from "vitest";
import { isAnnouncementDay, selectAnnouncementRecipients, type AnnouncementAccount } from "./announcement-audience";

const NOW = new Date("2026-11-03T10:00:00Z"); // a Tuesday

const account = (over: Partial<AnnouncementAccount> = {}): AnnouncementAccount => ({
  id: "u1",
  email: "cliente@ejemplo.com",
  excluded: false,
  optedOut: false,
  confirmed: true,
  alreadyClaimed: false,
  lastLifecycleSentAt: null,
  ...over
});

describe("EXT-REACH-1 (log §436): who gets the announcement", () => {
  it("reaches every confirmed account that has not unsubscribed, whatever its plan", () => {
    const { ready, counts } = selectAnnouncementRecipients([account(), account({ id: "u2", email: "b@ejemplo.com" })], NOW);
    expect(ready.map((r) => r.id)).toEqual(["u1", "u2"]);
    expect(counts.ready).toBe(2);
  });

  it("never our own accounts, nor without an address", () => {
    const { ready, counts } = selectAnnouncementRecipients([account({ excluded: true }), account({ email: null })], NOW);
    expect(ready).toEqual([]);
    expect(counts).toEqual({ ready: 0, waiting: 0, alreadySent: 0, optedOut: 0, unconfirmed: 0 });
  });

  it("skips who unsubscribed, who never confirmed and who already got it", () => {
    const { ready, counts } = selectAnnouncementRecipients(
      [account({ optedOut: true }), account({ confirmed: false }), account({ alreadyClaimed: true, optedOut: true })],
      NOW
    );
    expect(ready).toEqual([]);
    expect(counts).toMatchObject({ optedOut: 1, unconfirmed: 1, alreadySent: 1 });
  });

  it("waits 48 h after another lifecycle email", () => {
    const recent = account({ lastLifecycleSentAt: new Date(NOW.getTime() - 47 * 3600e3) });
    const old = account({ id: "u2", lastLifecycleSentAt: new Date(NOW.getTime() - 49 * 3600e3) });
    const { ready, counts } = selectAnnouncementRecipients([recent, old], NOW);
    expect(ready.map((r) => r.id)).toEqual(["u2"]);
    expect(counts.waiting).toBe(1);
  });

  it("never on a Monday in Madrid", () => {
    expect(isAnnouncementDay(new Date("2026-11-02T10:00:00Z"))).toBe(false);
    expect(isAnnouncementDay(NOW)).toBe(true);
    expect(isAnnouncementDay(new Date("2026-11-01T23:30:00Z"))).toBe(false); // 00:30 Monday in Madrid
  });
});
