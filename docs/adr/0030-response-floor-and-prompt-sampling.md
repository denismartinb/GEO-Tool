# ADR 0030 — Suelo de respuestas por escaneo (muestreo por repetición de prompts)

- **Estado:** aceptado
- **Fecha:** 2026-08-04
- **Fase:** SAMPLING-1 (Fase 2 de `docs/geo-score-variability-2026-08.md`)
- **Migración:** `supabase/migrations/0028_scan_prompt_result_samples.sql`
  (aprobada explícitamente por el fundador, decisión D5)
- **Decide:** cuántas respuestas de IA tiene que reunir un escaneo antes de
  publicar un GEO Score, y cómo las consigue cuando el proyecto tiene pocos
  prompts.

## Contexto

El origen es el incidente que abre `docs/geo-score-variability-2026-08.md`: el
fundador lanzó dos escaneos consecutivos del mismo proyecto sin cambiar nada y
el GEO Score se movió **44 puntos**. La reproducción contra el
`computeRunScoresFromResults` real dejó los 44 puntos explicados por completo:
el proyecto tenía **1 prompt × 3 motores = 3 respuestas**, y a n=3 una sola
respuesta vale ~24 puntos de GEO.

La Fase 0 (ADR 0024) hizo el producto **honesto** sobre eso: por debajo de
`MIN_RESPONSES_FOR_BAND` no publica banda cualitativa ni delta, y el score
viaja siempre con su margen de Wilson. Pero honestidad no es precisión.
Ninguna fórmula estabiliza un número calculado sobre tres respuestas, y el
propio informe dejó escrito que *"la inestabilidad de fondo solo baja de
verdad con más muestra (Fase 2)"*.

El fundador lo planteó desde el lado del negocio, que es el correcto: un
dominio recién creado se escanea con pocos prompts, el score que ve el usuario
en su primera sesión es el menos fiable de todos, **y es el que decide si el
producto le parece creíble**.

## Decisión

Un escaneo apunta a un suelo de **50 respuestas de IA**
(`MIN_RESPONSES_PER_RUN`). Como cada prompt se lanza a cada motor activo:

```
respuestas = prompts × motores × repeticiones
repeticiones R = ceil(50 / (prompts × motores)),  acotado a [1, 5]
```

`lib/scan/sampling.ts` es la única implementación de esa regla, pura y sin
dependencias. `lib/scan/run-creation.ts` la aplica al crear los jobs.

### Por qué 50, dicho con su límite

El margen de Wilson decrece con `1/sqrt(n)`. Pasar de 30 a 60 respuestas
estrecha el intervalo de ~±18 pp a ~±13 pp: una mejora real del 29 %, **no una
transformación**. Dividir el margen por dos exigiría ~120 respuestas. 50 es
donde la curva deja de compensar el coste por escaneo: supera con holgura el
suelo de banda (10) y el listón de confianza alta (≥20 respuestas
completamente extraídas, `lib/scoring/run-scoring.ts`). El score sigue
mostrando su margen al lado — este ADR no retira nada de ADR 0024.

### Consecuencia que hace el cambio asumible

Con los 3 motores en producción, el suelo **sólo se activa por debajo de 17
prompts activos** (17 × 3 = 51 ≥ 50). Starter en su tope (25), Pro (100) y
Agencia (300) devuelven siempre `samples: 1` y no pagan nada por esta
funcionalidad. Los proyectos que repiten son exactamente los recién creados.

### Decisiones de producto del fundador (2026-08-04)

| | Decisión | Consecuencia |
|---|---|---|
| D1 | **Free queda fuera** | 10 prompts × 1 motor = 10 respuestas, en el mínimo justo para publicar banda. Llegar a 50 sería ×5 de coste en el plan que paga 0 € |
| D2 | El suelo aplica a **todos** los escaneos, no sólo al primero | Si sólo el primero tuviera 60 respuestas y el resto 30, `compareRuns` (ADR 0024) rechazaría **todos** los deltas por cambio de tamaño de muestra y la pantalla de tendencia quedaría muda para siempre |
| D3 | Se repiten prompts | Sugerir más prompts (que aportaría información nueva en vez de precisión sobre lo mismo) queda para una fase posterior |
| D4 | Se repiten **los tres** motores | Se consideró repetir sólo los grounded — Gemini y ChatGPT varían por recuperación, Claude sólo por redacción — y se descartó por simplicidad frente a un ahorro de ~1/3 |
| D5 | Migración aprobada | Ver abajo |
| E1 | Tope duro `MAX_PROMPT_SAMPLES = 5` + exención del proyecto reservado del piloto | Sin tope, 1 prompt × 3 motores pediría 17 repeticiones: 51 llamadas y 17 tandas encadenadas para una sola pregunta |
| E2 | Un proyecto demasiado pequeño para llegar a 50 **publica igual** | Con su tamaño de muestra y su margen a la vista. Esconder el score sería ocultar evidencia que el usuario ha pagado |

## Por qué hacía falta tocar el esquema

`0009_scan_result_multi_provider.sql` hizo **único** `(run_id, prompt_id,
provider)`. Ese índice es exactamente lo que viola una segunda muestra del
mismo prompt en el mismo motor: las repeticiones no son implementables sin
ensancharlo.

La alternativa considerada y **rechazada** era un run por repetición. Rompe el
invariante del que depende toda la aplicación — *"el último run completado es
la foto completa del proyecto"* (`docs/scan-lifecycle.md`) — y habría obligado
a cambiar todas las pantallas para agregar N runs. Radio de impacto mucho
mayor que una columna.

La migración añade dos columnas, ambas aditivas, ambas con default que
reproduce exactamente el comportamiento histórico:

- `scan_prompt_results.sample_index` (default `0`) y el índice único
  ensanchado a `(run_id, prompt_id, provider, sample_index)`.
- `scan_runs.sample_count` (default `1`). Existe porque **sin ella el producto
  miente en pantalla**: `total_prompts` tiene que seguir contando *jobs* (toda
  barra de progreso divide `successful_prompts + failed_prompts`, que son
  cuentas de jobs, entre él), y en cuanto un escaneo repite, ese número deja de
  ser el número de prompts. Con `sample_count`, `total_prompts / sample_count`
  recupera los prompts reales sin una segunda consulta.

Sin backfill: cada fila histórica *es* la muestra 0 de una única pasada.

## El invariante que hace que esto no sea gratis y falso

La unidad de trabajo pasa de `(run, prompt, motor)` a `(run, prompt, motor,
muestra)`. La comprobación de idempotencia de `processPromptJob` **tiene que
estar filtrada por `sample_index`**. Si no lo está, cada repetición posterior a
la primera ve las filas de la muestra 0, concluye que no hay nada que hacer y
completa **sin una sola llamada al LLM**: el escaneo reportaría 60 jobs
correctos y contendría 20 respuestas. El muestreo no costaría nada y no haría
nada, que es la peor forma posible de que esto se rompa. Está fijado por test
en `lib/scan/executor.test.ts` ("an earlier sample's rows never make a later
sample skip its calls").

Un job por `(prompt, muestra)` — y no un bucle de R llamadas dentro de un job —
es también lo que mantiene la concurrencia por tanda igual que hoy (10 jobs ×
3 motores = 30 llamadas simultáneas). Meter la repetición dentro del job la
multiplicaría por R contra el mismo presupuesto de ~60 s de `maxDuration`
(ADR 0003 / ADR 0014).

## Lo que este ADR NO hace

- **No toca ninguna fórmula de scoring.** Ni un peso, ni un umbral, ni una
  banda (`.claude/rules/scoring.md`). Cambia el **tamaño de la muestra** sobre
  la que corren esas fórmulas, y nada más.
- **No arregla la cobertura de extracción, y dependía de que otro la
  arreglara.** Mientras `runStructuredExtractionForRun` truncaba cada escaneo a
  las primeras 20 filas (el antiguo `MAX_EXTRACTION_RESULTS`), subir el suelo
  de respuestas **empeoraba** el score: las filas sobrantes entraban al cálculo
  con su `brand_mentioned` ingenuo, sin alias (ADR 0025) y sin verificar
  (ADR 0021), y sin datos de posición. Dicho de otro modo, esta fase habría
  cobrado el triple por un número peor.
  **Resuelto por EXTRACTION-RELIABILITY-1 (ADR 0029), mergeado el 2026-08-04**,
  que sustituye el tope por concurrencia acotada con presupuesto y difiere el
  finalize antes que completar un run sobre filas sin procesar. Esta fase se
  mergea **después** de aquella, y ese orden no es una preferencia: invertirlo
  degrada el producto de forma medible.
- **No rediseña la superficie.** El cajón de evidencias de Prompts muestra R
  filas por motor sin etiquetar la muestra, y `citationsTotal` por prompt suma
  las R respuestas. Fase de superficie, ya acordada como separada.

## Consecuencias aceptadas

1. **Las recomendaciones por prompt se vuelven más sensibles.** Una brecha del
   tipo "tu marca no aparece en esta consulta" se dispara si la marca falta en
   **alguna** de las R muestras (el motor deduplica por `dedupeKey`, así que no
   se duplican tarjetas). Es defendible — si de tres intentos la IA te omite
   una vez, la brecha es real — pero es un cambio de comportamiento, no una
   invariante preservada.
2. **La exención por dominio es una lista literal.** Un cliente real cuyo
   dominio fuera `mozilla.org` no muestrearía. Se acepta porque `CLAUDE.md` ya
   reserva ese dominio para el piloto, y un test estático fija la lista contra
   `PILOT_WRITE_DOMAIN` para que no puedan separarse en silencio.
3. **Un escaneo pequeño tarda más.** 60 lanzamientos son 6 tandas encadenadas
   en lugar de 2-3. El escaneo de onboarding pasa de ~1 minuto a varios.

## Referencias

`docs/geo-score-variability-2026-08.md` (§1 la reproducción, §3 el plan de
fases) · ADR 0024 (capa de fiabilidad) · ADR 0014 (ejecución por tandas
encadenadas) · ADR 0003 (`maxDuration`) · migración 0009 (multi-motor).
