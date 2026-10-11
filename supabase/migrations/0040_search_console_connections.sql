-- 0040_search_console_connections.sql
--
-- Phase: SEARCH-SEO-1 Fase 3, «Posición en Google» (founder-approved plan
-- 2026-10-10, docs/brand/design-decisions-log.md §283; security review by
-- data-guardian before this file was written).
--
-- Purpose: one Google Search Console connection per project. The customer
-- grants read-only access (`webmasters.readonly`) with Google's OAuth consent;
-- we keep the refresh token so the screen can ask Google for clicks,
-- impressions, positions and indexing on each visit. Nothing from Search
-- Console is stored here: every number is read live from Google.
--
-- The refresh token is a secret. It is stored only as AES-256-GCM ciphertext
-- (`v1:<keyId>:<base64(iv|tag|ct)>`, AAD bound to project and owner, see
-- lib/search-console/crypto.ts) under GSC_TOKEN_ENCRYPTION_KEY, which lives in
-- Vercel, never in the database.
--
-- Written and read only by trusted server code with the service-role client,
-- after the request has proven ownership (`requireActiveProject` +
-- `requireUser`), always filtering by project_id AND owner_user_id. RLS on and
-- no policy for `authenticated`: the browser never reads this table, not even
-- the ciphertext.
--
-- Until this migration is applied the screen says the connection is not
-- available yet; nothing else in the product reads this table.
-- Apply manually in the Supabase SQL editor, after 0039.

create table if not exists public.search_console_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  property text,
  refresh_token_ciphertext text,
  scope text not null,
  status text not null default 'active',
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint search_console_connections_status_chk check (status in ('active', 'revoked', 'error')),
  constraint search_console_connections_property_chk check (
    property is null or (char_length(property) <= 2048 and property ~ '^(sc-domain:|https?://)')
  ),
  constraint search_console_connections_last_error_chk check (last_error is null or char_length(last_error) <= 200),
  constraint search_console_connections_scope_chk check (scope = 'https://www.googleapis.com/auth/webmasters.readonly'),
  constraint search_console_connections_token_chk check (
    status <> 'active' or refresh_token_ciphertext is not null
  )
);

create index if not exists search_console_connections_owner_idx
  on public.search_console_connections (owner_user_id);

drop trigger if exists search_console_connections_set_updated_at on public.search_console_connections;
create trigger search_console_connections_set_updated_at
  before update on public.search_console_connections
  for each row execute function public.set_updated_at();

alter table public.search_console_connections enable row level security;

-- Defense in depth: the table holds an (encrypted) credential, so also drop
-- Supabase's default table grants. RLS without policies already denies.
revoke all on public.search_console_connections from anon, authenticated;
