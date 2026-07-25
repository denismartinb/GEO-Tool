# ADR 0019 — Brand-domain matching across TLDs

**Status:** Accepted
**Date:** 2026-07-25
**Deciders:** Founder (option A, explicitly chosen) + Director

---

## Context

Every "is this citation the brand's own?" check compared a citation's domain
against `projects.domain` with exact-or-subdomain matching
(`isSameOrSubdomain`). A brand, however, rarely lives on a single hostname:
IKEA is `ikea.es` in Spain and `ikea.com` globally; MercadoLibre is
`mercadolibre.com.co` and `mercadolibre.com.mx`.

The founder surfaced this on a production run for the `ikea.es` project: the
prompt detail listed `ikea.com` among the sources the AI actually used, while
the same panel stated *"Ninguna es ikea.es — por eso «Citada: No»"*. The AI
had genuinely cited the brand; the product said it hadn't.

This was not a display-only defect. The same matching fed three real
product metrics, all of which were **under-reporting**:

| Metric | Call site | ADR |
|---|---|---|
| `citation_score` | `run-scoring.ts` → `hasOwnDomainCitation` | 0013 |
| `authority` component of `geo_score` | derived from `citation_score` | 0008 |
| `own_citation_share` ("Cuota de Citas") | `aggregate-citations.ts` categorization | 0010 |

A fourth call site had the same blind spot with a different symptom:
competitor suggestion (`lib/llm/gemini.ts`) excluded only the exact own
domain, so `ikea.com` could be suggested as a *competitor* of `ikea.es`.

The matching logic was also physically duplicated (private copies of
`normalizeDomain` / `isSameOrSubdomain` in several modules), which is how the
prompt drawer drifted further still — it used strict equality and did not
even match subdomains.

## Decision

Introduce `lib/domains/brand-domain.ts` as the single definition of brand
domain ownership, exposing:

- `normalizeDomain` — canonical host (no scheme, no `www.`, no path)
- `isSameOrSubdomain` — same host or a subdomain of it
- `brandLabel` — the registrable label before the public suffix
- `isBrandDomain` — same host, subdomain, **or the same brand on another TLD**

`brandLabel` resolves the label immediately preceding the public suffix,
using a bounded list of two-level suffixes (`com.mx`, `co.uk`, …) limited to
the markets the product serves; everything else falls back to a single-level
suffix. So `ikea.es`, `ikea.com`, `blog.ikea.es` and `es.ikea.com` all
resolve to `ikea`, and `listado.mercadolibre.com.mx` resolves to
`mercadolibre`.

Adopt `isBrandDomain` at the four ownership call sites: `citation_score`
(and therefore `authority`/`geo_score`), the Citations page brand/competitor
categorization (including tracked competitors, so `conforama.com` counts for
a `conforama.es` competitor), the prompt detail "Citada" panel, and
competitor-suggestion exclusion.

### Explicitly out of scope

Link-topology checks in the web audit (`lib/web-audit/**`) keep using
`isSameOrSubdomain`. For technical SEO, a link from `ikea.es` to `ikea.com`
genuinely *is* an external link; applying brand matching there would corrupt
internal/external link analysis. `lib/recommendations/domain-coverage.ts` is
likewise untouched — it answers a different question (which of the project's
own pages cover a topic) and changing it was not part of this decision.

## Consequences

**Positive.** The three metrics above now count real brand citations that
were previously discarded, so `citation_score`, `authority`/`geo_score` and
`own_citation_share` stop under-reporting for any brand operating on more
than one TLD. The four call sites can no longer disagree with each other.

**Accepted trade-off.** Brand-label matching is a heuristic, not proof of
ownership: two unrelated owners of `<generic>.es` and `<generic>.com` will
match. The founder accepted this (2026-07-25, "opción A") over the precise
alternative — an explicit per-project `brand_domains` list — because it
requires no schema migration and fixes the observed case immediately. The
false positive is pinned in `brand-domain.test.ts` as a documented choice
rather than left as a latent surprise. An explicit `brand_domains` column
remains the upgrade path if false positives appear in practice.

**Historical data is unchanged.** Scores are computed at scan time
(`lib/scan/executor.ts`) and persisted on `scan_runs`. This change therefore
affects **new scans only**; existing runs keep the values they were stored
with. Re-scoring historical runs would need its own backfill decision and is
not part of this ADR.
