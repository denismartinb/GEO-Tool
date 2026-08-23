/**
 * RECS-ACCION-1 — de "consejo" a orden de trabajo.
 *
 * Dos preguntas que una recomendación tiene que poder responder antes de que
 * el usuario decida si la atiende, y que hasta ahora no respondía ninguna:
 *
 *   1. **¿Qué me vas a entregar?** El CTA decía "Generar propuesta con IA"
 *      para los quince tipos por igual, así que no prometía nada concreto —
 *      y el motor SÍ sabe qué artefacto toca en cada caso: sus playbooks por
 *      tipo (`recommendation-rewrite-llm.ts`) llevan meses dirigiendo la
 *      generación hacia una comparativa, una FAQ o un JSON-LD. Aquí se nombra
 *      esa misma decisión en el botón.
 *   2. **¿Depende de mí?** "Escribe a HubSpot para que te mencionen" y
 *      "añade este bloque a tu página de precios" no son la misma clase de
 *      trabajo, y la pantalla las pintaba idénticas. El control es lo que
 *      separa una tarea de una apuesta.
 *
 * Ambas son **derivadas del tipo**, no inventadas por un modelo: mismo patrón
 * que `labelForType`/`categoryForType` en `recommendation-engine.ts`, mapa
 * explícito y degradado seguro para cualquier tipo futuro sin entrada.
 *
 * La tercera pregunta — **¿está listo para pegar?** — no se puede responder
 * por tipo, porque depende del artefacto que salió. Se responde contando
 * (`classifySolutionReadiness`), nunca estimando.
 */

/** Quién decide el resultado del trabajo que propone la recomendación. */
export type DeliverableControl =
  /** Se hace en la web del cliente: depende solo de él. */
  | "own_site"
  /** Depende de que un tercero acepte: no se puede prometer el resultado. */
  | "third_party"
  /** Se resuelve dentro de GenScore, sin publicar nada. */
  | "in_app";

export type DeliverableSpec = {
  /**
   * CTA que nombra el entregable ("Generar comparativa"), no la mecánica
   * ("Generar propuesta con IA").
   */
  cta: string;
  /**
   * `null` para un tipo sin entrada: no se pinta chip. Afirmar "control
   * total" sobre algo que no sabemos clasificar sería peor que no decir nada
   * — misma dirección de fallo que el tri-estado de las sondas de la
   * auditoría (`lib/web-audit/robots.ts`), donde lo no medido nunca se
   * reporta como aprobado.
   */
  control: DeliverableControl | null;
};

/**
 * El entregable de cada tipo. Cada CTA es el nombre del artefacto que el
 * playbook correspondiente de `recommendation-rewrite-llm.ts` ya le pide al
 * modelo — si cambia un playbook, este mapa cambia con él o el botón promete
 * una cosa y llega otra.
 */
const deliverableByType: Record<string, DeliverableSpec> = {
  // --- En tu web: control total ---
  close_competitor_gap: { cta: "Generar comparativa", control: "own_site" },
  add_comparison_content: { cta: "Generar comparativa", control: "own_site" },
  create_faq_section: { cta: "Generar FAQ", control: "own_site" },
  add_citation_block: { cta: "Generar bloque citable", control: "own_site" },
  improve_citation_readiness: { cta: "Generar bloque citable", control: "own_site" },
  strengthen_brand_entity_clarity: { cta: "Generar ficha de marca", control: "own_site" },
  increase_brand_visibility: { cta: "Generar brief de contenido", control: "own_site" },
  increase_brand_prominence: { cta: "Generar entradilla", control: "own_site" },
  address_negative_narrative: { cta: "Generar contranarrativa", control: "own_site" },
  update_stale_content: { cta: "Generar actualización", control: "own_site" },
  amplify_positive_pattern: { cta: "Generar checklist", control: "own_site" },

  // --- Depende de un tercero: el resultado no se promete ---
  pursue_citation_sources: { cta: "Generar plan de contacto", control: "third_party" },
  pursue_comparator_sources: { cta: "Generar plan de alta", control: "third_party" },
  pursue_community_sources: { cta: "Generar respuesta", control: "third_party" },
  pursue_media_sources: { cta: "Generar pitch", control: "third_party" },

  // --- Se resuelve aquí dentro ---
  track_emerging_competitor: { cta: "Generar informe", control: "in_app" }
};

/**
 * Degradado seguro: un tipo nuevo sin entrada conserva el CTA genérico que
 * la pantalla ya usaba y no afirma nada sobre el control, igual que
 * `labelForType` cae al render antiguo en vez de romper.
 */
const FALLBACK_DELIVERABLE: DeliverableSpec = { cta: "Generar propuesta con IA", control: null };

export function deliverableForType(type: string): DeliverableSpec {
  return deliverableByType[type] ?? FALLBACK_DELIVERABLE;
}

export const CONTROL_LABEL: Record<DeliverableControl, string> = {
  own_site: "En tu web",
  third_party: "Depende de terceros",
  in_app: "Aquí en GenScore"
};

/**
 * Cuánto trabajo queda después de generar el artefacto.
 *
 * `needs_data` NO es una estimación: el prompt de reescritura obliga al modelo
 * a marcar con un placeholder (`[tu dato aquí]`) todo valor que no esté en la
 * evidencia, en vez de inventárselo. Esa disciplina —que existe desde el
 * primer día como barrera anti-invención— deja los huecos contables, así que
 * la etiqueta se calcula sobre el texto real que se le va a enseñar al
 * usuario. Si algún día el prompt deja de exigir placeholders, esta cuenta
 * deja de significar nada y hay que rehacerla.
 */
export type SolutionReadiness =
  | { kind: "ready" }
  | { kind: "needs_data"; blanks: number };

/**
 * Un placeholder es un `[...]` corto, sin comillas ni llaves y con alguna
 * letra. Las tres exclusiones son el motivo de que esto sea un regex y no un
 * `includes("[")`: los artefactos JSON-LD llevan arrays (`"sameAs": ["..."]`,
 * `[{ "@type": ... }]`) y contarlos como datos que faltan convertiría la
 * etiqueta en ruido justo en el tipo de artefacto más pegable que generamos.
 */
const PLACEHOLDER_PATTERN = /\[[^[\]{}"\n]{2,60}\]/g;

function countBlanks(text: string): number {
  const matches = text.match(PLACEHOLDER_PATTERN);
  if (!matches) return 0;
  // Exige al menos una letra: descarta `[1,2]`, `[0]` y demás arrays numéricos.
  return matches.filter((m) => /\p{L}/u.test(m)).length;
}

/**
 * Cuenta los huecos de TODO lo que el usuario va a copiar: los artefactos y
 * también los pasos, porque un paso del tipo "publica el precio [tu dato
 * aquí]" es exactamente el mismo dato pendiente. `title`/`summary` quedan
 * fuera a propósito: son la explicación, no el entregable.
 */
export function classifySolutionReadiness(solution: {
  steps: string[];
  examples: { content: string }[];
}): SolutionReadiness {
  const blanks =
    solution.examples.reduce((sum, ex) => sum + countBlanks(ex.content), 0) +
    solution.steps.reduce((sum, step) => sum + countBlanks(step), 0);
  return blanks === 0 ? { kind: "ready" } : { kind: "needs_data", blanks };
}

/**
 * Etiqueta que acompaña a la cifra de puntos (RECS-ACCION-1c).
 *
 * El contrafactual de ADR 0017 es un techo honesto —"hasta +X"— pero para una
 * acción externa ese techo depende de que actúe **otro**: el `+11 pt` de
 * "consigue que cinco webs te mencionen" asume que las cinco te mencionan.
 * Enseñar eso con la misma palabra que "añade un párrafo a tu página" iguala
 * dos promesas que no valen lo mismo. La cifra no cambia; cambia lo que
 * declara.
 */
export function pointsCaption(type: string): string {
  return deliverableForType(type).control === "third_party" ? "si te citan" : "potenciales";
}

/** Copy de la insignia de estado del artefacto generado. */
export function readinessLabel(readiness: SolutionReadiness): string {
  if (readiness.kind === "ready") return "Listo para copiar";
  return readiness.blanks === 1 ? "1 hueco por rellenar" : `${readiness.blanks} huecos por rellenar`;
}
