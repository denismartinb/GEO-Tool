/**
 * GEO-SELF-1 Fase 2 — fuentes fechadas de las comparativas.
 *
 * Hasta esta fase las comparativas guardaban la fecha de consulta y una nota
 * en un comentario, sin URL: el lector no podía comprobar nada y la siguiente
 * sesión no sabía de dónde salía cada cifra. Las dos comparativas de esta fase
 * (`profound-vs-peec-ai-vs-otterly`, `alternativas-a-peec-ai`) llevan sus
 * fuentes en los datos y las pintan en una sección «Fuentes» al final de la
 * página. Una fuente de terceros (`primary: false`) se publica siempre como
 * orientativa.
 */
export type Source = {
  /** Qué es la fuente, en una línea. Para terceros, también su fecha propia. */
  label: string;
  url: string;
  /** Fecha de consulta, ISO (AAAA-MM-DD). */
  consulted: string;
  /** true si es la web o la documentación del propio fabricante. */
  primary: boolean;
};

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
];

/** "2026-10-09" → "9 de octubre de 2026". */
export function formatIsoDateEs(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${MONTHS_ES[m - 1]} de ${y}`;
}

/** Lista sin duplicados (por URL), en el orden en que aparecen. */
export function uniqueSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}
