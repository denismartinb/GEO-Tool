# Handoff: Lumira — AI Visibility (GEO) Platform

## Overview
**Lumira** is a SaaS platform for **Generative Engine Optimization (GEO)** — it helps companies, SEO agencies and marketing teams understand, monitor and improve how their brand appears in AI-generated answers (ChatGPT, Google AI Overviews, Perplexity, Claude).

Core product principle: **"From AI visibility to implementation."** Lumira is not a passive reporting dashboard — every insight leads to a prioritized, implementable action, and the product can generate the fix (FAQ, schema, content, robots.txt rules) with one click.

This bundle documents a clickable, high-fidelity prototype covering the MVP: a marketing homepage, auth (login + signup), an onboarding flow, and the authenticated app (Overview, Recommendations Center, Prompts) with empty / loading / error states.

---

## About the Design Files
The files in `prototype/` are **design references built in HTML/CSS + React-via-Babel** — they show the intended look, layout and behavior. **They are not production code to ship directly.**

The task is to **recreate these designs in your target codebase** using its established framework, component library and patterns. If no codebase exists yet, the recommended stack is **React + TypeScript + Vite**, with CSS variables (or Tailwind mapped to the tokens below) and a router. The prototype is deliberately framework-light (plain React + a CSS file with custom properties) precisely so the token system and component anatomy transfer cleanly.

To run the reference prototype: serve the `prototype/` folder over any static server and open `Lumira.html` (it loads React/Babel from CDN). A floating **"Pantalla / Estado"** bar (bottom center) lets you jump between every screen and state — **this is a review aid and must NOT be built into the real app.**

The UI copy is in **Spanish**. Keep Spanish unless you're localizing; a glossary of key terms is at the end.

---

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, shadows and interactions are specified. Recreate pixel-faithfully using your codebase's primitives. The exact token values are in `prototype/styles.css` (`:root`) and itemized below.

---

## Brand
- **Name:** Lumira
- **Logo mark ("resonance"):** a central filled dot with symmetric concentric arcs on both sides (signal/resonance). See `Icon name="resonance"` in `prototype/icons.jsx` (24×24 stroke SVG: center `<circle r=2.4 fill>`, arcs at radii ~6 and ~9.6 with the outer pair at opacity .5). Rendered white on an indigo gradient tile (`.brand-mark`).
- **Wordmark:** "Lumira" in Hanken Grotesk 800.
- **Logo tile (`.brand-mark`):** 28×28, `border-radius:8px`, `background: linear-gradient(150deg, var(--accent) 0%, #6d63f0 100%)`, subtle shadow `0 2px 6px var(--accent-ring)`.
- **Palette system (dual):**
  - **Light (default) — "Graphite + Indigo":** graphite-cool neutrals + indigo accent `#6366f1`.
  - **Dark (approved, not yet implemented) — "Black + Cyan":** near-black surfaces + cyan accent `#22d3ee`. Target tokens: `bg #0c0d11`, `surface #15161c`, `line #23252e`, `ink #f3f4f8`, `muted #8b90a0`, `accent #22d3ee`, `accent-soft #0e2730`. Build this as a `data-theme="dark"` override of the same token names.

---

## Design Tokens
All tokens are CSS custom properties on `:root` in `styles.css`. Accent is overridden at runtime from the Tweaks panel; the default (approved) accent is indigo.

### Colors — neutrals (cool graphite)
| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#f6f7f9` | app background |
| `--surface` | `#ffffff` | cards / panels |
| `--surface-2` | `#fbfbfd` | subtle raised / striped |
| `--surface-sunk` | `#f1f3f6` | wells, track backgrounds |
| `--line` | `#e8eaef` | hairline borders |
| `--line-strong` | `#dde0e7` | stronger borders |
| `--line-soft` | `#eef0f4` | softest dividers |
| `--ink` | `#0f1729` | primary text |
| `--ink-2` | `#475067` | secondary text |
| `--ink-3` | `#6b7385` | tertiary text |
| `--ink-4` | `#98a0b0` | muted / placeholder |

### Colors — accent (indigo, default)
| Token | Hex |
|---|---|
| `--accent` | `#6366f1` |
| `--accent-700` (hover) | `#4f46e5` |
| `--accent-soft` | `#eef0fe` |
| `--accent-soft-2` | `#eef0fe` |
| `--accent-ink` | `#3730a3` |
| `--accent-ring` | `accent + "4d"` (≈30% alpha) computed at runtime |

### Colors — semantic
| Purpose | Color / Soft bg / Ink |
|---|---|
| Positive | `#15915a` / `#e7f6ee` / `#0d6b41` |
| Negative | `#d23b48` / `#fdecee` / `#a51f2c` |
| Warning | `#c47e12` / `#fdf3e0` / `#8a5a06` |
| Info | `#2f6fde` / `#eaf1fd` |
| Priority high | `#d23b48` / soft `#fdecee` |
| Priority med | `#c47e12` / soft `#fdf3e0` |

### Radii
`--r-xs 6` · `--r-sm 8` · `--r-md 10` · `--r-lg 14` · `--r-xl 18` · `--r-pill 999px`

### Shadows
- `--sh-1`: `0 1px 2px rgba(16,24,40,.05), 0 1px 1px rgba(16,24,40,.03)`
- `--sh-2`: `0 2px 4px rgba(16,24,40,.05), 0 4px 12px rgba(16,24,40,.06)`
- `--sh-3`: `0 8px 24px rgba(16,24,40,.10), 0 2px 6px rgba(16,24,40,.06)`
- `--sh-pop`: `0 12px 40px rgba(16,24,40,.16), 0 4px 12px rgba(16,24,40,.08)`

### Typography
- **UI / display:** `"Hanken Grotesk"` (Google Fonts), weights 400/500/600/700/800.
- **Mono (data, code, URLs, technical labels):** `"JetBrains Mono"`, 400/500/600.
- Tabular numbers everywhere numeric: `font-variant-numeric: tabular-nums` (`.tnum`).
- Type scale in use: page H1 40px/800; section title 15px/750; card title 13.5px/700; body 13–14px; metric numbers 30–34px/800 (hero score 41 → 48–60px); labels 10.5–12px; uppercase eyebrows 10.5–11px with `.05–.12em` letter-spacing.

### Spacing & layout
- 4px base scale. Card padding 15–20px. Section vertical rhythm ~30px.
- App content max-width **1320px**, centered, `padding: 26px 34px 80px`.
- Sidebar width **248px** (collapsed **68px**). Top header height **61px**.

---

## Global App Shell (`app.jsx`, `sidebar.jsx`)
A top-level `view` router controls: `landing` → `login` / `signup` → `app`. Inside `app`, an internal `state` machine drives content: `onboarding | populated | empty | loading | error`, and a `route`: `overview | prompts | competitors | runs | recs | solutions`.

**Layout:** CSS grid `grid-template-columns: 248px 1fr; height: 100vh; overflow: hidden`. Left = sidebar, right = `.main` (column: sticky header + scrollable `.content`).

**Sidebar (`.sb`):**
- Brand row (logo tile + "Lumira" + sub "Espacio de visibilidad en IA").
- Project switcher card (favicon initial, project name, domain in mono, chevron).
- Nav groups: **Analizar** (Visión general, Prompts ·64, Competidores ·5, Escaneos ·7) and **Actuar** (Recomendaciones ·12, Soluciones generadas 🔒 locked). Counts are pill badges; active item = `--accent-soft` bg + `--accent-ink` text + accent icon.
- Footer: "¿Qué es el GEO?" help link + user chip (avatar "DM", "Denis Martín", "Agencia Acme").
- Collapse button (circular, on the right edge) toggles the 68px rail; labels hidden via `.hide-collapsed`.

**Top header (`.hdr`):** translucent blurred bar. Left: breadcrumb (`Project · Page`) + meta pills (domain in mono, country flag + name, language). Right: scan status pill (dot + text, color by state: ok/run-pulse/err/idle), notifications icon button, and the primary **"Lanzar escaneo" / "Repetir escaneo"** button.

---

## Screens / Views

### 1. Landing / Homepage (`landing.jsx`, `marketing.css`)
Indexable marketing page; the entry view.
- **Nav** (sticky, blurred): logo + links (Producto, Cómo funciona, Recomendaciones) + "Iniciar sesión" (ghost) + "Prueba gratis" (primary).
- **Hero:** aurora animated background (4 blurred gradient blobs drifting 26–34s + 2 slow-rotating rings — see `.onb-aurora` in styles.css), eyebrow pill, H1 60px/800 with gradient span (`linear-gradient(100deg,#4f46e5,#7c3aed 55%,#0d9488)` clipped to text), 18.5px lead, a **domain input bar** (`.domain-bar`: globe icon + input + "Analiza gratis" primary CTA) and a trust note row (Sin tarjeta · Primer escaneo en minutos · 4 motores).
- **Product shot:** browser-window frame (`.browserframe`: traffic-light dots + URL `app.lumira.ai/overview`) containing `assets/hero-dashboard.png`. Use a live screenshot of the real Overview here.
- **Sections:** logo strip; "Cómo funciona" 3 steps (Analiza/Compara/Implementa); 6-card feature grid; "El corazón del producto" spotlight (2-col: copy + a static recommendation card mock); testimonial quote; gradient CTA band; footer.
- CTAs route: "Prueba gratis"/"Analiza gratis" → signup (passing typed domain); "Iniciar sesión" → login.

### 2. Login (`auth.jsx`)
Centered card on a soft radial-gradient bg (`.auth-bg`).
- Card (max 440px, radius 18, `--sh-pop`): logo lockup, H1 "Bienvenido de nuevo", sub, email field, full-width "Iniciar sesión" primary, "o continúa con" divider, Google + SSO social buttons, "¿No tienes cuenta? Regístrate" link, legal line.
- Submit / Google / SSO → enter app as returning user (`view=app`, `state=populated`, `route=overview`). "Inicio" back chip → landing.

### 3. Signup (`auth.jsx`)
Two-column full-screen (`.signup`, grid 1fr 1fr; right column hidden < 900px).
- **Left:** back chip, logo, H1 "Crea tu cuenta", sub, First/Last name (2-col), email, "Crear cuenta gratis" primary, social buttons, "¿Ya tienes cuenta? Inicia sesión", legal.
- **Right:** indigo gradient panel with two blurred glows + an auto-rotating **testimonial carousel** (4.2s interval, clickable dots). Card: large quote mark, italic quote, avatar + name + role.
- Completing signup → app onboarding (`state=onboarding`), prefilling the domain typed on the landing.

### 4. Onboarding (`onboarding.jsx`)
Full-screen "no project yet" state (same aurora bg as landing hero).
- Top bar: logo + "¿Qué es el GEO?" + avatar.
- Center: eyebrow, H1 ("De la visibilidad en IA / a la implementación", gradient), lead, then a `.domain-bar` with: globe, domain input with an **animated typewriter placeholder** (cycles example domains; pauses when focused/filled), a **country selector** (`.country-sel`: flag + name + native `<select>` overlay; US/ES/MX/UK/DE/FR with inline mini-flag SVGs), and "Comenzar" primary. Domain validation regex: `/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/` (strips `https://` and path); on invalid show inline error.
- A "¿Sin dominio a mano? → Ver ejemplo" chip loads the demo (vela.io). Engine chips row at bottom.
- Submitting → `state=loading` (scan runs with the entered domain in the copy) → `populated`.

### 5. Project Overview (`overview.jsx`) — the executive screen
Scrollable page; the most important read.
- **Executive summary banner:** icon + natural-language sentence with bolded metrics and colored highlights (neg/pos).
- **"Visibilidad de un vistazo"** section header + "Mejorando" badge.
- **Hero score card (`.hero-v2`, full width, flex):**
  - Left: **radial gauge** (open-bottom 270° arc, gradient stroke, color by band: ≥70 green / ≥40 accent / else warn) showing **GEO Score 41/100**, label + tooltip, "Franja «emergente»" badge. (A Tweak toggles gauge ↔ big number.)
  - Divider. Middle: **"Cómo se compone tu puntuación"** — 3 labeled mini progress bars: Tasa de mención 18%, Tasa de cita 9%, Prominencia 34%.
  - Divider. Right: **trend** — big number + delta + a 7-point sparkline (area, gradient fill) + band note.
- **4 metric cards (`.metrics-2col`, 2×2 full width, horizontal layout):** Tasa de mención 18% (+3pt), Tasa de cita 9% (+2pt), Diferencia vs competidor 2.4× (−0.3, inverted = good), Confianza 86% (+4). Each: label + info tooltip, big tabular number with unit, delta chip ("vs. escaneo anterior"), and a large sparkline filling the right of the card.
- **"Dónde estás"** → 2-col (`.grid-2-1`): **Competitive snapshot table** (Brand row with favicon/name/domain, your-row highlighted in `--accent-soft` with "Tú" tag; columns Mención, Cita, Share-of-AI-voice bar + %, Trend delta) + **Distribution by AI engine** card (per-engine colored bars + "% mención") with a "Why this matters" callout.
- **"Oportunidades"** → 2-col: **Prompt opportunities** rows (question + value/intent badges + volume/engines, competitor avatar stack, arrow) + **Most-cited source pages** list (URL in mono, your domain highlighted, citations count).
- **"Qué hacer primero"** → 3 top recommendation preview cards (rank chip, priority/category badges, title, impact/effort dot-meters + confidence), linking to the Recommendations Center.

### 6. Recommendations Center (`recommendations.jsx`) — the heart
Prioritized action backlog.
- **Summary banner** + stats (High priority, Quick wins, Total actions).
- **Filters:** segmented status (Todas / Abiertas / Victorias rápidas), category chips (Todas / Contenido / Técnico / Autoridad), sort toggle (Prioridad ↔ Impacto), Export.
- **Recommendation cards (`.rec-card`, expandable):** collapsed row = rank chip (color by priority), priority + category + "Quick win" + status badges, title, problem text, and right cluster of metrics (Impact/Effort **dot-meters** 1–5, Confidence %) + "Ver/Ocultar recomendación" button. Expanding (animated max-height) reveals:
  - 2-col: **"Por qué importa"** (paragraph + chips: prompts affected, est. impact, SEO risk) and **"Evidencia"** (engine badge + prompt + quoted AI answer with **highlighted competitor mentions** in a warning-tinted mark + cited source URL).
  - **"Acción sugerida"** block (target icon + paragraph).
  - **"Generar solución"**: a primary button that simulates AI generation — idle → loading (spinner + shimmer skeleton lines, ~1.7s) → done (generated FAQ/schema/robots/JSON-LD/content with Copy + "Marcar como implementado" actions). Off-platform recs show a non-generative note instead.

### 7. Prompts (`prompts.jsx`, `prompts-data.jsx`)
Topic/prompt explorer with a detail drawer.
- **Toggle:** Topics ↔ Prompts. **Search** + Intención/Motor filter chips.
- **Topics view:** expandable **topic rows** (`.topic-row`, grid: name+layers icon | Visibilidad number+bar | Menciones | Volumen IA sparkline+value | Intención stacked bar + legend | "Monitorizar"). Expanding reveals an inner **prompt table**: Prompt | Respuesta de IA (engine mark + 2-line snippet + "Ver respuesta completa") | Tu marca (Mencionada/Citada badges) | Marcas count | Fuentes count | arrow.
- **Prompts view:** the same prompt rows, flat.
- **Detail drawer (`.drawer`, right slide-over 760px + scrim):** Opens on prompt click.
  - Header "Detalle del prompt" + close. Prompt box (icon + text + meta: intención, volumen, nº motores).
  - Tabs **Resumen / Respuestas**.
  - **Respuestas (list):** per-engine rows (engine mark + name + snippet | Marca Sí/No | Sentimiento bar | Fecha). Click an engine →
  - **Respuestas (detail):** back chip + full AI response text (left) + right sidebar with **"Presencia de marca y sentimiento"** (your brand "Tú" + competitors, each with a signed sentiment bar) and **"Fuentes (n)"** (URL list in mono, your domain highlighted/linked).
  - **Resumen:** aggregate cards (how many engines mention/cite you, coverage, per-engine breakdown).

### 8. Empty / Loading / Error states (`states.jsx`)
- **Empty:** centered card — "Lanza tu primer escaneo de visibilidad en IA", description, "Lanzar escaneo" + "Revisar prompts" CTAs, and a "¿Qué es un escaneo?" explainer callout.
- **Loading:** spinner header + **staged progress checklist** (6 steps; current = spinner + "trabajando…", done = green check; the first step interpolates the scanned domain) + progress bar + "% · n de 6 pasos". Auto-advances ~1.1s/step then resolves to populated.
- **Error:** red icon — "No se pudo completar el escaneo", "58 de 64 prompts" partial-success copy, "Reintentar prompts fallidos" + "Ver detalles del escaneo", and a failure-detail card (mono run id).
- Recommendations/Prompts have their own empty variants that prompt to run a scan.

### Placeholder routes
Competidores, Escaneos, Soluciones generadas render a centered "designed in a later iteration" placeholder. Build full screens later; the data model notes are in the UX brief.

---

## Shared Components (`components.jsx`)
Recreate these as reusable primitives:
- **Tip** — info "i" with a hover tooltip bubble (dark, 248px, arrow). Used for every metric explanation ("Explain GEO everywhere").
- **Sparkline** — inline SVG line+area chart with gradient fill and end dot. Props: data[], w, h, color, fill, invert.
- **Gauge** — 270° open-bottom radial gauge with gradient stroke and centered value/label.
- **Delta** — signed change chip with up/down arrow; `invert` flag for metrics where down is good (Competitor gap).
- **Badge** — tones: pos / neg / warn / info / accent / neutral / outline; optional leading icon.
- **Fav** — entity favicon (colored rounded square with initial). **AvMini** — stacked mini avatars.
- **DotMeter** — 1–5 dot rating (Impact/Effort), tone-colored.
- **SovBar** — horizontal share bar.
- **Icon** — stroke icon set (`icons.jsx`), incl. the `resonance` brand mark. 24×24, `stroke="currentColor"`, configurable size & stroke-width.

---

## Interactions & Behavior
- **Routing/flow:** Landing → (Prueba gratis) → Signup → Onboarding (domain prefilled) → Loading → Overview. Landing → (Iniciar sesión) → Login → Overview. All transitions are state changes (no full reloads).
- **Scan simulation:** "Lanzar escaneo" sets `loading`; the staged checklist auto-completes then flips to `populated`.
- **Recommendation expand/collapse:** animated `max-height` (~.28s ease); one open at a time.
- **Generate solution:** idle→loading(~1.7s, shimmer)→done; in a real app this is an async LLM call — show the same 3-state pattern with a real request.
- **Prompt drawer:** slide-in from right (.26s cubic-bezier) + fade scrim; engine list ↔ engine detail two-level navigation.
- **Onboarding typewriter:** types/deletes example domains on a loop; pauses while the field is focused or has a value.
- **Testimonial carousel:** auto-advances every 4.2s; dots jump.
- **Tooltips/hover:** all metrics, table headers and badges have explanatory tooltips. Buttons have hover/active states (see `.btn*` in styles.css).
- **Animations note:** the prototype's `.fade-in` only animates `transform` (not opacity) on purpose — avoid opacity-from-0 mount animations that can leave content invisible if rAF is throttled.

## State Management
Minimal global state (prototype uses React `useState` in `app.jsx`):
- `view`: landing | login | signup | app
- `state`: onboarding | populated | empty | loading | error
- `route`: overview | prompts | competitors | runs | recs | solutions
- `scanDomain` (string), `initialDomain` (carried landing→onboarding), `collapsed` (sidebar)
- Tweaks (prototype-only; see below) — **do not ship.**
In production, replace with your router (URL-driven `view`/`route`) and server state (project, scans, recommendations, prompts) via your data layer. Data fetching: project create → scan job (async, with progress) → results (scores, competitors, prompts, citations, recommendations). The UX brief notes results should be cached ~30 days when the domain's crawled content is unchanged.

## Data Model (from sample data — `data.jsx`, `prompts-data.jsx`)
- **Project:** name, domain, country, language, lastScan, promptCount, competitorCount, runCount.
- **Scores:** geoVisibility (0–100), mentionRate %, citationRate %, competitorGap (×), confidence %, each with trend[] and delta.
- **Competitors:** name, domain, color, mentionRate, citationRate, shareOfVoice, delta.
- **Engines:** ChatGPT, Google AI Overviews, Perplexity, Claude — share %, mention %.
- **Topics:** name, region, visibility, mentions, volume, trend[], intent{Comercial/Informacional/Transaccional %}, prompts[].
- **Prompt:** text, intent, volume, your[Mencionada/Citada], brands count, sources count, engines[] where each = { engine, status[], sentiment(-100..100), competitors[], snippet, full, sources[{url, brand?, you?}] }.
- **Recommendation:** priority, rank, status, category, type, title, problem, why, impact(1–5), effort(1–5), confidence %, seoRisk, evidence{engine,prompt,quote,mentions[],cited}, action, genKind, metrics{affectedPrompts, est}.

## Assets
- `prototype/assets/hero-dashboard.png` — screenshot of the Overview used in the landing hero browser frame. Regenerate from the real app once built.
- **Fonts:** Hanken Grotesk + JetBrains Mono via Google Fonts (also Fraunces/Space Grotesk are referenced only in the brand exploration doc, not the app).
- **Icons:** all are inline stroke SVGs in `icons.jsx` (no icon-font dependency). The brand "resonance" mark is `Icon name="resonance"`.
- No third-party brand logos are shipped; AI-engine marks are simple colored letter tiles (`EngineMark` in `prompts.jsx`). Swap for real engine logos if you have license.

## Files
**`prototype/`** (open `Lumira.html`):
- `Lumira.html` — entry; loads React 18 + Babel (CDN) then the scripts below in order.
- `styles.css` — app design system + all app-screen styles (tokens in `:root`).
- `marketing.css` — landing + auth styles.
- `tweaks-panel.jsx` — prototype-only tweak panel (REMOVE in production).
- `icons.jsx` — Icon component + icon set (incl. `resonance` logo).
- `data.jsx`, `prompts-data.jsx` — sample data.
- `components.jsx` — shared primitives (Tip, Sparkline, Gauge, Delta, Badge, Fav, AvMini, DotMeter, SovBar).
- `sidebar.jsx`, `app.jsx` — shell + router + header + demo bar (demo bar is REMOVE-in-production).
- `overview.jsx`, `recommendations.jsx`, `prompts.jsx`, `states.jsx` — app screens.
- `onboarding.jsx`, `landing.jsx`, `auth.jsx` — pre-app screens.

**`brand/Lumira — Brand.html`** — brand exploration board (names, logo concepts incl. the chosen "resonance" mark, and the two approved palettes with app-ready tokens). Reference for visual identity.

---

## Glossary (ES → meaning)
Visión general = Overview · Prompts · Competidores = Competitors · Escaneos = Runs/Scans · Recomendaciones = Recommendations · Soluciones generadas = Generated Solutions · Tasa de mención = Mention rate · Tasa de cita = Citation rate · Diferencia vs competidor = Competitor gap · Cuota de voz en IA = Share of AI voice · Lanzar escaneo = Run scan · Prominencia = prominence/position in answer · Fuentes = Sources · Victoria rápida = Quick win.

## Out of scope (do NOT build for MVP)
Billing, teams, API management, browser extension, CMS integrations, advanced settings, enterprise admin, public/white-label reports. Also remove: the floating "Pantalla/Estado" demo bar and the Tweaks panel.
