-- 0033_project_engine_toggles.sql
--
-- Phase: ENGINE-DEBUG-TOGGLE-1 (founder-approved 2026-08-10)
--
-- Purpose: a per-project switch per engine (Gemini/Claude/OpenAI) so a scan
-- can be restricted to a subset of engines — e.g. only Gemini — for cheap
-- internal test runs, without touching the deployment-wide LLM_SCAN_PROVIDERS
-- env var or any real customer's engine set.
--
-- Why default TRUE, unlike 0031's audit halves and 0032's sampling switch.
-- Those two defaulted FALSE because the costly mistake was "spend an unwanted
-- campaign" during a prelaunch phase with no paying customers. Here the
-- costly mistake runs the other way: comparing a brand's visibility across
-- Gemini/Claude/OpenAI is the product's actual value proposition, not an
-- optional extra, so a new or existing project silently losing engines would
-- be a real regression, not a saving. TRUE reproduces today's shipped
-- behaviour exactly (every engine the plan allows already runs) — this
-- migration changes nothing until a project's owner deliberately narrows it.
--
-- Why three booleans, not one array/jsonb column. `LLMScanProvider` is a
-- closed union of exactly three known engines (lib/scan/providers.ts) — the
-- same shape WEB-AUDIT-AUTO-SPLIT-1 (0031) used for its two audit halves.
-- One boolean per engine keeps every read a plain `=== true`/`=== false`
-- check, with no JSON parsing or array-membership logic to get wrong on the
-- (still fail-open) unmigrated-column path.
--
-- Reading these columns FAILS OPEN (toward "engine stays enabled"), same
-- reasoning and same asymmetry as 0032's sampling_enabled versus 0031's audit
-- halves: `lib/scan/run-creation.ts` (sizes the run) and `lib/scan/
-- executor.ts` (executes it) both read `projects` on the critical path of
-- every scan the product creates or runs. A migration not yet applied, or a
-- transient read failure, must never be indistinguishable from "the founder
-- turned this engine off" — that would silently shrink every affected scan's
-- engine set product-wide. Each of the two reads is its OWN isolated query
-- (not merged into the existing project select those functions already run),
-- for the same reason `sampling_enabled` is: a column PostgREST does not know
-- about fails the WHOLE select it's part of, not just that field.
--
-- The floor of "at least one engine enabled" is enforced in the server action
-- (`setEngineEnabled`, app/dashboard/projects/[projectId]/actions.ts), not in
-- this schema: a CHECK constraint could not express "at least one of these
-- three columns is true" without a matching-columns trigger, and the more
-- useful failure mode is a clear, specific error at the point the founder
-- tries to turn off the last one — not a raw constraint-violation error.
--
-- No RLS policy changes: `projects` RLS is already keyed off ownership, and
-- these columns are read through the existing project fetches and written
-- through an owner-scoped server action, exactly like `auto_technical_audit_
-- enabled` / `auto_coverage_audit_enabled` (0031) and `sampling_enabled`
-- (0032).
--
-- Apply manually in the Supabase SQL editor, in order, after 0032.

alter table public.projects
  add column if not exists engine_gemini_enabled boolean not null default true;

alter table public.projects
  add column if not exists engine_claude_enabled boolean not null default true;

alter table public.projects
  add column if not exists engine_openai_enabled boolean not null default true;
