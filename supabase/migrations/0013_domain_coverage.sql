-- 0013_domain_coverage.sql
--
-- Phase: DOMAIN-COVERAGE-1 (founder-approved 2026-07-04) — "Auditar cobertura
-- del dominio": a standalone, Pro+-gated Gemini call using Google Search
-- grounding restricted (in the prompt) to the brand's own domain, run per-topic
-- across the latest completed scan's active prompts. It answers, per topic AI
-- is asked about, whether the brand's own domain verifiably publishes content
-- on it — distinguishing a content gap ("no page exists") from a surfacing gap
-- ("a page exists but AI doesn't cite it").
--
-- A coverage-map row is project/scan-level, NOT tied to any recommendation, so
-- it cannot carry a recommendation_id. This migration makes that column
-- nullable, but ONLY for the coverage type — the three per-recommendation
-- generation types keep their NOT NULL guarantee via a conditional CHECK, so a
-- bug can never silently insert an orphaned rewrite (data-guardian condition C1).
--
-- Reviewed by data-guardian before implementation (APROBADO CON CONDICIONES:
-- C1 conditional-nullability CHECK, C2 distinct generation_type, C3 new file).
--
-- Supersedes the never-merged, never-applied 0012_domain_audit_generation_type
-- from PR #160 (the per-recommendation audit approach was dropped). This file
-- reconciles the desired state regardless of whether that 0012 was ever applied
-- to production: it drops gensol_generation_type_chk by name (present in both
-- the 0005 base schema and the abandoned 0012) and re-adds it with the final
-- allowed set, which deliberately does NOT include the unused 'domain_audit'.
--
-- Apply manually in the Supabase SQL editor, in order, after 0011.

-- 1) Allow a NULL recommendation_id (only for coverage rows; see the CHECK in
--    step 3). The composite FK gensol_recommendation_project_fk is MATCH SIMPLE,
--    so it is simply not evaluated when recommendation_id is NULL — no
--    drop/recreate needed. Project scoping is unaffected: project_id has its own
--    direct FK to projects(id) (generated_solutions_project_id_fkey, made
--    ON DELETE CASCADE in 0006), so coverage rows still cascade-delete with the
--    project and can never be orphaned.
alter table public.generated_solutions
  alter column recommendation_id drop not null;

-- 2) Add the new project-level generation type. 'domain_audit' (from the
--    abandoned 0012) is intentionally omitted — it was never used in production.
alter table public.generated_solutions
  drop constraint gensol_generation_type_chk,
  add constraint gensol_generation_type_chk
    check (generation_type in (
      'prompt_answer_rewrite',
      'brand_copy_suggestion',
      'competitor_gap_messaging',
      'domain_coverage'
    ));

-- 3) Conditional-nullability guarantee (data-guardian C1): recommendation_id may
--    be NULL only for a project-level coverage row; every per-recommendation
--    type must still carry a non-null recommendation_id, so an orphaned rewrite
--    fails loudly at the DB instead of silently vanishing from the
--    recommendations page join.
alter table public.generated_solutions
  add constraint gensol_recommendation_nullability_chk
    check (
      (generation_type = 'domain_coverage' and recommendation_id is null)
      or (generation_type <> 'domain_coverage' and recommendation_id is not null)
    );
