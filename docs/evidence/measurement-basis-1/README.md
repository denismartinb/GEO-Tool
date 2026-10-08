# Evidencia visual — MEASUREMENT-BASIS-1 (tarjeta «Puntuación GEO» y nota «Base de esta medición»)

**Código evaluado:** `14b167f218cf8c92b88984740ff2f9fa3e860625` (PR #547). Este directorio solo añade
ficheros de documentación; no cambia código. Registro de la decisión: `docs/brand/design-decisions-log.md`
§236 (provisional: se renumera al rebasar, ver el propio PR) y regla de ruta `.claude/rules/scoring.md`.

## Qué es y qué no es
**Todas las imágenes son `[FIXTURE]`**: datos **inventados**, generados dentro de un proceso de test con
`scoredFixtureRun()` (`lib/scoring/measurement-basis.fixtures.ts`), con los cinco componentes del compuesto.
**No son un escaneo real, ni el preview, ni datos de ningún cliente.** No se ha insertado nada en producción ni
lanzado ningún escaneo. Cada imagen lleva un banner amarillo que lo dice.

Se renderizan los componentes reales (`GeoScoreGaugeCard`, `MeasurementBasisNote`) a HTML estático con el CSS real
(`app/globals.css` + `app/console.css`) y las webfonts reales de la build, dentro de un marco mínimo. Los
indicadores clave y la barra lateral están omitidos (marcador discontinuo / hueco en blanco).

## Imágenes
| Fichero | Escenario (fixture) | Ancho | Estado del detalle |
|---|---|---|---|
| `1-comparable-390-detalle-abierto.png` · `…-1280-…` | 3 escaneos con la misma base: **mediana, variación y sparkline** | 390 / 1280 | abierto tras clic |
| `2-cambio-modelo-390-detalle-abierto.png` · `…-1280-…` | el último escaneo usa **otro modelo de ChatGPT**: sin mediana ni variación, **con el motivo** | 390 / 1280 | abierto tras clic |
| `3-sin-base-previa-390-detalle-abierto.png` · `…-1280-…` | el último escaneo **ya registra su base**; los dos anteriores no: copy «Todavía no hay suficientes escaneos comparables… y cómo se midió» | 390 / 1280 | abierto tras clic |
| `3-sin-base-previa-390-detalle-cerrado.png` · `…-1280-…` | igual que el anterior, **estado por defecto del producto** | 390 / 1280 | cerrado |
| `4-sin-base-nada-390-detalle-abierto.png` · `…-1280-…` | **ningún** escaneo registra su base (ni el que se ve): misma frase **sin** «y cómo se midió» | 390 / 1280 | abierto tras clic |

## Qué se comprobó de verdad, y con qué
- **Mirado a ojo, de los 10 ficheros de este directorio: solo 2** —
  `3-sin-base-previa-390-detalle-cerrado.png` y `2-cambio-modelo-1280-detalle-abierto.png`. Los otros 8 salen del
  mismo HTML y de las mismas medidas, y el mismo HTML se miró antes en otras capturas (375 y 390 px, copy
  anterior al último ajuste), pero **esos 8 ficheros concretos no se han inspeccionado uno a uno**.
- **Medido por script en las 12 combinaciones escenario × ancho (375 / 390 / 1280):** sin desbordamiento horizontal;
  la línea del motivo mide 12 px y 5,43:1 de contraste (`--ink-3` dentro de `.ov2-scope`).
- **Interacción real (Playwright, Chromium):** con el detalle cerrado, un **clic en el `<summary>` lo abre** y
  su cuerpo pasa a ser visible; un **segundo clic lo cierra**. Comprobado en los 4 escenarios a 390 y 1280.
  **Alcance:** es el comportamiento nativo de `<details>` sobre HTML estático de fixture. **No** se ha probado el
  clic sobre el preview desplegado.
- **Una imagen no es una prueba de interacción:** las capturas «abierto» son el resultado de ese clic, no
  una afirmación sobre otros controles.

## Lo que esta evidencia NO cubre
- El **preview desplegado** del commit `14b167f` (no se ha pilotado; el piloto anterior es de `9b59e97`, con el
  copy y el estilo previos, y falló por tres causas ajenas a este PR).
- El caso comparable con **datos reales**: la cuenta piloto solo tiene escaneos sin base.
- Los indicadores clave, el desglose y el resto de la pantalla.
- Otros navegadores o dispositivos reales; solo Chromium de escritorio con las anchuras indicadas.

## Reproducir
`pnpm test components/geo-score-gauge-card.test.tsx components/measurement-basis-note.test.tsx` cubre los mismos
estados con datos del scorer real (copy, estilo, detalle abierto, ausencia de `--ink-4`). Las capturas se
generaron con un arnés temporal de Playwright que **no** forma parte del repositorio.

## Propuesta sobre estos ficheros
Son evidencia de revisión del PR (~650 KB de PNG). Propongo **retirarlos antes de fusionar**; la decisión es del
dueño del repositorio.
