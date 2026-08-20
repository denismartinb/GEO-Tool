import { describe, expect, it, vi, afterEach } from "vitest";
import { readCachedSessionUser, writeCachedSessionUser, type SessionUser } from "./use-session-user";

/**
 * `vitest.config.ts` runs `environment: "node"` — no real `sessionStorage` —
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
    vi.stubGlobal("sessionStorage", createMemoryStorage());
    writeCachedSessionUser(USER);
    expect(readCachedSessionUser()).toEqual(USER);
  });

  it("returns null when nothing was ever cached", () => {
    vi.stubGlobal("sessionStorage", createMemoryStorage());
    expect(readCachedSessionUser()).toBeNull();
  });

  it("clears the cache when writing null, so a stale identity can't linger", () => {
    vi.stubGlobal("sessionStorage", createMemoryStorage());
    writeCachedSessionUser(USER);
    writeCachedSessionUser(null);
    expect(readCachedSessionUser()).toBeNull();
  });

  it("fails safe (returns null) when sessionStorage throws, e.g. private browsing", () => {
    vi.stubGlobal("sessionStorage", {
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
    vi.stubGlobal("sessionStorage", storage);
    expect(readCachedSessionUser()).toBeNull();
  });
});
