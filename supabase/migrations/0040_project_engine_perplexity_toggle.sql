-- 0040_project_engine_perplexity_toggle.sql
--
-- Phase: PERPLEXITY-ENGINE-1 Fase 2 (founder-approved 2026-10-11)
--
-- Purpose: the /debug switch for Perplexity, next to the three engine
-- switches 0033 added. Same shape and same default TRUE, for the same reason:
-- an engine the plan pays for must not silently disappear.
--
-- Perplexity only ever runs on plans with caps.engines >= 4 (Pro, Agencia;
-- lib/scan/providers.ts), so this switch changes nothing on Starter.
--
-- Read FAILS OPEN and in its OWN query (lib/scan/engine-flags.ts): until this
-- migration is applied, Perplexity reads as enabled and the other three
-- switches keep working.
--
-- No RLS changes: written through the same owner-scoped `setEngineEnabled`
-- server action as the other three.
--
-- Apply manually in the Supabase SQL editor, after 0039.

alter table public.projects
  add column if not exists engine_perplexity_enabled boolean not null default true;
