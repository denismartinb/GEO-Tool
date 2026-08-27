# ADR 0036 — El GeoScore que se publica es una ventana, no un escaneo

- **Estado:** **aceptado** — aprobado por el fundador el 2026-08-05
  (*"Implementa el score de ventana en real"*)
- **Fecha:** 2026-08-05
- **Fase:** SCORE-WINDOW-1 (Fase D de ADR 0032, promovida)
- **No supersede ninguna fórmula.** El compuesto sigue siendo el de ADR 0033.
  Lo que cambia es **qué cifra se presenta como el GeoScore del proyecto**.

---

## 1 · Qué se decide

El número grande de Visión general pasa a ser la **mediana de los 3 últimos
escaneos comparables** (`DEFAULT_SCORE_WINDOW_SIZE = 3`).

**Dónde se explica.** La primera versión llevaba una línea bajo el gauge
("Mediana de tus N últimos escaneos comparables · este escaneo: X"). El
fundador la retiró el 2026-08-05 tras verla funcionando: sobraba en la pantalla
principal. La explicación **no se pierde** — vive en la página pública de
metodología (`app/docs/metodologia/geo-score`), que dice qué es la mediana, por
qué existe y cuál es su coste. Que el usuario pueda saber qué cantidad está
mirando sigue siendo obligatorio; en qué superficie se lo contamos es una
decisión de producto.

Cuando no hay ventana publicable —menos de 2 escaneos elegibles, o ninguno
comparable con el más reciente— **el titular vuelve a ser el score del último
escaneo**, exactamente como antes.

## 2 · Por qué

Las fases A, B y C atacaron varianza con causa: un alias mal resuelto, muestra
corta, un motor caído en silencio, un componente entrando y saliendo. Queda una
fuente que **ninguna fórmula elimina**: los motores hacen recuperación viva.
`temperature: 0` está fijado en los tres proveedores pero no controla lo que
Google Search o `web_search` devuelven en cada llamada, así que dos escaneos
idénticos ven internet distinto.

Y esa fuente ya no se puede atacar por otro lado: el 2026-08-05 se midió que
las 2.801 filas de Gemini guardan un único valor, el alias
`gemini-2.5-flash` — **no existe id versionado que pinear**, así que la deriva
de modelo tampoco se puede cerrar (ver `docs/geo-score-variability-2026-08.md`
§2).

Contra ruido irreducible por observación, el único instrumento honesto es dejar
de tratar una observación como la respuesta. Es el mismo movimiento que
`computeMentionInterval` ya hace para la precisión (ADR 0024), aplicado a la
estimación puntual.

## 3 · Mediana, no media

Un run anómalo —un proveedor con una mala hora— arrastra una media de 3 en un
tercio de su propio error. La mediana lo ignora salvo que se sostenga: reacciona
al cambio, no al ruido.

**El coste, dicho porque es real: un cambio genuino tarda `ceil(K/2)` escaneos
en trasladarse del todo al titular.** Con K=3, dos escaneos. A cambio, el
fundador deja de ver saltos de treinta puntos que no significaban nada.

## 4 · Lo que la ventana se niega a mezclar

`computeWindowedScore` rehúsa exactamente lo que `compareRuns` rehúsa comparar:
distinta `composite_version`, distinto `inputs_used`, o tamaños de muestra que
difieran más de la mitad. Una ventana que promediara a través de esas fronteras
blanquearía la incomparabilidad que ADR 0024 existe para exhibir — y lo haría
dentro de un número presentado como *más* fiable que los individuales.

Cuando no puede publicar, **cae al score del run**. Nunca a una mediana de
cosas incomparables.

## 5 · Qué sigue al titular, y qué no

- **La banda** (70/40) describe el titular, así que se calcula sobre él. Su
  suelo de muestra (`MIN_RESPONSES_FOR_BAND`) sigue aplicándose igual.
- **El delta** es **ventana contra ventana**, no ventana menos run. Restar el
  score crudo del escaneo anterior a la mediana de hoy compararía dos
  cantidades distintas y llamaría cambio a la diferencia. Sigue pasando por
  `resolveDelta`.
- **La evolución** dibuja la serie de ventanas, no los runs crudos. Un gauge
  con mediana sobre una línea de scores por escaneo son dos métricas en la
  misma tarjeta, y el usuario no puede saber a cuál pertenece el número.
- **La frase narrativa** ("aparece en X de Y respuestas… con una puntuación
  GEO de Z") sigue usando el **score del escaneo**: describe los datos de ese
  escaneo, y emparejarlos con la mediana atribuiría una cifra a datos que no
  la produjeron. Es, además, el único sitio de la pantalla donde el usuario ve
  el número de su escaneo concreto desde que se retiró la línea bajo el gauge.
- **Las alertas de caída NO cambian.** `checkAndSendScoreDropAlert` sigue
  mirando runs. Una alerta debe disparar cuando algo cae de verdad, y meterla
  detrás de una mediana la retrasaría dos escaneos justo en el caso en que
  llegar tarde importa. Es una decisión, no un olvido.

## 6 · Lo que este ADR NO hace

- **No toca el compuesto.** Los cinco componentes y sus pesos son los de
  ADR 0033.
- **No toca la capa de fiabilidad.** Margen de Wilson, suelo de muestra y
  `resolveDelta` siguen siendo obligatorios.
- **No repuntúa nada.** `run_scores` sigue guardando el score de cada run; la
  ventana se calcula al renderizar, así que revertir esta decisión es quitar
  código de pantalla, no migrar datos.
- **No unifica todas las superficies.** La tabla de Escaneos **dejó de
  mostrar el score por escaneo** el mismo día (decisión del fundador: pasa a
  ser dato de inspección), y con ella se fueron la columna «Δ Score» y su nota
  al pie — superan a DELTA-GUARD-1 *en esa pantalla*, porque la superficie que
  aquella fase hizo honesta ya no existe. La regla de `resolveDelta` sigue
  vinculante en todas las demás.

  **Siguen sin unificar** las tarjetas de dominio y el resumen semanal, que
  muestran el score del último escaneo y por tanto pueden discrepar del
  titular. Hueco declarado, pendiente de decisión.

## 7 · Adenda TRUST-METRICS-1 (2026-08-27, log §183) — el hueco de §6 se cierra, parcialmente

**Contexto.** Auditoría externa de producto (26-08-2026): el mismo escaneo
mostraba 6/100 en Visión general y "2 Puntuación GEO" en Dominios. El hueco
que §6 dejó declarado ("siguen sin unificar las tarjetas de dominio y el
resumen semanal") era exactamente esa divergencia, medida en producción.

**Qué se cierra.** Las tarjetas de dominio pasan a leer la ventana, vía
`lib/metrics/run-metrics.ts` (`resolveGeoScore`), el mismo punto de decisión
que Visión general. La notificación de fin de escaneo hace lo mismo. Ninguno
de los dos repuntúa nada ni toca este ADR: consumen `computeWindowedScore` /
`readWindowRun` sin modificarlos, tal como manda §6.

**Qué se verificó, se corrigió a medias, y se cerró bien a la segunda.**
El resumen semanal (`lib/scan/weekly-digest.ts`) ya leía el compuesto vía
`getEffectiveGeoScore` — nunca `visibility_score` crudo — para su comparación
semana-a-semana, y es una magnitud legítimamente distinta de la ventana
(cambio entre los dos runs más recientes, no la posición actual estabilizada).
Ese primer paso de la revisión se quedó ahí, mirando sólo el comentario de la
capa de datos — y el HTML que de verdad se envía (`lib/email/transactional.ts`)
seguía rotulando ese número **"Tu GEO Score"**, en el asunto, la cabecera y el
`preheader` del correo. Misma alerta de caída (`sendScoreDropAlertEmail`). Es
exactamente el error que este ADR y TRUST-METRICS-1 existen para eliminar,
sólo que en un canal — el correo — que ni el piloto ni una lectura rápida del
componente React iban a mirar nunca.

Cerrado sin tocar el cálculo: ambos correos siguen comparando runs concretos
consecutivos, que es lo correcto para su propósito (la alerta de caída
necesita una señal rápida y sin suavizar; SCORE-WINDOW-1 tardaría
`ceil(K/2)` escaneos en reflejar una caída sostenida real). Lo que cambia es
el rótulo: "Tu GEO Score" → "Puntuación de este escaneo" en el resumen
semanal, y el asunto/cabecera de la alerta dejan de decir "GEO Score" sin más.
La regla no es "todo número parecido a un score debe ser la ventana" — es
"nada que no sea la ventana se llama 'Puntuación GEO'".

**Lo que TRUST-METRICS-1 encontró que §6 no había previsto.** Todo lo que se
publique junto al titular tiene que estar en su misma base. El badge de delta
de Dominios (DELTA-GUARD-1) comparaba dos `visibility_score` crudos junto a un
titular que ahora es la ventana — la misma cifra prohibida, un nivel más
abajo. Se corrigió a ventana-sobre-ventana, misma construcción que el
`gaugeDelta` de Visión general (`previousWindow`, §5 de este ADR): publica
sólo cuando las dos resoluciones son ventanas reales.

**Y una pieza nueva que §5 no necesitaba porque sólo había una pantalla.**
Con más de una superficie leyendo runs para resolver la ventana, la
profundidad de lectura (cuántas filas se piden antes de aplicar
`computeWindowedScore`) tiene que ser la misma en todas — si una pantalla lee
menos runs que otra, puede quedarse sin comparables mientras la otra sí los
encuentra más atrás, y publicar `single_run` donde la otra publica ventana.
`GEO_SCORE_LOOKBACK_ROWS = 7` en `lib/metrics/run-metrics.ts` (la misma
profundidad que Visión general ya usaba) es ahora esa constante compartida.

**Sigue sin cerrarse, esta vez de verdad.** El invariante completo — «toda
superficie que use la etiqueta "Puntuación GEO" pasa por `lib/metrics/
run-metrics.ts`» — vive en `.claude/rules/scoring.md`, no en este ADR, porque
es una regla de ruta que se inyecta sola al tocar `lib/scoring/**`; este ADR
documenta la decisión técnica de la ventana, no el invariante de producto que
cuelga de ella.

## Referencias

ADR 0024 (fiabilidad) · ADR 0032 (plan por fases, Fase D) · ADR 0033
(GeoScore v4) · `lib/scoring/score-window.ts` ·
`docs/geo-score-variability-2026-08.md` §2.
