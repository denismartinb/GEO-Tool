import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SESSION_CACHE_KEY, SESSION_HINT_ATTR } from "./session-hint";

/**
 * Regression guard for the exact bug this file's header comment describes:
 * when `SESSION_CACHE_KEY` briefly lived in the `"use client"` module
 * `lib/use-session-user.ts`, `app/layout.tsx` (a Server Component) importing
 * it silently got `undefined` at build time instead of the string — Next.js
 * swaps a client module's exports for opaque references, and nothing in
 * `tsc` or `eslint` flags that. The built page shipped
 * `sessionStorage.getItem(undefined)`, disabling the whole feature with no
 * error anywhere. Caught only by reading the actual built HTML.
 */
describe("session-hint", () => {
  it("exports the constants app/layout.tsx's inline script and lib/use-session-user.ts both need", () => {
    expect(SESSION_CACHE_KEY).toBe("gs_session_user_hint");
    expect(SESSION_HINT_ATTR).toBe("data-session-hint");
  });

  it("is never a \"use client\" module", () => {
    const source = readFileSync(fileURLToPath(new URL("./session-hint.ts", import.meta.url)), "utf8");
    expect(source.trimStart().startsWith('"use client"')).toBe(false);
  });
});
