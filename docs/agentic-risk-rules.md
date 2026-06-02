# Agentic Risk Rules

These rules protect sensitive areas while keeping the delivery pipeline lightweight.

## Default Safety Rules

- No auto-merge.
- No production deployment.
- No destructive actions.
- No automatic database changes.
- No automatic RLS changes.
- No automatic auth changes.
- No secret exposure.
- No broad permissions unless strictly required.
- Human approval is always required before merge.

## Sensitive Areas

Treat the following as high-risk unless the issue explicitly allows them:

- Supabase schema
- migrations
- RLS
- auth
- provider runtime
- scan/run/job pipeline
- billing
- security-sensitive logic

## Risk Labels

Use the following labels to signal review posture:

- `risk:ui-only` — visual or copy-only change with no runtime risk outside presentation.
- `risk:database` — touches persistence or queries.
- `risk:rls` — touches row-level security or authorization boundaries.
- `risk:auth` — touches sign-in, session, or identity behavior.
- `risk:migration` — adds or changes database migrations.
- `risk:pipeline` — touches scan/run/job orchestration or background delivery logic.

## Review Expectations by Risk

- **UI-only**: validate scope and rendering impact.
- **Database / migration / RLS / auth / pipeline**: require explicit issue scope, careful QA, and manual human review.
- **Any ambiguity**: stop and request another iteration.

## Missing Secret Handling

Workflows should skip gracefully when required secrets are not configured and should explain what is missing.

They should not fail open, attempt destructive fallback behavior, or silently change scope.

