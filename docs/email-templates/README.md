# Supabase Auth email templates

These two emails are **not sent by our code** (`lib/email/transactional.ts` /
Resend) — Supabase Auth sends them directly, using whatever HTML is pasted
into its dashboard. They live here so the design is versioned and reviewable,
even though deploying a change means manually pasting into Supabase, not
merging a PR.

## Where to paste each one

Supabase Dashboard → **Authentication → Emails → Templates**:

| File | Supabase template | Triggered by |
|---|---|---|
| `confirm-signup.html` | **Confirm signup** | `app/signup/actions.ts` — email/password registration, when "Confirm email" is on |
| `magic-link-password-recovery.html` | **Magic Link** | `app/forgot-password/actions.ts` — calls `signInWithOtp()`, not `resetPasswordForEmail()`, so password recovery goes through the *Magic Link* template, not *Reset Password* |

Paste the file contents into the template's HTML editor and set the subject
line noted in the comment at the top of each file. Send a real test email
from the dashboard after saving to confirm it renders — Supabase's editor
preview doesn't always match what actual mail clients show.

## Keeping these in sync with the brand

Both files hardcode the same colors/fonts/spacing as
`lib/email/transactional.ts`'s `wrap()`/`eyebrow()`/`heading()`/`button()`
helpers, because Supabase templates can't import our TS module — they're a
separate rendering path. If the brand system in `transactional.ts` changes,
update these two files by hand to match.
