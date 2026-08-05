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
escaneos comparables** (`DEFAULT_SCORE_WINDOW_SIZE = 3`). El score del escaneo
concreto no desaparece: se muestra junto al titular, etiquetado.

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
  la produjeron.
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
- **No cambia otras superficies.** Escaneos, las tarjetas de dominio y el
  resumen semanal siguen mostrando el score por run. Unificarlas es trabajo
  pendiente, y hasta que ocurra **el titular de Visión general y la columna de
  Escaneos pueden mostrar números distintos para el mismo proyecto** — un
  hueco declarado, no un descuido.

## Referencias

ADR 0024 (fiabilidad) · ADR 0032 (plan por fases, Fase D) · ADR 0033
(GeoScore v4) · `lib/scoring/score-window.ts` ·
`docs/geo-score-variability-2026-08.md` §2.
