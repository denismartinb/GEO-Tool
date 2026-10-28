import { headlinePath } from "@/lib/recommendations/headline";
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

/**
 * Titular del bloqueo: el cambio que hay que hacer y en qué fichero o página
 * (RECS-HEADLINES-1, log §353), no la descripción del problema.
 */
export function blockerTitle(blocker: CitationBlocker): string {
  if (blocker.kind === "bots") {
    const rest = blocker.agents.length - 2;
    const shown = rest > 0 ? `${blocker.agents.slice(0, 2).join(", ")} y ${rest} más` : blocker.agents.join(" y ");
    const title = `Permite ${shown} en tu robots.txt`;
    return title.length <= 48 ? title : "Permite los bots de IA en tu robots.txt";
  }
  const n = blocker.urls.length;
  const one = n === 1 ? pathFor(blocker.urls[0]) : null;
  if (blocker.kind === "noindex") {
    if (one) return `Quita la etiqueta noindex de ${one}`;
    return n === 1 ? "Quita la etiqueta noindex de una página" : `Quita la etiqueta noindex de ${n} páginas`;
  }
  if (one) return `Quita nosnippet de ${one}`;
  return n === 1 ? "Quita nosnippet de una de tus páginas" : `Quita nosnippet de ${n} páginas`;
}

/** A short path for a one-page title, or null when it would not fit. */
function pathFor(url: string | undefined): string | null {
  return headlinePath(url ?? null, 18);
}

/** Por qué impide que te citen, en una frase. */
export function blockerDetail(blocker: CitationBlocker): string {
  switch (blocker.kind) {
    case "bots":
      return "Esos motores no pueden leer tu contenido, así que no pueden citarte.";
    // Number agrees with the title: «Una de tus páginas…» read «Llevan…»
    // (SEARCH-SEO-1 Fase 1a, log §271).
    case "noindex":
      return blocker.urls.length === 1
        ? "Lleva una etiqueta noindex: por buena que sea la página, ningún motor la va a citar."
        : "Llevan una etiqueta noindex: por buenas que sean las páginas, ningún motor las va a citar.";
    case "snippet":
      return blocker.urls.length === 1
        ? "Lleva nosnippet o max-snippet:0, que prohíbe reproducir un fragmento — y sin fragmento no hay cita."
        : "Llevan nosnippet o max-snippet:0, que prohíbe reproducir un fragmento — y sin fragmento no hay cita.";
  }
}

/** Las URLs afectadas, si el bloqueo es por página. */
export function blockerUrls(blocker: CitationBlocker): string[] {
  return blocker.kind === "bots" ? [] : blocker.urls;
}
