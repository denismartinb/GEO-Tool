import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  NON_PUBLIC_PATH_PATTERN,
  SESSION_CACHE_KEY,
  SESSION_HINT_ATTR,
  SESSION_PREFETCH_PROP
} from "./session-hint";

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

/**
 * header-flicker-prehydration-2 (2026-09-19). The inline script in
 * `app/layout.tsx` is built as a string, so nothing in `tsc`, `eslint` or any
 * render test ever executes it — the same blind spot that let the
 * `undefined`-key bug above ship. These assert its two load-bearing
 * properties against the real source, which is the only place they exist.
 */
describe("the pre-hydration session script", () => {
  const layout = readFileSync(fileURLToPath(new URL("../app/layout.tsx", import.meta.url)), "utf8");
  const script = layout.slice(layout.indexOf("const SESSION_HINT_SCRIPT"), layout.indexOf("export default function RootLayout"));

  it("reads the hint from localStorage, so it survives closing the tab", () => {
    expect(script).toContain("localStorage.getItem");
    expect(script).not.toContain("sessionStorage");
  });

  it("starts the /api/me request itself, before any bundle exists", () => {
    expect(script).toContain("fetch('/api/me'");
    // Asserted by constant name, not by value: the source interpolates it
    // (`window[${JSON.stringify(SESSION_PREFETCH_PROP)}]`), so the literal
    // string only exists in the built output, and checking for the import is
    // what proves the two sides cannot drift apart.
    expect(script).toContain("SESSION_PREFETCH_PROP");
    expect(SESSION_PREFETCH_PROP).toBe("__gsSessionPrefetch");
    // Without its own catch, a prefetch nothing adopts (a non-public path
    // reached by client-side navigation, a mount that never happens) surfaces
    // as an unhandled rejection in the console of a marketing page.
    expect(script).toContain(".catch(");
  });

  it("skips the prefetch where nothing reads the answer", () => {
    const nonPublic = new RegExp(NON_PUBLIC_PATH_PATTERN);
    for (const path of ["/dashboard", "/dashboard/projects/abc", "/admin", "/mfa", "/login", "/signup", "/api/me"]) {
      expect(nonPublic.test(path), path).toBe(true);
    }
    // Every surface that renders PublicHeader must still prefetch — including
    // paths that merely start with one of those words.
    for (const path of ["/", "/blog", "/blog/que-es-geo", "/pricing", "/geo", "/docs", "/comparativas", "/loginfo"]) {
      expect(nonPublic.test(path), path).toBe(false);
    }
  });
});
