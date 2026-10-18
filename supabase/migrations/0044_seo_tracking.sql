-- 0044_seo_tracking.sql
--
-- Phase: SEO-TRACK-1 fase 1, PR A (Task Intake approved by the founder on
-- 2026-10-18, docs/brand/design-decisions-log.md §340).
--
-- Purpose: «Posición en Google» grows from a live Search Console read into
-- keyword tracking. The customer groups keywords into topics, picks up to three
-- rival domains, and a weekly cron stores the public Google Top 20 of each
-- tracked keyword (DataForSEO SERP, Google Spain). Four tables:
--
--   seo_topics          the customer's topics (one target page each, optional)
--   seo_keywords        a keyword, its topic, where it came from, tracked or not
--   seo_serp_snapshots  one row per keyword and week: own position and page,
--                       the Top 10, local pack, «related questions», or a
--                       categorized error
--   seo_competitors     rival domains (and one `is_own` row for the project's
--                       own domain) with their monthly backlink summary
--
-- What is stored is DataForSEO's view of public Google results, never Search
-- Console rows. The only thing that may come from Search Console is a keyword
-- string the customer chose to track, the same as search_console_rec_states
-- (0042) already does with a query.
--
-- Readable by the owner (RLS select policies). Written only by trusted server
-- code with the service-role client after ownership was verified in code,
-- always filtering by project_id AND owner_user_id: same pattern as 0042.
--
-- Also adds `projects.seo_tracking_enabled` (default true), the per-project
-- switch the cron reads in its own query, failing toward ON if the column is
-- missing (same direction as the engine switches, log §54).
--
-- Apply manually in the Supabase SQL editor, after 0043.

create table if not exists public.seo_topics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_url text,
  created_at timestamptz not null default now(),
  constraint seo_topics_name_chk check (char_length(name) between 1 and 80),
  constraint seo_topics_target_url_chk check (target_url is null or char_length(target_url) between 1 and 2048),
  constraint seo_topics_uniq unique (project_id, name)
);

create table if not exists public.seo_keywords (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid references public.seo_topics(id) on delete set null,
  keyword text not null,
  source text not null,
  tracked boolean not null default true,
  created_at timestamptz not null default now(),
  constraint seo_keywords_keyword_chk check (char_length(keyword) between 1 and 200),
  constraint seo_keywords_source_chk check (source in ('search_console', 'competitor_gap', 'manual')),
  constraint seo_keywords_uniq unique (project_id, keyword)
);

create index if not exists seo_keywords_tracked_idx
  on public.seo_keywords (tracked, created_at);

create table if not exists public.seo_serp_snapshots (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.seo_keywords(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  status text not null,
  error text,
  own_position integer,
  own_url text,
  own_title text,
  top10 jsonb not null default '[]'::jsonb,
  has_local_pack boolean,
  questions jsonb not null default '[]'::jsonb,
  cost_usd numeric,
  created_at timestamptz not null default now(),
  constraint seo_serp_snapshots_status_chk check (status in ('ok', 'error')),
  constraint seo_serp_snapshots_error_chk check (error is null or char_length(error) <= 200),
  constraint seo_serp_snapshots_own_title_chk check (own_title is null or char_length(own_title) <= 300),
  constraint seo_serp_snapshots_uniq unique (keyword_id, week_start)
);

create index if not exists seo_serp_snapshots_week_idx
  on public.seo_serp_snapshots (week_start);

create index if not exists seo_serp_snapshots_project_idx
  on public.seo_serp_snapshots (project_id, week_start);

create table if not exists public.seo_competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  is_own boolean not null default false,
  referring_domains integer,
  backlinks integer,
  links_checked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint seo_competitors_domain_chk check (char_length(domain) between 3 and 255),
  constraint seo_competitors_uniq unique (project_id, domain)
);

create index if not exists seo_topics_owner_idx on public.seo_topics (owner_user_id);
create index if not exists seo_keywords_owner_idx on public.seo_keywords (owner_user_id);
create index if not exists seo_serp_snapshots_owner_idx on public.seo_serp_snapshots (owner_user_id);
create index if not exists seo_competitors_owner_idx on public.seo_competitors (owner_user_id);

alter table public.seo_topics enable row level security;
alter table public.seo_keywords enable row level security;
alter table public.seo_serp_snapshots enable row level security;
alter table public.seo_competitors enable row level security;

drop policy if exists seo_topics_select_owner on public.seo_topics;
create policy seo_topics_select_owner on public.seo_topics
for select to authenticated using (owner_user_id = auth.uid());

drop policy if exists seo_keywords_select_owner on public.seo_keywords;
create policy seo_keywords_select_owner on public.seo_keywords
for select to authenticated using (owner_user_id = auth.uid());

drop policy if exists seo_serp_snapshots_select_owner on public.seo_serp_snapshots;
create policy seo_serp_snapshots_select_owner on public.seo_serp_snapshots
for select to authenticated using (owner_user_id = auth.uid());

drop policy if exists seo_competitors_select_owner on public.seo_competitors;
create policy seo_competitors_select_owner on public.seo_competitors
for select to authenticated using (owner_user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy for `authenticated`: writes go through server
-- code with the service role, which re-verifies ownership first.

-- Ops alerts already sent (one per category and week). Written only after the
-- email went out, so a failed send is retried by the next pass. Internal: RLS
-- on and no policy, so only the service role touches it.
create table if not exists public.seo_tracking_alerts (
  week_start date not null,
  category text not null,
  sent_at timestamptz not null default now(),
  constraint seo_tracking_alerts_category_chk check (category in ('auth', 'balance')),
  primary key (week_start, category)
);

alter table public.seo_tracking_alerts enable row level security;

alter table public.projects
  add column if not exists seo_tracking_enabled boolean not null default true;
