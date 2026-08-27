---
description: Invariantes de la metodología de cálculo del GEO Score y sus métricas.
paths:
  - "lib/scoring/**"
---

# Metodología GEO — invariantes

Aplican automáticamente al tocar el scoring. **Esta es la zona de mayor riesgo
del producto**: cambiar una fórmula mueve todos los números históricos del
usuario sin avisar.

## Regla que gobierna todas las demás

**Ninguna fórmula se toca sin un ADR nuevo.** No "ajustes", no "mejoras
pequeñas", no cambiar un peso o un umbral de paso. Si el cambio parece
justificado, se para y se escribe el ADR primero — es exactamente el proceso
que produjo ADR 0015, 0024 y 0026.

**Y un ADR no basta si no hay datos.** Los seis números de la composición
(cuatro pesos, dos bandas) nunca se han validado contra la distribución real de
proyectos, y **sólo los runs completados desde el 2026-08-05 sirven para
hacerlo**: los anteriores calcularon sus componentes sobre una extracción
truncada a 20 filas (ADR 0029) o sobre muestras de 3 respuestas (ADR 0030). El
plan de medición, con sus consultas y sus criterios de parada fijados de
antemano, está en **ADR 0031** — que es una propuesta, no una decisión.

## Composición del score

- Composite **v4** según **ADR 0033** (supersede los pesos de ADR 0015/0026,
  no su significado). Cinco componentes: `presence` .32 / `prominence` .20 /
  `standing` .16 / `authority` .12 / `technical` .20.
- **Los cuatro componentes originales sólo se escalan; sus proporciones son
  intocables sin datos.** v4 los multiplicó por `1 − technical_weight`, así que
  al caerse `technical` renormalizan a exactamente .40/.25/.20/.15 y un
  proyecto sin auditoría puntúa idéntico a v3. Esa propiedad es la garantía de
  que v4 es **estrictamente aditivo**, y está aserida en
  `run-scoring.test.ts` ("renormalizes to EXACTLY the v3 weights"). Si alguna
  vez toca cambiar los pesos relativos de esos cuatro, es la recalibración de
  **ADR 0031** y sigue bloqueada por datos (ADR 0033 §3).
- **`technical` es determinista y por eso puede pesar.** `readiness_score` se
  calcula sin LLM (`lib/web-audit/page-checks.ts`). Ese es el motivo por el que
  darle peso *reduce* la varianza en vez de importarla: escala la parte
  volátil por `1 − w` (ADR 0033 §2). Si algún día una parte de esa nota pasara
  a decidirla un modelo, esta justificación se cae y hay que rehacerla.
- **Un run nunca se puntúa contra la auditoría de un run posterior.**
  `resolveTechnicalComponent` sólo acepta el snapshot propio del run o el más
  reciente *anterior* dentro de 30 días. Aceptar snapshots posteriores
  reescribiría scores históricos cada vez que un escaneo nuevo audita el sitio
  (ADR 0033 §4, misma objeción que ADR 0026 contra el backfill).
- Los pesos **se renormalizan** cuando falta un componente: el peso real de
  `presence` no es fijo. Cualquier cálculo derivado debe recomputar, no
  multiplicar por el peso nominal (esta fue la propuesta rechazada en ADR 0017).
- `standing` es **Share of Voice real**, no `100 - competitor_gap_score`. La v1
  daba 100 a una marca invisible en un mercado sin competidores mencionados
  (ADR 0015).
- **La posición mide rango cuando se menciona, no frecuencia** (ADR 0026
  `position-when-mentioned`, supersede parte de ADR 0005).

## Honestidad del dato

- **Una mención sólo cuenta si el nombre aparece literalmente en el texto**
  (ADR 0021). Relevancia temática no es mención. La evidencia persistida debe
  ser una cita textual del propio texto, nunca parafraseada.
- **Capa de fiabilidad obligatoria** (ADR 0024): un score derivado de pocas
  respuestas se presenta con su tamaño de muestra y su margen, nunca como una
  cifra exacta con un delta limpio. El caso que lo motivó: 30 → 74 (+44 pt)
  entre dos escaneos idénticos con n=3.
- La confianza declarada tiene que ser estadísticamente defendible, no una
  etiqueta cosmética (ADR 0015 punto 3).
- **Ninguna superficie publica una comparación entre escaneos sin pasar por
  `resolveDelta`** (`lib/scoring/score-reliability.ts`). No hay excepciones
  para tablas, listas ni tooltips: si una pantalla resta dos scores por su
  cuenta, está afirmando algo que el ADR 0024 ya decidió no afirmar. Lo
  aprendimos caro — ADR 0024 se implementó en la Visión general y el historial
  de Escaneos siguió publicando `+34 pt` sobre 3 respuestas durante meses
  (DELTA-GUARD-1, log §22). Una capa de honestidad que hay que acordarse de
  llamar acaba sin llamarse.

## Tamaño de la muestra (SAMPLING-1, ADR 0030)

- **Un escaneo apunta a un suelo de 50 respuestas** (`MIN_RESPONSES_PER_RUN`,
  `lib/scan/sampling.ts`). Cuando `prompts × motores` no llega, el run repite
  su set de prompts hasta `MAX_PROMPT_SAMPLES`. La regla vive en **un solo
  sitio**, puro y testeado: no se recalcula en ningún otro módulo.
- **Más muestra no sustituye al margen.** El suelo estrecha el intervalo de
  ~±18 pp a ~±13 pp, no lo elimina. Todo lo que ADR 0024 obliga a mostrar
  (tamaño de muestra, margen, guarda de comparabilidad) sigue siendo
  obligatorio — subir el suelo nunca es motivo para retirar la capa de
  fiabilidad.
- **La unidad de trabajo es `(run, prompt, motor, muestra)`.** Cualquier
  comprobación de "esto ya está hecho" tiene que filtrar por `sample_index`.
  Sin ese filtro las repeticiones se saltan sus llamadas en silencio y el
  escaneo reporta éxito con un tercio de las respuestas (ADR 0030).
- **El suelo no puede subir sin mirar la cobertura de extracción.** Si un run
  tiene más filas de las que `runStructuredExtractionForRun` llega a procesar,
  las sobrantes entran al score con su mención ingenua, sin alias y sin
  verificar (ADR 0021/0025): más muestra empeora el número en vez de mejorarlo.
  Hoy no ocurre —ADR 0029 retiró el tope de filas—, pero la regla se queda
  escrita porque el acoplamiento sigue ahí: cualquier futuro límite en la
  extracción vuelve a invertir el signo de esta fase.
- Free queda fuera del suelo por decisión de producto (D1, ADR 0030), no por
  limitación técnica.

## Cobertura de motores (GEO-SCORE-V4 Fase B, ADR 0033 §5)

- **Un run parcial puntúa sobre las filas que tiene, y lo dice.** Un job de
  prompt se da por bueno si responde al menos un motor, así que una caída de
  proveedor encoge la muestra sin fallar nada — 13 puntos de score en la
  reproducción de `docs/geo-score-variability-2026-08.md` §1. El veredicto de
  `computeEngineCoverage` se persiste en `geo_score.engine_coverage`.
- **Nunca se rellenan las filas que faltan.** Ni fabricarlas, ni contar como
  "no mención" a un motor que jamás contestó: eso sería inventar datos. Lo que
  se arregla es la presentación, no el número.

## La cifra publicada es una ventana (SCORE-WINDOW-1, ADR 0036)

- **El titular de Visión general es la mediana de los 3 últimos escaneos
  comparables**, no el score del último run. Existe porque los motores hacen
  recuperación viva y esa varianza no la quita ninguna fórmula — y porque el
  pin de modelo quedó descartado al medir que no hay id versionado.
- **La ventana cae al score del run cuando no puede publicar.** Nunca a una
  mediana de cosas incomparables: rehúsa exactamente lo que `compareRuns`
  rehúsa (versión de compuesto, `inputs_used`, tamaño de muestra).
- **Todo lo que cuelga del titular mide lo mismo que él.** La banda se calcula
  sobre la ventana, el delta es ventana-contra-ventana, y la evolución dibuja
  la serie de ventanas. Mezclarlos pone dos métricas en la misma tarjeta sin
  decir cuál es cuál.
- **Las alertas de caída siguen mirando runs, a propósito** (ADR 0036 §5):
  meterlas detrás de una mediana las retrasaría dos escaneos justo cuando
  llegar tarde importa.

## Una sola Puntuación GEO en todo el producto (TRUST-METRICS-1, log §179)

- **Toda superficie que use la etiqueta "Puntuación GEO" (o equivalente,
  "GEO Score") pasa por `lib/metrics/run-metrics.ts`, sin excepción.**
  `resolveGeoScore()` es el único punto de decisión: ventana cuando
  `SCORE-WINDOW-1` puede publicarla, compuesto del run cuando no, nunca
  `visibility_score` crudo. Nació así porque la auditoría externa del
  2026-08-26 encontró el mismo escaneo enseñando 6 en Visión general y 2 en
  Dominios — visibilidad y compuesto son cosas distintas, y nada impedía que
  cada pantalla eligiera la suya.
- **`visibility_score` no aparece jamás bajo esa etiqueta**, ni siquiera en
  la ruta de fallo de una consulta que falle. El primer intento de esta fase
  se equivocó exactamente ahí: el `catch` de la notificación de fin de
  escaneo caía a `visibility_score` en vez de al compuesto del run — lo
  encontró la revisión reforzada, no un test, porque nadie ejercita la ruta
  de fallo en local.
- **Todo lo que se compare junto al titular tiene que estar en su misma
  base.** Un delta que compara dos `visibility_score` crudos no puede sentarse
  al lado de un titular con ventana: es la misma cifra prohibida, un nivel
  más abajo. Se encontró en Dominios (badge de delta, DELTA-GUARD-1 original)
  y se corrigió a ventana-sobre-ventana, misma construcción que el
  `gaugeDelta` de Visión general.
- **La profundidad de lectura es una constante compartida**
  (`GEO_SCORE_LOOKBACK_ROWS`, 7 — la misma que Visión general ya usaba antes
  de que este módulo existiera), no una elección de cada pantalla. Con menos
  profundidad, una pantalla puede quedarse sin runs elegibles para la ventana
  mientras otra, leyendo más atrás, sí los encuentra — dos "Puntuación GEO"
  para el mismo proyecto, otra vez.
- **`SCORE-WINDOW-1` en sí (la mediana, el tamaño de ventana, las reglas de
  comparabilidad de la sección de arriba) no lo toca esta regla.** Se
  consume, nunca se modifica — es la sección de arriba, íntegra.

## Referencias

`docs/geo-methodology-audit-2026-07.md` (hallazgos abiertos),
`docs/geo-score-variability-2026-08.md` (sensibilidad por plan),
`docs/brand/design-decisions-log.md` §8b (cómo se muestra la incertidumbre),
§179 (TRUST-METRICS-1) · `docs/external-audit-2026-08.md` Fase 1 ·
ADR 0036 (adenda TRUST-METRICS-1).
