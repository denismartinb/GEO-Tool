# WEB-AUDIT-DQ — Calidad de la detección de cobertura

**Gate:** toca el core de DOMAIN-COVERAGE-1 (`lib/llm/gemini.ts` +
`lib/recommendations/domain-coverage.ts`). No añade schema ni es fake, pero
**cambia el comportamiento de detección**, así que requiere revisión de
metodología (geo-strategy) y de las invariantes de citación (data-guardian)
antes de mergear. No es "polish": es una corrección de honestidad de datos (P0
según la clasificación de `CLAUDE.md`, porque hoy la matriz puede mostrar huecos
que no existen).

## Resultado (2026-07-06) — diagnosticado y arreglado

Medición real sobre `ryanair.com` (6 temas, vía `:dq cached_diag`): **5 de 6
temas con `chunks: 0`** (Gemini no devolvió ninguna cita) y 1 con `chunks: 1`
que no resolvió a dominio propio. Confirma la **hipótesis 1**: se pasaba la
pregunta entera como consulta de sitio literal.

**Arreglo aplicado:** `auditDomainContent` (gemini.ts) ahora instruye a Gemini a
reducir la pregunta a su *subject* en palabras clave y buscar `site:{domain}`
con ellas (probando variaciones), en vez de buscar la pregunta verbatim. Se
retiró la línea literal `Search query: site:{domain} {pregunta}`. La detección
sube a `RULE_ID = domain_coverage_v2` y la caché filtra por versión, de modo que
los mapas v1 (falsos negativos) se recalculan en la próxima auditoría. Las
invariantes de DOMAIN-COVERAGE-1 (verificación fail-closed de dominio propio)
quedan intactas: siguen siendo lo único que decide "contenido propio verificado".
El diagnóstico `:dq` se mantiene para medir la mejora (chunks debería pasar de 0
a >0). Pendiente: verificar en preview con una reauditoría real, y decidir si el
caso `chunks>0 & found:false` (resolución de redirect) merece H2.

## Síntoma observado

En el preview, `ryanair.com` audita **0/6 temas con contenido propio** — los 6
caen en "Hueco de contenido". Ryanair publica con certeza páginas de equipaje,
tarifas y condiciones, luego esto es casi seguro un **falso negativo**. La matriz
entera, los KPIs y (más adelante) el plan de acción y los briefs heredan este
error.

## Hipótesis de causa (a confirmar con diagnóstico, no asumir)

1. **La query es una pregunta genérica, no una consulta de sitio.** El `topic`
   que se pasa a `auditDomainContent` es el `prompt_text` en crudo — una pregunta
   comparativa multi-marca ("¿Cuáles son las políticas de equipaje de mano más
   comunes en las aerolíneas económicas?"). El grounding hace
   `site:ryanair.com {esa pregunta entera}`, que casi nunca coincide con cómo se
   titula/indexa una página real. Una consulta por palabras clave
   ("equipaje de mano Ryanair") encontraría la página; la pregunta entera, no.
2. **La resolución de redirect fail-closed descarta citas válidas.** Si el
   grounding sí devuelve URLs de `ryanair.com` pero el redirect no resuelve
   (timeout de 2.5s, `REDIRECT_RESOLUTION_TIMEOUT_MS`), se descartan → `found:false`.
3. **El grounding restringido por dominio no rinde** para algunos dominios/temas
   (el modelo ignora la restricción de sitio del prompt, que es a nivel de
   instrucción, no un filtro duro de la API).

## Diagnóstico (primero medir, luego arreglar)

Añadir logging estructurado temporal (sanitizado, sin PII) en
`auditDomainCoverageCore`/`verifyOwnDomainPages`, por tema:
- nº de `groundingChunks` devueltos por Gemini,
- nº que resolvieron el redirect (vs. timeout/fallo),
- nº cuyo dominio resuelto casó con el dominio propio (label-boundary).

Esto ubica en qué etapa se pierden las páginas: Gemini no las devuelve (hipótesis
1/3), o sí las devuelve pero se caen en resolución (hipótesis 2). No se toca la
lógica hasta saber cuál es.

Prefijo de log: `[geo:domain-coverage:dq]`. Retirar (o bajar a debug) el logging
extra una vez validado.

## Candidatos de arreglo (elegir según el diagnóstico)

- **(H1) Derivar una consulta de palabras clave del prompt.** En vez de pasar la
  pregunta entera como `topic`, extraer el núcleo temático (entidad + intención)
  y buscar `site:domain {keywords}`. Opciones, de menor a mayor coste:
  - heurística determinista (quitar muletillas interrogativas, quedarse con
    sustantivos/entidad de marca) — sin coste de LLM;
  - reutilizar la extracción ya existente del escaneo si captura el tema;
  - una llamada corta a Gemini para condensar el prompt en 2-4 palabras clave
    (coste extra, se contaría en el presupuesto de la auditoría).
  Metodología a validar con **geo-strategy** (qué define un buen "tema" auditable).
- **(H2) Endurecer la resolución de redirect.** Subir el timeout para la
  auditoría de cobertura (no para el escaneo), o reintentar una vez; medir impacto
  en el presupuesto total de 45s. Mantener fail-closed (una URL sin resolver nunca
  cuenta como propia — invariante 1 de DOMAIN-COVERAGE-1, intocable).
- **(H3) Fallback de verificación directa.** Para un tema sin citas grounding
  propias, hacer una comprobación `site:domain {keywords}` adicional acotada antes
  de declarar "Hueco de contenido". Solo si H1/H2 no bastan; cuenta en el
  presupuesto.

## Fuera de alcance (no tocar)

- Las invariantes de DOMAIN-COVERAGE-1 (fail-closed, notas fijas no-Gemini cuando
  no hay nada verificado, saneo, gate Pro, persistencia de todo gasto). Cualquier
  arreglo se hace **dentro** de esas invariantes.
- El schema y el `generation_type` (sin migración).

## Tests

- Unit: la derivación de keywords (H1) sobre una batería de prompts reales
  (preguntas comparativas, preguntas de marca, long-tail) produce consultas
  sensatas y nunca vacías.
- El diagnóstico/logging no altera el resultado (mismos `topics` de salida).
- Reforzar el test existente que asegura que un redirect sin resolver sigue dando
  `found:false` (la corrección no debe abrir esa puerta).

## Criterios de aceptación

1. Diagnóstico ejecutado sobre al menos un dominio real que demostrablemente
   publica sobre un tema, con los contadores por etapa registrados.
2. Tras el arreglo, ese dominio reporta `found:true` con la página real para ese
   tema (verificado en el preview con una cuenta Pro real).
3. Ningún cambio debilita las invariantes de citación (tests en verde).
4. `pnpm test && pnpm run validate` en verde.
5. Nota de metodología (geo-strategy) y visto bueno (data-guardian) registrados en
   el PR.
