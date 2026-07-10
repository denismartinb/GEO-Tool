# WEB-AUDIT-2 — Technical GEO audit (page checks + AI-bot access)

**Gates:** this phase is adjacent to the forbidden "crawler" entry and adds a
table (migration 0015). It MUST NOT be implemented without (a) its own Task
Intake Report, (b) a data-guardian review of the migration + fetch surface, and
(c) explicit founder approval. This document is the design those reviews start
from.

## Goal

Answer "is each page AI-citable, technically?" and "can AI engines even read
this site?" with deterministic checks (no LLM):

1. **Per-page GEO readiness** for ≤ 10 own-domain pages the product already
   knows about (no URL discovery — this is what keeps it out of crawler
   territory): structured data, answer-first format, metadata, freshness.
2. **AI-bot access**: robots.txt rules for the AI crawlers that matter +
   llms.txt presence.
3. KPI **Preparación GEO (0–100)** + per-page table + bots panel on the
   Auditoría web page.

## Explicitly NOT a crawler — the boundary, stated

- Candidate URLs come ONLY from data the product already stores:
  1. `https://{project.domain}/` (homepage),
  2. verified pages of the latest coverage map (`topics[].pages[].url`),
  3. own-domain resolved grounding citations in the latest completed scan's
     `extracted_json`.
- Dedupe (by URL without hash/query), keep order above, cap at
  `MAX_AUDIT_PAGES = 10`.
- **No link-following, no sitemap parsing, no URL discovery of any kind.**
- Every candidate is re-verified fail-closed before fetching: https-only, host
  normalizes to the project domain or a label-boundary subdomain. After
  following redirects, the FINAL response URL is re-verified against the same
  rule; off-domain → the page is discarded (`status: "skipped_offsite"`).

## Fetch safety spec (`lib/web-audit/fetch-page.ts`, server-only)

- `fetch` with `AbortSignal.timeout(4000)` per page; total wall-clock budget
  `TECH_AUDIT_TOTAL_BUDGET_MS = 25_000` — over budget ⇒ remaining pages get
  `status: "skipped_budget"` (persisted as such; partial results are fine,
  invisible failure is not).
- Accept only `content-type: text/html*`; anything else ⇒ `skipped_not_html`.
- Read the body as a stream and stop at `MAX_HTML_BYTES = 512 * 1024`;
  a truncated body is still analyzed (checks are head-heavy).
- Send a honest UA: `GEOStudioAudit/1.0 (+https://<product-domain>/bots)`.
- Never store raw HTML. The fetcher returns the parsed check results only.
- SSRF hardening: reject candidates whose host is an IP literal, `localhost`,
  or ends in a non-public suffix; https only (http candidates upgraded, and
  discarded if https fails). Domain re-verification after redirect is the main
  guard (data-guardian to confirm sufficiency for our Vercel egress model).

## Page checks (`lib/web-audit/page-checks.ts`, pure, heavily unit-tested)

Input: `{ html: string; fetchedAt: Date }` → `PageCheckResult`. Parse with
regex/streaming string scans over the first bytes (no DOM library dependency;
if implementation proves too brittle, propose `htmlparser2` in the PR, calling
it out for review — new dependency needs a say-so).

| Check | Pass condition | Points |
|---|---|---|
| `structured_data` (30) | ≥ 1 `<script type="application/ld+json">` whose parsed JSON (or `@graph` entry) has `@type` in `{Article, NewsArticle, BlogPosting, FAQPage, HowTo, Product, Organization, WebPage}` | 30 all-or-nothing; record the matched types |
| `answer_format` (30) | 10 pts each: (a) exactly one `<h1>`; (b) ≥ 2 `<h2>`; (c) a `<p>` of ≥ 200 characters within the first 3000 characters after `</h1>` (answer-first intro) OR FAQPage structured data present | 0–30 |
| `metadata` (20) | 10 pts: `<title>` length 15–70 chars; 10 pts: `meta[name=description]` length 50–160 chars | 0–20 |
| `freshness` (20) | Date from (in priority order) JSON-LD `dateModified`/`datePublished`, `meta[property=article:modified_time]`, `meta[name=last-modified]`. ≤ 180 days → 20; ≤ 540 days → 10; older → 0; **no date found → `freshness: "unknown"` and the page score is computed over 80 points then rescaled to 0–100** (unknown must not read as stale) | 0–20 / unknown |

`pageScore` = points (rescaled when freshness unknown), rounded.
`readinessScore` (the KPI) = round(mean of `pageScore` over pages with
`status: "analyzed"`); null when none.

All extracted strings persisted or rendered (title, matched types) pass through
the existing `sanitizeField` pattern with tight caps.

## robots.txt / llms.txt (`lib/web-audit/robots.ts`, pure + tiny server fetch)

- Fetch `https://{domain}/robots.txt` and `https://{domain}/llms.txt`
  (4s timeout each, 128KB cap). 404/timeout on robots.txt ⇒ all bots
  `allowed` (crawl-default), recorded as `robots_found: false`.
- Tracked agents (fixed order):
  `GPTBot`, `OAI-SearchBot`, `Google-Extended`, `PerplexityBot`, `ClaudeBot`,
  `anthropic-ai`, `Bingbot`.
- Standard robots semantics, deterministic subset: group matching by exact
  user-agent token (case-insensitive) with `*` fallback; a bot is `blocked`
  when its effective group contains `Disallow: /` (only the root-disallow
  case — path-level nuance is out of scope and must not be guessed).
- llms.txt: presence + byte size only. No parsing beyond that in this phase.

## Persistence — migration `0015_web_audit_snapshots.sql` (data-guardian review required)

`generated_solutions` is NOT reused: these are not LLM generations, and its
sanitization CHECK constraints don't model this data. New table:

```sql
create table public.web_audit_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scan_id uuid null,             -- latest completed run at audit time, server-derived
  source text not null default 'manual',   -- 'manual' | 'cron' (phase 3)
  readiness_score integer null,  -- 0-100, null when no page analyzed
  pages jsonb not null default '[]'::jsonb,  -- PageAuditEntry[], sanitized fields only
  bots jsonb not null default '{}'::jsonb,   -- BotAccessReport, deterministic parse output
  created_at timestamptz not null default now(),
  constraint web_audit_source_chk check (source in ('manual','cron')),
  constraint web_audit_score_chk check (readiness_score is null or (readiness_score between 0 and 100))
);
create index web_audit_project_created_idx on public.web_audit_snapshots (project_id, created_at desc);
alter table public.web_audit_snapshots enable row level security;
create policy web_audit_select_owner on public.web_audit_snapshots
  for select to authenticated using (public.is_project_owner(project_id));
-- No INSERT/UPDATE/DELETE for authenticated: writes only via trusted server code,
-- same rationale as generated_solutions (0005).
```

Rate limit: 5/day/project, counted from this table's
`(project_id, created_at)` index — same windowed-count approach as
`generation-rate-limit.ts` (generalize that helper or add a sibling
`checkSnapshotRateLimit`; keep it pure logic over an injected client).

## Server action + core

- `lib/web-audit/technical-audit.ts` (server-only) `runTechnicalAuditCore`:
  ownership via user client → Pro gate (raw `current_plan`) → rate limit →
  candidate URL selection → fetch/check loop under the total budget →
  robots/llms fetch → **persist unconditionally** (invariant 3 of
  domain-coverage: consumed budget always leaves a row) → return typed result.
  Cache rule: if the latest snapshot is `< 24h` old AND its scan_id equals the
  current latest completed run, return it instead of re-running (mirrors the
  coverage cache; a founder-visible "Repetir" affordance is NOT offered within
  the cache window in this phase).
- `runTechnicalAuditAction` in the project `actions.ts`, zod-validated
  `{ projectId: uuid }`, revalidates `/web-audit`.

## UI additions to the Auditoría web page

- KPI row grows to 4 tiles: + *Preparación GEO* (`{readiness} / 100`, sub-note
  `media de {n} páginas clave`) and *Acceso bots IA*
  (`{allowed} / {tracked} permitidos`; amber sub-note naming blocked bots;
  `llms.txt no encontrado` when absent). Tiles render ONLY when a snapshot
  exists — never placeholders.
- **Salud técnica GEO por página**: full-width card, table (page path +
  context line `citada en N prompts` / `verificada` / `portada`; per-check
  status dots with text labels — never color alone; score pill). Skipped pages
  render with their skip reason in muted text.
- **Acceso de bots de IA**: list card, one row per tracked agent
  (engine display name + UA token + Permitido/Bloqueado badge; llms.txt row).
- Both cards carry a `Comprobado {fecha}` meta line and a single
  "Auditar salud técnica" button (same client-component pattern as
  `run-audit-button.tsx`, disabled while pending, error line beneath).

## Tests

- `page-checks.test.ts`: each check pass/fail; freshness unknown rescale;
  truncated HTML; JSON-LD `@graph`; malformed JSON-LD ignored; score bounds.
- `robots.test.ts`: exact-token group beats `*`; case-insensitivity;
  `Disallow: /` vs `Disallow: /private` (latter ≠ blocked); missing file ⇒
  all allowed + `robots_found: false`.
- `technical-audit` candidate selection: dedupe, cap, off-domain rejection
  (including post-redirect re-verification, mocked fetch), budget cutoff
  produces `skipped_budget` rows and still persists.

## Acceptance criteria

1. Migration reviewed by data-guardian and applied manually (Supabase SQL
   editor) before the feature flag/PR is exposed; the PR states apply status.
2. A technical audit on a real Pro project persists one snapshot row and
   renders the two new cards + two new KPI tiles; reload keeps them.
3. No fetch ever leaves the project's domain (test-proven candidate filter +
   post-redirect check); no raw HTML stored anywhere.
4. Rate limit: 6th audit in 24h returns the Spanish limit message.
5. Free plan: action returns the Pro-required message; UI shows the upsell.
6. `pnpm test && pnpm run validate` pass.
