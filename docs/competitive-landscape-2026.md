# Competitive Landscape — GEO / AI Visibility Tools (June 2026)

This document is the Director's reference for product-vision decisions. It
summarizes a 5-angle research pass (enterprise leaders, mid-market pure-plays,
SEO-suite incumbents, UX patterns, market trends) conducted June 2026. Update
it when the competitive picture shifts materially — don't re-research from
scratch each time.

**Source quality note:** much of the competitive blog content is published by
competing vendors (Profound, Writesonic, Scalenut, AthenaHQ reviewing each
other) — directionally useful, not neutral. The most reliable signals: G2
ratings, funding data, and two independent studies on measurement variance
(Penn State, arXiv 2603.08924).

---

## 1. Market context

- **Profound** ($1B valuation, $96M Series C Feb 2026, Lightspeed) is the
  clear category leader — enterprise tier.
- **Adobe acquired Semrush for $1.9B** (closed Apr 2026) — incumbents are
  buying into GEO, not just building.
- **Peec AI** (Berlin) went from ~$4M to ~$10M ARR in 6 months; $21M Series A
  at >$100M valuation. The clearest mid-market comparable.
- The contested ground is **SMB/mid-market, $100–500/mo** — exactly where
  GEO Studio sits.

## 2. Competitive map

| Tier | Players | Defining trait |
|---|---|---|
| Enterprise leader | Profound | Real prompt-panel data (400M+ conversations), Agent Analytics (CDN crawler logs), Prompt Volumes, Shopping Analysis. Most complete, most overwhelming. |
| Enterprise differentiated | AthenaHQ, Scrunch, Evertune, Bluefish | One moat each: Athena = agentic copilot + best UX (G2 4.6) + Action Center; Scrunch = AI-crawler analytics + AXP; Evertune = statistical rigor (25M-person panel); Bluefish = Fortune-500 + commerce (Amazon Rufus). |
| Mid-market (our tier) | Peec AI, Otterly, Rankscale, Goodie | Peec = onboarding/simplicity benchmark; Otterly = cheap + email digests; Rankscale = 17+ engines from €20; Goodie = only one with a content-generation action loop. |
| SEO-suite incumbents | Semrush/Adobe, Ahrefs, Similarweb, Conductor, BrightEdge, SE Ranking | Data moats (clickstream, keyword DBs, crawl) but bolted-on GEO features, fewer engines, slow refresh, severe undercounting (Ahrefs: 97.6% under-report vs reality). |
| Exits | xfunnel (→HubSpot, ~$30M), Daydream (agency, not SaaS) | Exit comps, not live competitors. |

## 3. Table stakes vs. differentiators

**Table stakes (required, not a moat):**
- Multi-LLM tracking (ChatGPT, Gemini, Perplexity, Claude, Grok, AI Overviews/Mode, Copilot)
- Share of voice / mention rate / visibility score as headline metric
- Citation/source analysis
- Daily prompt monitoring + competitor gap analysis
- Sentiment per mention
- Auto-suggested prompts/competitors at onboarding

**Real differentiators:**
1. Real query/conversation data (not synthetic prompts) — Profound's moat
2. The insight→action loop — the #1 complaint across the category is
   "tracking, not optimization" (Peec, Otterly, Rankscale all criticized for
   this; Athena/Goodie are the only ones that crossed over, and it justified
   their pricing premium)
3. AI-crawler / agent analytics (which bots hit which pages — emerging,
   "crawl-to-refer ratio" as new KPI)
4. Measurement credibility — only 1 of 8 tools surveyed publishes sample size
   / confidence intervals; this is an open trust problem in trade press
   (Digiday, 2026) and in academic literature (arXiv 2603.08924: ~5-7pp CI
   width on citation share, single-shot scores are largely noise)

## 4. UX patterns that win

**Praised:**
- Single home metric (visibility %) + competitor SoV ranking table, with
  prompt-level drilldown and a citation/source explorer as a second layer
  (Peec's pattern)
- Seeing the actual AI answer with full chat context next to each mention
- Onboarding < 1 hour with auto-suggested prompts/competitors + a free
  instant scan as the acquisition hook
- Email digests / Slack alerts in plain language (Otterly)
- Prioritized, specific recommendations, not raw data dumps (Athena's Action
  Center)

**Hated:**
- Unexplained week-to-week score volatility (Rankscale: 10-15% swings with no
  site changes — destroys trust)
- Data-heavy dashboards requiring a dedicated analyst (Profound)
- Nickel-and-diming engine coverage (Otterly hides Gemini/AI Mode behind
  add-ons)
- Slow refresh after editing prompts (hours/days)
- Gating the entire action layer behind enterprise pricing while charging
  mid-market prices (documented churn driver for Athena)
- Sentiment over-sensitivity / entity confusion (Semrush confused "Later" the
  company with "later" the adverb)

## 5. Market gaps a new entrant can exploit

- **Gap A — Honest mid-market action loop.** Deliver prioritized
  recommendations (Impact/Effort/Confidence) without enterprise gating.
- **Gap B — Visible measurement credibility.** Show sample size, disclose
  "this is via Gemini API, not the live UI", and (once temporal comparison
  exists) confidence intervals. Almost nobody occupies this; it aligns
  directly with our "no fake progress" principle.
- **Gap C — Clean UX with depth on demand.** The market is polarized between
  simple-but-shallow (Peec/Otterly) and deep-but-overwhelming
  (Profound/Rankscale). Nobody owns "readable headline, progressive
  disclosure into depth."

## 6. Where GEO Studio stands (June 2026)

| Capability | Market | GEO Studio | Status |
|---|---|---|---|
| Multi-LLM | Table stakes (8+ engines) | Gemini only | Biggest parity gap — but OpenAI/Perplexity runtimes are Forbidden without a dedicated phase |
| Auto-suggested onboarding | Peec's differentiator | Have it (wizard + Gemini) | Advantage to polish |
| Visibility % + competitor SoV headline | Table stakes | **Already built** in Overview (gauge, composition, SoV table) | Close to Gap C pattern already |
| Action loop (Gap A) | Open gap | **Already built** — "Qué hacer primero" with Impact/Effort/Confidence | Ahead of most mid-market tools on this axis |
| Measurement credibility (Gap B) | Open gap | "Confianza" metric exists but methodology not disclosed in UI | Cheap, high-leverage, unclaimed |
| Agent/crawler analytics | Emerging differentiator | Not started | H3 |
| Async/scheduled scans | Expected for "monitoring" | Gated, planned (ASYNC-SCAN-1) | Needed for monitoring credibility |

**Bottom line:** GEO Studio's H1/H2 work has, often unknowingly, already built
toward Gap A and Gap C. The cheapest unclaimed differentiator is Gap B
(methodology/credibility transparency) — pure UX/copy, no backend changes.
This should not distract from the standing P0 (stuck-scan blocker) and the
ASYNC-SCAN-1 phase, both of which are prerequisites for "monitoring" claims to
be credible at all.
