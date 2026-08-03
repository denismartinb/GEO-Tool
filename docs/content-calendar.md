# Calendario de contenido — GROWTH-2

> Ledger de ejecución del motor de contenido SEO+GEO. Mismo protocolo que
> `docs/launch-plan.md`: una fila por pieza, cada PR que la publique o la
> toque actualiza su fila en el mismo PR. El "por qué" y las reglas de
> redacción viven en `docs/content-strategy.md`; esto es solo estado.

Estados: 🔲 Pendiente · 🟡 En curso · ✅ Publicado · 🔁 Refrescado

---

## Capa A — Documentación pública (`/docs`)

Primer slice deliberadamente pequeño (Fase 2.3a) — no las ~10 páginas del
mapa completo de una vez. El resto del mapa (`/docs/informes/prompts`,
`/competidores`, `/citations`, `/recomendaciones`, `/metodologia/motores-y-
cobertura`, `/metodologia/ciclo-de-escaneo`) se añade en PRs pequeñas
posteriores (2.3b, 2.3c...), mismo patrón que GROWTH-1 hizo con el blog.

| # | Ruta | Keyword primaria | Estado | PR |
|---|---|---|---|---|
| A1 | `/docs` (índice) | — | 🔲 Pendiente | — |
| A2 | `/docs/empezar/primer-escaneo` | primer escaneo genscore | 🔲 Pendiente | — |
| A3 | `/docs/informes/overview` | informe overview genscore | 🔲 Pendiente | — |
| A4 | `/docs/metodologia/geo-score` | geo score metodología | 🔲 Pendiente | — |
| A5 | `/docs/planes-y-limites` | planes genscore límites | 🔲 Pendiente | — |

## Capa C — Páginas de decisión (Fase 2.4 / 2.6c / 2.8)

Priorizada frente a B1b/B2/B3 por recomendación de `seo-geo-research`: las
páginas de comparación citan más que la media del portfolio en motores
generativos (dato de terceros, no verificado de primera mano — ver
Task Intake de Fase 2.6).

| # | Ruta | Keyword primaria | Estado | PR |
|---|---|---|---|---|
| C1 | `/comparativas/genscore-vs-otterly` | genscore vs otterly | ✅ Hecho | #292 |
| C2 | `/comparativas/genscore-vs-peec-ai` | genscore vs peec ai | ✅ Hecho | #302 |
| C3 | `/comparativas/mejores-herramientas-geo-en-espanol` (pilar) | mejores herramientas geo español | ✅ Hecho | — |

## Capa D — Glosario (Fase 2.4 / 2.6b)

| # | Ruta | Keyword primaria | Estado | PR |
|---|---|---|---|---|
| D1 | `/glosario` (índice, primeras ~15 entradas: GEO, AEO, GEO Score, share of voice en IA, llms.txt, grounding, AI Overviews, prompt tracking...) | glosario geo | ✅ Hecho | #292 |
| D1b | `/glosario/<termino>` — URL propia por término (patrón confirmado por `seo-geo-research`: el único glosario del sector que funciona como motor de tráfico, Ahrefs, usa una página completa por término, no un índice único) | qué es &lt;término&gt; | ✅ Hecho | #299 |

## Capa B — Hubs del blog (Fase 2.5)

Reestructuración de `/blog` en 4 clusters (fundamentos, medición, playbooks,
sectores) — no piezas nuevas en sí, sino arquitectura + 2-3 artículos nuevos
del cluster "playbooks" (el que hoy no existe y tiene más demanda
transaccional).

| # | Qué | Estado | PR |
|---|---|---|---|
| B1a | Taxonomía de clusters (`cluster` en `lib/blog/posts.ts`), índice reagrupado, enlazado interno "Sigue leyendo" entre posts del mismo cluster | ✅ Hecho | #294 |
| B1b | Páginas pilar dedicadas por cluster + redirects si cambian rutas | 🔲 Pendiente | — |
| B2 | `/blog/como-conseguir-que-chatgpt-te-cite` (cluster playbooks) | ✅ Hecho | — |
| B3 | `/blog/llms-txt-guia-practica` (cluster playbooks) | ✅ Hecho | — |

## Capa E — Observatorio

Requiere Task Intake y aprobación propia (coste de escaneos + metodología
publicada). No planificado en este calendario hasta esa aprobación.
