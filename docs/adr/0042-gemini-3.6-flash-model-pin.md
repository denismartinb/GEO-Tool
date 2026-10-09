# ADR 0042 — Re-pin Gemini to gemini-3.6-flash, with per-family tuning

**Date:** 2026-10-09
**Status:** Proposed — pending founder Human Gate and a real scan on the PR preview
**Deciders:** Founder + Director
**Supersedes:** ADR 0009 (pin only; its addenda remain the rationale for the
2.x tuning, still used on rollback)

---

## Context

ADR 0009 pinned `gemini-2.5-flash` and recorded a Google-announced shutdown
of **2026-10-16**. `docs/launch-plan.md` (MODEL-PIN) asked for a new pin
before that date.

What Google's own pages say on 2026-10-09 (checked that day):

- `ai.google.dev/gemini-api/docs/deprecations` (last updated 2026-10-09) now
  lists `gemini-2.5-flash` with **"No shutdown date announced"** — the
  2026-10-16 date is gone — but adds that Google is **"limiting access to the
  2.5 models to users who have actively used them in the past"**.
- On 2026-07-09 developers reported `gemini-2.5-flash` returning
  `404 "This model ... is no longer available"` with no announcement
  (discuss.ai.google.dev thread 174267). That is the exact failure shape of
  the 2026-06-01 incident behind ADR 0009: every prompt fails identically and
  the run ends `scan_failed_no_results`.
- Google's listed replacement for the 2.5 Flash line is `gemini-3.6-flash`
  (stable since July 2026; supports Search grounding, structured output and
  thinking).

So the hard deadline softened, but the model sits on a closing door: new API
keys may not get it, and the July 404 shows it can disappear early. A pin
that is one Google decision away from failing every scan is not a pin.

## Decision

1. `DEFAULT_GEMINI_MODEL` (`lib/llm/gemini-client.ts`) → **`gemini-3.6-flash`**.
2. Every Gemini call builds `generationConfig` from one function,
   `geminiGenerationTuning(model)`, instead of five hand-written copies:
   - **Gemini 1.x/2.x:** `temperature: 0`, `thinkingBudget: 0` — unchanged
     ADR 0009 behaviour, so `GEMINI_MODEL=gemini-2.5-flash` in Vercel is an
     instant, code-free rollback.
   - **Gemini 3.x+:** **no `temperature`** (Google: *"strongly recommend
     keeping the temperature parameter at its default value of 1.0"*; lower
     values *"may lead to … looping or degraded performance"*) and
     `thinkingLevel: "minimal"` on 3.5/3.6 Flash and 3.1 Flash-Lite, `"low"`
     on anything else (3.7/3.8 Flash have no `minimal`). Thinking cannot be
     switched off on Gemini 3, and `thinkingBudget` together with
     `thinkingLevel` is a 400, so exactly one is sent.

Why 3.6 and not 3.7/3.8: it is the newest Flash that accepts `minimal`
(≈ "no thinking"). ADR 0009's first addendum showed thinking + grounding is
what pushes a call past `GEMINI_CALL_TIMEOUT_MS` (20 s); `low` would reopen
that risk for no measured gain on this task. Same token price as 3.7/3.8.

## Consequences

- **Scores move.** A different model answers the same prompts differently;
  the first scans after the switch are not comparable 1:1 with 2.5 history.
  The windowed headline score (ADR 0036) damps this but does not erase it.
- **More run-to-run variance.** Dropping `temperature: 0` reverses the ADR
  0009 2026-06-19 addendum for Gemini 3. Accepted: a looping grounded call is
  a failed prompt (P0), variance is noise the window and sampling already
  absorb (P2). Revisit with real data if the pilot or scans show swings.
- **Cost (Google pricing page, 2026-10-09).** Tokens: $0.75 in / $3.75 out
  per 1M until 2026-12-31, then $1.50 / $7.50 — vs $0.30 / $2.50 on 2.5.
  Grounding: 5,000 free search queries/month shared across Gemini 3.x, then
  $14 / 1,000 — vs 1,500 free grounded prompts/**day** on 2.5. At the
  measured ~800 Gemini generation calls/30 days (`docs/llm-cost-analysis-
  2026-08.md`, before sampling ×3) we stay inside the free search tier; past
  ~5,000 queries/month grounding becomes a real line item. Rough per-scan
  Gemini cost goes from ~$0.002/call to ~$0.004–0.006/call in tokens.
- **Rollback:** set `GEMINI_MODEL=gemini-2.5-flash` in Vercel; no deploy of
  code needed and the 2.x tuning applies automatically.
- **If `GEMINI_MODEL` is already set in Vercel** (ADR 0009 says it was set to
  `gemini-2.5-flash` on 2026-06-11), the code default does nothing until the
  founder deletes it or sets it to `gemini-3.6-flash`. This is the one step
  that cannot be done from the repo.

## Verification required before merge (ADR 0002 rule 3)

- Unit tests pin the request shape per family
  (`lib/llm/gemini-client.test.ts`, `lib/llm/gemini.test.ts`).
- **A real scan on the PR preview** with Gemini enabled must reach
  `completed` with Gemini rows extracted, and its Gemini call latencies must
  stay under the 20 s timeout. Not done in the PR's own session: that
  container has no `GEMINI_API_KEY` and no route to Google's API.
