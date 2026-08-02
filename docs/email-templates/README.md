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

## Header asset (BRAND-5c, v3)

The header in all 8 Resend emails and both Supabase templates is
`<img src="https://www.genscore.es/brand/genscore-email-header.png">` — the
v3 lockup (mark + wordmark + tagline) plus the ghost-G motif, rasterized at
1200×240 (2x of the 600×120 display size), `public/brand/
genscore-email-header.png` (BRAND-5c, `docs/brand/brand-guidelines.md`).
Inline SVG (what `components/ui/brand-logo.tsx` uses in the app) doesn't
render in Outlook desktop, so every email uses this raster copy instead, at
a stable production URL every email client can load via `<img>`.

**This means the logo only appears once that PNG is live in production** —
these Supabase templates (and any Resend email sent from a preview deploy)
will show a broken image icon until this branch is deployed.

**The `<img>` style must stay `width:100%;max-width:600px;height:auto`, never
a fixed `width:600px;height:120px`.** A full-bleed banner at a hard pixel
width forces the `.em-card` table to a 600px floor and silently defeats the
`@media (max-width:600px)` rule below it — the email stops reflowing on
phones with no visual error, just a fixed-width card that gets clipped or
horizontally scrollable. The old 140×24 logo never hit this because it was
small enough to never become the table's widest content; a full-width
header will, unless it's explicitly told to shrink. Verify any change here
by rendering the real HTML output (not just the source file) at a ~375px
viewport, not only desktop width.

Regenerate the PNG only if the lockup SVGs (`public/brand/genscore-logo.svg`,
`public/brand/genscore-mark.svg`) change. It's produced by rendering those
SVGs plus the "GENERATIVE ENGINE OPTIMIZATION" tagline (baked in as raster
text — email clients don't load custom fonts reliably, see
`docs/brand/brand-guidelines.md` §3) on an exact 1200×240 canvas via a
headless-Chromium screenshot, then palette-quantized with Pillow to keep the
file small (~8 KB) — not hand-drawn. See the BRAND-5c PR history for the
exact generation script.
