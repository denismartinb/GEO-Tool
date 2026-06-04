# GEO Studio Private Beta Readiness

Use this checklist before inviting private beta users to test the current MVP.

## Current MVP capabilities

- Authenticated project creation and access control
- Initial prompts and competitors during project setup
- Manual one-click Gemini scan launch from the overview
- Structured extraction from real Gemini responses
- Deterministic scoring
- Rule-based recommendations backed by evidence
- Overview, Prompts, Competitors, Recommendations, Runs and technical run-detail screens
- Archive and restore project UX

## Known limitations

- Gemini-only provider runtime
- No OpenAI or Perplexity provider runtime yet
- No crawler
- No automatic competitor discovery
- No background monitoring or scheduled scans
- No billing or teams
- Recommendations are rule-based v0
- Users should review prompts and competitors before scanning

## Private beta smoke checklist

1. Configure `.env.local`.
2. Apply migrations through `0004_v0_scan_result_dedup.sql`.
3. Run `pnpm run validate`.
4. Start the app.
5. Create an account or log in.
6. Create a project with initial prompts and competitors.
7. Confirm project overview, prompts and competitors load correctly.
8. Launch one Gemini scan manually.
9. Review Overview, Prompts, Competitors, Recommendations, Runs and technical detail.
10. Test archive and restore.
11. Capture blockers, confusing copy or raw error exposure.

## Human Gate checklist

- Validate build and lint health.
- Validate first project creation.
- Validate one real Gemini scan.
- Confirm no raw database or provider errors are shown to the user.
- Confirm beta user instructions are clear enough to proceed.
