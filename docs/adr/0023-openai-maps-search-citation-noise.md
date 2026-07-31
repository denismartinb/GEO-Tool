# ADR 0023 — OpenAI Google Maps/Search citations are not real citations

**Status:** Accepted
**Date:** 2026-07-31
**Deciders:** Founder (reported live) + Director

---

## Context

Founder reviewed a real ChatGPT response (project "Alberdiderma", a dermatology
clinic) and flagged that the citation URLs looked "wrong" or "malformed":

```
[Alberdiderma](https://www.google.com/maps/search/Alberdiderma%2C+Madrid%2C+Espa%C3%B1a?utm_source=openai)
```

Every clinic OpenAI's `web_search` tool listed in that response — including
the project's own brand — was cited with a `google.com/maps/search/...` URL
instead of the clinic's real website. This is a known behavior of that tool
for local-business queries: when it doesn't resolve (or doesn't bother
resolving) a direct business URL, it falls back to a Google Maps search link
for the business name as the citation.

`lib/llm/openai.ts`'s own doc comment asserted `url_citation.url` is "already
the real destination page" — true in general, but false for this case. Since
`buildGroundedCitations` (`lib/scan/extraction.ts`) treats OpenAI's grounding
URLs as final (`groundingUrlsAreFinal: true`, no redirect resolution), a Maps
search link's domain resolves straight to `google.com` with `confidence:
"high"` — a fabricated-looking but technically well-formed citation.

**This was NOT a brand-new class of problem.** `lib/citations/aggregate-citations.ts`
already has a near-identical fix for the equivalent *inline*-citation case
(`resolveCitation`, founder review 2026-07-19): a Google Maps/Search URL the
model writes inline next to a business-name mention is excluded as noise,
never a real citation. That fix, however, only covers the heuristic inline
path — its own comment explicitly assumes "grounding citations ... are
handled above and never reach this branch" (i.e. assumed to always be
genuine). That assumption held for Gemini (whose grounding chunks are
`vertexaisearch.cloud.google.com` redirects, resolved to their real
destination by `resolveGroundingRedirects` — never a bare Maps link) but not
for OpenAI's `url_citation`, which can BE the Maps link directly, with no
resolution step to catch it.

## Decision

Filter Google Maps/Search noise **at the source**, in
`generateOpenAIVisibilityAnswer` (`lib/llm/openai.ts`), before a `url_citation`
annotation ever becomes a `groundingChunk`. New `isGoogleMapsSearchNoise(url)`:
true when the hostname is `google.com` (or `www.google.com`) AND the path is
either `/maps/search/...` or exactly `/search` (a plain Google results page).
Matching chunks are dropped entirely — they never reach `citations_count`,
`citation_found`, the Citations page, or "Fuentes usadas" in the prompt
drawer.

Deliberately **narrower** than "any google.com grounding citation is noise":
`aggregate-citations.ts` already has an explicit, tested case (`resolveCitation`)
where a genuine grounding citation whose real content happens to be hosted on
google.com (e.g. a Google Shopping listing) is kept, not filtered. Only the
Maps-search/plain-search URL *shapes* are excluded — a citation with a
different `google.com` path is untouched.

### Why filter at the source, not downstream

Filtering in `lib/llm/openai.ts` (where the chunk is created) rather than in
`extraction.ts` or `aggregate-citations.ts` means every downstream
consumer — `citations_count`, `citation_found`, `citation_score_any_domain`/
`citation_score_blended` (comparison-only fields), the Citations page, and
the prompt drawer's "Fuentes usadas" — is protected automatically, with no
new special-casing needed anywhere else. `citation_score` (the official ADR
0013 metric, own-domain only) was never affected either way, since
`google.com` never matches a project's own domain.

### Accompanying UI fix (same report, different root cause)

The founder separately flagged that a *genuine, verified* mention's evidence
quote ("Especialistas en dermatología médica y estética...") doesn't itself
name the brand — read in isolation, nothing in the sentence says
"Alberdiderma". This is not a data-fabrication bug (MENTION-VERIFY-1's
verification already confirmed this specific quote is real and belongs to
the brand) — it is a UI clarity gap. Fixed by labeling the section with the
project's own brand name (`components/prompts/prompt-drawer.tsx`:
"Evidencias de mención de {projectBrand}") instead of leaving it unlabeled —
a one-line JSX change, no extraction/prompt changes, since the panel was
already unambiguously about the project's own brand (`ext?.brand?.evidence`),
just not visibly labeled as such.

## Consequences

**Positive.** OpenAI-sourced `citations_count`/`citation_found` (and the
comparison-only `citation_score_any_domain`/`citation_score_blended` fields)
can no longer be inflated by Maps-search fallback links that were never real
cited content. The Citations page and prompt drawer stop showing
"google.com" as a source for local-business queries where the model didn't
actually find/cite a real page.

**No historical fix.** Existing persisted `scan_prompt_results` rows keep
whatever citations were extracted before this fix, including any Maps-search
noise already counted. No backfill in this phase.

**Accepted risk.** The URL-shape filter is a heuristic (hostname + path
pattern), not a semantic understanding of "is this a real citation." A
future Maps URL shape not covered here (e.g. a shortened/redirected variant)
could still slip through; this is the same class of residual risk the
inline-citation fix already accepted for the equivalent case.

---

## Follow-up — the same URL, a third and unrelated root cause (2026-07-31)

After this filter shipped, the founder still saw the full
`google.com/maps/search/...` URL in the prompt drawer's **"Respuestas"** tab
and reported the fix as ineffective. It was neither a miss in this filter
nor in MENTION-VERIFY-1.

**The scope of this ADR is citation *counting*, not transcript *display*.**
The filter decides which URLs become citations — feeding `citations_count`,
`citation_found`, the Citations page and "Fuentes usadas". The "Respuestas"
tab shows the model's raw answer, which must always be rendered verbatim:
no citation filter can (or should) alter it. The two surfaces were being
conflated because the same URL appears on both.

The display bug was in the markdown-lite renderer. OpenAI wraps long
citation URLs onto their own line:

```
[Clínica Dermatológica Madrid De Felipe]
(https://www.google.com/maps/search/...?utm_source=openai)
```

`tokenizeInline`'s link regex required `]` and `(` to be adjacent, so this
never tokenized as a link and the entire construct fell through to plain
text — raw brackets and full URL, exactly what the founder was reporting.
Replaying the founder's verbatim response through the parser: **0 links
detected before, 2 after.**

Fixed by tolerating whitespace between `]` and `(`, letting `renderInline`
accept multi-line input (so a construct spanning a line boundary is not
severed before parsing), and extracting the parser to
`lib/markdown/inline-markdown.ts` with unit tests. The logic previously
lived inline in `components/prompts/prompt-drawer.tsx` with no test
coverage at all, which is the reason the bug shipped unnoticed; the
founder's verbatim answer is now a regression fixture. See
`docs/director-strategy.md` → MARKDOWN-RENDER-1.

**A second cause in the same renderer — nesting.** With the above deployed
the URLs were still raw, and the screenshot said why: the leaked `[label]`
and `(url)` were rendered **in bold**. OpenAI wraps these cited listings as
`**[label](url)**`, and the tokenizer was flat — regex alternation takes the
leftmost match, so the bold run (two characters earlier) swallowed the whole
link and emitted it as literal text inside a `<strong>`. `tokenizeInline` is
now recursive: bold, italic and link labels hold child tokens, the renderer
recurses to match, and a depth cap guards against pathological input. A
`visibleText()` helper makes the real invariant — *no raw URL ever reaches
the visible transcript* — directly assertable in tests.

**Lessons worth keeping:**
1. When a user reports "the same problem again" after a fix, verify which
   surface they are looking at before assuming the fix missed a case. Three
   distinct root causes (fabricated evidence, citation counting, transcript
   rendering) presented as one identical-looking symptom.
2. Reproduce rendering bugs from the persisted `raw_response`, not from a
   hand-typed approximation of the screenshot. The reconstruction used for
   the first fix omitted the bold wrapper, which confirmed a genuine bug
   while hiding the dominant one and cost an extra round trip.
3. Assert on what the reader sees, not on whether one construct parsed.
   "0 links before, 2 after" looked conclusive and still shipped a broken
   screen; "the visible text contains no `google.com`" would not have.
