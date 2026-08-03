import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard over the hand-applied migration files.
 *
 * Migrations in this repo are applied manually in the Supabase SQL editor
 * (each file says so), so nothing executes them before they reach the
 * founder. That makes a migration that CANNOT run a defect the normal
 * pipeline is blind to — `pnpm run validate` passes, tests pass, the PR looks
 * green, and the error surfaces only when a human pastes it into a SQL editor.
 *
 * That is exactly how 0025 shipped with a subquery inside a CHECK constraint
 * (`ERROR: 0A000: cannot use subquery in check constraint`) — a restriction
 * Postgres enforces unconditionally, so the statement could never have
 * succeeded on any database, in any state.
 *
 * These checks are deliberately narrow: they catch statically-decidable
 * "this can never run" mistakes, not semantic ones. Real validation would mean
 * applying every migration to a throwaway Postgres in CI, which is a bigger
 * infrastructure decision than this file. Until then, each rule here should
 * correspond to a mistake that actually reached production.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function readMigrations(): Array<{ file: string; sql: string }> {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), "utf8") }));
}

/** Strips `--` line comments so prose about SQL is never mistaken for SQL. */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const commentStart = line.indexOf("--");
      return commentStart === -1 ? line : line.slice(0, commentStart);
    })
    .join("\n");
}

/**
 * Extracts the parenthesised body of every `check (...)` in the statement,
 * balancing nested parentheses so the whole expression is captured rather
 * than stopping at the first `)`.
 */
function extractCheckBodies(sql: string): string[] {
  const bodies: string[] = [];
  const pattern = /\bcheck\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sql)) !== null) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;

    while (index < sql.length && depth > 0) {
      if (sql[index] === "(") depth += 1;
      else if (sql[index] === ")") depth -= 1;
      index += 1;
    }

    bodies.push(sql.slice(start, index - 1));
  }

  return bodies;
}

describe("supabase migrations", () => {
  const migrations = readMigrations();

  it("finds migration files to check", () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it("never puts a subquery inside a CHECK constraint", () => {
    // Postgres rejects this unconditionally (SQLSTATE 0A000). A migration
    // containing one is not "risky" — it is unrunnable.
    const offenders = migrations
      .filter(({ sql }) => extractCheckBodies(stripComments(sql)).some((body) => /\bselect\b/i.test(body)))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("keeps hand-applied DDL re-runnable from an unknown state", () => {
    // Applying by hand can fail in transport (a dropped mobile connection
    // produced "Load failed (api.supabase.com)" with no way to tell whether
    // the statements ran). Any migration written after that incident must be
    // safe to re-run. Older migrations predate the rule and are exempt.
    //
    // 0025, not 0023: `0023_project_suggested_competitors.sql` landed on main
    // independently and without knowledge of this rule. Editing an
    // already-applied migration to satisfy a rule written after it is worse
    // than exempting it — the file is a record of what was run, not a
    // maintained artifact. The rule binds from the first migration written
    // once it existed.
    const IDEMPOTENCY_REQUIRED_FROM = "0025";

    const offenders = migrations
      .filter(({ file }) => file.slice(0, 4) >= IDEMPOTENCY_REQUIRED_FROM)
      .flatMap(({ file, sql }) => {
        const body = stripComments(sql);
        // Whole statements, not just the `add column` fragment — the guard
        // clause sits AFTER those two words, so a match that stops there can
        // never see it.
        const statements = body.match(/\balter\s+table\b[^;]*;/gis) ?? [];
        const unguarded = statements.filter(
          (statement) =>
            /\badd\s+column\b/i.test(statement) && !/\badd\s+column\s+if\s+not\s+exists\b/i.test(statement)
        );
        return unguarded.length ? [file] : [];
      });

    expect(offenders).toEqual([]);
  });

  it("says how it is applied, so nobody assumes a runner picks it up", () => {
    const offenders = migrations
      .filter(({ sql }) => !/apply\s+manually/i.test(sql))
      .map(({ file }) => file);

    // Older migrations predate the convention; only assert it does not regress
    // for the ones that established it.
    const recent = offenders.filter((file) => file.slice(0, 4) >= "0022");
    expect(recent).toEqual([]);
  });
});
