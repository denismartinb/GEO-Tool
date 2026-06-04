# GEO Suite Design Reference

This folder contains the UX/UI reference material for GEO Studio.

## Purpose

Use this material as the source of truth for:

- Screen structure and flow sequencing
- Component hierarchy and visual system
- Copy tone (Spanish for in-product, English for internal docs)
- Layout, spacing, typography, cards, badges, buttons
- Empty / loading / success / error states

## Contents

| File | Purpose |
|------|---------|
| `app.jsx` | Main dashboard shell and routing reference |
| `auth.jsx` | Login / signup screens |
| `landing.jsx` | Marketing / landing page |
| `onboarding.jsx` | New domain / project wizard |
| `competitor-setup.jsx` | Competitor selection step |
| `prompt-setup.jsx` | Prompt setup step |
| `runs.jsx` | Escaneos / scan history hub |
| `overview.jsx` | Overview with real scan data |
| `prompts.jsx` | Prompt management screen |
| `recommendations.jsx` | Recommendations screen |
| `sidebar.jsx` | Navigation sidebar |
| `components.jsx` | Shared component library reference |
| `styles.css` | Core visual tokens and styles |
| `marketing.css` | Marketing / landing styles |
| `screenshots/` | Screen captures for visual alignment |
| `design_handoff_lumira/` | Additional handoff assets |

## Rules for Using This Reference

**Do:**
- Inspect screenshots and JSX to understand intended screen structure.
- Extract component hierarchy, spacing, and visual tokens.
- Adapt prototype code to current Next.js architecture.
- Reuse existing CSS tokens and classes where possible.
- Match primary CTAs, empty states, and navigation patterns.

**Do not:**
- Paste large prototype files blindly into production code.
- Introduce prototype-only state as real product behavior.
- Rename GEO Studio to Lumira (some files use Lumira as a prototype brand name — ignore it).
- Import prototype assets without verifying they are needed.
- Fake data to make screens look populated.

## Alignment Criteria

A screen is considered aligned when:
1. Screen purpose matches the design reference.
2. Primary CTA matches the design reference.
3. Component hierarchy is close enough.
4. Empty / loading / success / error states are handled.
5. Visual density and hierarchy are close enough.

## Priority

Product behavior must remain real. Fix broken flows before visual polish.
