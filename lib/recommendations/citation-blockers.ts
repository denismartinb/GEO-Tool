import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport } from "@/lib/web-audit/robots";

/**
 * AUDIT-RECS-JOIN-1 Fase A — lo que impide que te citen, dicho en la pantalla
 * donde se decide qué hacer.
 *
 * La pantalla de Recomendaciones ya sacaba UN bloqueo de la auditoría —los
 * bots rastreadores— con esta justificación escrita en su propio comentario:
 * *«mientras un rastreador de IA esté bloqueado, las acciones de contenido de
 * abajo no pueden rendir en ese motor»*. El razonamiento vale exactamente
 * igual para los otros dos bloqueos duros, y ninguno se enseñaba:
 *
 * - **`noindex`**: la página no puede indexarse, así que no puede citarse.
 * - **`nosnippet` / `max-snippet:0`** (AUDIT-SNIPPET-1, log §131): el motor
 *   puede rastrearla e indexarla pero tiene prohibido reproducir un fragmento.
 *   Sin fragmento no hay cita.
 *
 * Esto **no rompe el reparto de zonas** («La Auditoría arregla tu web;
 * Recomendaciones consigue que te citen»). No duplica el catálogo de la
 * auditoría ni lo convierte en recomendaciones: señala los tres hechos que
 * hacen imposible el objetivo de esta pantalla y manda a arreglarlos donde se
 * arreglan. Es la excepción que ya existía, aplicada entera en vez de a un
 * tercio.
 *
 * Y es lo primero que nombra **una URL concreta del cliente**: hasta ahora
 * ninguna recomendación decía «edita esta página tuya», sólo «publica algo
 * sobre esta consulta».
 */

export type CitationBlocker =
  | { kind: "bots"; agents: string[] }
  | { kind: "noindex"; urls: string[] }
  | { kind: "snippet"; urls: string[] };

/**
 * Sólo se reportan bloqueos **medidos**. Un campo ausente en una instantánea
 * anterior a la fase que lo introdujo es «nunca medido», no «limpio»: se
 * excluye, igual que hace `issues.ts` con `isMeasured`. Aquí sale gratis
 * porque este módulo únicamente afirma problemas — nunca declara que algo
 * esté bien.
 */
export function findCitationBlockers(input: {
  bots: BotAccessReport | null;
  pages: PageAuditEntry[] | null;
}): CitationBlocker[] {
  const blockers: CitationBlocker[] = [];

  const agents = (input.bots?.bots ?? []).filter((b) => !b.allowed).map((b) => b.agent);
  if (agents.length > 0) blockers.push({ kind: "bots", agents });

  const analyzed = (input.pages ?? []).filter((p) => p.status === "analyzed" && p.check);

  const noindexUrls = analyzed.filter((p) => p.check!.indexability?.noindex === true).map((p) => p.url);
  if (noindexUrls.length > 0) blockers.push({ kind: "noindex", urls: noindexUrls });

  const snippetUrls = analyzed
    .filter((p) => (p.check!.indexability?.snippetBlocks?.length ?? 0) > 0)
    .map((p) => p.url);
  if (snippetUrls.length > 0) blockers.push({ kind: "snippet", urls: snippetUrls });

  return blockers;
}

/** Titular del bloqueo. Nombra la causa, no la métrica. */
export function blockerTitle(blocker: CitationBlocker): string {
  if (blocker.kind === "bots") {
    const shown = blocker.agents.slice(0, 2).join(" y ");
    const rest = blocker.agents.length > 2 ? ` y ${blocker.agents.length - 2} más` : "";
    return `Tu web bloquea a ${shown}${rest}`;
  }
  const n = blocker.urls.length;
  if (blocker.kind === "noindex") {
    return n === 1 ? "Una de tus páginas no se puede indexar" : `${n} de tus páginas no se pueden indexar`;
  }
  return n === 1
    ? "Una de tus páginas prohíbe mostrar fragmentos"
    : `${n} de tus páginas prohíben mostrar fragmentos`;
}

/** Por qué impide que te citen, en una frase. */
export function blockerDetail(blocker: CitationBlocker): string {
  switch (blocker.kind) {
    case "bots":
      return "Esos motores no pueden leer tu contenido, así que no pueden citarte.";
    case "noindex":
      return "Llevan una etiqueta noindex: por buena que sea la página, ningún motor la va a citar.";
    case "snippet":
      return "Llevan nosnippet o max-snippet:0, que prohíbe reproducir un fragmento — y sin fragmento no hay cita.";
  }
}

/** Las URLs afectadas, si el bloqueo es por página. */
export function blockerUrls(blocker: CitationBlocker): string[] {
  return blocker.kind === "bots" ? [] : blocker.urls;
}
