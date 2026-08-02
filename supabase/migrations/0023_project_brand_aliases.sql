-- 0023_project_brand_aliases.sql
--
-- Phase: GEO-SCORE-BRAND-IDENTITY-1 (Fase −1 de docs/geo-score-variability-2026-08.md)
-- Founder-approved 2026-08-02 (migración y derivación automática de alias).
-- ADR: docs/adr/0025-brand-identity-aliases.md
--
-- Purpose: a brand is not a string. The project "Mozilla" IS mentioned when
-- the AI recommends "Firefox", but verifyMention (lib/scan/extraction.ts,
-- ADR 0021) only accepts a mention when the extractor's display_name_found
-- plausibly names the tracked string — and namesPlausiblyMatch("Firefox",
-- "Mozilla") is false.
--
-- Measured against the founder's three real scan responses (2026-08-02): all
-- three recommend Firefox, and "Mozilla" appears only as incidental
-- parent-company attribution. Remove that attribution and all three become
-- NOT MENTIONED — a 74 that should be a 0. This affects every brand whose
-- product is better known than the company (Inditex/Zara, Meta/Instagram,
-- Alphabet/Google).
--
-- No backfill: default '{}' leaves every existing project with exactly
-- today's behavior until its aliases are derived (lib/projects/brand-aliases.ts,
-- computed lazily from the persisted business profile — ADR 0022 — and always
-- editable). No RLS change: projects and scan_prompt_results are owner-scoped
-- at row level, and those policies already cover every column on the row.
--
-- Apply manually in the Supabase SQL editor, after 0022.

alter table public.projects
  add column brand_aliases text[] not null default '{}';

comment on column public.projects.brand_aliases is
  'Alternative names that count as a mention of the brand: products, trade names and variants. E.g. Mozilla -> {Firefox, Firefox Focus, Thunderbird}. Consumed by verifyMention (lib/scan/extraction.ts, ADR 0021).';

-- Defensive bound: the list is proposed by an LLM during onboarding and then
-- edited by the user. Uncapped, one long junk alias degrades mention matching
-- for the whole project (every alias is another comparison per entity, per
-- prompt). Enforced here rather than only in application code so no future
-- write path can bypass it.
alter table public.projects
  add constraint projects_brand_aliases_bounded check (
    array_length(brand_aliases, 1) is null
    or (
      array_length(brand_aliases, 1) <= 25
      and 120 >= (select max(length(a)) from unnest(brand_aliases) as a)
    )
  );

-- Per-scan snapshot, same pattern as brand_snapshot / competitors_snapshot
-- (0001_v0_schema.sql). Persisted scores are never recomputed for historical
-- runs (ADR 0021), so adding an alias cannot rewrite an old score — but
-- without this column, a scan before the alias and a scan after it are
-- indistinguishable from a real change in visibility, which is precisely the
-- unexplained-jump problem this whole phase exists to remove.
alter table public.scan_prompt_results
  add column brand_aliases_snapshot text[] not null default '{}';

comment on column public.scan_prompt_results.brand_aliases_snapshot is
  'projects.brand_aliases as it stood when this scan ran. Frozen like brand_snapshot/competitors_snapshot so history stays interpretable after the alias list changes.';
