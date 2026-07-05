-- 0014_recommendations_priority_rank_uncap.sql
--
-- Phase: RECS-CAP-REMOVE (founder-approved 2026-07-05) — "las recomendaciones
-- son la clave del producto, no debe haber límite". PR #168 removed the
-- application-level .slice(0, 10) truncation in
-- lib/recommendations/recommendation-engine.ts so every real, deduplicated
-- recommendation candidate is returned, not just the top 10 by score.
--
-- That change alone is NOT sufficient: this table's original CHECK constraint
-- (0001_v0_schema.sql) hard-limits priority_rank to [1,10]. With the
-- application cap removed, any run with more than 10 real candidates now
-- produces rows with priority_rank 11, 12, ... — violating this constraint.
-- lib/scan/executor.ts inserts all of a run's recommendations in a single
-- multi-row insert, so the constraint violation rejects the ENTIRE batch. That
-- insert is wrapped in an intentional fail-soft try/catch (a recommendation
-- failure must never sink an otherwise-successful scan — docs/scan-lifecycle.md),
-- so the failure was only logged, not surfaced — a real 49-prompt scan
-- completed with genuine, verified gaps in its per-prompt data but ZERO
-- recommendations persisted. Caught in PR #168 preview testing before merge.
--
-- Reviewed by data-guardian before implementation (APROBADO CON CONDICIONES):
-- additive and safe (existing rows with rank 1-10 trivially satisfy >= 1; no
-- other index/constraint depends on the old upper bound; no data migration
-- needed). Must ship in the SAME PR as the application-level change (they are
-- one invariant expressed in two layers, not two separate changes) and MUST be
-- applied to production before that code deploys, or production reproduces the
-- exact same zero-recommendations bug.
--
-- Apply manually in the Supabase SQL editor, in order, after 0013 — and BEFORE
-- deploying this PR's code to production.

alter table public.recommendations
  drop constraint rec_priority_rank_chk,
  add constraint rec_priority_rank_chk check (priority_rank >= 1);
