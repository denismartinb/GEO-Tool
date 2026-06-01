create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.owner_user_id = auth.uid()
  );
$$;

revoke all on function public.is_project_owner(uuid) from public;
grant execute on function public.is_project_owner(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_competitors enable row level security;
alter table public.project_prompts enable row level security;
alter table public.scan_runs enable row level security;
alter table public.scan_prompt_results enable row level security;
alter table public.run_scores enable row level security;
alter table public.recommendations enable row level security;
alter table public.jobs enable row level security;
alter table public.job_logs enable row level security;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy projects_select_owner
on public.projects
for select
to authenticated
using (owner_user_id = auth.uid());

create policy projects_insert_owner
on public.projects
for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy projects_update_owner
on public.projects
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy competitors_select_owner
on public.project_competitors
for select
to authenticated
using (public.is_project_owner(project_id));

create policy competitors_insert_owner
on public.project_competitors
for insert
to authenticated
with check (public.is_project_owner(project_id));

create policy competitors_update_owner
on public.project_competitors
for update
to authenticated
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

create policy prompts_select_owner
on public.project_prompts
for select
to authenticated
using (public.is_project_owner(project_id));

create policy prompts_insert_owner
on public.project_prompts
for insert
to authenticated
with check (public.is_project_owner(project_id));

create policy prompts_update_owner
on public.project_prompts
for update
to authenticated
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

create policy scan_runs_select_owner
on public.scan_runs
for select
to authenticated
using (public.is_project_owner(project_id));

create policy scan_prompt_results_select_owner
on public.scan_prompt_results
for select
to authenticated
using (public.is_project_owner(project_id));

create policy run_scores_select_owner
on public.run_scores
for select
to authenticated
using (public.is_project_owner(project_id));

-- recommendations are select-only from browser/client in v0.
-- updates (including status changes) must go through trusted server code using service role.
create policy recommendations_select_owner
on public.recommendations
for select
to authenticated
using (public.is_project_owner(project_id));

create policy jobs_select_owner
on public.jobs
for select
to authenticated
using (public.is_project_owner(project_id));

create policy job_logs_select_owner
on public.job_logs
for select
to authenticated
using (public.is_project_owner(project_id));
