create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  domain text not null,
  brand text not null,
  country text not null,
  language text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_len_chk check (char_length(name) between 1 and 120),
  constraint projects_domain_len_chk check (char_length(domain) between 3 and 255),
  constraint projects_country_len_chk check (char_length(country) between 2 and 10),
  constraint projects_language_len_chk check (char_length(language) between 2 and 20),
  constraint projects_owner_domain_country_lang_uniq unique (owner_user_id, domain, country, language)
);

create index projects_owner_created_idx on public.projects (owner_user_id, created_at desc);
create index projects_owner_archived_idx on public.projects (owner_user_id, is_archived);

create table public.project_competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  domain text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitors_name_len_chk check (char_length(name) between 1 and 120),
  constraint competitors_domain_len_chk check (char_length(domain) between 3 and 255),
  constraint competitors_project_domain_uniq unique (project_id, domain)
);

create index competitors_project_active_idx on public.project_competitors (project_id, is_active);
create index competitors_project_created_idx on public.project_competitors (project_id, created_at desc);

create table public.project_prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  prompt_text text not null,
  category text null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prompts_text_len_chk check (char_length(prompt_text) between 10 and 3000)
);

create index prompts_project_active_idx on public.project_prompts (project_id, is_active);
create index prompts_project_sort_idx on public.project_prompts (project_id, sort_order, created_at);

create table public.scan_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  triggered_by_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending',
  error_summary text null,
  started_at timestamptz null,
  finished_at timestamptz null,
  extraction_version text not null default 'v1',
  scoring_version text not null default 'v1',
  total_prompts integer not null default 0,
  successful_prompts integer not null default 0,
  failed_prompts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scan_runs_status_chk check (status in ('pending','running','completed','failed','cancelled')),
  constraint scan_runs_counts_chk check (total_prompts >= 0 and successful_prompts >= 0 and failed_prompts >= 0),
  constraint scan_runs_id_project_uniq unique (id, project_id)
);

create index scan_runs_project_created_idx on public.scan_runs (project_id, created_at desc);
create index scan_runs_project_status_idx on public.scan_runs (project_id, status);
create index scan_runs_status_created_idx on public.scan_runs (status, created_at);

create table public.scan_prompt_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  project_id uuid not null references public.projects(id) on delete restrict,
  prompt_id uuid null references public.project_prompts(id) on delete set null,
  prompt_text_snapshot text not null,
  brand_snapshot text not null,
  competitors_snapshot jsonb not null default '[]'::jsonb,
  country_snapshot text not null,
  language_snapshot text not null,
  provider text not null default 'openai',
  model text not null,
  status text not null default 'pending',
  raw_response_text text null,
  raw_response_json jsonb null,
  tokens_in integer null,
  tokens_out integer null,
  cost_usd numeric(12,6) null,
  llm_latency_ms integer null,
  brand_mentioned boolean not null default false,
  citation_found boolean not null default false,
  mentioned_competitors_count integer not null default 0,
  citations_count integer not null default 0,
  sentiment text not null default 'unknown',
  extraction_version text not null default 'v1',
  extracted_json jsonb null,
  extraction_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spr_status_chk check (status in ('pending','running','completed','failed')),
  constraint spr_tokens_in_chk check (tokens_in is null or tokens_in >= 0),
  constraint spr_tokens_out_chk check (tokens_out is null or tokens_out >= 0),
  constraint spr_cost_chk check (cost_usd is null or cost_usd >= 0),
  constraint spr_latency_chk check (llm_latency_ms is null or llm_latency_ms >= 0),
  constraint spr_mentioned_competitors_count_chk check (mentioned_competitors_count >= 0),
  constraint spr_citations_count_chk check (citations_count >= 0),
  constraint spr_sentiment_chk check (sentiment in ('positive','neutral','negative','mixed','unknown')),
  constraint spr_run_project_fk
    foreign key (run_id, project_id)
    references public.scan_runs (id, project_id)
    on delete cascade
);

create index spr_run_created_idx on public.scan_prompt_results (run_id, created_at);
create index spr_run_status_idx on public.scan_prompt_results (run_id, status);
create index spr_project_run_idx on public.scan_prompt_results (project_id, run_id);
create index spr_prompt_id_idx on public.scan_prompt_results (prompt_id) where prompt_id is not null;
create index spr_run_brand_mentioned_idx on public.scan_prompt_results (run_id, brand_mentioned);
create index spr_run_citation_found_idx on public.scan_prompt_results (run_id, citation_found);

create table public.run_scores (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique,
  project_id uuid not null references public.projects(id) on delete restrict,
  scoring_version text not null default 'v1',
  visibility_score numeric(5,2) not null default 0,
  citation_score numeric(5,2) not null default 0,
  competitor_gap_score numeric(5,2) not null default 0,
  confidence text not null,
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint run_scores_visibility_chk check (visibility_score >= 0 and visibility_score <= 100),
  constraint run_scores_citation_chk check (citation_score >= 0 and citation_score <= 100),
  constraint run_scores_gap_chk check (competitor_gap_score >= 0 and competitor_gap_score <= 100),
  constraint run_scores_confidence_chk check (confidence in ('low','medium','high')),
  constraint run_scores_run_project_fk
    foreign key (run_id, project_id)
    references public.scan_runs (id, project_id)
    on delete cascade
);

create index run_scores_project_created_idx on public.run_scores (project_id, created_at desc);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  project_id uuid not null references public.projects(id) on delete restrict,
  status text not null default 'active',
  priority_rank integer not null,
  title text not null,
  description text not null,
  rule_id text not null,
  recommendation_type text not null,
  impact text not null,
  effort text not null,
  confidence text not null,
  source_type text not null,
  evidence_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rec_status_chk check (status in ('active','dismissed')),
  constraint rec_priority_rank_chk check (priority_rank between 1 and 10),
  constraint rec_impact_chk check (impact in ('low','medium','high')),
  constraint rec_effort_chk check (effort in ('low','medium','high')),
  constraint rec_confidence_chk check (confidence in ('low','medium','high')),
  constraint rec_source_type_chk check (source_type in ('rule','llm_rewrite')),
  constraint rec_run_project_fk
    foreign key (run_id, project_id)
    references public.scan_runs (id, project_id)
    on delete cascade
);

create index rec_run_priority_idx on public.recommendations (run_id, priority_rank);
create index rec_project_created_idx on public.recommendations (project_id, created_at desc);
create index rec_run_status_idx on public.recommendations (run_id, status);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid not null,
  job_type text not null,
  status text not null default 'pending',
  payload_json jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default now(),
  locked_by text null,
  locked_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_type_chk check (job_type in ('scan_start','scan_prompt','scan_finalize')),
  constraint jobs_status_chk check (status in ('pending','running','retrying','completed','failed','cancelled')),
  constraint jobs_attempt_count_chk check (attempt_count >= 0),
  constraint jobs_max_attempts_chk check (max_attempts between 1 and 10),
  constraint jobs_id_project_uniq unique (id, project_id),
  constraint jobs_id_run_project_uniq unique (id, run_id, project_id),
  constraint jobs_run_project_fk
    foreign key (run_id, project_id)
    references public.scan_runs (id, project_id)
    on delete cascade
);

create index jobs_status_next_attempt_idx on public.jobs (status, next_attempt_at);
create index jobs_run_created_idx on public.jobs (run_id, created_at);
create index jobs_project_created_idx on public.jobs (project_id, created_at desc);
create index jobs_locked_idx on public.jobs (locked_at) where status in ('running','retrying');

create table public.job_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid not null,
  level text not null,
  message text not null,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint job_logs_level_chk check (level in ('debug','info','warn','error')),
  constraint job_logs_job_run_project_fk
    foreign key (job_id, run_id, project_id)
    references public.jobs (id, run_id, project_id)
    on delete cascade
);

create index job_logs_job_created_idx on public.job_logs (job_id, created_at);
create index job_logs_project_created_idx on public.job_logs (project_id, created_at desc);
create index job_logs_run_created_idx on public.job_logs (run_id, created_at);

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trg_projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger trg_project_competitors_set_updated_at
before update on public.project_competitors
for each row execute function public.set_updated_at();

create trigger trg_project_prompts_set_updated_at
before update on public.project_prompts
for each row execute function public.set_updated_at();

create trigger trg_scan_runs_set_updated_at
before update on public.scan_runs
for each row execute function public.set_updated_at();

create trigger trg_scan_prompt_results_set_updated_at
before update on public.scan_prompt_results
for each row execute function public.set_updated_at();

create trigger trg_run_scores_set_updated_at
before update on public.run_scores
for each row execute function public.set_updated_at();

create trigger trg_recommendations_set_updated_at
before update on public.recommendations
for each row execute function public.set_updated_at();

create trigger trg_jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();
