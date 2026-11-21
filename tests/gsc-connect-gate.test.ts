import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GSC-CONNECT-GATE-1 (log §413): an invitation to connect Search Console is
 * only shown after reading the project's real connection state, and only
 * when that state is "disconnected" or "reconnect". The Chrome panel showed
 * «Conectar con Google» on an inner page of a domain that was already
 * connected, because it painted the invite whenever it had no state at all
 * (EXT-GSC-2 addendum, log §411). Inviting someone who is already connected
 * is a false statement about their account.
 *
 * Source-level contract, like console-page-template.test.ts: every place
 * that renders an invite, or links to the consent route, is listed here and
 * checked for the gate right above it.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\.(tsx?|jsx?)$/.test(name)) out.push(full);
  }
  return out;
}

const SOURCES = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components")), ...walk(join(ROOT, "lib"))];

/** Components that paint an invite to connect. */
const INVITE_TAG = /<(GscConnectPanel|GscConnectRow|GscConnect)\b/g;

/** Readers of the real state: our database (and Google) for this project and owner. */
const STATE_READER = /\b(readSearchConsoleAvailability|loadSearchConsoleOverview|loadSearchConsoleScreen)\b/;

/** The guard has to name the two states that allow an invite. */
const GATE = /(===\s*"disconnected"|===\s*"reconnect")/;

const GATE_WINDOW = 6;

function lineOf(src: string, index: number) {
  return src.slice(0, index).split("\n").length;
}

describe("Search Console connect invite is gated on the real state", () => {
  const renderers = SOURCES.filter((f) => {
    const src = readFileSync(f, "utf8");
    INVITE_TAG.lastIndex = 0;
    return INVITE_TAG.test(src) && !f.endsWith("gsc-connect-invite.tsx") && !f.endsWith("gsc-connect.tsx");
  });

  it("finds the known surfaces (Visión general, Recomendaciones, Posición en Google)", () => {
    const rel = renderers.map((f) => relative(ROOT, f));
    expect(rel).toEqual(
      expect.arrayContaining([
        "app/dashboard/projects/[projectId]/_components/gsc-overview-half.tsx",
        "app/dashboard/projects/[projectId]/recommendations/page.tsx",
        "app/dashboard/projects/[projectId]/search-console/page.tsx"
      ])
    );
  });

  for (const file of renderers) {
    const rel = relative(ROOT, file);
    const src = readFileSync(file, "utf8");

    it(`${rel} reads the real state before inviting`, () => {
      expect(src, `${rel} renders an invite without reading the connection`).toMatch(STATE_READER);
    });

    it(`${rel} only invites on "disconnected" or "reconnect"`, () => {
      const lines = src.split("\n");
      for (const m of src.matchAll(INVITE_TAG)) {
        const at = lineOf(src, m.index ?? 0);
        const above = lines.slice(Math.max(0, at - 1 - GATE_WINDOW), at).join("\n");
        expect(above, `${rel}:${at} <${m[1]}> has no "disconnected"/"reconnect" check above it`).toMatch(GATE);
      }
    });
  }

  it("only the invite and «Posición en Google» build the consent link", () => {
    const allowed = new Set([
      "app/dashboard/projects/[projectId]/_components/gsc-connect-invite.tsx",
      "app/dashboard/projects/[projectId]/search-console/page.tsx",
      // FEATURE-EMAILS-1 (log §417): the Search Console email; its pass reads
      // the real connections first and skips anyone already connected.
      "lib/email/lifecycle/feature-templates.ts"
    ]);
    const builders = SOURCES.filter((f) => /["'`]\/api\/search-console\/connect\?/.test(readFileSync(f, "utf8"))).map(
      (f) => relative(ROOT, f)
    );
    expect(builders.filter((f) => !allowed.has(f))).toEqual([]);
  });
});

describe("Chrome panel: invite only signed out or on the real state", () => {
  const panel = readFileSync(join(ROOT, "docs/chrome-extension/prueba/extension/panel.js"), "utf8");
  const calls = panel
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => line.includes("gscInvite()") && !/const gscInvite\s*=/.test(line));

  it("has invite call sites", () => {
    expect(calls.length).toBeGreaterThan(0);
  });

  it("every call is the signed-out teaser or the disconnected state", () => {
    for (const { line, n } of calls) {
      expect(line, `panel.js:${n} paints the invite without a gate`).toMatch(/!S\.real|S\.real \?|=== "disconnected"/);
      // A missing state (loading, error) is never a reason to invite.
      expect(line, `panel.js:${n} invites when the state is missing`).not.toMatch(/!g\s*\|\|/);
    }
  });
});
