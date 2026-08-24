#!/usr/bin/env node
// Concatenates every migration in supabase/migrations/, in order, into one
// paste-able SQL script — for bootstrapping a *new* Supabase project (e.g. the
// CI/preview project) from scratch. Migrations here are applied by hand in the
// Supabase SQL editor (see supabase/migrations/migrations.test.ts); pasting 34
// files one at a time is the error-prone step this removes.
//
// Usage: pnpm run supabase:bundle > /tmp/ci-project-bootstrap.sql
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const files = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const bundle = files
  .map((file) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8").trimEnd();
    return `-- ==== ${file} ====\n${sql}\n`;
  })
  .join("\n");

process.stdout.write(
  `-- Bundled from supabase/migrations/ (${files.length} files) — run once, in order, ` +
    `against a brand-new empty Supabase project.\n\n${bundle}`
);
