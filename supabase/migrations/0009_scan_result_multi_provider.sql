-- Multi-engine execution (Gemini + Claude run per scan): a prompt now gets up
-- to one scan_prompt_results row per active engine, so the previous
-- (run_id, prompt_id) uniqueness (0004_v0_scan_result_dedup.sql) must widen to
-- (run_id, prompt_id, provider). No data is deleted: the prior dedup pass
-- already guarantees at most one row per (run_id, prompt_id, provider) today
-- (provider was constant per run before this change), so this migration only
-- replaces the index definition.
drop index if exists public.scan_prompt_results_run_prompt_uniq;

create unique index if not exists scan_prompt_results_run_prompt_provider_uniq
on public.scan_prompt_results (run_id, prompt_id, provider)
where prompt_id is not null;
