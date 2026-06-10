-- 0006_project_delete_cascade.sql
--
-- Phase: DATA-MGMT-2-DB (founder-approved 2026-06-10)
--
-- Purpose: enable owner-scoped hard delete of domains (projects) from the
-- app, so the upcoming DATA-MGMT-2 app phase can ship a real "Eliminar
-- dominio" action on the Escaneos domain cards.
--
-- Behavior changes:
--   1. The five direct project FKs that were `on delete restrict` become
--      `on delete cascade`. Deleting a row from public.projects now
--      cascades to ALL of its scan_runs, scan_prompt_results, run_scores,
--      recommendations and generated_solutions rows (project_competitors,
--      project_prompts, jobs and job_logs already cascaded in 0001).
--   2. A DELETE RLS policy is added on public.projects, scoped to the
--      owner (owner_user_id = auth.uid()). Child tables need no DELETE
--      policies: FK cascade deletes are performed by the system and are
--      not subject to the deleting role's RLS.
--
-- Apply manually in the Supabase SQL editor, in order, after 0005.

-- 1. Flip direct project FKs from RESTRICT to CASCADE.
-- Constraint names are the Postgres defaults for the inline column
-- declarations in 0001_v0_schema.sql / 0005_generated_solutions.sql.

alter table public.scan_runs
  drop constraint scan_runs_project_id_fkey,
  add constraint scan_runs_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.scan_prompt_results
  drop constraint scan_prompt_results_project_id_fkey,
  add constraint scan_prompt_results_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.run_scores
  drop constraint run_scores_project_id_fkey,
  add constraint run_scores_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.recommendations
  drop constraint recommendations_project_id_fkey,
  add constraint recommendations_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.generated_solutions
  drop constraint generated_solutions_project_id_fkey,
  add constraint generated_solutions_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade;

-- 2. Owner-scoped DELETE policy on projects.

drop policy if exists projects_delete_owner on public.projects;

create policy projects_delete_owner
on public.projects
for delete
to authenticated
using (owner_user_id = auth.uid());
