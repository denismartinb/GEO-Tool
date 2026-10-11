import { afterEach, describe, expect, it, vi } from "vitest";
import { applyInternalVisitorParam, isInternalVisitor, setInternalVisitor } from "@/lib/analytics/internal-visitor";

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k)
    }
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("internal visitor flag", () => {
  it("is set by ?interno=1 and cleared by ?interno=0", () => {
    stubStorage();
    expect(isInternalVisitor()).toBe(false);
    applyInternalVisitorParam("?utm_source=x&interno=1");
    expect(isInternalVisitor()).toBe(true);
    applyInternalVisitorParam("?foo=bar");
    expect(isInternalVisitor()).toBe(true);
    applyInternalVisitorParam("?interno=0");
    expect(isInternalVisitor()).toBe(false);
    setInternalVisitor(true);
    expect(isInternalVisitor()).toBe(true);
  });

  it("reads as a real visitor when storage is unavailable", () => {
    vi.stubGlobal("window", {});
    expect(isInternalVisitor()).toBe(false);
    expect(() => setInternalVisitor(true)).not.toThrow();
  });
});
