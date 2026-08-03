-- 0026_brand_aliases_derived_at.sql
--
-- Phase: GEO-SCORE-BRAND-IDENTITY-1b (founder-approved 2026-08-02, "derivado
-- perezosa sí")
-- ADR: docs/adr/0025-brand-identity-aliases.md (Consequences → follow-up)
--
-- Purpose: migration 0025 derives brand_aliases at project CREATION only, so
-- every project that already existed keeps '{}' and stays mis-measured —
-- including the founder's own Mozilla project, the one that surfaced the bug.
-- Lazy derivation fixes that on the next scan, but needs to tell two states
-- apart that 0023 renders identically:
--
--   '{}' because nobody has derived aliases for this project yet
--   '{}' because this brand genuinely has no product/sub-brand names
--
-- The second is the COMMON case (most brands are only ever called by their own
-- name). Without this column, every scan of every such project would re-fetch
-- the homepage and re-call Gemini forever, paying repeatedly to re-derive
-- nothing.
--
-- Same shape as the null-means-not-computed convention business_profile
-- already uses (0022). A separate migration rather than an edit to 0023
-- because 0023 may already be applied by hand in Supabase — an applied
-- migration is history and must not be rewritten under a running database.
--
-- Nullable, no backfill: existing projects read as "never derived", which is
-- exactly right — they never were.
--
-- Apply manually in the Supabase SQL editor, after 0025.
--
-- Idempotent on purpose (see 0023's header): these are applied by hand, and a
-- dropped connection mid-apply leaves an unknown state that must be safe to
-- re-run.

alter table public.projects
  add column if not exists brand_aliases_derived_at timestamptz null;

comment on column public.projects.brand_aliases_derived_at is
  'When brand_aliases was last derived. NULL means never derived — distinct from a derived-but-empty list, which is the correct outcome for most brands and must not trigger re-derivation on every scan.';
