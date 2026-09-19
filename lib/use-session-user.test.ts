import { describe, expect, it, vi, afterEach } from "vitest";
import { readCachedSessionUser, writeCachedSessionUser, type SessionUser } from "./use-session-user";

/**
 * `vitest.config.ts` runs `environment: "node"` — no real `localStorage` —
 * so this is a minimal in-memory stand-in, same spirit as the `fetch` mocks
 * elsewhere in the repo (`vi.stubGlobal`, e.g. `lib/llm/gemini.test.ts`).
 */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    }
  };
}

const USER: SessionUser = { email: "founder@genscore.es", planId: "pro", planName: "Pro" };

describe("readCachedSessionUser / writeCachedSessionUser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a written user", () => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    writeCachedSessionUser(USER);
    expect(readCachedSessionUser()).toEqual(USER);
  });

  it("returns null when nothing was ever cached", () => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    expect(readCachedSessionUser()).toBeNull();
  });

  it("clears the cache when writing null, so a stale identity can't linger", () => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    writeCachedSessionUser(USER);
    writeCachedSessionUser(null);
    expect(readCachedSessionUser()).toBeNull();
  });

  it("fails safe (returns null) when localStorage throws, e.g. private browsing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
      removeItem: () => {
        throw new Error("storage disabled");
      },
      clear: () => {},
      key: () => null,
      length: 0
    });
    expect(() => writeCachedSessionUser(USER)).not.toThrow();
    expect(readCachedSessionUser()).toBeNull();
  });

  it("fails safe (returns null) on corrupted JSON instead of throwing", () => {
    const storage = createMemoryStorage();
    storage.setItem("gs_session_user_hint", "{not valid json");
    vi.stubGlobal("localStorage", storage);
    expect(readCachedSessionUser()).toBeNull();
  });
});

/**
 * header-flicker-prehydration-2 (2026-09-19). The regression guard for the
 * whole point of that pass: this cache MUST outlive the tab. When it lived in
 * `sessionStorage` the hint was present only on a second navigation inside
 * one tab, so every way a phone actually opens a site — a link from another
 * app, a new tab, after the browser was closed — started with an empty cache
 * and paid the full anonymous flash. A future refactor swapping the storage
 * back would reinstate that silently: nothing would throw, nothing would look
 * wrong locally, and the flicker would only show up on someone's phone.
 */
describe("the identity cache survives closing the tab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes to localStorage, never sessionStorage", () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);

    writeCachedSessionUser(USER);

    expect(local.getItem("gs_session_user_hint")).toContain(USER.email);
    expect(session.getItem("gs_session_user_hint")).toBeNull();
  });

  it("reads from localStorage, ignoring anything left in sessionStorage", () => {
    const session = createMemoryStorage();
    session.setItem("gs_session_user_hint", JSON.stringify(USER));
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", session);

    expect(readCachedSessionUser()).toBeNull();
  });
});
