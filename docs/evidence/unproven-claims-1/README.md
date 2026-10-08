# UNPROVEN-CLAIMS-1 — evidencia visual (PR #548)

Todas las imágenes de esta carpeta son **de fixture**: ninguna es del preview
real ni de datos reales. No contienen secretos, cookies, tokens, `.env`, datos
de clientes ni PII; el contenido es la fixture sintética del primer escaneo de
genscore.es (`lib/recommendations/fixtures/genscore-first-scan.ts`, construida a
mano, sin leer ninguna fila de producción).

**Código renderizado:** commit `0cc2692` (`0cc26929ce1322b597e7bc019bb293594121db0d`).
El head del PR con esta carpeta es el commit que la añade (docs-only sobre
`0cc2692`); el informe del PR cita el SHA exacto.

## Cómo se generaron
Los componentes reales (`OpportunitiesCard`, `RecCard`, el texto de los helpers
de Prompts) se compilaron con esbuild, se renderizaron con `react-dom/server` y
se fotografiaron en Chromium con el `app/globals.css` + `app/console.css`
reales, a 390 y 1280 px de ancho (`fullPage`, JPEG calidad 82). No hay base de
datos, escaneo ni escritura. Los puntos de «Impacto/Esfuerzo» salen apagados
porque el arnés no carga las variables de color de la consola: es un artefacto
del arnés, no del producto.

## Qué es cada imagen
| Fichero | Qué muestra | Origen |
|---|---|---|
| `oportunidades-390.jpg`, `oportunidades-1280.jpg` | Visión general · tarjeta Oportunidades completa: recuento real, «Ordenadas por prioridad estimada.», filas con impacto cualitativo, sin «+N»/techo | fixture |
| `oportunidades-css-{antes,despues}-{390,768,1280}.jpg` | Antes/después del CSS de los títulos con la fixture y filas extremas (solo la tarjeta) | fixture |
| `flujo-oportunidades-a-detalle-390.jpg` | Oportunidades a 390 px y, debajo, la **misma** recomendación con el detalle abierto en Recomendaciones: el título cortado en la fila se lee entero | fixture, **render estático de los dos estados; no es un clic real** |
| `recomendaciones-y-prompts-390.jpg`, `recomendaciones-y-prompts-1280.jpg` | Tarjetas de visibilidad, FAQ, brecha con competidor, fila de `419ad9a` recalibrada, «Repite lo que ya te funciona», cabecera del plan sin cifra, banner de Prompts y cajón | fixture; banner y cajón con clases reales y el texto de los helpers, no el componente completo |

## Títulos de Oportunidades: antes/después del CSS (mismo fixture, medido)
Cambio: solo las dos reglas del título (`.ov2-opp-t` y `.ov2-opp-t span`,
2 líneas con `line-clamp`) salen de `@media (min-width: 1200px)` en
`app/console.css`; alineación, relleno, punto y «rápida» siguen siendo del
breakpoint. `globals.css` no tiene secciones posteriores que re-encabecen esos
selectores, así que no cambia quién gana (`styles.md`). La fila sigue sin
enlace ni tooltip: no se inventa ninguno.

Fixture: las 3 filas del primer escaneo + 3 extremas (título muy largo, una
palabra de 80 caracteres sin espacios, título corto con «rápida»). `l` = líneas;
`*` = recortada.
| Ancho | Antes | Después |
|---|---|---|
| 390 | 1l* 1l* 1l* 1l* 1l* 1l | **2l 2l 2l** 2l* 1l* 1l |
| 768 | 1l 1l 1l* 1l* 1l* 1l | 1l 1l **2l** 2l* 1l* 1l |
| 1280 | 2l 1l 2l 2l* 1l* 1l | 2l 1l 2l 2l* 1l* 1l (idéntico) |

En los tres anchos, antes y después: sin desborde de la tarjeta ni del
documento, el botón «Ver todas las recomendaciones» queda dentro de la tarjeta
y el título nunca solapa la etiqueta de impacto. Límites que **no** se arreglan
aquí: un título larguísimo se recorta a 2 líneas con puntos suspensivos, y una
palabra de 80 caracteres sin espacios no puede envolver (igual que antes).
Con «+N pt» (antes de §236) a 390 px el título medía 249 px; con «Impacto …»
y sin este cambio, 209–223 px.

| Antes (390) | Después (390) |
|---|---|
| `oportunidades-css-antes-390.jpg` | `oportunidades-css-despues-390.jpg` |
| `oportunidades-css-antes-768.jpg` | `oportunidades-css-despues-768.jpg` |
| `oportunidades-css-antes-1280.jpg` | `oportunidades-css-despues-1280.jpg` |

## Qué NO prueba esto
UI real en el preview, interacción real, datos reales ni el piloto de usuario.
La revisión de píxeles de estas capturas no es independiente salvo la que haga el
dueño.
