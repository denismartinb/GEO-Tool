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
| P0-08 | Pro anuncia diario; la consola dice que no se repetirá | `/pricing` promete "Diario"; `recurring_scans_enabled` nace `false` (`cron.ts:255`) | **Confirmado, y resuelto para altas nuevas** por PROJECT-DEFAULTS-BY-ACCOUNT-1 (se enciende al completarse el primer escaneo). Sigue abierto para los proyectos ya existentes. |
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
| 0 | `AUDIT-REPRO-1` | P0-04 (clasificar), correcciones D y E | 1-2 días | Sí — sin esto la Fase 4 no se puede planificar |
| 1 | `TRUST-METRICS-1` | P0-01, P0-02, P1-03, correcciones A y B | 5-7 días | **Sí** |
| 2 | `TRUST-PROMISES-1` | P0-06, P0-08, correcciones F y G | 2-3 días | **Sí** |
| 3 | `RECURRING-VALUE-1` | "histórico verificable", alertas, calendario | 3-4 días | **Sí** |
| 4 | `ACTIONS-OBSERVABLE-1` | P0-04, correcciones C y H | 4-6 días | **Sí** |
| 5 | `AUDIT-RUNNABLE-1` | P0-05 | 2-3 días | **Sí** |
| 6 | `CHECKER-COPY-1` | P0-07 | 1 día | **Sí** (es el punto de conversión) |
| 7 | `RECS-EVIDENCE-2` | P0-03 | 3-4 días | Sí |
| 8 | `CITATIONS-HONESTY-1` | P0-09 | 2-3 días | Sí |
| 9 | `ENTITY-HYGIENE-1` | P1-02 | 2 días | No |
| 10 | `SCREEN-POLISH-1` | P1/P2 del §6 del informe | 2-3 días | No |
| — | Diferenciadores 7-12 semanas | §10 del informe · tabla «1 bis» | — | **No.** Explícitamente fuera. |

**Máximo 3 PRs abiertos a la vez** (`BUILD-BUDGET-1`). Las fases 1, 2 y 6 son
independientes entre sí y pueden ir en paralelo; 4 depende de 0; 3 depende de 2
(su calendario sale de ahí); 5 depende de diagnosticar por qué la auditoría
técnica quedó en N/A.

---

## 1 bis. Las capacidades que el auditor considera necesarias para cobrar

Segunda tanda de material (capturas "Lo necesario para poder cobrar",
2026-08-27). Se recoge entera **con una columna añadida**: qué dice el código,
porque tres de las diez filas describen algo que ya existe y que su sesión no
podía ver.

| Capacidad | Lo que dice el auditor | Verificado | Dónde cae |
|---|---|---|---|
| Seguimiento recurrente | No pudo confirmar ejecuciones diarias, próxima fecha ni histórico | **Cierto.** `recurring_scans_enabled` nace `false` | Fase 2 + Fase 3 |
| Histórico y evolución | "Sólo existe la fotografía del escaneo actual" | **Falso sobre el producto**: sparkline, delta con guardas, tendencia de SoV y digest semanal existen. Cierto sobre su sesión: tenía un escaneo | Fase 3 |
| Métricas fiables | Score 6, score 2 y visibilidad 2 para el mismo análisis | **Cierto y estructural** | Fase 1 |
| Auditoría ejecutable | Pantalla sin botón para iniciarla | **Cierto**, y deliberado (`AUDIT-NO-BUTTON-1`) | Fase 5 |
| Acciones que se completan | FAQ, brief, comparativa, exportar y marcar hecho no respondieron | **Sin reproducir**: el código tiene spinner y error | Fase 0 → Fase 4 |
| Investigación de prompts | Sin demanda, intención, dificultad ni priorización | **Cierto.** No existe nada de eso | **Fuera** — diferenciador |
| Más motores | Tres frente a los siete de Otterly | **Cierto** | **Fuera** — diferenciador |
| Alertas útiles | Activación poco clara y sin calendario visible | **Cierto a medias**: hay notificaciones y alerta de cambio de score (`lib/scan/score-alert.ts`), sin umbral ni calendario | Fase 3 |
| Exportación e informes | La exportación no terminó visiblemente | **Sin reproducir** (mismo caso que las acciones) | Fase 0 → Fase 4 |
| Integraciones y atribución | No disponibles | **Cierto** | **Fuera** — diferenciador |

Seis de las diez caen dentro del plan de lanzamiento. Tres son los
diferenciadores que ya estaban fuera del camino crítico y siguen estándolo. Y
una —el histórico— cambia de naturaleza al verificarla: deja de ser una
funcionalidad que falta y pasa a ser una que **no se ve cuando importa**, que es
la Fase 3.

---

## 1 ter. Plan de ejecución

Once fases, tres carriles simultáneos como máximo (`BUILD-BUDGET-1`: nunca más
de 3 PRs abiertos). El orden de abajo no es el orden de importancia: es el que
mantiene los tres carriles llenos sin que ninguno espere a otro.

### Olas

| Ola | Carril A (crítico) | Carril B | Carril C | Dura |
|---|---|---|---|---|
| 1 | **Fase 1** `TRUST-METRICS-1` (5-7 d) | **Fase 6** `CHECKER-COPY-1` (1 d) → **Fase 0** `AUDIT-REPRO-1` (1-2 d) | **Fase 2** `TRUST-PROMISES-1` (2-3 d) | ~1 sem |
| 2 | **Fase 4** `ACTIONS-OBSERVABLE-1` (4-6 d) | **Fase 5** `AUDIT-RUNNABLE-1` (2-3 d) | **Fase 3** `RECURRING-VALUE-1` (3-4 d) | ~1 sem |
| 3 | **Fase 7** `RECS-EVIDENCE-2` (3-4 d) | **Fase 8** `CITATIONS-HONESTY-1` (2-3 d) | **Fase 9** `ENTITY-HYGIENE-1` (2 d) | ~4 d |
| 4 | **Fase 10** `SCREEN-POLISH-1` (2-3 d) | — | — | ~3 d |

**~3 semanas de reloj**, no la suma de las fases. El camino crítico es el
carril A; los otros dos existen para que nunca esté esperando.

### Por qué ese reparto

- **Fase 6 va primera de todo** aunque sea la sexta en severidad: un día de
  trabajo en el punto exacto de conversión. Es el único cambio del plan que
  paga el mismo día que entra.
- **Fase 1 arranca el día 1** aunque sea la más larga: nada depende de ella,
  pero ella no depende de nada, y es la que decide si el resto es creíble.
- **Fase 0 antes que la 4**, siempre. La 4 no se puede dimensionar sin la
  clasificación de la 0.
- **Fase 3 después de la 2**: su calendario de seguimiento sale de ahí.
- **Fase 5 después de su diagnóstico**: si la auditoría automática falla por una
  causa distinta de la que suponemos, el botón sólo tapa el síntoma.
- Las fases 7 a 10 van al final porque **ninguna bloquea cobrar**. Si hay que
  lanzar antes, se lanzan sin ellas y se dice qué falta.

### Dependencias reales (todo lo demás es paralelo)

```
Fase 0 ──> Fase 4
Fase 2 ──> Fase 3
Fase 1 ──> (nada; pero toda cifra que otra fase publique debe leer su módulo)
diagnóstico técnico ──> Fase 5
```

### Regla de un PR

Una fase = un PR = una entrada de histórico = una celda del mapa de zonas. Nada
de PRs que mezclan fases: es lo que `CLAUDE.md` ya prohíbe y lo que haría
imposible revertir una sola cosa si sale mal.

Cada PR se cierra con el mismo ritual, sin excepciones: `pnpm test &&
pnpm run validate`, QA, **piloto contra el preview**, cierre documental en el
mismo PR, y Human Gate. Y en el mensaje al fundador, siempre: URL del preview y
qué probar en castellano.

### Protocolo reforzado para la Fase 1

Petición explícita del fundador, dos veces: *"la nota GEO Score es el core de la
herramienta"*. Esta fase se ejecuta con reglas más duras que las demás.

1. **El módulo nace solo.** `lib/metrics/run-metrics.ts` y sus tests entran en
   el primer commit, **sin un solo consumidor**. Si el módulo está mal, se ve
   antes de que nadie dependa de él.
2. **Una superficie, un commit.** Siete superficies, siete commits legibles y
   revertibles por separado. Nunca "migradas todas".
3. **Captura antes/después sobre el mismo proyecto en cada commit.** Un número
   correcto bajo una etiqueta equivocada es invisible para cualquier test; sólo
   se ve mirando. Es exactamente el fallo que la auditoría encontró.
4. **Aserción cruzada en el piloto antes del Human Gate**: el piloto lee la
   cifra en Visión general y en Dominios del mismo proyecto y falla si difieren.
   Sin esta aserción, la fase no se presenta.
5. **`data-guardian` revisa la lectura de datos** (la ventana pasa a leer tres
   runs por proyecto en una pantalla que lista varios) y **`geo-strategy` revisa
   la semántica** de cada etiqueta nueva. No es opcional en esta fase.
6. **Plan de vuelta atrás escrito antes de empezar**: el módulo es aditivo y
   cada migración es un commit; revertir una superficie no arrastra a las otras.

### Criterio para lanzar

Se puede cobrar cuando las **Fases 0 a 6** estén cerradas: ni una cifra
contradictoria, ni una acción silenciosa, ni una promesa pública que el producto
no cumpla, y el ciclo recurrente visible. Las fases 7 a 10 mejoran el producto y
no bloquean el cobro; los diferenciadores (motores, investigación de demanda,
atribución) son otro trimestre y otro Task Intake.

---

## Fase 0 — `AUDIT-REPRO-1`: reproducir antes de arreglar

**Problema.** El hallazgo peor puntuado del informe (fiabilidad funcional 4,0)
descansa en seis CTAs que "no dieron feedback". El código dice que tienen estado
de carga, estado de error y efecto. **No podemos planificar la Fase 4 sin saber
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
   con la misma etiqueta — es la mejor estimación disponible y no inventa nada.
   Aceptado explícitamente por el fundador; ver más abajo.
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

**El detalle de escaneo sale de la consola del usuario final** (decisión del
fundador, 2026-08-27). `/runs/[runId]` deja de ser alcanzable desde el producto:
se retiran los dos enlaces "Ver detalle del escaneo" de Páginas citadas
(`citations/page.tsx:220`) y de Recomendaciones (`recommendations/page.tsx:701`),
y la ruta queda accesible **sólo desde `/debug`**, que ya la enlaza desde la
fecha de cada fila. Razón: *"quiero tener una única cifra GEO Score porque si no
es un lío"* — una pantalla que por definición habla de un run concreto es la
única que no puede mostrar la ventana, así que o contradice al resto o pide al
usuario sostener dos cantidades. Retirarla del recorrido lo cierra de raíz.

El coste es menor de lo que parecía cuando se planteó como excepción. Esos dos
enlaces viven **dentro de estados vacíos** ("sin citas", "sin recomendaciones"),
como ya documenta el comentario de `debug/page.tsx:971-974`: un proyecto con
datos reales nunca podía abrir un escaneo desde ahí. No eran un camino
diseñado, eran un accidente de colocación, y `/debug` es desde entonces la vía
real. Los dos estados vacíos se quedan sin botón y con su texto actual, que ya
dice lo único cierto: vuelve tras el próximo escaneo.

**El primer escaneo sin ventana se acepta tal cual** (decisión del fundador,
2026-08-27: *"no pasa nada; la ventana evita la variabilidad cuando hay más de
uno"*). Se mantiene la caída al compuesto del run bajo la misma etiqueta, y no
se inventa ningún indicador nuevo para anunciarla: el producto ya distingue una
muestra insuficiente (`hasSufficientSample`, `MIN_RESPONSES_FOR_BAND` en
`lib/scoring/score-reliability.ts`) y esta fase se limita a **no contradecir ese
marcador donde ya existe**. Queda anotado como riesgo conocido y aceptado: entre
el primer y el segundo escaneo la cifra puede moverse por cambio de cantidad de
datos, no sólo por cambio de visibilidad.

**Entregables.**
- `lib/metrics/run-metrics.ts` — módulo único, sin I/O, dueño de: `geoScore`,
  `visibilityScore`, `promptCount`, `answerCount`, `engineCount`,
  `mentionRateByAnswer` (1/45), `promptCoverage` (1/15), `citationRate`, cada uno
  con `label` y `denominatorLabel` propios. Ninguna pantalla vuelve a calcular un
  porcentaje.
- Migración de las superficies: Visión general, Dominios, Prompts, Competidores,
  notificaciones y resumen semanal. Y de la exportación, cuando exista (Fase 4,
  `ACTIONS-OBSERVABLE-1`).
- Retirada de los dos enlaces a `/runs/[runId]` de Páginas citadas y
  Recomendaciones; la ruta se queda accesible sólo desde `/debug`, sin tocar la
  pantalla en sí.
- **Este trabajo se hace con revisión reforzada** (petición explícita del
  fundador: *"hazlo con mucho mimo, cuidado y revisión; la nota GEO Score es el
  core de la herramienta"*). En la práctica: `run-metrics.ts` nace con sus tests
  antes que sus consumidores; cada superficie se migra en un commit propio y
  legible; y ninguna migración entra sin una captura del antes y el después
  sobre el mismo proyecto, porque un número correcto bajo una etiqueta
  equivocada es invisible para cualquier test.
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

**Decisión de producto — RESUELTA, y ya implementada** (fundador, 2026-08-27).
El producto cumple la promesa: `recurring_scans_enabled` queda encendido por
defecto para cuentas reales.

**Cómo, que no es como este plan suponía.** No puede nacer en `ON` con el
proyecto: la columna tiene precondición propia —la UI de `/debug` exige al menos
un escaneo completado antes de poder activarla— así que forzarlo en el alta
sería un botón roto. Va enganchado al primer escaneo: `executePendingScan`
(`lib/scan/executor.ts`, PROJECT-DEFAULTS-BY-ACCOUNT-1, rama
`claude/default-account-config-x956ex`) lo enciende solo cuando el primer run
llega a `completed`, **sólo esa primera vez** —cuenta runs completados y exige
exactamente 1— para que quien luego lo apague a mano no se lo encuentre
reencendido en el escaneo siguiente. Las cuentas internas de prueba quedan
excluidas, y el bloque es fail-soft: si falla, el escaneo ya ha terminado bien.

Efecto práctico en un alta nueva: los otros cinco interruptores nacen
encendidos, y éste se enciende solo unos segundos después, al completarse el
primer escaneo.

**Lo que esta fase HEREDA y lo que le QUEDA.** Hereda el mecanismo entero. Le
quedan dos cosas que ese cambio no cubre y que siguen siendo P0-08:

1. **Los proyectos que YA existen.** El disparo es `completedRunCount === 1`, y
   es correcto que lo sea: es justo lo que evita reencender lo que alguien
   apagó. Pero significa que **ningún proyecto con dos o más escaneos completados
   lo recibe nunca**, y ésos son precisamente los clientes actuales — incluida la
   cuenta Pro desde la que el auditor leyó "Tu análisis de hoy no se repetirá".
   Hay que decidir entre rellenar hacia atrás (migración de datos acotada a
   proyectos de plan de pago, con el interruptor apagado y sin apagado manual
   registrado) o asumir que esos proyectos lo activan a mano. **Decisión del
   fundador**; la recomendación es rellenar, porque el fallo que la auditoría
   encontró vive exactamente ahí.
2. **La cadencia sigue sin verse.** Encenderla no la hace visible: allá donde se
   afirme una cadencia hay que mostrar **la próxima ejecución con fecha**, no un
   adjetivo. Es de esta fase, y alimenta el calendario de la Fase 3.

**Adelantado por trabajo ordinario (2026-08-27).** `PROMO-CONSOLE-PARITY-1`
(#485, log §170) se mergeó mientras este plan estaba en revisión y ya cierra
una de las divergencias que el auditor encontró: una cuenta en prueba Pro veía
179 €/mes en Ajustes mientras `/precios` decía 59 €. Más importante que el
síntoma es lo que introduce — `resolveShownPromoPrice` en `plans-data.ts`,
**un solo sitio que decide qué precio enseña una pantalla** — que es la semilla
del catálogo de esta fase y distingue además dos promociones que no son la
misma (la contratada, cupón vivo en Stripe, y la ofrecida, campaña abierta).

Lo que esta fase hereda, en consecuencia: `plans-data.ts` se promueve a
`lib/plans/catalog.ts` en vez de escribirse de cero, y el alcance restante son
los literales todavía sueltos (`pricing/page.tsx:34`, `session-ctas.tsx:74`,
las dos comparativas), los topes, los días de prueba y la cadencia — no el
precio promocional, que ya tiene dueño. **La fase encoge; no desaparece.**

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

## Fase 3 — `RECURRING-VALUE-1`: el valor recurrente se ve antes de tenerlo

**Origen.** Segunda tanda de material del auditor (capturas "Lo necesario para
poder cobrar" y "La funcionalidad más importante que falta", 2026-08-27). Su
titular es que **falta el histórico verificable** — qué cambió desde el escaneo
anterior, qué recomendación se aplicó, cuándo se volvió a medir, en qué motor
mejoró — y que sin ese ciclo el producto "se parece más a un informe puntual
que a una suscripción SaaS".

**La afirmación es falsa sobre el producto y cierta sobre su sesión, y eso la
hace más grave, no menos.** Verificado: la capa de evolución existe y está
construida con cuidado — sparkline sobre los últimos N escaneos y su rótulo
("Últimos N escaneos"), delta con guardas de comparabilidad (DELTA-GUARD-1,
ADR 0024), tendencia de share of voice (`lib/competitors/trend-window.ts`,
`sov-delta.ts`) y resumen semanal (`lib/scan/weekly-digest.ts`). El auditor no
vio nada de eso porque tenía **un solo escaneo**, y con uno el producto retira
correctamente todo lo temporal: `page.tsx:938-939` muestra literalmente "La
tendencia estará disponible con ≥2 escaneos".

Es decir: **no falta la funcionalidad, falta que exista datos cuando alguien
decide si paga.** Un evaluador hace un escaneo, no ve evolución, y concluye
exactamente lo que concluyó el auditor. La honestidad de retirar lo que no se
puede afirmar —que es correcta y no se toca— tiene como efecto secundario que
la mitad recurrente del producto sea invisible precisamente en la sesión que
decide la conversión.

**Y se compone con P0-08.** Sin `recurring_scans_enabled`, el segundo escaneo no
llega solo: no es que la evolución tarde un día en aparecer, es que puede no
aparecer nunca. Los dos fallos juntos producen un producto que parece un informe
puntual de forma permanente. Por eso esta fase va inmediatamente después de
`TRUST-PROMISES-1` y no antes.

**Entregables.**
- **Anunciar la evolución con fecha, no con condición.** "La tendencia estará
  disponible con ≥2 escaneos" describe un requisito; se sustituye por lo que el
  usuario necesita saber: *"tu próxima medición es el <fecha>; entonces verás
  cuánto ha cambiado"*. Es la misma verdad, dicha desde el producto y no desde
  su implementación. No inventa ningún dato — la fecha sale del calendario real
  de la Fase 2.
- **El calendario visible de seguimiento**, heredado de la Fase 2: última
  ejecución, próxima ejecución y cadencia, en la pantalla donde se promete.
- **El ciclo acción → reescaneo → cambio, cerrado y legible.** Una recomendación
  marcada como hecha registra cuándo, y el siguiente escaneo comparable dice si
  se movió lo que esa acción tocaba. Sin atribución causal inventada: se muestra
  qué cambió y cuándo se aplicó qué, y la relación la establece el usuario.
  Cualquier afirmación más fuerte sería una métrica falsa.
- **Alertas con umbral y destinatario claros** (fila "Alertas útiles" de la
  tabla del auditor). Hoy existen notificaciones y una alerta de cambio de score
  (`lib/scan/score-alert.ts`), pero sin umbral configurable ni calendario a la
  vista, así que se leen como ruido en vez de como vigilancia.

**Lo que esta fase NO hace.** No adelanta datos que no existen, no simula un
histórico, y no toca la retirada de lo temporal con un solo escaneo: esa
retirada es correcta y protegerla es el motivo por el que la fase se llama
"que se vea antes de tenerlo" y no "que se vea".

**Nota sobre `/runs`.** La retirada del detalle de escaneo de la consola
(Fase 1) y esta fase se rozan pero no se contradicen: el auditor no pedía la
ficha de un run concreto, pedía **evolución entre runs**, que vive en Visión
general y en Competidores. La ficha per-run seguía siendo la única pantalla
incapaz de mostrar la cifra única, y su sitio es `/debug`.

**Criterio de aceptación.** En una cuenta con un solo escaneo, ninguna pantalla
describe la evolución como un requisito técnico sin decir cuándo llega. En una
cuenta con dos escaneos comparables, el usuario puede responder sin ayuda: qué
cambió, cuándo se midió y qué acción había en medio.

---

## Fase 4 — `ACTIONS-OBSERVABLE-1`: ninguna acción silenciosa (P0-04)

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

## Fase 5 — `AUDIT-RUNNABLE-1`: la auditoría web tiene salida (P0-05)

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

## Fase 6 — `CHECKER-COPY-1`: el aviso deja de contradecir al resultado (P0-07)

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

## Fase 7 — `RECS-EVIDENCE-2`: cada acción dice de qué motor habla (P0-03)

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

## Fase 8 — `CITATIONS-HONESTY-1`: decir sólo lo que se ha comprobado (P0-09)

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

## Fase 9 — `ENTITY-HYGIENE-1` (P1-02)

Lista de términos genéricos y reglas de entidad para que ni "ChatGPT" se sugiera
como competidor ni "GEO Score" como alias de marca. Falso positivo barato de
evitar y caro de dejar: contamina competidores, SOV y recomendaciones a la vez.

---

## Fase 10 — `SCREEN-POLISH-1` (P1/P2 del §6 del informe)

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
`docs/brand/design-decisions-log.md` (el número se calcula al abrir el PR, no
ahora: §169 y §170 se reclamaron el 2026-08-27 mientras este plan estaba en
revisión, y `tests/log-numbering.test.ts` existe precisamente porque dos ramas
calculan `max + 1` sobre bases que envejecen), actualización de la
regla de ruta de su zona si establece un invariante, y la celda "Última fase
cerrada" del `Mapa de zonas` de `CLAUDE.md`. Las fases 0, 1, 2 y 3 tocan además
`docs/agentic-user-pilot.md` y `CLAUDE.md`, por las correcciones de método.
