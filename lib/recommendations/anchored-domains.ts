/**
 * The closed set of domains ONE recommendation's own evidence anchors.
 *
 * Two things must read the same set or the AI rewrite is broken by
 * construction: the prompt ("Domains you may mention") and the anti-fabrication
 * guard that re-checks the answer (`rewrite-validation.ts`). They didn't.
 * The prompt offered `citation_domains` as the allowlist AND, for the
 * source-gap rules, a separate `citation_pages` list it explicitly asked the
 * model to name a page from — while the guard only ever admitted
 * `citation_domains`. Those two are built by different code paths
 * (`recommendation-engine.ts`: an 8-item aggregate over the affected prompts
 * vs. the qualifying citation sources), so a page domain outside the first
 * eight is routine, not exotic: on the founder's own GenScore card three of
 * four cited pages (dageno.ai, blog.hubspot.es, es.semrush.com) fell outside
 * it, so every "Generar propuesta con IA" click on that card obeyed the prompt
 * and was then rejected by the guard as `unanchored_domain_mentioned` — a
 * deterministic failure that spent a Gemini call and a slot of the daily
 * generation budget each time.
 *
 * Nothing here widens what "anchored" means: every domain returned comes from
 * the recommendation's own persisted `evidence_json`. It is bounded by
 * construction (citation_domains ≤ 8, sources ≤ 6, so ≤ ~26 entries) and
 * deliberately has NO cap of its own — a cap is exactly what produced the
 * mismatch in the first place.
 *
 * Pure logic, no I/O — importable from Vitest with no server-only shim.
 */

export type AnchoredDomainEvidence = {
  /** Aggregate of cited domains across the affected prompts (capped upstream). */
  citation_domains?: string[];
  /** Source-gap rules only: the third-party domains the card is about. */
  source_domains?: string[];
  /** Source-gap rules only: the specific already-cited pages the prompt names. */
  citation_pages?: { domain?: string; url?: string }[];
};

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function hostOf(url: string): string {
  try {
    return normalizeDomain(new URL(url.trim()).hostname);
  } catch {
    // Not a parseable absolute URL — the page's own `domain` field already
    // covers this entry, so there is nothing to recover here.
    return "";
  }
}

/**
 * Normalized, de-duplicated, order-preserving. The same array is handed to the
 * prompt and to the guard, so what the model is allowed to write and what it is
 * judged against can no longer drift apart.
 */
export function collectAnchoredDomains(evidence: AnchoredDomainEvidence): string[] {
  const pages = evidence.citation_pages ?? [];
  const candidates = [
    ...(evidence.citation_domains ?? []),
    ...(evidence.source_domains ?? []),
    ...pages.map((page) => page.domain ?? ""),
    ...pages.map((page) => (page.url ? hostOf(page.url) : ""))
  ];

  const seen = new Set<string>();
  const anchored: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const domain = normalizeDomain(candidate);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    anchored.push(domain);
  }
  return anchored;
}

/**
 * Dominios de segundo nivel que no son la marca (`example.co.uk`), para no
 * quedarse con "co" como etiqueta de marca.
 */
const SECOND_LEVEL_LABELS = new Set(["co", "com", "org", "net", "gov", "edu", "ac"]);

/** La etiqueta que lleva la marca: `blog.hubspot.es` → "hubspot", `delve.ai` → "delve". */
function brandLabel(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length < 2) return "";
  let index = parts.length - 2;
  if (index > 0 && SECOND_LEVEL_LABELS.has(parts[index])) index -= 1;
  return parts[index] ?? "";
}

/** Forma comparable de un nombre o una etiqueta: sin acentos, sin espacios, sin signos. */
function compact(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Los competidores de la lista del proyecto que ESTA tarjeta ya ancla por su
 * dominio — «SE Ranking» cuando `seranking.com` está entre los dominios
 * anclados, «Semrush» cuando lo está `es.semrush.com`.
 *
 * Existe por el mismo choque que `collectAnchoredDomains`, un campo más allá.
 * El playbook de las reglas de hueco de fuentes le pide al modelo que clasifique
 * cada dominio y diga su jugada, e **incluso que marque los que son
 * competidores de la marca como «no es un objetivo de outreach»** — lo cual
 * exige nombrarlos. El guardián, en cambio, rechaza cualquier competidor de la
 * lista del proyecto que no esté en `mentioned_competitors`, que en estas
 * tarjetas viene vacío. Con `seranking.com` en la evidencia y «SE Ranking» en
 * la lista de competidores del proyecto, la propuesta se descartaba por hacer
 * exactamente lo que se le pedía (log §124).
 *
 * No afloja el guardián: sólo se admite un competidor cuyo **propio dominio**
 * está ya en la evidencia de esta tarjeta, y el emparejado es por igualdad
 * exacta de etiqueta, así que `evilacme.com` no habilita «Acme» (ADR 0019).
 */
export function competitorsAnchoredByDomain(trackedCompetitors: string[], anchoredDomains: string[]): string[] {
  const keys = new Set<string>();
  for (const domain of anchoredDomains) {
    const label = compact(brandLabel(domain));
    if (label) keys.add(label);
    // `delve.ai` → "delveai", que es como se escribe «Delve AI» en la lista de
    // competidores. Sin esto, un competidor cuyo nombre incluye el TLD se
    // quedaría fuera de su propio dominio.
    const whole = compact(domain);
    if (whole) keys.add(whole);
  }
  return trackedCompetitors.filter((name) => {
    const key = compact(name);
    return key.length > 0 && keys.has(key);
  });
}
