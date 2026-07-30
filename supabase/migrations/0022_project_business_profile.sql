-- 0022_project_business_profile.sql
--
-- Phase: COMPETITOR-GROUNDING-2 (founder-approved 2026-07-30)
-- ADR: docs/adr/0022-persisted-business-profile.md
--
-- Purpose: persist the BusinessProfile (lib/llm/gemini.ts) that
-- COMPETITOR-GROUNDING-1 (PR #265, docs/adr/0020) already infers from a
-- project's own homepage — today it is computed once during onboarding
-- suggestion/creation and discarded, so the post-creation "Añadir prompts"
-- flow (lib/projects/add-prompts.ts) has no profile to draw on and stays
-- blind to what the business actually does.
--
-- Nullable, no backfill: existing projects simply have business_profile =
-- null, which every consumer treats identically to "not yet computed" (lazy
-- compute-and-cache on first use, never a hard requirement). No RLS change
-- needed — projects' existing row-level policies (owner-scoped select/
-- insert/update) already cover every column on the row, including this one.
--
-- Apply manually in the Supabase SQL editor, after 0021.

alter table public.projects
  add column business_profile jsonb null;
