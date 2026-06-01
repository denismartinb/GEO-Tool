# RLS Manual Test Checklist (v0)

1. Authenticated user can create/update/select own `projects`, `project_prompts`, `project_competitors`.
2. Authenticated user cannot delete `projects`, `project_prompts`, `project_competitors` from client context.
3. Authenticated user cannot insert/update/delete `scan_runs`, `scan_prompt_results`, `run_scores`, `recommendations`, `jobs`, `job_logs`.
4. User A cannot read User B project data.
5. `scan_runs.status`, `scan_prompt_results.status`, `jobs.status` default to `pending`.
6. Composite FK consistency:
   - cannot insert `scan_prompt_results` with mismatched `(run_id, project_id)`
   - cannot insert `run_scores` with mismatched `(run_id, project_id)`
   - cannot insert `recommendations` with mismatched `(run_id, project_id)`
   - cannot insert `job_logs` with mismatched `(job_id, run_id, project_id)`
