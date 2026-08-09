/**
 * Server-side sanitization gate for untrusted text — LLM output and HTML
 * fetched from the open web.
 *
 * Invariante de origen (0005): este contenido puede acabar copiado o exportado
 * al sitio del propio usuario, así que sólo se marca como renderizable después
 * de que código de confianza lo limpie. Quita etiquetas HTML y caracteres de
 * control, colapsa espacios y recorta a `maxLen`.
 *
 * **Por qué vive aquí y no en cada módulo** (PRELAUNCH-HARDENING-1 Fase R,
 * R1): existían tres copias byte a byte de esta función —en
 * `lib/web-audit/technical-audit.ts`, `lib/recommendations/domain-coverage.ts`
 * y `lib/recommendations/rewrite-recommendation.ts`—. Es un helper de
 * seguridad: una mejora futura del escapado (un caso de control que se escape,
 * una etiqueta que el regex no cubra) habría aterrizado en una de las tres y
 * fallado en silencio en las otras dos, sin que nada lo señalara. Las reglas de
 * ruta de auditoría web y de recomendaciones exigen las dos "el patrón
 * existente (`sanitizeField`)" — en singular, que ahora es literal.
 *
 * Lo que NO es: un saneador de HTML de propósito general. Aquí se aplana texto
 * a texto plano; nunca se almacena ni se renderiza HTML crudo
 * (`.claude/rules/web-audit.md`).
 */
export function sanitizeField(input: string, maxLen: number): string {
  let stripped = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    // Replace C0 control chars and DEL with a space; keep everything else.
    stripped += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return stripped
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
