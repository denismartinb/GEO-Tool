/**
 * Anti-hallucination guard for Slice 2's LLM-rewrite layer
 * (lib/recommendations/rewrite-recommendation.ts). Gemini is instructed in the
 * prompt to use only the given facts, but a prompt instruction is not a safety
 * boundary by itself — this is the server-side check that actually enforces
 * it before a rewrite is ever persisted or shown to the user.
 *
 * Two closed-set checks, both fail-closed (reject on any doubt):
 * - Competitors: rejects if the rewritten text names ANY competitor from the
 *   project's full tracked roster (`project_competitors`) that isn't part of
 *   THIS recommendation's already-anchored allowlist. This catches Gemini
 *   swapping in a real-but-wrong-for-this-card competitor, not just a fully
 *   invented one.
 * - Domains: rejects if the rewritten text contains a domain-like token
 *   (matched against a common-TLD list to avoid false positives on
 *   abbreviations like "p.ej.") that isn't the brand's own domain or one of
 *   this recommendation's already-anchored citation domains.
 *
 * Deliberately not exhaustive (no full NLP/entity-recognition) — a pragmatic
 * safety net consistent with CLAUDE.md's "no fake recommendations" given a
 * closed, known competitor roster and a closed, known domain list. Pure logic,
 * no I/O — importable from Vitest with no server-only shim needed.
 */

const COMMON_TLDS = new Set([
  "com", "es", "org", "net", "io", "co", "info", "app", "ai", "biz", "shop",
  "store", "dev", "mx", "fr", "de", "it", "uk", "eu", "cat", "pt", "nl", "be",
  "ar", "cl", "pe", "us", "ca", "br", "gov", "edu", "me", "tv", "online"
]);

const DOMAIN_TOKEN_PATTERN = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/gi;

// Structured-data vocabulary domains that legitimately appear in any JSON-LD
// example (e.g. `"@context": "https://schema.org"`). They are not citation or
// competitor domains, so they must never trip the anti-fabrication guard.
const ALWAYS_ALLOWED_DOMAINS = ["schema.org", "www.w3.org"];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeDomain(value: string): string {
  return normalize(value)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function looksLikeDomain(token: string): boolean {
  const parts = normalizeDomain(token).split(".");
  if (parts.length < 2) return false;
  return COMMON_TLDS.has(parts[parts.length - 1]);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionsTerm(normalizedText: string, normalizedTerm: string): boolean {
  if (!normalizedTerm) return false;
  const pattern = new RegExp(`(?:^|[^a-z0-9áéíóúñ])${escapeRegExp(normalizedTerm)}(?:[^a-z0-9áéíóúñ]|$)`, "i");
  return pattern.test(normalizedText);
}

export type RewriteValidationInput = {
  title: string;
  description: string;
  /** Competitor names already anchored to THIS recommendation's evidence (mentioned_competitors + dominant_competitor, if any). */
  allowedCompetitors: string[];
  /** Domains already anchored to THIS recommendation's evidence (citation_domains). */
  allowedDomains: string[];
  /** The project's FULL tracked-competitor roster — used to catch a swap to a real-but-unanchored competitor, not just a fully invented name. */
  trackedCompetitors: string[];
  brandDomain: string;
  /**
   * El texto generado troceado por piezas (título, resumen, cada paso, cada
   * ejemplo). La comprobación de comparación es por frase, y un paso sin punto
   * final se pegaría al siguiente si sólo recibiéramos el texto unido — lo que
   * inventaría frases que nadie escribió. Opcional: sin él, la guarda cae a
   * `[title, description]`, que es el comportamiento de los llamadores viejos.
   */
  segments?: string[];
};

export type RewriteValidationResult =
  | { valid: true }
  | { valid: false; reason: "untracked_competitor_mentioned" | "unanchored_domain_mentioned" | "comparative_claim_against_competitor" };

/**
 * Léxico de **juicio de valor comparativo** (RECS-USEFULNESS-1 Fase C, log §128).
 *
 * **Por qué existe.** El 2026-08-21 el fundador generó una propuesta real para
 * el proyecto Movistar y el artefacto salió sintácticamente impecable —la Fase A
 * hizo su trabajo— con esta frase dentro, lista para pegar en la web del
 * cliente:
 *
 * > «A diferencia de operadores como Jazztel, Vodafone España, MásMóvil,
 * > Orange España o Digi, Movistar mantiene un alto estándar de calidad y
 * > cobertura»
 *
 * Publicidad comparativa contra cinco competidores nombrados, sin un solo dato
 * que la sostenga. En España la comparación tiene que ser objetiva y
 * verificable sobre características esenciales (art. 10 de la Ley de
 * Competencia Desleal), así que eso no es contenido flojo: es una reclamación
 * esperando a ocurrir, y se la damos al cliente con un botón de copiar.
 *
 * **Qué se prohíbe y qué NO.** Nombrar a un competidor sigue permitido —lo
 * gobierna la lista cerrada de `allowedCompetitors`, y media plataforma se basa
 * en ello: «Compara tu página con la de Digi», una tabla comparativa, «Digi
 * aparece antes que tú». Lo que se prohíbe es el **juicio de valor** en la
 * misma frase que el nombre. La comparación neutra y verificable sobrevive
 * entera; la que dice quién es mejor, no.
 *
 * **Límite declarado, porque esto no es un conjunto cerrado.** Las otras dos
 * guardas de este fichero comparan contra listas (competidores, dominios) y por
 * eso son exactas. «Juicio de valor» no lo es: este léxico es finito y está en
 * castellano, así que un superlativo escrito de otra forma —o en otro idioma,
 * y `projects.language` admite más de uno— pasa. Es una red, no una garantía,
 * y la regla blanda del prompt es lo que cubre el resto (log §128).
 */
const COMPARATIVE_JUDGEMENT_MARKERS = [
  "superior",
  "superiores",
  "supera",
  "superan",
  "aventaja",
  "mejor",
  "mejores",
  "peor",
  "peores",
  "lider",
  "líder",
  "insuperable",
  "inigualable",
  "imbatible",
  "optimo",
  "óptimo",
  "por encima de",
  "alto estandar",
  "alto estándar",
  "mayor calidad",
  "mas fiable",
  "más fiable",
  "mas robusto",
  "más robusto",
  "mas completo",
  "más completo",
  "ventaja frente",
  "ventaja sobre",
  "valor anadido",
  "valor añadido"
] as const;

/**
 * Trocea en frases para que el juicio y el nombre tengan que convivir en la
 * misma. Sin esto, un plan que nombra a un competidor en el paso 2 y usa la
 * palabra "mejor" en el paso 5 se rechazaría entero — y esos planes son
 * legítimos.
 */
function toSentences(segment: string): string[] {
  return segment
    .split(/[.!?\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function validateRewriteAgainstEvidence(input: RewriteValidationInput): RewriteValidationResult {
  const rawText = `${input.title} ${input.description}`;
  const normalizedText = normalize(rawText);
  const allowedCompetitors = new Set(input.allowedCompetitors.map(normalize).filter(Boolean));

  for (const competitor of input.trackedCompetitors) {
    const normalizedCompetitor = normalize(competitor);
    if (!normalizedCompetitor || allowedCompetitors.has(normalizedCompetitor)) continue;
    if (mentionsTerm(normalizedText, normalizedCompetitor)) {
      return { valid: false, reason: "untracked_competitor_mentioned" };
    }
  }

  const allowedDomains = new Set(
    [...input.allowedDomains, input.brandDomain, ...ALWAYS_ALLOWED_DOMAINS].map(normalizeDomain).filter(Boolean)
  );
  const domainMatches = rawText.match(DOMAIN_TOKEN_PATTERN) ?? [];
  for (const match of domainMatches) {
    if (!looksLikeDomain(match)) continue;
    if (!allowedDomains.has(normalizeDomain(match))) {
      return { valid: false, reason: "unanchored_domain_mentioned" };
    }
  }

  const segments = input.segments?.length ? input.segments : [input.title, input.description];
  const competitorNames = [...new Set([...input.allowedCompetitors, ...input.trackedCompetitors])]
    .map(normalize)
    .filter(Boolean);

  for (const segment of segments) {
    for (const sentence of toSentences(segment)) {
      const normalizedSentence = normalize(sentence);
      const namesCompetitor = competitorNames.some((name) => mentionsTerm(normalizedSentence, name));
      if (!namesCompetitor) continue;
      if (COMPARATIVE_JUDGEMENT_MARKERS.some((marker) => normalizedSentence.includes(marker))) {
        return { valid: false, reason: "comparative_claim_against_competitor" };
      }
    }
  }

  return { valid: true };
}
