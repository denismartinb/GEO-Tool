import { headlinePath } from "@/lib/recommendations/headline";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import { AI_ENGINES, engineReadStates } from "@/lib/web-audit/ai-bots";
import { serverBlockedEngines, serverStateFor } from "@/lib/web-audit/server-probe";

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
  /** GEO-ALERTS-1 (log §440): robots.txt lets the engine in, the server refuses its bot (simulation). */
  | { kind: "server"; agents: string[] }
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

  // AI-BOTS-CONSOLE-1 (log §426): engines that cannot read the site, never a
  // closed training bot (GPTBot, ClaudeBot), which does not stop a citation.
  const states = engineReadStates(input.bots);

  // GEO-ALERTS-1 (log §440): the server blocks first. An engine robots.txt
  // already closes is reported under «bots», never twice.
  const serverBlocked = new Set(serverBlockedEngines(input.bots));
  const serverAgents = AI_ENGINES.filter((e) => serverBlocked.has(e.engine as never) && states[e.engine] !== false).map(
    (e) => e.name
  );
  if (serverAgents.length > 0) blockers.push({ kind: "server", agents: serverAgents });

  const agents = AI_ENGINES.filter((e) => states[e.engine] === false).map((e) => e.name);
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
 * (RECS-HEADLINES-1, log §354), no la descripción del problema.
 */
export function blockerTitle(blocker: CitationBlocker): string {
  if (blocker.kind === "server") {
    const title = `Deja pasar a ${joinNames(blocker.agents)} en tu servidor`;
    return title.length <= 48 ? title : "Deja pasar a los bots de IA en tu servidor";
  }
  if (blocker.kind === "bots") {
    const rest = blocker.agents.length - 2;
    const shown = rest > 0 ? `${blocker.agents.slice(0, 2).join(", ")} y ${rest} más` : blocker.agents.join(" y ");
    const title = `Abre tu robots.txt a ${shown}`;
    return title.length <= 48 ? title : "Abre tu robots.txt a los motores de IA";
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

/** «ChatGPT», «ChatGPT y Claude», «ChatGPT, Claude y Perplexity». */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/** A short path for a one-page title, or null when it would not fit. */
function pathFor(url: string | undefined): string | null {
  return headlinePath(url ?? null, 18);
}

/** Por qué impide que te citen, en una frase. */
export function blockerDetail(blocker: CitationBlocker): string {
  switch (blocker.kind) {
    case "server":
      return blocker.agents.length === 1
        ? "Tu robots.txt le deja pasar, pero tu servidor le responde con un bloqueo (lo hemos simulado desde nuestro servidor). Suele ser el cortafuegos o Cloudflare."
        : "Tu robots.txt les deja pasar, pero tu servidor les responde con un bloqueo (lo hemos simulado desde nuestro servidor). Suele ser el cortafuegos o Cloudflare.";
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
  return blocker.kind === "bots" || blocker.kind === "server" ? [] : blocker.urls;
}

/** How sure we are: read as it is («Comprobado») or reproduced by us («Simulación»). */
export type BlockerEvidence = "Comprobado" | "Simulación";

/**
 * GEO-ALERTS-1 (log §440): the Visión general strip says the STATE in its
 * title («ChatGPT no puede entrar en tu web») and how sure we are; the action
 * («Deja pasar…») stays the title of Recomendaciones and the bell.
 */
export function blockerStrip(blocker: CitationBlocker): { title: string; evidence: BlockerEvidence; detail: string } {
  if (blocker.kind === "server") {
    const many = blocker.agents.length > 1;
    return {
      title: `${joinNames(blocker.agents)} no ${many ? "pueden" : "puede"} entrar en tu web`,
      evidence: "Simulación",
      detail: `Tu robots.txt ${many ? "les" : "le"} deja pasar, pero tu servidor ${many ? "les" : "le"} responde con un bloqueo. Suele ser el cortafuegos o Cloudflare.`
    };
  }
  if (blocker.kind === "bots") {
    const many = blocker.agents.length > 1;
    return {
      title: `${joinNames(blocker.agents)} no ${many ? "pueden" : "puede"} leer tu web`,
      evidence: "Comprobado",
      detail: `Tu robots.txt ${many ? "los" : "lo"} bloquea, así que no ${many ? "pueden" : "puede"} citarte.`
    };
  }
  return { title: blockerTitle(blocker), evidence: "Comprobado", detail: blockerDetail(blocker) };
}

/**
 * Engines that could read the site in `previous` and cannot in `current`
 * (`blocked`), and the reverse (`resolved`), by robots.txt or by server.
 * Unknown on either side is never a change.
 */
export function engineAccessChanges(
  previous: BotAccessReport | null,
  current: BotAccessReport | null
): { blocked: { name: string; by: "server" | "robots" }[]; resolved: string[] } {
  const blocked: { name: string; by: "server" | "robots" }[] = [];
  const resolved: string[] = [];
  if (!previous || !current) return { blocked, resolved };
  const robotsBefore = engineReadStates(previous);
  const robotsAfter = engineReadStates(current);
  for (const { engine, name } of AI_ENGINES) {
    const serverBefore = serverStateFor(previous, engine);
    const serverAfter = serverStateFor(current, engine);
    if (robotsBefore[engine] === true && robotsAfter[engine] === false) {
      blocked.push({ name, by: "robots" });
    } else if (robotsAfter[engine] !== false && serverBefore === "allowed" && serverAfter === "blocked") {
      blocked.push({ name, by: "server" });
    } else if (
      // Resolved only when the side that blocked now says «open» and the other
      // side does not block: a probe we could not run never resolves anything.
      (robotsBefore[engine] === false && robotsAfter[engine] === true && serverAfter !== "blocked") ||
      (serverBefore === "blocked" && serverAfter === "allowed" && robotsAfter[engine] === true)
    ) {
      resolved.push(name);
    }
  }
  return { blocked, resolved };
}
