import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SCAN-LIVE-RUN-INDEX-1 — the migration and the code must agree on what
 * "live" means. The migration is applied by hand and nothing executes it
 * before it reaches a human (supabase/migrations/migrations.test.ts), so the
 * only thing that can keep its predicate honest is a static contract against
 * the code that reads the same set.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const MIGRATION = "supabase/migrations/0039_scan_runs_one_live_per_project.sql";
const sql = read(MIGRATION).replace(/--.*$/gm, "");

describe("0039 — one live run per project", () => {
  it("is a UNIQUE partial index on project_id alone", () => {
    expect(sql).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+scan_runs_one_live_per_project_uniq/i);
    expect(sql).toMatch(/on\s+public\.scan_runs\s*\(\s*project_id\s*\)/i);
  });

  it("covers exactly the statuses the application's active-run check reads", () => {
    const predicate = /where\s+status\s+in\s*\(([^)]*)\)/i.exec(sql)?.[1] ?? "";
    const indexed = predicate.split(",").map((s) => s.trim().replace(/'/g, "")).sort();

    const code = read("lib/scan/run-creation.ts");
    const readSet = /\.in\("status",\s*\[([^\]]*)\]\)/.exec(code)?.[1] ?? "";
    const read_ = readSet.split(",").map((s) => s.trim().replace(/"/g, "")).sort();

    expect(indexed).toEqual(["pending", "running"]);
    expect(indexed).toEqual(read_);
  });

  it("never constrains a terminal status", () => {
    const check = /scan_runs_status_chk[^;]*check \(status in \(([^)]*)\)\)/i.exec(
      read("supabase/migrations/0001_v0_schema.sql")
    )?.[1];
    const all = (check ?? "").split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(all.sort()).toEqual(["cancelled", "completed", "failed", "pending", "running"]);
    for (const terminal of ["completed", "failed", "cancelled"]) {
      expect(sql).not.toContain(`'${terminal}'`);
    }
  });

  it("changes no data and no policy: it is one CREATE INDEX and nothing else", () => {
    const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
    expect(statements).toHaveLength(1);
    expect(sql).not.toMatch(/\b(insert|update|delete|alter|drop|grant|revoke)\b/i);
  });

  it("documents its own pre-flight and rollback", () => {
    const raw = read(MIGRATION);
    expect(raw).toMatch(/PRE-FLIGHT/);
    expect(raw).toMatch(/ROLLBACK/);
    expect(raw).toMatch(/drop index if exists public\.scan_runs_one_live_per_project_uniq/);
  });
});

describe("run creation maps the lost race to the error the pre-check already uses", () => {
  const code = read("lib/scan/run-creation.ts");

  it("23505 on the run insert becomes active_run_exists, before the generic scan_failed", () => {
    const mapped = code.indexOf('runError?.code === UNIQUE_VIOLATION');
    const generic = code.indexOf("if (runError || !run)");
    expect(mapped).toBeGreaterThan(-1);
    expect(generic).toBeGreaterThan(mapped);
    expect(code).toContain('const UNIQUE_VIOLATION = "23505"');
  });

  it("scan_runs has a single insert site, so the mapping covers every launcher", () => {
    const sites = [
      "lib/scan/run-creation.ts",
      "lib/scan/reconciliation.ts",
      "lib/scan/cron.ts",
      "lib/scan/launch.ts",
      "lib/scan/executor.ts",
      "lib/scan/resume.ts",
      "lib/projects/create-project.ts"
    ].flatMap((file) => {
      const src = read(file);
      return /from\("scan_runs"\)\s*\.insert\(/.test(src) ? [file] : [];
    });
    expect(sites).toEqual(["lib/scan/run-creation.ts"]);
  });
});
