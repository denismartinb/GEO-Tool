# WEB-AUDIT-1 — The section, built from what already exists

**One PR. No migrations, no new Gemini call shapes, no forbidden areas.**
Everything here reads data that DOMAIN-COVERAGE-1 already persists, plus scan
results that already exist. Consult `README.md` in this directory for canonical
KPI formulas, matrix classification, and shared invariants.

## Goal

Promote the domain-coverage audit from an ephemeral card on Escaneos to a
first-class "Auditoría web" section with:

1. A new route `/dashboard/projects/[projectId]/web-audit` + sidebar entry.
2. Server-loaded, persisted audit results (survive reload — today the result
   lives only in client state and is lost).
3. The **opportunity matrix** (coverage × citations) and two KPIs
   (Cobertura de temas, Tasa de aprovechamiento).
4. A coverage/surfacing **trend** across past audits (when ≥ 2 exist).

## Out of scope (do NOT implement in this PR)

- Page fetching, robots.txt, llms.txt, readiness score (phase 2).
- Cron/daily audit, notifications (phase 3).
- Any change to `lib/recommendations/domain-coverage.ts` behavior (only the
  type/parse extraction described below).
- Any schema change. Any change to scoring (`lib/scoring/**`).

---

## File-by-file plan

### 1. New pure module: `lib/web-audit/coverage-map.ts`

Extract from `lib/recommendations/domain-coverage.ts` (move, don't duplicate):
`DomainCoveragePage`, `DomainCoverageTopic`, `DomainCoverageMap` types,
`parseCoverageMap()`, `NOT_COVERED_NOTE`, `COULD_NOT_VERIFY_NOTE`.

- **No `import "server-only"`** — pure logic, importable from Vitest and from
  server components (same pattern/justification as
  `lib/recommendations/generation-rate-limit.ts`).
- `lib/recommendations/domain-coverage.ts` imports these from the new module and
  **re-exports** `NOT_COVERED_NOTE`, `COULD_NOT_VERIFY_NOTE` and the types, so
  `lib/recommendations/coverage-overlay.ts` and existing tests keep compiling
  unchanged.

### 2. New pure module: `lib/web-audit/opportunity-matrix.ts`

```ts
export type TopicOutcome =
  | "performing"        // found && cited
  | "invisible"         // found && !cited
  | "content_gap"       // !found (conclusive) && !cited && competitorsMentioned
  | "open_opportunity"  // !found (conclusive) && !cited && !competitorsMentioned
  | "unverified_cited"  // !found (conclusive) && cited
  | "inconclusive";     // COULD_NOT_VERIFY_NOTE, or no scan result for promptId

export type PromptResultLite = {
  prompt_id: string | null;
  extracted_json: unknown;
  provider: string | null;
  mentioned_competitors_count: number;
};

export type ClassifiedTopic = DomainCoverageTopic & { outcome: TopicOutcome };

export type WebAuditSummary = {
  topics: ClassifiedTopic[];
  conclusiveCount: number;
  coveredCount: number;          // found === true
  coveragePct: number | null;    // covered / conclusive; null when conclusive === 0
  surfacedCount: number;         // performing
  surfacingPct: number | null;   // performing / covered; null when covered === 0
};

export function hasOwnDomainGroundingCitation(
  extractedJson: unknown,
  projectDomainNormalized: string,
  provider: string | null
): boolean;

export function buildWebAuditSummary(input: {
  coverage: DomainCoverageMap;
  results: PromptResultLite[];   // completed rows of coverage.scanId
  projectDomain: string;         // raw, normalize inside
}): WebAuditSummary;
```

Implementation requirements:

- `hasOwnDomainGroundingCitation` mirrors the private `hasOwnDomainCitation` of
  `lib/scoring/run-scoring.ts` exactly: only `source === "grounding"` citations,
  normalized label-boundary domain match, and rows from ungrounded providers
  (anything not in `{"gemini"}`, with `null`/missing provider treated as
  grounded) return `false` for citation purposes — copy the semantics including
  the `GROUNDED_PROVIDERS` treatment, do NOT import from run-scoring (keep the
  scoring module untouched; divergence is guarded by tests).
- Classification exactly per the table in `README.md`. A topic is
  *inconclusive* when `topic.note === COULD_NOT_VERIFY_NOTE` **or** no result
  row exists with its `promptId`. Inconclusive topics are excluded from every
  denominator.
- `normalizeDomain` / `isSameOrSubdomain`: copy the exact implementations used
  in `domain-coverage.ts` (they are 6 lines each; a shared util refactor is not
  worth touching the reviewed module in this PR).

### 3. New pure module: `lib/web-audit/trend.ts`

```ts
export type CoverageTrendPoint = {
  scanId: string;
  generatedAt: string;      // ISO
  coveragePct: number | null;
  surfacingPct: number | null;
};

export function buildCoverageTrend(input: {
  maps: DomainCoverageMap[];                       // any order
  resultsByScanId: Map<string, PromptResultLite[]>;
  projectDomain: string;
}): CoverageTrendPoint[];
```

- Dedupe by `scanId` keeping the most recent `generatedAt` (re-audits of the
  same scan hit the cache today, but historical rows may repeat a scanId).
- Sort ascending by `generatedAt`; cap to the last **8** points.
- Reuses `buildWebAuditSummary` per map.

### 4. New route: `app/dashboard/projects/[projectId]/web-audit/page.tsx`

Server component. `export const maxDuration = 60;` with the same ADR-0003
comment style as `runs/page.tsx` (the audit server action is invoked from this
page and needs the full budget).

Data loading (user-context RLS client throughout; follow the parallel-query
style of the other project pages):

1. `requireActiveProject(projectId)`; `requireUser()`.
2. Plan gate: `profiles.current_plan` → `isProOrAbove` (copy the exact block
   and comment from `runs/page.tsx:183-191`).
3. Latest completed run id (same query as `domain-coverage.ts:273-283`).
4. Coverage history:
   ```ts
   supabase.from("generated_solutions")
     .select("sanitized_content, created_at")
     .eq("project_id", projectId)
     .eq("generation_type", "domain_coverage")
     .is("recommendation_id", null)
     .eq("status", "completed")
     .eq("is_sanitized", true)
     .order("created_at", { ascending: false })
     .limit(12)
   ```
   Parse each row with `parseCoverageMap`; drop nulls silently.
5. Collect the distinct `scanId`s of the parsed maps; one query:
   ```ts
   supabase.from("scan_prompt_results")
     .select("prompt_id, run_id, extracted_json, provider, mentioned_competitors_count")
     .eq("project_id", projectId)
     .in("run_id", scanIds)
     .eq("status", "completed")
   ```
   Group into `resultsByScanId`.
6. `latestMap` = parsed map with the newest `generatedAt` (independent of
   whether its scanId is the latest run — the header states which scan it
   audited; see UI). `summary = buildWebAuditSummary(latestMap …)` and
   `trend = buildCoverageTrend(…)`.

### 5. New client component: `app/dashboard/projects/[projectId]/web-audit/run-audit-button.tsx`

Move the trigger logic out of `runs/domain-coverage-section.tsx`
(`useTransition` + `auditDomainCoverageAction`), but drop the local
`coverage` state: on success the action revalidates the page and the
server-rendered content refreshes (call `router.refresh()` after a successful
action as a belt-and-braces, matching existing client patterns). Keep local
`error` state for the failure message. Button copy: `Auditar ahora` /
`Auditando…` (spinner), disabled while pending. When `canAuditCoverage` is
false render the existing "Disponible en plan Pro" outline badge instead.

### 6. Page composition (server-rendered, existing CSS classes/inline-style idiom)

Follow the visual grammar of the mockup and the existing pages (`.page`,
`.ov-sticky-header`, `.card`, `.section-head`, badges). All copy in castellano.

1. **Sticky header** — kicker `Auditoría web`, project name + domain badge
   (copy the header of `runs/page.tsx`), right side: `run-audit-button` and,
   when a `latestMap` exists, meta text
   `Última auditoría: {fecha} · sobre el escaneo del {fecha del escaneo}`.
2. **Intro summary strip** (`.summary`): one sentence —
   `Tu dominio visto como lo ve la IA: qué contenido tienes y si las respuestas de IA lo aprovechan.`
3. **KPI row** — two `.card` stat tiles (grid, 2 columns; responsive wrap):
   - *Cobertura de temas*: `{coveredCount} / {conclusiveCount} temas` +
     sub-note `temas de tus prompts con contenido propio verificado`. When the
     trend has ≥ 2 points show a `Delta` (existing component) vs the previous
     point's `coveredCount`-equivalent percentage.
   - *Tasa de aprovechamiento*: `{surfacingPct} %` + sub-note
     `de los temas con contenido, cuántos cita la IA`. Amber note when
     `invisible` count > 0: `{n} temas con contenido no se citan`.
   - `coveragePct === null` → render `—` (never `0 %` from an empty
     denominator).
4. **Opportunity matrix** — `.card` with 2×2 CSS grid + axis labels
   (`Con contenido propio` vertical, `La IA no te cita → sí te cita`
   horizontal). Each quadrant: label + count + up to 6 topic chips
   (truncate with `…` and `title` attr). `unverified_cited` and
   `open_opportunity` share the neutral quadrant visually, listed with their
   own labels. `inconclusive` topics render under the matrix as a muted line:
   `{n} temas sin verificar en esta auditoría (no cuentan para los KPIs)`.
   Quadrant tones: reuse `badge-pos`-style greens, existing warn/neg CSS vars
   (`--pos`, `--warn`, `--neg` + soft backgrounds already used across the app).
5. **Trend card** — render ONLY when `trend.length >= 2`. Server-rendered
   inline SVG (no chart library, none exists in the project): two polylines
   (coverage `var(--accent)`, surfacing `var(--pos)`), horizontal gridlines at
   0/25/50/75/100 %, date labels, endpoint value labels, `<svg role="img">`
   with a Spanish `aria-label` summarizing both series. Legend row above
   (colored swatch + text). No hover/tooltip in this phase (P3 polish later) —
   endpoint labels carry the reading.
6. **Topic detail list** — the moved `TopicRow` rendering from
   `domain-coverage-section.tsx` (badge + topic + verified pages links +
   note in italics with the AI-interpretation disclaimer), now grouped by
   outcome in this order: `invisible`, `content_gap`, `performing`,
   `unverified_cited`, `open_opportunity`, `inconclusive`. Add per-row outcome
   badge using the matrix labels.
7. **Empty / gated states** (exactly one renders):
   - Not Pro → `.card` upsell: title `Disponible en el plan Pro`, body
     explaining the feature, link to `/dashboard/settings/billing`.
   - Pro, no completed scan → reuse `NO_SCAN_FAILURE` wording with CTA link to
     the Overview to launch a scan.
   - Pro, scans but no audit yet → explainer card + the run button:
     `Todavía no has auditado tu web. La auditoría comprueba, tema a tema, si tu dominio publica contenido que Google encuentra.`
     plus the note `Hasta 5 auditorías al día por proyecto.`

### 7. `components/sidebar.tsx`

Add to `analyzeLinks` after Escaneos:
```ts
{ segment: "/web-audit", label: "Auditoría web", icon: "search", countKey: null as null | string }
```
(`search` exists in `components/ui/icon.tsx`.) No count badge in this phase.

### 8. `app/dashboard/projects/[projectId]/runs/page.tsx`

- Remove the `DomainCoverageSection` import and usage and the
  `canAuditCoverage` plan-gate block (lines 183-191) — the runs page no longer
  needs the profile read.
- Add to the footer links row a link to the new section
  (icon `search`, label `Auditoría web`).
- Delete `runs/domain-coverage-section.tsx` (superseded by the new page +
  `run-audit-button.tsx`).

### 9. `app/dashboard/projects/[projectId]/actions.ts`

In `auditDomainCoverageAction`, change the revalidation to the new home of the
feature:
```ts
revalidatePath(`/dashboard/projects/${parsed.data.projectId}/web-audit`);
```
(the runs page no longer renders coverage). Update the doc comment ("feature on
the Escaneos page" → "the Auditoría web page").

---

## Tests (Vitest, colocated `*.test.ts`, same style as existing lib tests)

`lib/web-audit/opportunity-matrix.test.ts` — the load-bearing suite:

- performing / invisible / content_gap / open_opportunity / unverified_cited
  classification, one focused case each.
- `COULD_NOT_VERIFY_NOTE` topic → inconclusive, excluded from denominators.
- Topic whose `promptId` has no result row → inconclusive.
- Subdomain match counts (`blog.acme.com` vs project `acme.com`); label
  boundary rejected (`evilacme.com` does NOT count); `www.` and scheme
  normalization.
- Inline (non-grounding) citation to own domain does NOT count; grounding
  citation from an ungrounded provider row (e.g. `provider: "claude"`) does
  NOT count; `provider: null` treated as grounded.
- `coveragePct`/`surfacingPct` null-denominator cases.

`lib/web-audit/trend.test.ts`: scanId dedupe keeps newest, ascending sort,
cap at 8.

`lib/web-audit/coverage-map.test.ts`: move/keep the existing parse tests that
cover `parseCoverageMap` (they currently live in
`lib/recommendations/domain-coverage.test.ts`; keep that file compiling —
only relocate what the extraction moved).

## Acceptance criteria

1. Sidebar shows "Auditoría web" between Escaneos and the Actuar group; route
   renders for an owned project and 404-redirects like the other pages for a
   non-owned one (via `requireActiveProject`).
2. A previously-run audit renders on load with no client action (persistence
   proven: reload keeps the data).
3. "Auditar ahora" runs an audit, and the page shows the refreshed
   server-rendered result; rate-limit and plan-gate failures surface their
   existing Spanish error messages.
4. Matrix quadrant counts + KPI numbers are mutually consistent (sum of
   quadrant counts + inconclusive = topics length) — assert in tests.
5. The Escaneos page no longer renders the coverage card; nothing else on it
   changed.
6. `pnpm test` and `pnpm run validate` pass; no `server-only` module is
   imported from a client component (build enforces).
7. No schema change, no change to `domain-coverage.ts` runtime behavior
   (diff limited to import/re-export moves).

## QA smoke (manual, preview URL)

Free account → section shows Pro upsell. Pro account, no scans → CTA to scan.
Pro + completed scan → run audit → matrix/KPIs render → reload → data persists
→ run again → served from cache (same `generatedAt`) → after a new scan,
audit again → new row, trend gains a point.
