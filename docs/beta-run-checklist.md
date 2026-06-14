# GEO Studio Beta Run Checklist

Use this checklist before inviting beta users. Run it with real project data and inspect the stored evidence, not only the UI.

## Setup

- Configure `.env.local` with Supabase URL, anon key, service role key and `GEMINI_API_KEY`.
- Confirm the Gemini key is present and remains server-only.
- Apply migrations in order through `supabase/migrations/0004_v0_scan_result_dedup.sql`.
- Run:

```bash
pnpm run validate
git diff --check
```

Next 16 generates `.next/types` during `build` or `dev`, so `build` must run before `typecheck` when `.next` has been cleaned.

## Test Project Data

Recommended test project:

- Brand: `GEO Studio`
- Domain: `example.com`
- Country: `ES`
- Language: `es`
- Competitors: add 3-5 real tools relevant to the tested category.
- Prompts: add up to 6 prompts. Real Gemini scans currently stop above 6 prompts.

Example prompts:

- `¿Cuáles son las mejores herramientas GEO para mejorar la visibilidad de una marca en respuestas de IA?`
- `¿Cómo puedo saber si ChatGPT o Gemini citan mi marca?`
- `Compara las mejores herramientas de generative engine optimization para SaaS B2B.`
- `What are the best GEO tools for a B2B SaaS marketing team?`
- `How can a SaaS company improve citations in AI-generated answers?`
- `Compare GEO tools for tracking brand visibility in AI search engines.`

## Expected Flow

1. Sign up or log in.
2. Create the test project and preload initial prompts and competitors if useful.
3. Review or adjust competitors.
4. Review or adjust the 5-10 prompts before scanning.
5. Click `Lanzar escaneo` and keep the page open while Gemini executes synchronously.
6. Confirm the completed scan redirects back to the project overview.
7. Inspect stored raw responses.
8. Inspect extracted signals and evidence snippets.
9. Inspect scores and confidence.
10. Inspect rule-based recommendations and their evidence.
11. Inspect the Runs screen and at least one technical run detail page.

## Acceptance Checks

- Run completes successfully.
- No jobs remain stuck in `running`.
- Raw Gemini responses exist for completed prompt jobs.
- Structured extraction exists and uses `gemini-extraction-v1`.
- Scores exist and use `phase6-extraction-scoring-v1`.
- Recommendations exist when evidence triggers rules.
- `Why this matters`, prompt examples and evidence snippets are visible where available.
- Real runs do not show fake/mock labels.
- Errors are understandable and do not expose API keys or raw secrets.

## If Something Fails

- Check the run status in the UI.
- Confirm `.env.local` contains `GEMINI_API_KEY`.
- Verify migrations are applied through `0004_v0_scan_result_dedup.sql`.
- Inspect these Supabase tables: `scan_runs`, `jobs`, `job_logs`, `scan_prompt_results`.
- Common causes: missing Gemini key, more than 6 prompts, missing active prompts, Gemini API quota/rate limit, unapplied migration, or missing RLS/service-role environment configuration.
- If Gemini reports `GenerateContentRequest.model`, set `GEMINI_MODEL=gemini-2.0-flash`.
- Use the Runs screen for recent history and the technical run detail only for debugging and support when a scan fails or needs inspection.
- Project setup does not crawl the website, and competitor discovery is not automatic or verified.
