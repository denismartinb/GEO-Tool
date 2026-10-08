/**
 * ONBOARDING-PROPOSALS-1 Fase 2 (log §237) — clasificación ESTIMADA de un
 * prompt propuesto: intención (informativa / comercial / local) y si nombra la
 * marca.
 *
 * Es una heurística de palabras clave, no un modelo ni un dato. Se calcula al
 * pintar, no se persiste y la pantalla la etiqueta «estimado». Tampoco dice
 * nada de demanda: un prompt propuesto no es una búsqueda real y no hay
 * volumen medido que pueda acompañarlo.
 */

export type PromptIntent = "informational" | "commercial" | "local";

export type PromptClassification = {
  intent: PromptIntent;
  /** El prompt nombra la marca (o un alias) como palabra completa. */
  branded: boolean;
};

export const INTENT_LABEL: Record<PromptIntent, string> = {
  informational: "Informativa",
  commercial: "Comercial",
  local: "Local"
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * «Local» = una zona concreta (ciudad, «cerca de mí», a domicilio). Un PAÍS no
 * cuenta: es el mercado del proyecto, no una localidad, y marcaría como local
 * casi toda pregunta de un negocio que opera en un solo país.
 */
const LOCAL_PATTERNS = [
  /\bcerca de (mi|aqui|ti)\b/,
  /\bnear me\b/,
  /\ben mi (zona|ciudad|barrio|pueblo)\b/,
  /\ba domicilio\b/,
  /\bmas cercan[oa]s?\b/,
  /\ben (madrid|barcelona|valencia|sevilla|bilbao|malaga|zaragoza|ciudad de mexico|buenos aires|bogota|santiago|lima)\b/
];

const COMMERCIAL_PATTERNS = [
  /\b(precio|precios|coste|costes|cuanto cuesta|cuanto vale|tarifas?|presupuesto|oferta|ofertas|barato|barata|gratis)\b/,
  /\b(comprar|contratar|alquilar|suscripcion|planes?)\b/,
  /\b(mejor|mejores|top|ranking|recomendad[oa]s?|recomiendas?)\b/,
  /\b(alternativas?|comparar|comparativa|versus|vs)\b/,
  /\b(opiniones|resenas|valoraciones)\b/,
  /\b(best|cheap|price|pricing|buy|review|reviews|alternatives?|compare)\b/
];

/**
 * ¿Aparece `name` como secuencia de palabras completas dentro del prompt?
 * Con límites de palabra sobre el texto normalizado: «Zara» no cuenta en
 * «Zaragoza», y no se quitan espacios para que un nombre pegado case con otro
 * partido.
 */
function containsWholeName(normalizedText: string, name: string): boolean {
  const key = normalize(name);
  if (key.length < 3) return false;
  return ` ${normalizedText} `.includes(` ${key} `);
}

export function classifyPrompt(
  text: string,
  identity: { brand: string; aliases?: readonly string[] }
): PromptClassification {
  const normalized = normalize(text);
  const names = [identity.brand, ...(identity.aliases ?? [])];
  const branded = normalized.length > 0 && names.some((name) => containsWholeName(normalized, name));

  let intent: PromptIntent = "informational";
  if (LOCAL_PATTERNS.some((pattern) => pattern.test(normalized))) intent = "local";
  else if (COMMERCIAL_PATTERNS.some((pattern) => pattern.test(normalized))) intent = "commercial";

  return { intent, branded };
}

export type PromptMixSummary = {
  total: number;
  informational: number;
  commercial: number;
  local: number;
  branded: number;
};

export function summarizePromptMix(
  texts: readonly string[],
  identity: { brand: string; aliases?: readonly string[] }
): PromptMixSummary {
  const summary: PromptMixSummary = { total: 0, informational: 0, commercial: 0, local: 0, branded: 0 };
  for (const text of texts) {
    if (!text.trim()) continue;
    const { intent, branded } = classifyPrompt(text, identity);
    summary.total += 1;
    summary[intent] += 1;
    if (branded) summary.branded += 1;
  }
  return summary;
}
