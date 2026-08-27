# Auditoría externa 2026-08-26 — plan de corrección

**Origen:** `Informe_auditoria_GenScore_20260826.docx`, auditoría de producto
encargada a ChatGPT sobre una cuenta Pro real y un escaneo real de `genscore.es`
(15 prompts × 3 motores = 45 respuestas). · **Diagnóstico de por qué no lo vimos
nosotros:** `docs/agentic-blind-spots-2026-08.md`.

**Veredicto del auditor:** el núcleo de medición es defendible; el producto no
está listo para adquisición self-service de pago. Notas: propuesta de valor
8,0 · onboarding 8,5 · usabilidad 7,5 · **claridad de medición 4,0 ·
accionabilidad 4,0 · fiabilidad funcional 4,0** · preparación para pago 5,0.

Este plan cubre **todos** los apartados del informe. Cada hallazgo se ha
verificado contra el código antes de planificarse, y la verificación está
anotada: hay dos falsos positivos parciales y uno probablemente ya arreglado,
y decirlo importa tanto como arreglar el resto.

---

## 0. Estado de verificación de cada hallazgo

| ID | Hallazgo del auditor | Verificado en código | Estado |
|---|---|---|---|
| P0-01 | Score 6 en panel, 2 en Dominios, "Visibilidad 2" en notificación | `page.tsx:404` lee el compuesto `geo_score.score`; `project-workspace.ts:332` y `render.ts:88` leen `run_scores.visibility_score` | **Confirmado. Estructural.** |
| P0-02 | Competidores llama "45 prompts" a 45 respuestas | `competitors/page.tsx:219,561` — `totalResultsCount = results.length` (filas prompt×motor) rotulado "prompts" | **Confirmado.** |
| P0-03 | Recomendaciones contradictorias sobre el mismo prompt | Las recomendaciones se agregan por prompt, sin dimensión de motor en la evidencia | **Confirmado.** |
| P0-04 | Seis CTAs sin feedback ni resultado | `handleRewrite`/`handleDismiss`/`handleExport` **existen y tienen estado de carga y error** (`recommendations-client.tsx:388-422,1070`) | **No reproducible desde el código. Fase 0 lo clasifica.** |
| P0-05 | Auditoría web sin botón para iniciarla | Cierto y **deliberado**: `AUDIT-NO-BUTTON-1` (fundador, 2026-08-05) lo retiró porque la auditoría corre sola tras cada escaneo | **Confirmado, con matiz.** El fallo real es que el camino automático falló y no quedaba salida. |
| P0-06 | Precio/promo/trial discrepan entre web, FAQ y cuenta | "179" escrito a mano en ≥5 sitios: `plans-data.ts:115`, `pricing/page.tsx:34`, `session-ctas.tsx:74`, dos comparativas | **Confirmado. Estructural.** |
| P0-07 | El checker cierra un resultado positivo con copy negativo | `free-checker-result.tsx` — el panel "Con una consulta no se puede decir que no aparezcas" se renderiza **incondicionalmente** | **Confirmado. Arreglo barato.** |
| P0-08 | Pro anuncia diario; la consola dice que no se repetirá | `/pricing` promete "Diario"; `recurring_scans_enabled` nace `false` (`cron.ts:255`), y el banner es correcto respecto a ese `false` | **Confirmado.** Contradicción producto↔promesa, no bug. |
| P0-09 | "Fuente que cita a un rival" sobreafirma | `aggregate-citations.ts:39-48` — `competitors` son los rivales nombrados **en la respuesta** donde se citó la página, no en la página | **Confirmado. Semántico.** |
| P1-01 | Pestaña de escaneo clavada en "finalizando" | `ANIMATION-PARITY-1` (#482, 2026-08-27) movió el sondeo y el `router.refresh()` al propio `ScanMissionRocket` en las 6 pantallas | **Probablemente ya arreglado tras la auditoría. Verificar, no reimplementar.** |
| P1-02 | ChatGPT sugerido como competidor; "GEO Score" como alias | No existe ninguna lista de términos genéricos en `lib/competitors/` ni en `lib/brand-aliases/` | **Confirmado.** |
| P1-03 | La tabla por motor de Competidores omitió Claude | `engine-share.ts:69-81` — `filterComparableEngines` elimina el motor donde nadie fue mencionado. **Deliberado** (no inventar un 0) | **Confirmado, con matiz.** La honestidad es correcta; la lectura resultante es falsa. |

**Los dos matices importan para el alcance.** P0-05 y P1-03 no son código
descuidado: son dos decisiones nuestras, bien razonadas, cuyo efecto de
superficie es peor que el problema que evitaban. Se revierten con premisa
escrita, no se "arreglan".

---

## 1. Orden de las fases

El criterio no es la severidad del informe, es **qué desbloquea el lanzamiento**.
Un número contradictorio destruye la confianza en todo lo demás, así que va
primero; un motor nuevo no la construye, así que va fuera del camino crítico.

| Fase | Nombre | Cubre | Tamaño | Bloquea lanzamiento |
|---|---|---|---|---|
| 0 | `AUDIT-REPRO-1` | P0-04 (clasificar), correcciones D y E | 1-2 días | Sí — sin esto la Fase 3 no se puede planificar |
| 1 | `TRUST-METRICS-1` | P0-01, P0-02, P1-03, correcciones A y B | 3-5 días | **Sí** |
| 2 | `TRUST-PROMISES-1` | P0-06, P0-08, correcciones F y G | 3-4 días | **Sí** |
| 3 | `ACTIONS-OBSERVABLE-1` | P0-04, correcciones C y H | 4-6 días | **Sí** |
| 4 | `AUDIT-RUNNABLE-1` | P0-05 | 2-3 días | **Sí** |
| 5 | `CHECKER-COPY-1` | P0-07 | 1 día | **Sí** (es el punto de conversión) |
| 6 | `RECS-EVIDENCE-2` | P0-03 | 3-4 días | Sí |
| 7 | `CITATIONS-HONESTY-1` | P0-09 | 2-3 días | Sí |
| 8 | `ENTITY-HYGIENE-1` | P1-02 | 2 días | No |
| 9 | `SCREEN-POLISH-1` | P1/P2 del §6 del informe | 2-3 días | No |
| — | Diferenciadores 7-12 semanas | §10 del informe | — | **No.** Explícitamente fuera. |

**Máximo 3 PRs abiertos a la vez** (`BUILD-BUDGET-1`). Las fases 1, 2 y 5 son
independientes entre sí y pueden ir en paralelo; 3 depende de 0; 4 depende de
diagnosticar por qué la auditoría técnica quedó en N/A.

---

## Fase 0 — `AUDIT-REPRO-1`: reproducir antes de arreglar

**Problema.** El hallazgo peor puntuado del informe (fiabilidad funcional 4,0)
descansa en seis CTAs que "no dieron feedback". El código dice que tienen estado
de carga, estado de error y efecto. **No podemos planificar la Fase 3 sin saber
cuál de las tres explicaciones posibles es la verdadera**, y las tres piden
arreglos distintos:

1. `router.refresh()` tarda segundos sin acuse de recibo → el arreglo es
   feedback optimista, no un bug de backend.
2. El resultado aparece dentro de un panel plegado o fuera de viewport → el
   arreglo es dónde se pinta, no si funciona.
3. La descarga del `.md` la bloquea el navegador agéntico en silencio → **falso
   positivo del entorno de auditoría**, pero real para cualquier usuario con el
   mismo bloqueo, así que pide una salida alternativa igualmente.

**Entregables.**
- `tests/pilot/journeys/write/recommendation-actions.spec.ts`: sobre el proyecto
  reservado (`PILOT_WRITE_DOMAIN`, una prompt, coste ~1 llamada), ejercita las
  seis acciones y **exige un efecto observable en el DOM** para cada una, con
  captura antes/después y el tiempo hasta el efecto.
- Bandera `--journeys actions` y su cerradura en el self-check (el set por
  defecto no puede alcanzar estos ficheros, igual que con `--journeys scan`).
- Informe de clasificación de las seis: real / invisible / falso positivo del
  entorno, con la captura que lo demuestra.
- `CLAUDE.md`: la regla de premisa (Corrección E) y la regla de cobertura no
  vista en el informe de piloto (parte de H).

**Criterio de aceptación.** Cada una de las seis acciones tiene un veredicto con
evidencia. Ninguna queda como "no sabemos".

---

## Fase 1 — `TRUST-METRICS-1`: un solo número, con su denominador (P0-01, P0-02, P1-03)

**Problema.** El producto publica hoy cuatro cifras distintas para la misma
realidad y llama "prompts" a dos unidades distintas. Es el hallazgo que hunde
"claridad de medición" a 4,0 y contamina todo lo demás: si el score no es
estable, ninguna recomendación es creíble.

**Decisión de producto — TOMADA por el fundador el 2026-08-27.** Hay **una sola
puntuación GEO en todo el producto, y es la puntuación con ventana**
(`SCORE-WINDOW-1`, ADR 0036). Dominios, la notificación y cualquier superficie
que publique una puntuación leen ese mismo valor. La visibilidad sigue
existiendo, pero sólo como componente etiquetado dentro del desglose: nunca
sola, nunca con aspecto de score.

Donde antes se iba a decir "puntuación de este escaneo", el copy pasa a
**"Escaneo actualizado"** seguido de la puntuación con ventana ya actualizada.
Es lo que evita la mentira sin partir el número en dos: la notificación no
afirma que ése sea el resultado del escaneo que acaba de terminar, afirma que
el escaneo ha movido la puntuación — que es lo que de verdad ha pasado.

**SCORE-WINDOW-1 queda EXPLÍCITAMENTE FUERA DE ALCANCE.** No se toca la
mediana, ni el tamaño de ventana, ni `MIN_RUNS_FOR_WINDOW`, ni las reglas de
comparabilidad. Resuelve un problema distinto — la varianza irreducible de la
recuperación en vivo, que `temperature: 0` no controla — y lo resuelve bien.
Se anota aquí porque "unificar la puntuación" se puede leer como "quitar el
suavizado", y una sesión futura lo leería así.

**Corolario que cambia el criterio de aceptación del auditor.** El informe pide
que "un mismo `scan_id` devuelva un score idéntico en cinco superficies". Con
ventana eso es imposible **y no debe perseguirse**: la ventana es una mediana
sobre K runs, no una propiedad de un `scan_id`. El criterio correcto es el de
abajo: una sola cantidad publicada bajo la etiqueta "Puntuación GEO", y
`visibility_score` jamás publicado bajo ella.

*(Nota sobre lo que vio el auditor: tenía un solo escaneo completado, y la
ventana necesita dos para publicar. El 6 que vio era el compuesto de su run,
no la mediana — el suavizado ni siquiera estaba activo en su sesión. El 6
contra 2 es enteramente confusión compuesto↔visibilidad.)*

**Tres consecuencias que esta decisión arrastra y que no son copy.**

1. **El primer escaneo no tiene ventana.** `MIN_RUNS_FOR_WINDOW` es 2, y ése es
   exactamente el momento en que se dispara la notificación y en que Dominios
   enseña su primer número. Se mantiene la caída actual al compuesto del run,
   con la misma etiqueta — es la mejor estimación disponible y no inventa nada —
   pero el marcador de fiabilidad que ya existe pasa a ser **obligatorio**
   mientras no haya ventana, para que el salto al llegar el segundo escaneo esté
   anunciado antes de ocurrir.
2. **`getWorkspaceCounters` sólo guarda dos runs por proyecto**
   (`lib/project-workspace.ts:332-340`) y la ventana necesita tres. Dominios
   lista varios proyectos, así que es una consulta por proyecto, no una global:
   hay que medir su coste antes de subir el límite.
3. **La notificación se compone en `executor.ts:1066` con `visibilityScore` en
   el payload.** Hay que meter el valor de ventana ahí — es computable en ese
   instante, porque el run recién escrito es el más reciente — y dejar un
   fallback para las filas históricas cuyo payload sólo lleva visibilidad.

**Cuarta superficie, ausente del informe del auditor:**
`lib/scan/weekly-digest.ts` también publica `visibility_score`. Entra en el
alcance de esta fase por el mismo argumento que las otras cuatro.

**Excepción acotada: la pantalla de detalle de un escaneo** (`/runs/[runId]`).
El fundador la dio por no visible para el usuario final; **sí lo es**: se llega
desde el botón "Ver detalle del escaneo" de dos estados vacíos, en Páginas
citadas (`citations/page.tsx:220`) y en Recomendaciones
(`recommendations/page.tsx:701`). Como trata de un run concreto por definición,
la salida es que **hable de "este escaneo" y no llame "Puntuación GEO" a nada**,
en lugar de retirar los dos enlaces — que son la única salida de esos dos
estados vacíos.

**Entregables.**
- `lib/metrics/run-metrics.ts` — módulo único, sin I/O, dueño de: `geoScore`,
  `visibilityScore`, `promptCount`, `answerCount`, `engineCount`,
  `mentionRateByAnswer` (1/45), `promptCoverage` (1/15), `citationRate`, cada uno
  con `label` y `denominatorLabel` propios. Ninguna pantalla vuelve a calcular un
  porcentaje.
- Migración de las superficies: Visión general, Dominios, Prompts, Competidores,
  notificaciones, resumen semanal y detalle de escaneo. Y de la exportación,
  cuando exista (Fase 3, `ACTIONS-OBSERVABLE-1`).
- **Todo porcentaje se publica con su denominador al lado**: "2 % de respuestas
  (1/45)", "7 % de prompts (1/15)". Sin excepción.
- Competidores: `results.length` deja de rotularse "prompts" → "45 respuestas
  (15 prompts × 3 motores)".
- P1-03: la tabla por motor pasa a listar **todos los motores del escaneo**, con
  el 0 explícito y su denominador real ("0 de 15 respuestas de Claude"). Se
  retira `filterComparableEngines` del render. El principio que la creó — no
  inventar un 0 para un motor que no corrió — se conserva: un motor sin filas
  sigue sin salir; lo que cambia es que un motor que corrió y dio cero **sí**
  sale, porque ocultarlo es lo que miente.
- `tests/metric-contract.test.ts`: test a nivel de fuente, mismo patrón que
  `tests/mission-parity.test.ts`, que falla si una pantalla calcula un
  porcentaje fuera del módulo o publica uno sin denominador.
- Aserción cruzada en el piloto: el score de Dominios == el de Visión general
  para el mismo proyecto (Corrección B).

**Criterio de aceptación.** Reformulado respecto al del informe, por lo dicho
arriba sobre la ventana:

- Toda superficie que publique la etiqueta "Puntuación GEO" muestra **la
  puntuación con ventana**, o su caída documentada al compuesto del run cuando
  aún no hay ventana — nunca `visibility_score`. 100 %.
- `visibility_score` no aparece jamás fuera del desglose de componentes, ni bajo
  ninguna etiqueta que contenga "Puntuación GEO". 0 excepciones.
- Todo porcentaje se publica con su denominador. 0 excepciones.
- Ninguna pantalla calcula un porcentaje fuera de `lib/metrics/run-metrics.ts`,
  y `tests/metric-contract.test.ts` lo comprueba a nivel de fuente.

---

## Fase 2 — `TRUST-PROMISES-1`: una sola fuente de precio y capacidad (P0-06, P0-08)

**Problema.** Precio, promo, duración de prueba y límites viven escritos a mano
en cinco sitios; y la cadencia prometida en `/pricing` ("Diario" en Pro) no es la
que el producto hace por defecto (`recurring_scans_enabled = false`).

**Decisión de producto necesaria (tuya):** para P0-08, dos salidas.

- **(a) Recomendada — el producto cumple la promesa.** Un proyecto de plan de
  pago nace con `recurring_scans_enabled = true`. El banner "Tu análisis de hoy
  no se repetirá" deja de salir a quien paga, porque deja de ser verdad. Requiere
  comprobar el coste: un Pro con 100 prompts × 3 motores × diario es la línea que
  hay que mirar contra `docs/llm-cost-analysis-2026-08.md` antes de decidir.
- (b) La promesa se ajusta al producto: `/pricing` dice "diario, activable desde
  el proyecto". Es honesto, gratis y peor comercialmente.

En ambos casos, allá donde se afirme una cadencia se muestra **la próxima
ejecución con fecha**, no un adjetivo.

**Entregables.**
- `lib/plans/catalog.ts` — fuente única: `id`, `price`, `promoPrice`,
  `promoEndsAt`, `trialDays`, `promptCap`, `domainCap`, `engines`, `cadence`.
- Portada, `/pricing`, FAQ pública, docs, Ajustes y checkout leen de ahí.
  Las comparativas también, o declaran explícitamente que citan un precio
  histórico con fecha.
- `tests/promise-parity.test.ts`: falla si un precio, un tope o una cadencia
  aparece como literal fuera del catálogo.
- Agente `product-auditor` (Corrección G) y su primera pasada mensual.

**Criterio de aceptación.** Home, pricing, FAQ, checkout y cuenta leen la misma
configuración. 0 divergencias.

**Nota comercial fuera de alcance de ingeniería.** El informe cuestiona el
precio de lista de 179 €/mes frente a Otterly Standard (189 $/100 prompts, 7
motores) y Semrush AI Visibility (99 $), y sugiere sostener Pro en 79-99 € hasta
alcanzar paridad operativa, reservando 179 € para un plan con cinco dominios,
equipos e informes. **Es una decisión tuya y no la incluyo en ninguna fase.** Lo
que sí incluyo: cuando la tomes, se toca un fichero.

---

## Fase 3 — `ACTIONS-OBSERVABLE-1`: ninguna acción silenciosa (P0-04)

**Alcance definido por la Fase 0.** Lo que sigue es el marco; el reparto exacto
sale de la clasificación.

**Entregables.**
- **Contrato de acción, aplicado a las seis**: toda acción del producto termina
  en uno de tres estados visibles — éxito con acuse, error con mensaje propio
  categorizado, o carga con progreso. Nunca en nada. Se aplica en el componente
  compartido, no seis veces.
- Exportar plan: además de la descarga, **salida alternativa** (modal con el
  markdown y copiar al portapapeles) para cualquier entorno donde la descarga
  esté bloqueada. Hoy un bloqueo silencioso es indistinguible de un botón muerto.
- Marcar como hecho: acuse explícito y **deshacer**. Hoy la fila desaparece, que
  es un efecto real pero se lee como un fallo.
- Generadores (FAQ, brief, comparativa): el resultado se pinta **donde se ve**,
  no dentro de un panel plegado, y el botón no desaparece antes de que haya algo
  que enseñar.
- Lo que la Fase 0 encuentre roto de verdad y no quepa en este slice **se oculta
  tras bandera de beta cerrada** en vez de quedarse mudo en producción. Es la
  recomendación explícita del informe y la comparto.
- Corrección C (`--journeys full` semanal) y H (cobertura no vista como salida
  del piloto).

**Criterio de aceptación.** FAQ, brief, comparativa, exportación y marcar hecho
terminan en éxito o error visible. 100 % E2E.

---

## Fase 4 — `AUDIT-RUNNABLE-1`: la auditoría web tiene salida (P0-05)

**Dos trabajos, y el segundo es el importante.**

1. **Diagnóstico:** por qué el componente técnico quedó en N/A tras un escaneo
   real, si `AUDIT-AFTER-SCAN-1` la dispara sola. Sin esta respuesta, devolver el
   botón sólo tapa el síntoma.
2. **Camino de recuperación:** devolver un "Auditar ahora" explícito. **Esto
   revierte una decisión tuya** (`AUDIT-NO-BUTTON-1`, 2026-08-05) y por eso no se
   toca sin tu visto bueno en este mismo plan. El argumento para revertir: el
   botón sobraba mientras el camino automático funcionase siempre, y hemos visto
   que no. La entrada de histórico tiene que registrar la premisa, no sólo la
   decisión (Corrección E).
3. Progreso visible, resultado explicado, y el componente técnico del GEO Score
   dejando de ser N/A tras ejecutarla.

**Criterio de aceptación.** Un usuario inicia el job, ve progreso, recibe
hallazgos y actualiza el score técnico. p95 < 5 min.

---

## Fase 5 — `CHECKER-COPY-1`: el aviso deja de contradecir al resultado (P0-07)

**Problema.** Verificado: el panel "Con una consulta no se puede decir que no
aparezcas — sólo que en ésta no apareciste" se renderiza siempre, incluso tras un
resultado positivo con cita del propio dominio. En el punto exacto de conversión,
el producto se desmiente a sí mismo.

**Entregables.** Dos variantes del aviso, ambas honestas — la de resultado
negativo tal cual está, y una de resultado positivo ("una respuesta favorable no
garantiza que se repita: los motores no son deterministas") — más el CTA
adecuado a cada caso. Test unitario del copy condicional sobre los dos
resultados, más una pasada del piloto sobre un dominio que aparece y uno que no.

**Criterio de aceptación.** El copy positivo/negativo coincide con el resultado y
con su CTA. 100 % de los casos. Es la fase más barata del plan y toca el momento
de mayor valor comercial: **si sólo se hiciera una cosa esta semana, sería ésta.**

---

## Fase 6 — `RECS-EVIDENCE-2`: cada acción dice de qué motor habla (P0-03)

**Entregables.**
- Toda recomendación lleva `prompt`, `motor`, `fecha`, `evidencia`, `competidor`
  y respuesta objetivo. La ausencia de la dimensión de motor es la causa directa
  de que dos acciones sobre el mismo prompt parezcan contradecirse.
- Agrupación de acciones equivalentes: 22 recomendaciones con duplicados es
  ruido, no plan.
- El impacto se calcula sobre **respuestas concretas**, no sobre un prompt
  abstracto, y la suma de la cabecera ("hasta +14 puntos") es auditable contra
  las tarjetas visibles — el informe encontró +11 y +4 bajo un titular de +14.

**Criterio de aceptación.** Toda acción incluye prompt, motor y evidencia, y no
duplica otra. >95 % sin duplicado.

---

## Fase 7 — `CITATIONS-HONESTY-1`: decir sólo lo que se ha comprobado (P0-09)

**Entregables.**
- Renombrar la afirmación a lo que de verdad se ha medido: no "fuente que cita a
  un rival", sino "fuente citada en una respuesta donde también apareció X". Es
  más largo y es lo único cierto sin abrir la página.
- Tres estados distintos, como pide el informe: fuente citada; fuente que
  menciona a un competidor **verificado a nivel de página**; fuente alcanzable
  para outreach.
- **No recomendar "consigue que esta web te mencione" hasta verificar el
  contenido de la página.** Hoy lo recomendamos sin haberla leído.
- Priorización mínima de las 240 URLs: agrupar por dominio, con frecuencia,
  motor y consultas asociadas. La relevancia editorial completa (`relevance_score`
  frente a sector y mercado) es de la fase de diferenciación, no de ésta.

---

## Fase 8 — `ENTITY-HYGIENE-1` (P1-02)

Lista de términos genéricos y reglas de entidad para que ni "ChatGPT" se sugiera
como competidor ni "GEO Score" como alias de marca. Falso positivo barato de
evitar y caro de dejar: contamina competidores, SOV y recomendaciones a la vez.

---

## Fase 9 — `SCREEN-POLISH-1` (P1/P2 del §6 del informe)

"Topics" → "Temas". Sentimiento en N/A cuando la marca no aparece (hoy dice
positivo, que es afirmar sobre algo que no ocurrió). Filas clicables como
botones accesibles. Onboarding que arranca en 15 prompts en vez de generar 10 y
recomendar 15 acto seguido. Definiciones visibles de prominencia, share of voice
y posición media. Rankings ordenables.

---

## 2. Verificación de P1-01 (no es una fase)

El informe describe la pestaña de escaneo clavada en "finalizando" mientras otra
pestaña ya mostraba resultados. `ANIMATION-PARITY-1` (#482, mergeado el
2026-08-27, **un día después de la auditoría**) movió el sondeo y el
`router.refresh()` al propio `ScanMissionRocket` en las seis pantallas, por esta
misma razón. **Se verifica con una pasada de piloto antes de tocar nada.** Si
sigue ocurriendo, entra como fase propia; si no, se anota como cerrado en el
histórico con la referencia cruzada.

---

## 3. Fuera de alcance para el lanzamiento

Lo que el informe sitúa a 7-12 semanas y **no** entra en el camino crítico:
Perplexity, Google AI Overviews y AI Mode; investigación de demanda con índice
de consultas; integración GSC/GA4; equipos, roles, white label y portal de
cliente; API/MCP; atribución de tráfico; análisis de narrativa y alucinaciones;
metodología versionada con pesos y umbrales publicados.

Tres de ellos son la brecha competitiva real (cobertura de motores, investigación
de demanda, atribución) y merecen su propio Task Intake después del lanzamiento.
Ninguno arregla la confianza, que es lo que hoy bloquea cobrar.

---

## 4. Cierre documental

Cada fase cierra en su propio PR con: entrada en
`docs/brand/design-decisions-log.md` (a partir de §169), actualización de la
regla de ruta de su zona si establece un invariante, y la celda "Última fase
cerrada" del `Mapa de zonas` de `CLAUDE.md`. Las fases 0, 1, 2 y 3 tocan además
`docs/agentic-user-pilot.md` y `CLAUDE.md`, por las correcciones de método.
