# UNPROVEN-CLAIMS-1 — evidencia visual (PR #548)

Todas las imágenes de esta carpeta son **de fixture**: ninguna es del preview
real ni de datos reales. No contienen secretos, cookies, tokens, `.env`, datos
de clientes ni PII; el contenido es la fixture sintética del primer escaneo de
genscore.es (`lib/recommendations/fixtures/genscore-first-scan.ts`, construida a
mano, sin leer ninguna fila de producción).

**Código renderizado:** commit `f009909` (`f0099095385490b8264dc5e4aabdec87e439ab3f`).
El head del PR con esta carpeta es el commit que la añade (docs-only sobre
`f009909`); el informe del PR cita el SHA exacto.

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
| `flujo-oportunidades-a-detalle-390.jpg` | Oportunidades a 390 px y, debajo, la **misma** recomendación con el detalle abierto en Recomendaciones: el título cortado en la fila se lee entero | fixture, **render estático de los dos estados; no es un clic real** |
| `recomendaciones-y-prompts-390.jpg`, `recomendaciones-y-prompts-1280.jpg` | Tarjetas de visibilidad, FAQ, brecha con competidor, fila de `419ad9a` recalibrada, «Repite lo que ya te funciona», cabecera del plan sin cifra, banner de Prompts y cajón | fixture; banner y cajón con clases reales y el texto de los helpers, no el componente completo |

## Truncado de los títulos de Oportunidades (medido)
`scrollWidth > clientWidth` sobre `.ov2-opp-t > span`, mismo CSS. La fila no es un
enlace ni tiene tooltip: el título completo solo se lee en Recomendaciones.
| Ancho | Con «+14 pt» (antes) | Con «Impacto …» (ahora) |
|---|---|---|
| 390 | cortan 3/3 (249 px) | cortan 3/3 (223/209/209 px) |
| 768 | corta la 3.ª (351 px) | corta la 3.ª (311 px) |
| 1280 | ninguna | ninguna |

Causa: la regla de 2 líneas está dentro de `@media (min-width: 1200px)` en
`app/console.css`; por debajo rige `nowrap` + `ellipsis` (`app/globals.css`).
Propuesta mínima, **no aplicada**: sacar esa regla del breakpoint (CSS puro).

## Qué NO prueba esto
UI real en el preview, interacción real, datos reales ni el piloto de usuario.
La revisión de píxeles de estas capturas no es independiente salvo la que haga el
dueño.
