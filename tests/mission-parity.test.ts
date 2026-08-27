import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ANIMATION-PARITY-1 (2026-08-26, `docs/brand/design-decisions-log.md` §168).
 *
 * The first-scan mission is ONE component mounted on SIX screens, and the
 * founder's report was that it did not look or behave like one component:
 * broken outright on Prompts, the figure on two lines on four of the six, and
 * frozen on "Casi está" until a manual reload on five of the six.
 *
 * Every case had the same shape — something OUTSIDE the component decided how
 * it rendered, and nothing failed loudly when a screen disagreed. These are
 * source-level contracts, deliberately crude, guarding exactly the properties
 * that were silently per-screen. The pixel proof is a Playwright fixture built
 * from the compiled CSS (method recorded in the log entry); this is what keeps
 * a future edit from undoing it without anyone noticing.
 */

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

/** The six screens that mount the mission, per `grep -rn "<FirstScanTakeover"`. */
const MISSION_PAGES = [
  "app/dashboard/projects/[projectId]/page.tsx",
  "app/dashboard/projects/[projectId]/prompts/page.tsx",
  "app/dashboard/projects/[projectId]/competitors/page.tsx",
  "app/dashboard/projects/[projectId]/citations/page.tsx",
  "app/dashboard/projects/[projectId]/recommendations/page.tsx",
  "app/dashboard/projects/[projectId]/web-audit/page.tsx"
];

describe("first-scan mission — the six screens agree", () => {
  it("every screen that mounts it puts `mrk-fill` on its own `.page`", () => {
    for (const file of MISSION_PAGES) {
      const src = read(file);
      expect(src, `${file} should mount the mission`).toContain("<FirstScanTakeover");
      // `.mrk-fill` is what turns `.page` into the flex column the mission
      // fills; without it the scene stops at its own min-height cap with grey
      // page underneath (the Prompts bug, but reachable from any of the six).
      expect(src, `${file} must apply mrk-fill to .page while the mission shows`).toMatch(
        /className=\{`page[^`]*\$\{showMissionTakeover \? " mrk-fill" : ""\}/
      );
    }
  });

  it("no screen wraps the mission in a padded box of its own", () => {
    // The regression this replaces: Prompts rendered the mission inside a
    // `<div style={{ paddingTop: 20 }}>`, an extra `auto`-height flex item
    // between `.page.mrk-fill` and `.mrk-full`. The two legitimate wrappers
    // (`.cm2-scope`, `.wa2-scope.wa2-page`) are `display: contents` and carry
    // `mrk-fill` themselves; anything else is the bug coming back.
    for (const file of MISSION_PAGES) {
      const src = read(file);
      const mount = src.indexOf("<FirstScanTakeover");
      const openingLine = src.lastIndexOf("\n", src.lastIndexOf("\n", mount) - 1);
      const preamble = src.slice(Math.max(openingLine, 0), mount);
      expect(preamble, `${file} must not open a styled box right above the mission`).not.toMatch(
        /<div[^>]*style=\{\{[^}]*padding/
      );
    }
  });

  it("the mission hands the screen back itself, on all six", () => {
    const src = read("components/scan-mission-rocket.tsx");
    // Before this, only `app/dashboard/projects/[projectId]/page.tsx` mounted
    // `ScanProgressPoller`, so on the other five the mission sat on its last
    // beat until the user reloaded by hand.
    expect(src).toContain("router.refresh()");
    expect(src).toMatch(/isTerminal \|\| isSuperseded/);
  });
});

describe("first-scan mission — nothing ambient decides how it renders", () => {
  const css = read("app/globals.css");
  const missionShell = css.slice(css.indexOf("\n.mrk-full {"), css.indexOf(".mrk-full.night {"));

  it("pins its own typeface and ink ramp", () => {
    // Two of the six screens wrap it in a brand scope (`.cm2-scope`,
    // `.wa2-scope`) that re-declares both; the other four fell through to
    // `body`'s Hanken Grotesk and the lighter global `--ink-*`, which is also
    // below AA on this screen's own background (4,08:1).
    expect(missionShell).toMatch(/font-family:\s*var\(--font-body\)/);
    for (const token of ["--ink:", "--ink-2:", "--ink-3:", "--ink-4:"]) {
      expect(missionShell, `.mrk-full must pin ${token}`).toContain(`${token} var(--brand-ink`);
    }
  });

  it("caps the copy column in px, never in font-metric units", () => {
    const desktop = css.slice(css.indexOf("  .mrk-copy {"), css.indexOf("  .mrk-title { font-size:"));
    expect(desktop).toMatch(/max-width:\s*\d+px/);
    // `ch` is the advance of the "0" glyph in the element's OWN font, so this
    // cap resolved 269px under Hanken Grotesk and 308px under Figtree — the
    // 39px that decided whether "36 de 78" fitted on one line.
    expect(desktop).not.toMatch(/max-width:\s*[\d.]+ch/);
  });

  it("keeps the figure itself unbreakable", () => {
    const src = read("components/scan-mission-rocket.tsx");
    expect(src).toMatch(/countTitle\(beat\.done, beat\.total\)/);
    expect(src).toContain("`${done}\\u00A0de\\u00A0${total}`");
  });
});
