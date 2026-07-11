-- WEB-AUDIT-2: technical GEO audit snapshots (per-page checks + AI-bot
-- access). Not stored in generated_solutions: these are deterministic,
-- non-LLM checks, and generated_solutions' sanitization CHECK constraints
-- don't model this shape. Reviewed by data-guardian
-- (docs/specs/web-audit/phase-2-technical-audit.md).

create table public.web_audit_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scan_id uuid null,             -- latest completed run at audit time, server-derived
  source text not null default 'manual',   -- 'manual' | 'cron' (phase 3)
  readiness_score integer null,  -- 0-100, null when no page analyzed
  pages jsonb not null default '[]'::jsonb,  -- PageAuditEntry[], sanitized fields only
  bots jsonb not null default '{}'::jsonb,   -- BotAccessReport, deterministic parse output
  created_at timestamptz not null default now(),
  constraint web_audit_source_chk check (source in ('manual', 'cron')),
  constraint web_audit_score_chk check (readiness_score is null or (readiness_score between 0 and 100))
);

create index web_audit_project_created_idx on public.web_audit_snapshots (project_id, created_at desc);

alter table public.web_audit_snapshots enable row level security;

create policy web_audit_select_owner on public.web_audit_snapshots
  for select to authenticated using (public.is_project_owner(project_id));

-- No INSERT/UPDATE/DELETE policy for `authenticated`: writes only via
-- trusted server code using the service-role client, same rationale as
-- generated_solutions (migration 0005).
