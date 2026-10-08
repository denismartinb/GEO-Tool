/**
 * ONBOARDING-PROPOSALS-1 (log §237) — qué fuente respalda a cada competidor
 * propuesto.
 *
 * La sugerencia de competidores usa Google Search (`google_search`), y Gemini
 * devuelve las páginas que consultó en `groundingChunks`, UNA lista para toda
 * la respuesta, no una por rival. Atribuir cualquiera de ellas a un competidor
 * concreto sería inventar una relación. La única atribución defendible es la
 * literal: el competidor tiene fuente cuando alguna de las fuentes consultadas
 * ES su propio sitio (el `title` de un chunk es el dominio de la página). Si no,
 * queda «no verificado». No se lee ninguna web por nuestra cuenta (sin crawler).
 */

export type GroundedSource = { uri: string; title?: string };

function hostOf(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");
}

/** `blog.otterly.ai` respalda a `otterly.ai`; `nototterly.ai` no. */
function isSameOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function sourceForDomain(domain: string, sources: readonly GroundedSource[]): GroundedSource | null {
  const target = hostOf(domain);
  if (!target || !target.includes(".")) return null;
  for (const source of sources) {
    const titleHost = source.title ? hostOf(source.title) : "";
    if (titleHost && isSameOrSubdomain(titleHost, target)) return source;
  }
  return null;
}
