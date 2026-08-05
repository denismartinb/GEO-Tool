import { describe, expect, it } from "vitest";
import { isPendingUnread, isVisuallyUnread, unsentUnreadIds } from "./seen";

const unread = (id: string) => ({ id, readAt: null });
const read = (id: string) => ({ id, readAt: "2026-08-05T10:00:00.000Z" });

describe("unsentUnreadIds", () => {
  it("returns only the unread ids that were rendered on this surface", () => {
    expect(unsentUnreadIds([unread("a"), read("b"), unread("c")], new Set())).toEqual(["a", "c"]);
  });

  it("does not resend ids already dispatched in this session", () => {
    expect(unsentUnreadIds([unread("a"), unread("b")], new Set(["a"]))).toEqual(["b"]);
  });

  it("returns nothing once everything visible has been sent", () => {
    expect(unsentUnreadIds([unread("a")], new Set(["a"]))).toEqual([]);
    expect(unsentUnreadIds([read("a")], new Set())).toEqual([]);
  });
});

describe("isPendingUnread", () => {
  it("stops counting a notification the moment it is dispatched, before the write lands", () => {
    expect(isPendingUnread(unread("a"), new Set())).toBe(true);
    expect(isPendingUnread(unread("a"), new Set(["a"]))).toBe(false);
  });

  it("never counts one the server already has as read", () => {
    expect(isPendingUnread(read("a"), new Set())).toBe(false);
  });
});

describe("isVisuallyUnread", () => {
  it("keeps the dot after the server marks it read, for the rest of the session", () => {
    expect(isVisuallyUnread(read("a"), new Set(["a"]))).toBe(true);
  });

  it("drops the dot on a fresh session, where nothing was seen yet", () => {
    expect(isVisuallyUnread(read("a"), new Set())).toBe(false);
  });

  it("shows the dot for anything still unread on the server", () => {
    expect(isVisuallyUnread(unread("a"), new Set())).toBe(true);
  });
});
