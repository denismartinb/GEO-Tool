/**
 * Integridad de un artefacto pegable de una solución generada
 * (RECS-USEFULNESS-1 Fase A, log §126).
 *
 * **Por qué existe.** El 2026-08-20 el fundador ejecutó las recomendaciones que
 * GenScore emite para el propio `genscore.es` y el bloque JSON-LD que la
 * pantalla ofrecía con un botón «Copiar» **terminaba a media palabra**:
 * 1.182 caracteres, cortado en `...bien organizadas con HTML se`. No era un
 * accidente del modelo: `EXAMPLE_CONTENT_MAX` valía 1.200, el prompt le pedía
 * al modelo «max 1200 chars», y un `FAQPage` con dos preguntas respondidas en
 * castellano no cabe ahí. El modelo escribió hasta su presupuesto y paró.
 *
 * Y nada lo detenía: la validación de entonces sólo miraba evidencia
 * (competidores y dominios inventados) y longitud, así que un objeto JSON sin
 * cerrar pasaba el filtro, se persistía y se pintaba junto a un botón de
 * copiar. El cliente lo pegaba, `JSON.parse` fallaba en su web, y no tenía
 * forma de saber que el fallo era nuestro.
 *
 * **Las dos reglas que se derivan de ahí, y por qué son distintas:**
 *
 * - **Un artefacto de código no se trunca jamás.** Medio JSON-LD es peor que
 *   ninguno: no falla al pegarlo, falla después, en la web del cliente. Si no
 *   cabe, se descarta entero.
 * - **La prosa sí se recorta, pero nunca a media palabra.** Un párrafo citable
 *   que se pasa por poco sigue siendo útil; tirarlo entero pierde valor sin
 *   ganar corrección.
 *
 * Este módulo NO valida el contenido —si el texto es bueno, si el consejo es
 * correcto, si el schema corresponde a contenido visible en la página—. Eso es
 * la Fase C. Aquí sólo se responde una pregunta: **¿lo que le damos al usuario
 * para pegar está entero y es sintácticamente válido?**
 */

/** Prosa: un párrafo citable, un guion, una plantilla de correo. */
export const PROSE_ARTIFACT_MAX = 1_200;

/**
 * Código: JSON-LD o un fragmento de marcado. El tope viejo (1.200) era el que
 * provocaba el corte — un `FAQPage` con 2-4 pares pregunta/respuesta en
 * castellano no entra. 3.000 es lo que ocupa ese artefacto completo con
 * holgura, medido sobre el bloque real del incidente.
 */
export const CODE_ARTIFACT_MAX = 3_000;

export type ArtifactKind = "json" | "markup" | "prose";

export type ArtifactRejection =
  /** Vacío tras sanear. */
  | "empty"
  /** Código por encima de su tope: se descarta en vez de cortarse. */
  | "too_long"
  /** Empieza como JSON (o va dentro de un `<script type="application/ld+json">`) y no parsea. */
  | "invalid_json"
  /** Marcado que acaba dentro de una etiqueta sin cerrar — la firma de un corte. */
  | "unterminated_markup";

export type ArtifactCheck =
  | { ok: true; kind: ArtifactKind; content: string }
  | { ok: false; kind: ArtifactKind; reason: ArtifactRejection };

const LD_JSON_SCRIPT = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>/i;

/**
 * Desenvuelve una valla de markdown (```json … ```) y dice si estaba cerrada.
 *
 * Devolver el interior **también cuando la valla quedó abierta** no es
 * indulgencia, es lo contrario: si se devolviera el texto con las comillas
 * delante, el artefacto dejaría de parecer JSON, se clasificaría como prosa y
 * un objeto cortado se colaría recortado por palabra y con su botón de copiar
 * — exactamente el fallo que este módulo existe para impedir. Lo cazó el test
 * de este fichero sobre la primera versión.
 */
function unwrapFence(content: string): { body: string; unterminated: boolean } {
  const trimmed = content.trim();
  if (!trimmed.startsWith("```")) return { body: trimmed, unterminated: false };
  const firstBreak = trimmed.indexOf("\n");
  if (firstBreak === -1) return { body: trimmed.replace(/^`+/, "").trim(), unterminated: true };
  const rest = trimmed.slice(firstBreak + 1);
  const closing = rest.lastIndexOf("```");
  if (closing === -1) return { body: rest.trim(), unterminated: true };
  return { body: rest.slice(0, closing).trim(), unterminated: false };
}

/**
 * Devuelve el texto que debería ser JSON, o null si el artefacto no pretende
 * serlo. Un `<script type="application/ld+json">` sin su `</script>` devuelve
 * cadena vacía (no null): pretende ser JSON y está incompleto, que es
 * justamente lo que hay que rechazar, no ignorar.
 */
export function jsonPayloadOf(content: string): string | null {
  const { body } = unwrapFence(content);

  const scriptMatch = body.match(LD_JSON_SCRIPT);
  if (scriptMatch) {
    const openEnd = (scriptMatch.index ?? 0) + scriptMatch[0].length;
    const closing = body.toLowerCase().indexOf("</script>", openEnd);
    if (closing === -1) return "";
    return body.slice(openEnd, closing).trim();
  }

  const first = body[0];
  if (first === "{" || first === "[") return body;

  return null;
}

export function classifyArtifact(content: string): ArtifactKind {
  if (jsonPayloadOf(content) !== null) return "json";
  if (unwrapFence(content).body.startsWith("<")) return "markup";
  return "prose";
}

/**
 * Un marcado cortado casi siempre acaba dentro de una etiqueta abierta. Es una
 * comprobación deliberadamente estrecha: no valida HTML, sólo detecta el corte.
 */
function endsInsideTag(body: string): boolean {
  const lastOpen = body.lastIndexOf("<");
  if (lastOpen === -1) return false;
  return body.indexOf(">", lastOpen) === -1;
}

/**
 * Recorta prosa por el último límite de palabra que quepa, nunca por el medio
 * de una. Si no hay ningún espacio (una sola palabra larguísima), se recorta
 * duro: no hay límite mejor y el caso no se da en prosa real.
 */
export function trimProseAtWordBoundary(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;
  const hard = content.slice(0, maxLen);
  const lastSpace = hard.search(/\s\S*$/);
  return (lastSpace > 0 ? hard.slice(0, lastSpace) : hard).trimEnd();
}

/**
 * La puerta: decide si un artefacto ya saneado puede enseñarse con un botón de
 * copiar. Devuelve el contenido final (prosa posiblemente recortada por
 * palabra) o el motivo del descarte, para que quien llama pueda registrarlo.
 */
export function checkPasteableArtifact(content: string): ArtifactCheck {
  const kind = classifyArtifact(content);

  if (content.trim().length === 0) return { ok: false, kind, reason: "empty" };

  if (kind === "prose") {
    const trimmed = trimProseAtWordBoundary(content, PROSE_ARTIFACT_MAX);
    if (trimmed.length === 0) return { ok: false, kind, reason: "empty" };
    return { ok: true, kind, content: trimmed };
  }

  if (content.length > CODE_ARTIFACT_MAX) return { ok: false, kind, reason: "too_long" };

  if (kind === "json") {
    const payload = jsonPayloadOf(content) ?? "";
    if (payload.trim().length === 0) return { ok: false, kind, reason: "invalid_json" };
    try {
      JSON.parse(payload);
    } catch {
      return { ok: false, kind, reason: "invalid_json" };
    }
    return { ok: true, kind, content };
  }

  const { body, unterminated } = unwrapFence(content);
  if (unterminated || endsInsideTag(body)) {
    return { ok: false, kind, reason: "unterminated_markup" };
  }

  return { ok: true, kind, content };
}
