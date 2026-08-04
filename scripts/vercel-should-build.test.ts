import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// BUILD-BUDGET-1 Fase 1. The script decides whether Vercel spends one of the
// 100 daily deployments. Its inverted exit contract (0 = SKIP, non-zero =
// BUILD) is exactly the kind of thing that silently flips during a refactor,
// and the failure mode is not "wasted quota" but "the pilot judged a preview
// built from a different commit". So both directions are pinned here.

const SCRIPT = path.resolve(__dirname, "vercel-should-build.sh");
const SKIP = 0;
const BUILD = 1;

const repos: string[] = [];

afterEach(() => {
  while (repos.length > 0) {
    rmSync(repos.pop() as string, { recursive: true, force: true });
  }
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com"
    }
  }).trim();
}

/**
 * Builds a throwaway repo with two commits: a baseline, then one touching
 * `files`. Returns the SHAs Vercel would expose as PREVIOUS/COMMIT.
 */
function repoWithSecondCommitTouching(files: string[]): {
  cwd: string;
  prev: string;
  sha: string;
} {
  const cwd = mkdtempSync(path.join(tmpdir(), "should-build-"));
  repos.push(cwd);
  git(cwd, "init", "--quiet", "--initial-branch", "main");
  writeFileSync(path.join(cwd, "package.json"), "{}\n");
  git(cwd, "add", "-A");
  git(cwd, "commit", "--quiet", "-m", "baseline");
  const prev = git(cwd, "rev-parse", "HEAD");

  for (const file of files) {
    const target = path.join(cwd, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `touched ${file}\n`);
  }
  git(cwd, "add", "-A");
  git(cwd, "commit", "--quiet", "--allow-empty", "-m", "change");

  return { cwd, prev, sha: git(cwd, "rev-parse", "HEAD") };
}

function decide(
  cwd: string,
  env: Record<string, string | undefined>
): { code: number; output: string } {
  const result = spawnSync("bash", [SCRIPT], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      // Cleared first so a runner that happens to define them (Vercel's own
      // CI, a local shell) cannot leak into the case under test.
      VERCEL_ENV: undefined,
      VERCEL_GIT_COMMIT_SHA: undefined,
      VERCEL_GIT_PREVIOUS_SHA: undefined,
      VERCEL_GIT_COMMIT_REF: undefined,
      ...env
    }
  });
  return { code: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

function decideFor(files: string[], env: Record<string, string> = {}) {
  const { cwd, prev, sha } = repoWithSecondCommitTouching(files);
  return decide(cwd, {
    VERCEL_GIT_PREVIOUS_SHA: prev,
    VERCEL_GIT_COMMIT_SHA: sha,
    ...env
  });
}

describe("vercel-should-build", () => {
  it("skips a push that only touches documentation", () => {
    expect(decideFor(["docs/adr/0028-something.md"]).code).toBe(SKIP);
  });

  it("skips agent config, CI workflows and tests", () => {
    expect(
      decideFor([
        ".claude/rules/scoring.md",
        ".github/workflows/ux-pilot.yml",
        "tests/pilot/journeys/overview.spec.ts"
      ]).code
    ).toBe(SKIP);
  });

  it("skips root-level prose such as CLAUDE.md", () => {
    expect(decideFor(["CLAUDE.md", "README.md"]).code).toBe(SKIP);
  });

  it("builds when a single app file rides along with the docs", () => {
    const { code, output } = decideFor([
      "docs/launch-plan.md",
      "app/dashboard/page.tsx"
    ]);
    expect(code).toBe(BUILD);
    expect(output).toContain("app/dashboard/page.tsx");
  });

  it("builds for a nested .md, which next.config.ts routes as a page", () => {
    expect(decideFor(["app/blog/some-post/page.md"]).code).toBe(BUILD);
  });

  it("builds when the build-decision script itself changes", () => {
    expect(decideFor(["scripts/vercel-should-build.sh"]).code).toBe(BUILD);
  });

  it("builds when dependencies change", () => {
    expect(decideFor(["pnpm-lock.yaml"]).code).toBe(BUILD);
  });

  it("never skips a production deployment, whatever changed", () => {
    expect(decideFor(["docs/launch-plan.md"], { VERCEL_ENV: "production" }).code).toBe(
      BUILD
    );
  });

  it("skips an empty commit — the banned 'retrigger' pattern", () => {
    const { code } = decideFor([]);
    expect(code).toBe(SKIP);
  });

  it("fails open when there is no previous successful deployment", () => {
    const { cwd, sha } = repoWithSecondCommitTouching(["docs/launch-plan.md"]);
    const { code, output } = decide(cwd, { VERCEL_GIT_COMMIT_SHA: sha });
    expect(code).toBe(BUILD);
    expect(output).toContain("no previous successful deployment");
  });

  it("fails open when the previous SHA is not reachable in the shallow clone", () => {
    const { cwd, sha } = repoWithSecondCommitTouching(["docs/launch-plan.md"]);
    const { code, output } = decide(cwd, {
      VERCEL_GIT_PREVIOUS_SHA: "0".repeat(40),
      VERCEL_GIT_COMMIT_SHA: sha
    });
    expect(code).toBe(BUILD);
    expect(output).toContain("not reachable");
  });
});
