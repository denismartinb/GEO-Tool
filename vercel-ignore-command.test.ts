import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard over `vercel.json`'s `ignoreCommand`.
 *
 * The command tells Vercel to skip the build when a commit touched nothing but
 * internal documentation (exit 0 = skip, exit 1 = build). That is a deploy
 * decision made by a string in a config file, which nothing else in this repo
 * type-checks, lints or exercises — and the failure mode is silent in the
 * worst possible direction: an over-broad exclusion means real product changes
 * stop deploying, with a green PR and no error anywhere.
 *
 * The concrete near-miss this file exists to prevent: the obvious first draft
 * of this command excluded `*.md`. Every blog article in this product is
 * `app/blog/<slug>/page.mdx` — a glob one character away — and the plausible
 * `*.mdx` variant would have quietly stopped publishing new articles while
 * every check stayed green.
 *
 * These assertions are deliberately about the SHAPE of the exclusion list, not
 * about git's matching semantics. Whether the pathspecs actually match what we
 * think they match was verified against real repository history before this
 * landed (see the PR); what rots over time is someone appending a convenient
 * pattern here, which is what this catches.
 */

const REPO_ROOT = process.cwd();

/** Directories whose contents are compiled into the deployed application. */
const BUILD_INPUT_PREFIXES = [
  "app",
  "components",
  "lib",
  "public",
  "supabase",
  "tests",
  "scripts",
  "middleware",
  "next.config",
  "package.json",
  "pnpm-lock",
  "tsconfig",
  "tailwind.config",
  "postcss.config"
];

function readIgnoreCommand(): string {
  const raw = readFileSync(join(REPO_ROOT, "vercel.json"), "utf8");
  const config = JSON.parse(raw) as { ignoreCommand?: string };
  return config.ignoreCommand ?? "";
}

/** Every `:(exclude)<path>` pathspec in the command, in order. */
function readExcludedPaths(command: string): string[] {
  return Array.from(command.matchAll(/:\(exclude\)([^']+)/g)).map((match) => match[1]);
}

describe("vercel.json ignoreCommand", () => {
  const command = readIgnoreCommand();
  const excluded = readExcludedPaths(command);

  it("is configured at all", () => {
    expect(command).not.toBe("");
    expect(excluded.length).toBeGreaterThan(0);
  });

  it("never excludes anything the build compiles", () => {
    // The whole point of the exclusion list is "internal documentation".
    // Anything under app/, lib/, components/, public/, supabase/ or the build
    // config is, by definition, a change that must produce a deployment.
    const offenders = excluded.filter((path) =>
      BUILD_INPUT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    );

    expect(offenders).toEqual([]);
  });

  it("uses literal paths, never wildcards", () => {
    // A wildcard is how this breaks. `*.md` or `*.mdx` reads as "documentation"
    // and silently swallows app/blog/<slug>/page.mdx — every article in the
    // product. Literal paths cannot reach into a directory they do not name.
    const wildcards = excluded.filter((path) => /[*?[\]]/.test(path));

    expect(wildcards).toEqual([]);
  });

  it("builds when git cannot answer, rather than skipping", () => {
    // `git diff --quiet` exits 128 when HEAD^ does not exist (a root commit, a
    // clone too shallow to have a parent). Vercel reads exit 0 as "skip", so
    // an unnormalised command could turn a git error into a silently missing
    // deployment. `test $? -eq 0` collapses every non-zero code to 1 = build:
    // when in doubt, deploy. Verified against this repo's root commit.
    expect(command).toContain("test $? -eq 0");
  });

  it("only ever skips for paths that exist", () => {
    // A stale exclusion is harmless to the build but is a lie about what the
    // rule covers, and it hides that someone renamed a directory without
    // revisiting this list.
    const missing = excluded.filter((path) => !existsSync(join(REPO_ROOT, path)));

    expect(missing).toEqual([]);
  });
});
