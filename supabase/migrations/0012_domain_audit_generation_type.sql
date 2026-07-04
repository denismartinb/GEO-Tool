-- 0012_domain_audit_generation_type.sql
--
-- Phase: RECS-4B (founder-approved 2026-07-04) — "Auditar mi web": an
-- on-demand, Pro+-gated Gemini call using Google Search grounding restricted
-- to the brand's own domain, so a recommendation asset can cite what's
-- already published there instead of a generic template.
--
-- Reviewed by data-guardian before implementation. Reuses generated_solutions
-- (0005) rather than a new table — same ownership/RLS/sanitization model
-- already trusted for the other 3 generation types. Adds a fourth allowed
-- value; Postgres has no ALTER CONSTRAINT for a CHECK, so this drops and
-- re-adds gensol_generation_type_chk under the same name with all 4 values
-- (the 3 existing ones are preserved, so current rows revalidate cleanly).
--
-- Every domain_audit row still MUST satisfy the pre-existing NOT NULL /
-- composite-FK constraints on this table — recommendation_id NOT NULL with
-- gensol_recommendation_project_fk (recommendation_id, project_id) ->
-- recommendations(id, project_id): a domain audit can only be persisted for
-- a recommendation that already exists for that project. rule_id NOT NULL:
-- application code must carry the recommendation_type through, same as the
-- other 3 generation types already do.
--
-- No RLS change: reads still go through generated_solutions_select_owner
-- (0002/0005); the write path is the existing service-role pattern already
-- used by lib/recommendations/rewrite-recommendation.ts, with ownership
-- re-verified in application code before any write.
--
-- Apply manually in the Supabase SQL editor, in order, after 0011.

alter table public.generated_solutions
  drop constraint gensol_generation_type_chk,
  add constraint gensol_generation_type_chk
    check (generation_type in ('prompt_answer_rewrite','brand_copy_suggestion','competitor_gap_messaging','domain_audit'));
