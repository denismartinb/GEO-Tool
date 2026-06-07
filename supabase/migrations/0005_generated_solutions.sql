-- 0005_generated_solutions.sql
-- Phase 0 (approved by founder): real AI-generated, evidence-anchored solutions
-- per recommendation. LLM output is UNTRUSTED content (the user may copy/paste/
-- export it to their own site). It must NOT be shown to the user until trusted
-- server-side code marks it as sanitized/reviewed.

-- ---------------------------------------------------------------------------
-- 1) Composite-uniqueness on recommendations so child rows can use the
--    project's standard composite-FK consistency pattern (matches scan_runs /
--    jobs). Additive only, founder-approved.
-- ---------------------------------------------------------------------------
alter table public.recommendations
  add constraint recommendations_id_project_uniq unique (id, project_id);

-- ---------------------------------------------------------------------------
-- 2) generated_solutions
-- ---------------------------------------------------------------------------
create table public.generated_solutions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null,
  project_id uuid not null references public.projects(id) on delete restrict,

  -- Provenance / type of generation. rule_id carried from the recommendation so
  -- we can audit which deterministic rule produced the anchored evidence.
  rule_id text not null,
  generation_type text not null,

  -- Lifecycle. Content is only renderable once status = 'completed' AND
  -- sanitized_content is non-null. 'failed' carries a safe error_summary.
  status text not null default 'pending',

  -- Untrusted raw LLM output (never rendered directly to the client).
  raw_content text null,
  -- Server-sanitized, safe-to-render output. NULL until sanitization passes.
  sanitized_content text null,
  -- Explicit gate flag, independent of status, set only by trusted server code.
  is_sanitized boolean not null default false,
  sanitized_at timestamptz null,

  -- Owner-facing lifecycle on the solution itself (e.g. dismiss a suggestion).
  is_dismissed boolean not null default false,

  -- Model / provenance metadata (mirrors scan_prompt_results conventions).
  provider text not null default 'gemini',
  model text null,
  prompt_version text not null default 'v1',

  -- Evidence anchor: the exact slice of scan evidence this solution is built on.
  -- Anchoring to real evidence is the honesty guarantee -- no invented page data.
  evidence_json jsonb not null default '{}'::jsonb,

  -- Cost / observability (nullable, same shape as scan_prompt_results).
  tokens_in integer null,
  tokens_out integer null,
  cost_usd numeric(12,6) null,
  llm_latency_ms integer null,

  -- Safe, user-facing error message (NEVER raw Postgres / raw provider error).
  error_summary text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gensol_status_chk
    check (status in ('pending','running','completed','failed')),
  constraint gensol_generation_type_chk
    check (generation_type in ('prompt_answer_rewrite','brand_copy_suggestion','competitor_gap_messaging')),
  constraint gensol_provider_chk
    check (provider in ('gemini')),
  constraint gensol_tokens_in_chk
    check (tokens_in is null or tokens_in >= 0),
  constraint gensol_tokens_out_chk
    check (tokens_out is null or tokens_out >= 0),
  constraint gensol_cost_chk
    check (cost_usd is null or cost_usd >= 0),
  constraint gensol_latency_chk
    check (llm_latency_ms is null or llm_latency_ms >= 0),

  -- Integrity: a row can only be 'completed' if it has been sanitized and
  -- carries sanitized content. This is the DB-level safety gate that prevents
  -- unsanitized LLM output from ever being in a "renderable" state.
  constraint gensol_completed_requires_sanitized_chk
    check (
      status <> 'completed'
      or (is_sanitized = true and sanitized_content is not null)
    ),
  -- is_sanitized = true must coincide with sanitized_content + timestamp.
  constraint gensol_sanitized_consistency_chk
    check (
      is_sanitized = false
      or (sanitized_content is not null and sanitized_at is not null)
    ),

  -- Composite FK: a solution can never point to a recommendation of another project.
  constraint gensol_recommendation_project_fk
    foreign key (recommendation_id, project_id)
    references public.recommendations (id, project_id)
    on delete cascade
);

create index gensol_recommendation_created_idx
  on public.generated_solutions (recommendation_id, created_at desc);
create index gensol_project_created_idx
  on public.generated_solutions (project_id, created_at desc);
create index gensol_project_status_idx
  on public.generated_solutions (project_id, status);
-- Supports rate-limiting / abuse queries: count rows per project in a time window.
create index gensol_project_created_status_idx
  on public.generated_solutions (project_id, created_at, status);

create trigger trg_generated_solutions_set_updated_at
before update on public.generated_solutions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
alter table public.generated_solutions enable row level security;

-- Client may ONLY read its own project's solutions. All inserts and content
-- writes go through trusted server code (service role / authenticated server
-- actions), exactly like recommendations in v0.
--
-- No INSERT/UPDATE/DELETE policy is granted to `authenticated`: Postgres RLS
-- cannot restrict writes by column, so any UPDATE policy would also let an
-- owner write `raw_content` / `sanitized_content` / `is_sanitized` directly,
-- bypassing the server-side sanitization pipeline entirely. Actions like
-- "dismiss a solution" must go through a server action that re-verifies
-- is_project_owner() and updates is_dismissed via trusted code.
create policy generated_solutions_select_owner
on public.generated_solutions
for select
to authenticated
using (public.is_project_owner(project_id));
