import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
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
        // Cualquier workflow MENOS el del piloto: los demás corren por
        // `push`/`pull_request` y no necesitan un preview para ejercitarse.
        ".github/workflows/ci.yml",
        "tests/adr-numbering.test.ts"
      ]).code
    ).toBe(SKIP);
  });

  it("builds when the pilot itself changes — it needs a preview to run against", () => {
    // The pilot only ever runs against a preview, so a skipped build means the
    // change to it is never exercised (2026-08-05: a fix to the interaction
    // sweep deployed "Ignored" and no pilot ran). Still true after
    // VERCEL-COST-1 Fase 5 made the pilot hand-dispatched: dispatching it needs
    // a preview of that commit to point at.
    const { code, output } = decideFor([
      "docs/agentic-user-pilot.md",
      "tests/pilot/support/explore.ts"
    ]);
    expect(code).toBe(BUILD);
    expect(output).toContain("tests/pilot/support/explore.ts");
  });

  it("builds when the pilot's own WORKFLOW changes — same argument, one level over", () => {
    // Esta prueba invierte a propósito lo que este mismo fichero afirmaba
    // antes (`.github/workflows/ux-pilot.yml` iba en la lista de saltables).
    // Se cambió porque la suposición costó una pasada: el 2026-08-11 el piloto
    // se agotó a los 20 min, el commit que subía el techo a 30 sólo tocaba
    // `.github/` y `docs/`, no hubo build, no hubo preview, y el arreglo del
    // timeout no se pudo ejercitar (log §55). Un workflow que sólo sabe pilotar
    // un preview necesita un deployment igual que lo necesita el código del
    // piloto — sigue siendo cierto desde que se dispara a mano (Fase 5,
    // log §198): sin preview de ese commit, el dispatch se cae.
    const { code, output } = decideFor([
      "docs/agentic-user-pilot.md",
      ".github/workflows/ux-pilot.yml"
    ]);
    expect(code).toBe(BUILD);
    expect(output).toContain(".github/workflows/ux-pilot.yml");
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

  // Inherited from vercel-ignore-command.test.ts (PR #323), which guarded the
  // inline `git diff --quiet HEAD^ HEAD -- ':(exclude)…'` command this script
  // replaces. Its near-miss is worth keeping in front of whoever edits the safe
  // list next: the obvious first draft excluded `*.md`, and every article in
  // this product is `app/blog/<slug>/page.mdx` — one character away from being
  // silently unpublishable with every check still green. Stated as behaviour
  // rather than as string-shape assertions, so it survives a rewrite.
  it.each([
    "app/dashboard/page.tsx",
    "app/blog/some-post/page.mdx",
    "components/ui/button.tsx",
    "lib/scoring/geo-score.ts",
    "public/logo.svg",
    "supabase/migrations/0001_init.sql",
    "middleware.ts",
    "next.config.ts",
    "package.json",
    "tailwind.config.ts"
  ])("always builds when %s changes", (file) => {
    expect(decideFor([file]).code).toBe(BUILD);
  });

  it("is the command vercel.json actually runs, and it is executable", () => {
    const config = JSON.parse(
      readFileSync(path.resolve(__dirname, "..", "vercel.json"), "utf8")
    ) as { ignoreCommand?: string };

    expect(config.ignoreCommand).toBe("bash scripts/vercel-should-build.sh");
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it("only names directories that exist, so the rule is not a lie", () => {
    // A stale entry is harmless to the build but hides that someone renamed a
    // directory without revisiting the safe list.
    for (const dir of ["docs", ".claude", ".github", "tests", "agents"]) {
      expect(existsSync(path.resolve(__dirname, "..", dir))).toBe(true);
    }
  });

  it("skips the agents/ prose directory", () => {
    expect(decideFor(["agents/product-director.md"]).code).toBe(SKIP);
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
