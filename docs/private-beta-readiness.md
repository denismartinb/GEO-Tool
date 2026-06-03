# GEO Studio Private Beta Readiness

Use this operational checklist before inviting private beta users.

## Environment

- Supabase project configured.
- Migrations `0001` through `0004` applied.
- Supabase Auth enabled.
- Environment variables configured:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GEMINI_API_KEY`
  - `GEMINI_MODEL`

## Safety Limits

- Maximum 10 prompts per real Gemini scan.
- Scan execution is sequential.
- Gemini is the only active provider.
- No background monitoring yet.

## Smoke Test

- Sign up and log in.
- Create one project.
- Add 3-5 competitors.
- Add 5 prompts.
- Execute a Gemini scan.
- Confirm raw responses exist.
- Confirm structured extraction exists.
- Confirm scores exist.
- Confirm rule-based recommendations exist when evidence triggers rules.
- Confirm recommendation evidence is visible.

## Beta User Instructions

- Start with 1 project.
- Use 5-10 prompts.
- Add 3-5 competitors.
- Treat outputs as directional v0 evidence.
- Report confusing recommendations or incorrect extraction.

## Known Limitations

- Gemini-only.
- No OpenAI or Perplexity yet.
- No crawler yet.
- No scheduled monitoring yet.
- No billing or teams.
- Recommendations are rule-based v0.
