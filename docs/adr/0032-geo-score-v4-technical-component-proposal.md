# ADR 0032 — GeoScore v4: componente técnico y plan de reducción de varianza (propuesta)

- **Estado:** **propuesta — NO implementada, no aprobada**
- **Fecha:** 2026-08-05
- **Fase:** GEO-SCORE-V4 (análisis solicitado por el fundador el 2026-08-05)
- **Decide:** nada todavía. Inventaría **todas las variables que hoy influyen en
  el GeoScore**, ordena las fuentes de varianza escaneo-a-escaneo por impacto,
  y propone un plan por fases para (1) reducir esa varianza y (2) incorporar la
  nota de auditoría técnica al GeoScore como componente importante — con las
  decisiones abiertas señaladas, no resueltas en silencio.

> `.claude/rules/scoring.md`: *"Ninguna fórmula se toca sin un ADR nuevo."*
> Este documento es ese ADR en fase de propuesta. El PR que lo introduce toca
> únicamente `docs/` y la celda del mapa de zonas. Ni un peso, ni una banda,
> ni un componente cambian aquí.

---

## 1 · Petición del fundador (2026-08-05)

1. Análisis completo de todas las variables que influyen en el GeoScore.
2. **Prioridad: minimizar la variabilidad escaneo-a-escaneo** — se han visto
   saltos de ~30 pt entre escaneos consecutivos y eso resta credibilidad.
3. Incorporar la **nota de auditoría técnica** dentro del GeoScore **de manera
   importante**: la adaptación técnica a los motores de IA es condición para
   que el resto de mejoras funcione.

---

## 2 · Inventario: qué compone hoy el GeoScore

Fórmula v3 (`lib/scoring/run-scoring.ts`, `COMPOSITE_VERSION = "geo-score-v3"`,
ADR 0015 + 0026). Cuatro componentes 0–100, media ponderada con
**renormalización** cuando falta alguno:

| Componente | Peso base | Qué mide | De dónde sale |
|---|---|---|---|
| `presence` | 0.40 | Tasa de mención: filas con `brand_mentioned` / total de respuestas | Mención **verificada** (ADR 0021) con alias (ADR 0025) |
| `prominence` | 0.25 | Rango medio **cuando se menciona**, normalizado por nº de entidades (ADR 0026) | `extracted_json.brand.position`; se cae si hay <10 menciones o extracción no confiable |
| `standing` | 0.20 | Share of Voice real: menciones de marca / (marca + competidores) | Recuentos de mención (ADR 0015) |
| `authority` | 0.15 | Citas de dominio propio / respuestas con grounding | Sólo motores con grounding (Gemini, OpenAI); Claude no computa aquí |

**No influyen hoy en el score:** el sentimiento (sólo distribución
informativa), `competitor_gap_score` (alimenta recomendaciones), y **la
auditoría técnica** — `readiness_score` vive en `web_audit_snapshots` y sólo
entra en el "Diagnóstico general" de la pantalla de auditoría
(`buildGlobalScore`), que no se persiste ni sale de esa pantalla.

**Todo lo que mueve esos cuatro números aguas arriba:**

- **Muestra** (ADR 0030): unidad = `(run, prompt, motor, muestra)`; suelo de
  50 respuestas con hasta 5 repeticiones por prompt; las muestras se
  **agrupan**, no se promedian por prompt. Free queda fuera del suelo (D1).
- **Motores**: `gemini, claude, openai` en producción (3 en planes de pago,
  1 en Free). Un prompt se da por bueno **si al menos un motor responde**; un
  motor caído no escribe fila y encoge el denominador en silencio.
- **Extracción** (ADR 0029): sin tope de filas; reintentos acotados y errores
  categorizados. Una fila con `extraction_version` antigua tumba
  `prominence` y `standing` del run entero; una fila con error de extracción
  puntúa con su `brand_mentioned` ingenuo (sin alias, sin verificar).
- **Capa de fiabilidad** (ADR 0024 + DELTA-GUARD-1): suelo de 10 respuestas
  para banda y delta, margen de Wilson, `compareRuns` rehúsa comparar runs con
  distinta versión, distinto set de motores, distintos `inputs_used` o
  distinto nº de respuestas. **Sólo protege el delta y la banda: el score en
  sí siempre se publica.**

---

## 3 · Fuentes de varianza escaneo-a-escaneo, por impacto

Ordenadas por lo que mueven, con los números ya medidos en
`docs/geo-score-variability-2026-08.md`:

| # | Fuente | Magnitud medida | Estado |
|---|---|---|---|
| V1 | **Identidad de marca / alias** — "Firefox" no casaba con "Mozilla"; el 74 habría sido un 0 | ±44 pt (el caso del fundador) | Mitigada (ADR 0025) · **hueco −1c**: los alias mueven el score y no tienen UI · **hueco −1b**: la marca compite consigo misma en posición/SoV |
| V2 | **Tamaño de muestra** — una respuesta de IA movía 23,8 pt con n=3; 0,24 pt con n=300 | Suelo 50 → margen ~±13 pp (antes ±18) | Mitigada (ADR 0030) · Free sigue exento · reducir a la mitad exigiría ~120 respuestas |
| V3 | **Amplificación / doble conteo** — la tasa de mención llegaba al compuesto a 0,71× en vez de 0,40× | +47 pt por +67 pp de mención | Parcialmente corregida (ADR 0026) · **el ratio no se ha vuelto a medir**; es la pregunta 1 de ADR 0031 |
| V4 | **Mezcla de motores y fallos parciales** — la misma realidad da 71,67 (4 componentes) o 84,31 (sólo Claude, sin `authority`) por la renormalización | ~±12 pt por caída de componente | Sin corregir: `compareRuns` suprime el delta pero el score saltado se publica igual |
| V5 | **Caídas de componente intermitentes** — `extraction_version` antigua o `prominence` rozando su suelo de 10 menciones hacen entrar/salir componentes entre runs consecutivos | Misma mecánica que V4 | Sin corregir |
| V6 | **No determinismo del retrieval** — `temperature: 0` no controla lo que Google Search / `web_search` devuelven en cada llamada; y `gemini-2.5-flash` es alias flotante (viola ADR 0002, reintroducido por ADR 0009) | Irreducible en origen; sólo se amortigua con muestra y ventana | Sin corregir |
| V7 | **Titulares de grounding contados como menciones** — pendiente verificar si entran en `raw_response_text` | Desconocida | Pregunta abierta (informe de variabilidad §2) |

Lectura honesta: **la fórmula no puede eliminar V6**. Con retrieval vivo, dos
escaneos idénticos ven internet distinto. Todo lo demás sí es accionable.

---

## 4 · Plan propuesto, por fases

### Fase A — sin tocar la fórmula (primero, y desbloquea todo lo demás)

1. **Ejecutar la medición de ADR 0031** en cuanto el conjunto válido llegue a
   ~30 runs sobre ≥8 proyectos (sólo runs desde el 2026-08-05). Sin esto no
   hay recalibración ni v4 defendibles.
2. **Fase −1c: UI de alias.** El riesgo asumido en ADR 0025 sigue sin mitigar;
   es la fuente de "número equivocado" (peor que número inestable) más grande
   que queda.
3. **Fase −1b: dedupe de entidades de la misma marca** en posición y SoV.
4. **Verificar V7** (titulares de grounding) con los datos ya persistidos.
5. **Pin del modelo Gemini a id versionado** (restaurar ADR 0002).

### Fase B — política de cobertura de motores (ADR propio, sin tocar pesos)

Hoy un fallo transitorio de proveedor reescala la medición sin avisar (V4).
Propuesta a diseñar: cuando el set de motores efectivo de un run difiere del
esperado por el plan, el run se marca **parcial** — el score se publica con esa
marca visible y nunca entra como línea base de alertas ni comparaciones. Es
extender a la superficie lo que `compareRuns` ya sabe. Alternativa más dura
(reintentar el run entero antes de puntuar) descartada por coste.

### Fase C — GeoScore v4: el componente técnico (el cambio de fórmula)

**Propuesta:** quinto componente `technical` = `readiness_score` del snapshot
de auditoría ligado al mismo run (`web_audit_snapshots.scan_id = run_id`).

Por qué encaja con la prioridad de estabilidad, además de con la tesis del
fundador: `readiness_score` es **determinista** — cero LLM en su cálculo
(`lib/web-audit/page-checks.ts`), misma web → misma nota salvo cambio real.
Un componente determinista con peso w reduce mecánicamente la varianza del
compuesto ≈ w, encima de las mejoras A/B.

**Peso:** el envelope razonado es **0.15–0.25** ("importante sin dominar":
`presence` debe seguir siendo el mayor peso, porque un GeoScore alto con la
marca invisible en las respuestas sería fake product behavior). **El número
exacto no se propone aquí**: se fija en el mismo ejercicio de calibración de
ADR 0031, para que haya **una sola frontera de versión** (`geo-score-v4`) y no
dos. Cambiar medición y pesos por separado en dos saltos duplicaría el coste
que ADR 0024 ya impone: ningún delta cruza una frontera de versión.

**Decisiones de diseño que el Task Intake de la Fase C debe cerrar:**

1. **Timing.** La auditoría corre *después* del run (ADR 0027; con reintentos,
   hasta ~12,5 h). Opciones: (a) puntuar sin `technical` y **re-puntuar** al
   llegar el snapshot (un update idempotente de `run_scores.details_json`, con
   el score marcado provisional entre medias); (b) usar el último snapshot
   previo del proyecto. Recomendación: (a) — (b) puntúa el run con una foto de
   otra web si hubo deploy entre medias.
2. **Planes sin auditoría.** La auditoría es Pro-gated: en Free/Starter el
   componente caería siempre y la renormalización haría que un score Free y
   uno Pro **no midan lo mismo** — exactamente la discontinuidad V4/V5 que
   queremos reducir. Hay que decidir: extender una auditoría acotada a todos
   los planes (coste: es fetch + regex, sin LLM en el cálculo técnico), o
   aceptar y etiquetar la asimetría. Recomendación: extender; el coste
   marginal es bajo precisamente porque no hay LLM.
3. **Estabilidad del propio componente.** La nota técnica es determinista pero
   su **conjunto de páginas** no es fijo (candidatas del coverage map y de
   citas del último scan, `MAX_AUDIT_PAGES = 10`, saltos por presupuesto de
   25 s). Para que el componente estabilice en vez de importar varianza nueva:
   persistir y reutilizar el page-set entre auditorías salvo cambio real del
   sitio, y excluir del score las páginas saltadas por presupuesto (ya se
   hace).
4. **Objeción registrada, tratada de frente.** El histórico ya decidió no
   mezclar técnica con resultado en dos sitios: log §17 decisión 4 (las
   proyecciones de puntos nunca sobre el score global "que mezcla contenido no
   controlable con técnica") y log §22 (la nota técnica a una columna del
   GeoScore "se lee como una segunda puntuación"). Este ADR propone lo
   contrario **a sabiendas y por decisión de producto del fundador**: el
   GeoScore pasa de medir *resultado observado* a medir *resultado +
   preparación*. El coste semántico se paga con transparencia: el desglose por
   componentes tiene que ser visible donde se muestre el score, para que
   "subió porque arreglaste la web" y "subió porque las IAs te citan más" sean
   distinguibles. Si el fundador prefiere no pagar ese coste, la alternativa
   es un índice combinado *junto al* GeoScore, no dentro — queda listada para
   que la decisión sea consciente, no por omisión.

### Fase D — opcional, el mayor amortiguador de V6: score de ventana

Publicar como cifra principal una media de ventana (últimos K runs
comparables, con el per-run como detalle). Es la única palanca real contra el
no determinismo del retrieval, y la propuesta 2 de la auditoría de julio que
nunca se implementó (ADR 0026 sólo rechazó suavizar el *gráfico de rangos*,
no el score). Coste: el número principal reacciona más lento a cambios
reales. Necesita su propio ADR y decisión de producto; no bloquea A–C.

---

## 5 · Lo que este ADR NO hace

- No cambia ningún peso, componente, banda ni umbral. El PR toca sólo `docs/`
  y la celda del mapa de zonas.
- No fija el peso del componente técnico: eso exige los datos de ADR 0031.
- No toca la capa de fiabilidad (ADR 0024): margen, suelos y `resolveDelta`
  siguen obligatorios con cualquier fórmula.

## 6 · Criterio de aceptación

Este ADR pasa a `aceptado` sólo con: aprobación explícita del fundador del
plan por fases (§4), y — para la Fase C — los datos de ADR 0031, el peso
concreto propuesto con su simulación sobre proyectos reales (cuántos cambian
de banda y en qué dirección), y las cuatro decisiones de diseño cerradas en su
Task Intake.

## Referencias

ADR 0015 (composite v2) · ADR 0021/0025 (mención verificada y alias) ·
ADR 0024 (fiabilidad) · ADR 0026 (posición condicionada) · ADR 0027
(auditoría post-scan) · ADR 0029 (extracción) · ADR 0030 (suelo de muestra) ·
ADR 0031 (calibración, propuesta) · `docs/geo-score-variability-2026-08.md` ·
`docs/geo-methodology-audit-2026-07.md` · log §8b, §17, §20, §22, §23, §25.
