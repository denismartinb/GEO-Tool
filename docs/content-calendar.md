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
| A1 | `/docs` (índice) | — | ✅ Publicado | #291 |
| A2 | `/docs/empezar/primer-escaneo` | primer escaneo genscore | ✅ Publicado | #291 |
| A3 | `/docs/informes/overview` | informe overview genscore | ✅ Publicado | #291 |
| A4 | `/docs/metodologia/geo-score` | geo score metodología | ✅ Publicado | #291 |
| A5 | `/docs/planes-y-limites` | planes genscore límites | ✅ Publicado | #291 |

**Corregido el 2026-08-09 (SEO-POS-1, T16):** estas cinco filas seguían
marcadas 🔲 Pendiente aunque las páginas existen en el repo desde la Fase 2.3
(PR #291, `app/docs/**` + `lib/docs/nav.ts`) y el sitemap ya las publica. Un
ledger que dice "pendiente" de algo shipeado hace que la siguiente sesión
reescriba lo que ya existe.

## Capa C — Páginas de decisión (Fase 2.4 / 2.6c / 2.8)

Priorizada frente a B1b/B2/B3 por recomendación de `seo-geo-research`: las
páginas de comparación citan más que la media del portfolio en motores
generativos (dato de terceros, no verificado de primera mano — ver
Task Intake de Fase 2.6).

| # | Ruta | Keyword primaria | Estado | PR |
|---|---|---|---|---|
| C1 | `/comparativas/genscore-vs-otterly` | genscore vs otterly | ✅ Hecho | #292 |
| C2 | `/comparativas/genscore-vs-peec-ai` | genscore vs peec ai | ✅ Hecho | #302 |
| C3 | `/comparativas/mejores-herramientas-geo-en-espanol` (pilar) | mejores herramientas geo español | ✅ Hecho | #306 |

## Capa D — Glosario (Fase 2.4 / 2.6b)

| # | Ruta | Keyword primaria | Estado | PR |
|---|---|---|---|---|
| D1 | `/glosario` (índice, primeras ~15 entradas: GEO, AEO, GEO Score, share of voice en IA, llms.txt, grounding, AI Overviews, prompt tracking...) | glosario geo | ✅ Hecho | #292 |
| D1b | `/glosario/<termino>` — URL propia por término (patrón confirmado por `seo-geo-research`: el único glosario del sector que funciona como motor de tráfico, Ahrefs, usa una página completa por término, no un índice único) | qué es &lt;término&gt; | ✅ Hecho | #299 |

## Capa B — Hubs del blog (Fase 2.5 / 2.9)

Reestructuración de `/blog` en 4 clusters (fundamentos, medición, playbooks,
sectores) — no piezas nuevas en sí, sino arquitectura + 2-3 artículos nuevos
del cluster "playbooks" (el que hoy no existe y tiene más demanda
transaccional).

| # | Qué | Estado | PR |
|---|---|---|---|
| B1a | Taxonomía de clusters (`cluster` en `lib/blog/posts.ts`), índice reagrupado, enlazado interno "Sigue leyendo" entre posts del mismo cluster | ✅ Hecho | #294 |
| B1b | Páginas pilar dedicadas por cluster (`/blog/<cluster>`) | ✅ Hecho — 3 de 4 (ver nota) | — |
| B2 | `/blog/como-conseguir-que-chatgpt-te-cite` (cluster playbooks) | ✅ Hecho | — |
| B3 | `/blog/llms-txt-guia-practica` (cluster playbooks) | ✅ Hecho | — |

**Nota B1b:** páginas pilar reales para fundamentos, medición y playbooks —
cada una con una síntesis propia (no relleno) del porqué de esa sección y
enlace a todos sus artículos; cada artículo enlaza de vuelta a su pilar
("todo satélite enlaza a su página pilar", `content-strategy.md` §4.3). El
cluster "sectores" fue el último en tenerla: hasta 2026-08-05 no tenía
`pillarIntro` **a propósito**, porque con cero artículos no había nada real que
sintetizar y un pilar de relleno es peor que un estado vacío honesto. Lo abrió
W1 (`geo-para-ecommerce`, PR #342), que le dio pilar propio y lo metió en el
sitemap automáticamente — `app/sitemap.ts` filtra por `pillarIntro`, así que la
ruta entra sola en cuanto deja de estar vacía. Sin redirects: no se ha movido ninguna URL de
post existente.

## Cola semanal autónoma (GROWTH-3 Fase A1)

La rutina semanal coge de aquí el siguiente tema **pendiente** de arriba
abajo. Cuando esta cola se vacía, el agente pide un brief nuevo a
`seo-geo-research` y lo añade aquí en el mismo PR. Ver
`docs/agentic-weekly-post.md`.

| # | Tema | Cluster | Estado | PR |
|---|---|---|---|---|
| W1 | GEO para ecommerce: cómo aparecer cuando la IA recomienda productos | `sectores` | ✅ Publicado | #342 |
| W2 | GEO para SaaS B2B: las preguntas que hace un comprador antes de pedir demo | `sectores` | ✅ Publicado | #346 |
| W3 | GEO para agencias: cómo vender un servicio de visibilidad en IA | `sectores` | ✅ Publicado | #349 |
| W4 | Cómo medir si tu contenido mejora tu visibilidad en IA (y en cuánto tiempo) | `medicion` | 🔲 Pendiente | — |
| W5 | Qué hacer cuando la IA te menciona pero recomienda a otro | `playbooks` | 🔲 Pendiente | — |
| W6 | Datos estructurados para GEO: qué marcar y qué no sirve de nada | `playbooks` | 🔲 Pendiente | — |

**Nota sobre el cluster `sectores`:** estaba vacío y el índice de `/blog` lo
mostraba como "Próximamente" — por eso sus tres piezas van primero en la cola,
para cerrar un hueco visible del sitio. **Las tres se escribieron el
2026-08-05** — W1 lo abrió, W2 y W3 lo completaron. El cluster ya no tiene
huecos: ecommerce (comprador), SaaS B2B (comprador) y agencias (quien vende el
servicio).

**La cola queda vacía a partir de W4.** Al llegar ahí, la sesión semanal tiene
que pedir un brief nuevo a `seo-geo-research` y añadirlo aquí en el mismo PR
(ver `docs/agentic-weekly-post.md` §2, paso 2).

**W2 y W3 van apilados, no salen de `main`.** W2 se apila sobre W1 y W3 sobre
W2, así que el PR de W3 contiene los tres artículos hasta que los de abajo se
mergeen. El orden de merge correcto es #342 → #346 → #349.

**W2 va apilado sobre la rama de W1, no sobre `main`.** Es el segundo artículo
del cluster que W1 abrió, así que depende de su trabajo estructural (el
`pillarIntro` de `sectores`, el mapa `BLOG_POSTS_BY_CLUSTER` del pilot y los
tests que dejaron de codificar "sectores está vacío"). Rehacerlo desde `main`
habría duplicado esos cambios y garantizado un conflicto contra la PR #342. Al
mergear #342 primero, el PR de W2 se queda solo con su artículo.

---

## Capa E — Observatorio

Requiere Task Intake y aprobación propia (coste de escaneos + metodología
publicada). No planificado en este calendario hasta esa aprobación.
