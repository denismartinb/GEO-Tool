-- 0028_scan_prompt_result_samples.sql
--
-- Phase: SAMPLING-1 (Fase 2 de docs/geo-score-variability-2026-08.md)
-- Founder-approved 2026-08-04 (decisión D5 del Task Intake; ver ADR 0030).
-- ADR: docs/adr/0030-response-floor-and-prompt-sampling.md
--
-- Purpose: a run may now ask the SAME prompt to the SAME engine more than
-- once, so that a project with few prompts still reaches the response floor
-- the GEO score needs to be worth publishing (MIN_RESPONSES_PER_RUN,
-- lib/scan/sampling.ts).
--
-- Why the schema has to move at all: 0009_scan_result_multi_provider.sql made
-- (run_id, prompt_id, provider) UNIQUE. That index is exactly what a second
-- sample of the same prompt on the same engine violates, so repetitions are
-- not implementable without widening it. The alternative considered and
-- rejected was one run per repetition, which breaks the invariant every
-- screen depends on — "the latest completed run is the full snapshot"
-- (docs/scan-lifecycle.md).
--
-- Measured motivation (docs/geo-score-variability-2026-08.md §1): at n=3 a
-- single AI response is worth ~24 GEO points. The founder saw a 44-point move
-- between two identical scans. With 3 engines the floor only ever engages
-- below 17 active prompts (17 x 3 = 51 >= 50), so established projects are
-- unaffected by this migration in practice — their sample_index stays 0.
--
-- No RLS change: scan_prompt_results is already owner-scoped at row level via
-- its project, and that policy covers every column on the row.
--
-- No backfill: `default 0` makes every existing row "sample 0 of 1", which is
-- precisely what it is. Historical runs keep their exact meaning and remain
-- comparable to each other.
--
-- Apply manually in the Supabase SQL editor, after 0026.
--
-- Idempotent on purpose (see the note in 0025): a migration applied by hand
-- must be safe to re-run from an unknown state.

alter table public.scan_prompt_results
  add column if not exists sample_index smallint not null default 0;

comment on column public.scan_prompt_results.sample_index is
  'Zero-based repetition index of this (prompt, provider) pair within its run. 0 for every run created before SAMPLING-1 and for every run whose prompt count already clears the response floor. See lib/scan/sampling.ts and ADR 0030.';

-- Lower bound only, deliberately. The real cap (MAX_PROMPT_SAMPLES) lives in
-- lib/scan/sampling.ts, and duplicating it here would mean raising the cap
-- required a second migration — a constraint that has to be changed in two
-- places to change one number is a trap, and this one would fail at INSERT
-- time inside a running scan. What must never happen is a negative index,
-- which would silently sort before the real samples wherever a reader orders
-- by it.
alter table public.scan_prompt_results
  drop constraint if exists scan_prompt_results_sample_index_chk;

alter table public.scan_prompt_results
  add constraint scan_prompt_results_sample_index_chk check (sample_index >= 0);

-- Widen the uniqueness that 0009 established. Same shape, same partial-index
-- predicate, one more column: a row is still unique per (run, prompt, engine)
-- FOR A GIVEN SAMPLE, so the idempotency `processPromptJob` relies on (never
-- writing two rows for the same unit of work) is preserved exactly — it is
-- now keyed per sample instead of per prompt.
--
-- Order matters: the new index is created BEFORE the old one is dropped, so a
-- re-run that failed halfway never leaves the table without a uniqueness
-- guarantee on this data.
create unique index if not exists scan_prompt_results_run_prompt_provider_sample_uniq
on public.scan_prompt_results (run_id, prompt_id, provider, sample_index)
where prompt_id is not null;

drop index if exists public.scan_prompt_results_run_prompt_provider_uniq;

-- How many times this run repeated its prompt set. Second column of the same
-- approved migration, called out explicitly at the Human Gate rather than
-- slipped in, because it is a schema change the founder should see.
--
-- It exists because without it the product lies on screen. `total_prompts`
-- has to keep counting scan_prompt JOBS — every progress bar divides
-- `successful_prompts + failed_prompts` (which count jobs) by it, so any
-- other definition makes the bar exceed 100%. Once a run repeats its prompts,
-- that job count is no longer the number of prompts, and copy like "X de Y
-- prompts" (components/scan-in-progress.tsx) becomes false. With
-- sample_count, a reader recovers the real prompt count as
-- total_prompts / sample_count without a second query.
--
-- Defaults to 1, which is exactly what every historical run was: one pass
-- over its prompt set. No backfill needed.
alter table public.scan_runs
  add column if not exists sample_count smallint not null default 1;

comment on column public.scan_runs.sample_count is
  'Times this run asked each prompt of each engine (SAMPLING-1, ADR 0030). 1 for every run created before sampling and for every run whose prompt count already clears the response floor. total_prompts / sample_count = distinct prompts scanned.';

alter table public.scan_runs
  drop constraint if exists scan_runs_sample_count_chk;

alter table public.scan_runs
  add constraint scan_runs_sample_count_chk check (sample_count >= 1);
