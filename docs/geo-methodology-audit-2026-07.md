# Auditoría de metodología GEO y KPIs del dashboard — julio 2026

**Origen:** petición del fundador (2026-07-11): revisión crítica y adversarial
de la metodología GEO (el foso del producto) incluyendo explícitamente
"si el cálculo de KPI y los propios KPIs del Dashboard son los óptimos para
un producto como este".

**Alcance revisado:** `docs/adr/0008` (GEO Score compuesto) y los ADRs de
métricas relacionados (0005, 0010, 0011, 0012, 0013),
`lib/scoring/run-scoring.ts`, la página de Overview
(`app/dashboard/projects/[projectId]/page.tsx`), el motor de recomendaciones
completo (`lib/recommendations/recommendation-engine.ts`), los topes por plan
(`app/pricing/plans-data.ts`) y la superficie de KPIs de Escaneos.

**Este documento es solo análisis.** No implementa nada. Cada hallazgo
accionable necesita su propio PR (los pequeños) o Task Intake (los que
cambian el significado del score), según el protocolo de `CLAUDE.md`.

---

## Resumen ejecutivo

El motor de recomendaciones es la parte más sólida y defendible del producto:
cada card está anclada a evidencia real por-prompt, con dedupe estable,
snippets que solo respaldan lo que la regla afirma, y sin caps arbitrarios.
Eso es exactamente lo que el mercado critica que falta en la competencia.

El GEO Score compuesto y los KPIs del Overview, en cambio, tienen **un bug de
verdad de datos (P0)**, **dos fuentes de falsos positivos/afirmaciones
engañosas (P1)** y **tres debilidades metodológicas de fondo** que un cliente
de agencia escéptico puede desmontar en una demo. Ninguna es difícil de
corregir; dos de ellas son quick wins sin backend.

| # | Hallazgo | Clase | Prioridad |
|---|---|---|---|
| 1 | Las tendencias y deltas del Overview usan los 7 escaneos más **antiguos**, no los últimos | Bug de datos | **P0** |
| 2 | Regla de frescura (gap 10): cualquier año ≤2023 en la respuesta marca "información desactualizada" (falsos positivos casi garantizados) | Falso positivo | **P1** |
| 3 | Card "Oportunidades de prompts": placeholder permanente que promete "próxima actualización" | Honestidad | **P1** |
| 4 | Doble conteo en el GEO Score: 3 de 4 componentes derivan de `brand_mentioned`; `standing` premia mercados vacíos | Metodología | **P1** (v2 del score) |
| 5 | Sin control de varianza: 1 muestra por prompt/motor/día; "confianza alta" con ≥5 resultados; alerta de caída con umbral fijo de 10 pt | Metodología | **P1** (v2) |
| 6 | El sentimiento se extrae y persiste pero no existe como KPI en ningún sitio del dashboard | KPI faltante | **P1** (quick win) |
| 7 | La card "Confianza" ocupa 1 de las 4 posiciones de cabecera siendo una meta-métrica, y su sparkline es una línea plana fabricada | KPI cuestionable | **P2** |
| 8 | Fallback legacy "Tasa de cita": el tooltip promete "cita a tu propio dominio" pero el cálculo cuenta cualquier cita | Copy engañoso | **P2** |
| 9 | "Páginas fuente más citadas": `isYours` usa `.includes()` (subcadena) en vez del match estricto de dominio del scoring | Inconsistencia | **P2** |
| 10 | El GEO Score (KPI estrella) no tiene tendencia ni delta en su propia pantalla | KPI faltante | **P2** |
| 11 | Bandas 70/40 heredadas de la era mention-rate, nunca recalibradas para el compuesto | Metodología | **P2** (necesita datos) |

---

## 1 · P0 — Las tendencias del Overview muestran los 7 escaneos más antiguos

`app/dashboard/projects/[projectId]/page.tsx` (~línea 245):

```ts
supabase
  .from("run_scores")
  .select("visibility_score, citation_score, competitor_gap_score, created_at")
  .eq("project_id", projectId)
  .order("created_at", { ascending: true })
  .limit(7)
```

`order ascending` + `limit(7)` devuelve las **7 filas más antiguas** del
proyecto, no las 7 más recientes. Mientras un proyecto tiene ≤7 escaneos
puntuados el resultado es correcto por casualidad (7 filas = todas). A partir
del 8º escaneo:

- **Los sparklines de tendencia se congelan para siempre** en la primera
  semana de historia del proyecto.
- **El delta "vs. escaneo anterior" es falso**: `prevScore =
  trendHistory[length - 2]` pasa a ser el 6º escaneo *más antiguo* del
  proyecto, así que la card "Tasa de mención" compara el escaneo de hoy
  contra uno de la primera semana y lo etiqueta "vs. escaneo anterior".

Un Pro con refresco diario cruza el umbral **en una semana de uso** — es
decir, exactamente durante el onboarding de las primeras agencias de la
Fase 5. La alerta de caída de score (Fase 6a) no está afectada
(`lib/scan/score-alert.ts` compara contra el run inmediatamente anterior por
su propia query), lo que produciría el síntoma desconcertante de "me llega un
email de caída pero el dashboard dice «sin cambio»".

**Fix propuesto (PR pequeño):** `ascending: false` + `limit(7)` + invertir el
array en memoria. Añadir test que fije el contrato "últimos 7, orden
cronológico".

## 2 · P1 — Falsos positivos en la regla de frescura (gap 10)

`computeFreshnessGap` (`lib/recommendations/recommendation-engine.ts`) marca
un prompt como "información desactualizada" si la marca está mencionada y el
texto de la respuesta contiene **cualquier año cuatro cifras ≤ (año actual −
3)**:

```ts
const years = text.match(YEAR_RE);
if (years?.some((y) => parseInt(y, 10) <= STALE_YEAR_CUTOFF)) return true;
```

"Zara, fundada en **1975**…", "ganó el premio X en **2019**", "desde **2010**
opera en…" — cualquier dato histórico perfectamente correcto dispara la card
"Actualiza la información de tu marca que la IA cita como desactualizada".
Para marcas con historia (la mayoría de clientes de agencia), esta card
aparecerá de forma casi permanente con evidencia que el cliente leerá y
descartará — y una recomendación descartable por falsa erosiona la
credibilidad de **todas** las demás, que es el activo central del producto.

Las frases explícitas de `STALE_PHRASES` ("ya no está disponible", "was
discontinued") sí son señal legítima; el problema es solo la heurística de
año suelto.

**Fix propuesto (PR pequeño):** exigir contexto para el año — solo contar
años ≤cutoff adyacentes a marcadores de vigencia ("a fecha de", "as of",
"datos de", "última actualización") o, más conservador aún, eliminar la
heurística de año y dejar solo `STALE_PHRASES` hasta que la Fase D2 tenga
extracción real de frescura. Preferible perder recall a fabricar hallazgos.

## 3 · P1 — Card "Oportunidades de prompts": placeholder que promete futuro

En el Overview, sección "Oportunidades", la card izquierda es un estado vacío
permanente: *"Las oportunidades de prompts… se calcularán automáticamente en
la próxima actualización."* Lleva ahí desde que existe la sección, en la
pantalla más vista del producto, y roza la regla constitucional de no
enseñar producto que no existe.

Lo llamativo es que **el dato ya existe**: `competitorNoBrand` (prompts con
competidor presente y marca ausente) se computa en el motor de
recomendaciones, y la propia página ya tiene por prompt todo lo necesario en
`allPromptResults` + `extracted_json`. Renderizar la lista real (prompt +
qué competidor gana + link a la recomendación asociada) es frontend puro.

**Fix propuesto (PR pequeño):** o se construye la lista real con los datos ya
capturados, o se retira la card hasta que exista. Recomendación: construirla —
es de las pocas cards que responden directamente "¿dónde pierdo dinero hoy?".

## 4 · P1 (metodología) — Doble conteo en el compuesto y el caso del mercado vacío

Los cuatro componentes (ADR-0008) no son señales independientes:

- `presence` = % prompts con `brand_mentioned` (peso 0.40).
- `prominence` penaliza cada prompt sin mención con la posición N+1 → un
  proyecto con presencia baja tiene prominencia baja **por construcción**
  (peso 0.25).
- `standing` = 100 − presión competitiva, y la presión solo puede puntuar en
  prompts donde la marca **no** aparece → también función de
  `brand_mentioned` (peso 0.20).

En la práctica, ~85% del peso del compuesto está correlacionado con la misma
variable binaria subyacente. El score no es tan "holístico" como lo describe
el ADR — es mention rate con armónicos, más un 15% de autoridad.

El caso degenerado que un cliente escéptico encontrará: **una marca
totalmente invisible en un mercado donde la IA tampoco menciona competidores
puntúa 20/100** (presence 0, prominence 0, standing 100 × 0.20, authority 0),
mientras el producto le dice que la franja <40 es "inicial". ¿Por qué 20 y no
0, si nadie la ha visto nunca? Porque `standing` interpreta "no hay
competidores mencionados" como mérito de la marca.

**Propuesta para geo-score-v2 (Task Intake propio, cambia el significado del
score):** sustituir `standing` por **Share of Voice real** (menciones de
marca / menciones de marca + competidores, que la página ya computa como
`brandSov` pero no participa en el score). SoV no premia mercados vacíos, es
la métrica competitiva que las agencias ya usan en informes, y reduce el
doble conteo porque su denominador incluye la actividad de los competidores,
no solo la ausencia de la marca. Mantener v1 en paralelo en `details_json`
durante la transición (mismo patrón que `citation_score_any_domain` en
ADR-0013).

## 5 · P1 (metodología) — Varianza sin controlar

- Cada prompt se muestrea **una sola vez por motor y por escaneo**, con
  salidas LLM no deterministas.
- En Free (10 prompts, 1 motor), **cada prompt vale 10 puntos de presence**:
  un cambio aleatorio en una sola respuesta mueve el headline ±10 sin que
  nada real haya cambiado. En Starter (25 prompts) son ±4.
- `confidence` se marca "high" con `totalResults >= 5` y cobertura ≥0.8 —
  cinco muestras es "alta confianza" solo en el sentido de cobertura de
  extracción, no en el estadístico, pero la UI lo comunica como fiabilidad
  de la muestra.
- La alerta de caída (Fase 6a) usa umbral fijo de 10 puntos comparando dos
  runs individuales: en cuentas pequeñas eso está dentro del ruido → falsas
  alarmas por email, el tipo de notificación que se desactiva a la semana.
  (El ledger ya anota el umbral como "pendiente de afinar"; esta es la
  justificación cuantitativa.)

**Propuestas (por coste creciente):**
1. **Sin coste:** ligar las etiquetas de confianza al nº de prompts con
   honestidad estadística (p.ej. "alta" requiere ≥20 resultados), y en la
   alerta exigir persistencia (caída sostenida en 2 runs consecutivos) en
   vez de un delta puntual.
2. **Coste bajo:** suavizar la tendencia con media móvil de los últimos K
   runs para el gauge/alertas, mostrando el run puntual como detalle.
3. **Coste por escaneo (decisión de producto):** múltiples muestras por
   prompt en planes de pago — es lo que hace la competencia cara; sería
   además un diferenciador honesto de Pro frente a Free.

## 6 · P1 (quick win) — El sentimiento se captura y no se enseña en ningún KPI

La extracción ya produce `sentiment` por prompt y `sentiment_drivers`
(temas de la percepción negativa), y el scoring persiste
`sentiment_distribution` por run en `details_json`. Se usa en el motor de
recomendaciones (gap 9) y como chip por prompt en la pantalla de Prompts —
pero **no existe ninguna card ni distribución de sentimiento en el
Overview**. Toda la competencia relevante (Otterly, Peec, AthenaHQ) tiene
sentiment tracking como feature de cabecera de sus comparativas.

Es el KPI nuevo más barato posible: los datos ya están persistidos, es
frontend puro. Encaja además con el hallazgo 7 (hay un hueco natural donde
ponerlo).

## 7 · P2 — "Confianza" como card de cabecera, con sparkline fabricado

De las 4 cards de métricas del Overview, la cuarta es "Confianza" — una
meta-métrica de calidad de extracción, no un KPI de visibilidad que un
cliente pondría en un informe. Ya se comunica como badge sobre el gauge
cuando degrada, que es su sitio natural.

Peor: su sparkline se construye como
`confTrend = trendHistory.map(() => confidenceToPercent(runConfidence))` —
una **línea plana del valor actual repetido N veces** presentada visualmente
como si fuera historia. Es un dato fabricado (leve, pero fabricado) en la
pantalla principal.

**Propuesta:** sustituir la card de Confianza por la card de **Sentimiento**
(hallazgo 6) y dejar la confianza como badge del gauge. Un solo PR de
frontend resuelve 6 y 7 juntos.

## 8 · P2 — Fallback legacy "Tasa de cita": tooltip y cálculo cuentan cosas distintas

Cuando un run no tiene `geo_score` (runs anteriores a geo-score-v1), el
bloque "Cómo se compone tu puntuación" cae a tres filas legacy. La fila
"Tasa de cita" muestra `computedCitationRate` = % de filas con
`citation_found` (**cualquier** cita, de cualquier dominio), pero su tooltip
dice *"cita verificada (grounding) a tu propio dominio"* — la definición
estricta de ADR-0013 que ese número **no** cumple. Además `citDelta` se
computa mezclando ambas definiciones (rate any-domain de hoy vs
`citation_score` own-domain almacenado) y luego no se usa — código muerto
que invita a reintroducir el error.

Impacto acotado (solo runs legacy), pero es exactamente la clase de
inconsistencia que ADR-0013 se escribió para eliminar.

**Fix propuesto:** en el fallback, o alinear el número con el tooltip usando
`citation_score` almacenado, o alinear el tooltip con el número; y borrar
`citDelta`.

## 9 · P2 — `isYours` de "Páginas fuente más citadas" usa subcadena

```ts
isYours: Boolean(p.domain && p.domain.replace(/^www\./, "").includes(project.domain.replace(/^www\./, "")))
```

`"no-acme.com".includes("acme.com")` → `true`: un dominio de tercero que
contenga el tuyo como subcadena se marca como propio (icono/color "tuyo").
El scoring ya tiene el match correcto (`isSameOrSubdomain`,
`lib/scoring/run-scoring.ts`) — la página debería reutilizar esa misma
semántica, igual que ya hace el cálculo de cuota de citas unas líneas más
arriba.

## 10 · P2 — El KPI estrella no tiene tendencia en su propia pantalla

El gauge del GEO Score no tiene sparkline ni delta en el Overview (la query
de tendencia ni siquiera selecciona `details_json`, donde vive
`geo_score.score`). La pantalla de Escaneos sí muestra score y delta por run,
y el email de alerta (Fase 6a) se dispara precisamente por variaciones de
este número — pero la pantalla donde vive el gauge no muestra su evolución.
Al corregir el hallazgo 1 conviene añadir `details_json` a la query de
tendencia (con `getEffectiveGeoScore`, ya extraído para ALERTS-1) y dar al
gauge su delta "vs. escaneo anterior".

Anotación menor relacionada: la Cuota de Citas se computa en el render solo
para el último run y no tiene historia posible. Deuda consciente; si se
convierte en KPI de retención (el email semanal de Fase 6b querrá contarla),
necesitará persistirse por run — decisión de esquema, no de esta auditoría.

## 11 · P2 — Bandas 70/40 sin recalibrar para el compuesto

El propio ADR-0008 deja las bandas del gauge (≥70 "competitivo", ≥40
"emergente") como herencia de la era mention-rate y aplaza la recalibración
"con justificación basada en datos". Con la estructura actual del compuesto
(floor de ~20 por el hallazgo 4, autoridad own-domain casi siempre baja al
principio), las etiquetas cualitativas no están validadas contra ninguna
distribución real. Cuando haya ≥10–20 proyectos con historia, recalibrar
bandas sobre la distribución observada (o percentiles) es un ADR pequeño.
No accionable hoy; queda registrado para no olvidarse.

---

## Veredicto sobre el motor de recomendaciones

Revisado el motor completo (12 tipos de card, 10 gaps del catálogo): la
arquitectura de honestidad es **notablemente buena** y es defendible ante un
cliente técnico:

- Cada card lleva `evidence_json` con los prompts afectados reales, los
  competidores/dominios observados y snippets que **solo** respaldan lo que
  la regla afirma (`snippetSource` distingue marca/competidor/ninguno — el
  detalle de que una regla sobre ausencia de cita rechace snippets de mención
  es exactamente el rigor correcto).
- Dedupe estable por gap (`dedupe_key`) con historia entre runs, sin caps
  arbitrarios (RECS-CAP-REMOVE eliminó además un "fake win" real).
- Umbrales de recurrencia (≥2 prompts) razonables para no fabricar patrones
  de una sola observación.
- Los gaps 1–8 usan solo datos capturados; nada inventado.

Los dos puntos débiles encontrados son el hallazgo 2 (frescura, falsos
positivos) y una observación menor: `severityScore` usa constantes mágicas
por regla (48, 44, ×20, ×16…) sin documento que explique la escala relativa —
funciona, pero cuando geo-strategy quiera reordenar prioridades no habrá
criterio escrito de por qué una brecha de competidor "vale" más que una de
cita. Documentarlo cuando se toque, no urge.

---

## ¿Son estos los KPIs óptimos para este producto? (respuesta directa)

**El conjunto actual — GEO Score, Tasa de mención, Cuota de Citas, Presión
Competitiva, Posición media, distribución por motor y SoV en tabla — cubre
bien la categoría y aguanta la comparación con la competencia.** Las
definiciones basadas en grounding (ADRs 0012/0013) son más honestas que el
estándar del mercado y son material de venta, no solo de ingeniería.

Lo que cambiaría, en orden:

1. **Añadir Sentimiento como KPI de cabecera** (ya capturado, no mostrado) —
   hueco evidente frente a competencia y coste casi nulo.
2. **Quitar "Confianza" de las 4 cards** (a badge del gauge) para hacerle
   sitio.
3. **Dar tendencia al GEO Score** en el Overview (es la promesa del
   producto: "tracks it over time").
4. **Promocionar SoV de tabla a señal del score** (geo-score-v2, hallazgo 4).
5. **Atacar la varianza** (hallazgo 5) antes de que las alertas por email
   (Fase 6) entrenen a los usuarios a ignorarlas.

---

## Plan de fases propuesto (pendiente de aprobación, no implementado)

| Fase | Contenido | Tipo | Riesgo |
|---|---|---|---|
| A | Fix P0 de tendencias (hallazgo 1) + limpiar `citDelta`/sparkline plano (7, 8) + `isYours` (9) | PR pequeño, frontend/query | Bajo |
| B | Card de Sentimiento sustituyendo a Confianza (6+7) + tendencia del GEO Score (10) | PR pequeño, frontend | Bajo |
| C | Frescura sin falsos positivos (2) | PR pequeño, engine | Bajo |
| D | "Oportunidades de prompts" real con datos existentes (3) | PR pequeño, frontend | Bajo |
| E | geo-score-v2: SoV como standing + recalibración de bandas + política de varianza/confianza (4, 5, 11) | **Task Intake + geo-strategy** — cambia el significado del score | Medio |

A y C son las que protegen la credibilidad ante las primeras agencias
(Fase 5 del launch plan); E es la única que necesita debate de metodología y
decisión explícita del fundador.

**Estado (2026-07-11):** plan aprobado por el fundador ("Sí"). **Fase A
implementada en este mismo PR** (tendencias descendente+reverse, `citDelta`/
`citTrend` eliminados, sparkline plano de Confianza retirado, tooltip del
fallback legacy alineado con su cálculo, `isOwnDomain` compartido para
cuota de citas y páginas citadas). Fases B–D pendientes, en PRs pequeños
separados; Fase E pendiente de Task Intake con `geo-strategy`.

**Estado (2026-07-12):** #213 (auditoría + Fase A) mergeado por orden del
fundador, que aprobó encadenar B → C → D en PRs separados. **Fase B
implementada** en el PR siguiente: card "Sentimiento de marca" (dominante +
desglose, solo sobre respuestas con la marca mencionada, sin delta ni
tendencia fabricados) sustituye a la card "Confianza" (que ya se comunica
como badge del gauge), y el gauge del GEO Score gana sparkline + delta
"vs. escaneo anterior" usando `getEffectiveGeoScore` sobre los últimos 7
runs (mismo fallback a `visibility_score` que el propio gauge, ADR-0008).

**Estado (2026-07-12, cont.):** #214 (Fase B) mergeado. **Fase C
implementada** en el PR siguiente: la heurística de año suelto de
`computeFreshnessGap` se sustituye por `findStaleYearSignal` — un año
antiguo solo cuenta como señal de desactualización cuando sigue
inmediatamente a un marcador de vigencia (`RECENCY_MARKERS`: "según datos
de", "as of", "última actualización"…); la narración histórica ("fundada
en 1975") deja de disparar la card. `STALE_PHRASES` sin cambios. Tests
actualizados (el que fijaba el comportamiento antiguo ahora fija el nuevo)
+ 2 casos nuevos. Queda la Fase D y, aparte, la Fase E (Task Intake).

**Estado (2026-07-12, cont.):** #215 (Fase C) mergeado. **Fase D
implementada** en el PR siguiente: la card "Oportunidades de prompts" del
Overview deja de ser un placeholder que prometía "próxima actualización" y
muestra la lista real — prompts del último escaneo donde la IA menciona a
un competidor y no a la marca (misma señal que usan las reglas de
competidor del motor), agregando los competidores ganadores entre motores,
con estado vacío honesto y enlace a Recomendaciones. Solo display; con la
Fase D quedan cerradas A–D. Pendiente únicamente la Fase E (geo-score-v2),
gatillada a su Task Intake con `geo-strategy`.
