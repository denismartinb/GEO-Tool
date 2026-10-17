# ADR 0043 — «Visibilidad agéntica»: what the agentic check measures and how it scores

**Date:** 2026-10-17
**Status:** Accepted (weights approved by the founder with the design, 2026-10-17)
**Deciders:** Founder + Director
**Zone:** Comercio agéntico (new), log §317

---

## Context

The founder approved a new product line on agentic commerce: whether an AI
agent can find a store, understand its products, trust it and get to the
payment. Fase 0 is the engine (`lib/agentic-audit/`), Fase 1 the public
landing with a free check. The console (Fase 2) needs a migration and its own
approval.

Two limits shaped what the engine can honestly claim:

1. **We cannot see what a real agent sees from an anti-bot service.**
   Cloudflare, Akamai and DataDome verify ChatGPT, Claude or Perplexity by IP
   range or request signature. A request that only copies their user-agent
   string gets a different answer from the one the real agent gets. So we
   never spoof: we ask as GenScore's identified bot and report what that
   measures, «your site puts a challenge in front of automated visits».
   Per-assistant access is read from robots.txt only.
2. **We cannot walk the checkout.** Whether checkout forces registration or
   shows a captcha would need following links into the cart, which is a
   crawler (forbidden without approval, `CLAUDE.md`). Compra in v1 measures
   only what the product page itself shows.

## Decision

The score is four weighted components, each made of checks worth 100 points
inside the component:

| Component | Weight | Checks (points) |
|---|---|---|
| Descubrimiento | 30 | robots.txt lets the assistants in (45), no challenge to automated visits (40), sitemap (15) |
| Comprensión | 30 | Product + Offer structured data (30), price and currency as data (20), availability (15), GTIN (15), text readable without JavaScript (20) |
| Confianza | 20 | return policy (30), shipping (25), reviews (20), who is behind the store (25) |
| Compra | 20 | add to cart in the HTML (40), no captcha on the page (30), quick payment (15), known platform (15) |

- pass earns all of a check's points, avg half, fail none.
- `unknown` (we could not measure) is left out of both sides, so our own
  blocked request never reads as the store's fault.
- A component with nothing measurable leaves the total; the total is the
  weighted mean of the rest.
- The total exists only for a product page we could read. A home page is
  not failing Comprensión or Compra by having no product.
- **Interoperabilidad** (UCP profile, MCP, A2A agent card, product feed) is
  shown as «N de 4» and stays out of the total. Agent commerce by protocol is
  not live in Spain; weighting it now would mostly punish stores for not
  publishing something no Spanish buyer can use yet. It gets a weight when
  the founder decides. The product never calls it «sin puntos».
- A feed sent privately to Google or OpenAI cannot be seen from outside, so
  the feed is `unknown` unless the platform exposes a public catalogue
  (Shopify `/products.json`, WooCommerce Store API).

What the check requests is a fixed list, all on the store's own domain: the
page given, robots.txt, sitemap.xml, four `/.well-known/` files and, on
Shopify or WooCommerce, one catalogue URL. No link is followed. Every request
goes through the web audit's SSRF guard (imported).

## Consequences

- The free check costs no LLM. It is rate limited in `public_checks` with
  its own counters (`engine = 'agentic'`) so it cannot eat the ChatGPT
  checker's quota, and without a migration.
- Some stores that let real agents in will show a challenge to our bot
  (an allow-list for verified agents). The copy says what we measured, not
  that ChatGPT is blocked.
- Changing any weight moves every result. It needs a founder decision and an
  addendum here, like the GEO Score (ADR 0033).

## Addendum: Fase 2a, the console review (2026-10-17, log §322)

- The console runs the same engine on one product page the customer saves.
  The page must be on the project's domain or a subdomain
  (`isSameOrSubdomain`), so the fixed-URL list stays on a domain the
  customer owns.
- Each review is a row of `agentic_audits` (migration 0043), written
  `pending` before any request leaves and updated to `completed` or
  `failed`. Reads go through RLS (owner only); writes only through the
  server action with the service role, after ownership is checked with the
  user's client.
- Limit: 5 reviews per project per 24 h, counted from those rows, failing
  closed if the count cannot be read.
- Plan: Pro, Agencia and the Pro trial, read with `resolveSystemPlanId`.
- The projected score («subes a N») is the engine's own arithmetic with the
  chosen checks set to pass (`scoreIfChecksPass`). Weights are unchanged.
