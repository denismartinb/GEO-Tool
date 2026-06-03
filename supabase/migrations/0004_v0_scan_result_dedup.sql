with ranked_results as (
  select
    id,
    row_number() over (
      partition by run_id, prompt_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as duplicate_rank
  from public.scan_prompt_results
  where prompt_id is not null
)
delete from public.scan_prompt_results as spr
using ranked_results
where spr.id = ranked_results.id
  and ranked_results.duplicate_rank > 1;

create unique index if not exists scan_prompt_results_run_prompt_uniq
on public.scan_prompt_results (run_id, prompt_id)
where prompt_id is not null;
