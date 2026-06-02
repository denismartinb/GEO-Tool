create unique index if not exists scan_prompt_results_run_prompt_uniq
on public.scan_prompt_results (run_id, prompt_id)
where prompt_id is not null;
