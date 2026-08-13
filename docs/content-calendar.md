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

## Cola de la Fase C de SEO-POS-1 (prioridad por ventana de oportunidad)

Cola distinta de la "Capa C — Páginas de decisión" de arriba (esa numeración
C1/C2/C3 ya está tomada por comparativas). Esta viene de
`docs/seo-positioning-plan.md` §4, Fase C: 10 piezas priorizadas por dónde el
mercado en español todavía tiene hueco, no por orden alfabético. Etiquetas
"Sx" para no chocar con las Cx de comparativas ni las Wx de la cola semanal.

| # | Pieza | Cluster kw del plan | Cluster blog | Estado | PR |
|---|---|---|---|---|---|
| S1 | Cómo saber si tu marca aparece en ChatGPT, Gemini y Claude | 1 — Verificación | `playbooks` | ✅ Publicado | #(este) |
| S2 | Alternativas a Profound en español | 2 — Alternativas | `comparativas` | ✅ Publicado | #(este) |
| S3 | Alternativas a Otterly (formato listicle) | 2 — Alternativas | `comparativas` | ✅ Publicado | #(este) |
| S4 | Refresco de "Mejores herramientas GEO en español" (+ CreceRank, Mentio; TrendSights descartada) | 3 — Herramientas | `comparativas` | ✅ Publicado | #(este) |
| S5 | Qué es una auditoría GEO (con checklist) | 5 — Auditoría | `playbooks` | ✅ Publicado | #(este) |
| S6 | Métricas GEO: qué medir y qué no | 6 — Métricas | `medicion` | ✅ Publicado | #(este) |
| S7 | Cómo aparecer en Perplexity | 7 — Motor a motor | `playbooks` | 🔲 Pendiente | — |
| S8 | Cómo medir en GA4 el tráfico que llega desde ChatGPT | 8 — Analítica | `medicion` | 🔲 Pendiente | — |
| S9 | Cómo hacer que ChatGPT recomiende tu negocio (pyme) | 4 — Pyme/local | `playbooks` | 🔲 Pendiente | — |
| S10 | Glosario: +5 términos de la capa de medición | 6/9 — Métricas/Definiciones | `glosario` | 🔲 Pendiente | — |

**S1 — hecho (2026-08-10).** Título corregido respecto al que proponía
`seo-positioning-plan.md` §4: el borrador original decía "…en ChatGPT, Gemini
y Perplexity", pero Perplexity **no es un motor soportado hoy**
(`docs/launch-plan.md` Fase 8: Gemini, Claude y ChatGPT vía ENGINES-2;
Perplexity "sin fecha, fuera de alcance"). Publicarlo así habría sido el mismo
reclamo falso que PRICING-TRUTH-1 retiró del resto del producto, solo que en
la primera pieza nueva de contenido del plan. Corregido a "…en ChatGPT, Gemini
y Claude" antes de escribir una sola línea. Tres formas reales de comprobar la
mención (manual con prompts repetidos, analítica, herramienta sistemática),
`FAQPage` con 3 preguntas reales, figura ilustrativa de la variabilidad
entre ejecuciones, CTA al escaneo gratuito real. Portada nueva (evidencia:
tres motores con veredicto distinto — citado, mencionado sin cita, ausente).
Añadido al fixture del piloto en el mismo PR (`tests/pilot/fixtures/
server.mjs`) — lo exige `fixture-drift.test.ts`.

**S2 — hecho (2026-08-10).** `/comparativas/genscore-vs-profound`, mismo
formato que `genscore-vs-otterly`/`genscore-vs-peec-ai` (tabla + "cuándo
elegir cada una" + metodología con fecha de consulta). Investigación previa a
escribir una sola cifra: la financiación de Profound (155 M$, valoración de
1.000 M$ en febrero de 2026) está bien documentada y se cita tal cual, pero su
**precio ya no se publica** — su web pide una demo, y fuentes de terceros
citan importes muy distintos según su fecha (499 $/mes en 2025, 99 $/mes en
reseñas de 2026). La fila de precio no afirma ninguna cifra concreta de
Profound a propósito, con test (`genscore-vs-profound.test.ts`) que lo
impone. Presencia en el mercado hispanohablante: sin evidencia encontrada —
redactado como "sin evidencia de…", nunca como "no soporta…", porque no se
pudo descartar del todo que su selector de 30+ idiomas incluya castellano.

**S3 — hecho (2026-08-12).** `/comparativas/alternativas-a-otterly`. No es la
comparativa 1:1 (ya existe) ni el pilar de categoría (también): quien busca
"alternativas a X" ya conoce X y ha chocado con **un límite concreto**, así que
la pieza se organiza por el límite —tope de prompts, motores que eran add-on,
diagnóstico sin ejecución, idioma— y no por un ranking, que obligaría a
declarar un ganador global que no existe.

Tres decisiones de honestidad, las tres con test
(`alternativas-a-otterly.test.ts`):

1. **Cada ventaja de Otterly se declara entera y con su contexto**
   (`OTTERLY_STRENGTHS` es `{claim, context}`, con test que exige las dos
   mitades). "Usuarios ilimitados por 29 $" seguido de "con quince prompts
   incluidos" es la misma verdad, situada — que es distinto de recortarla.
2. **Cada alternativa declara dónde no llega**, Genscore incluida, y el campo
   `tradeoff` es obligatorio en el tipo. El de Genscore nombra Perplexity,
   Copilot y la falta de desglose por país, y un test lo exige **por nombre**:
   son datos que un comprador verifica en dos clics, y esconderlos es el error
   que PRICING-TRUTH-1 obligó a retirar del producto.
3. **El encuadre es de marketing, no de arbitraje** (revisión del fundador,
   2026-08-12; log §67). La primera versión abría admitiendo que la escribe un
   competidor y dedicaba un bloque destacado a "cuándo NO deberías cambiar";
   ambas cosas concedían gratis. El hecho comprobable no se recorta, pero el
   orden, el espacio y el contexto se deciden a favor de Genscore.

**Precios: ninguno de Otterly viene de fuente primaria.** `otterly.ai/pricing`
está bloqueado por el proxy de egress (misma limitación que tuvo Peec AI). Se
publican porque dos agregadores independientes coinciden (29 $/15 prompts,
189 $/100, 489 $/400, con Gemini y Google AI Mode como add-ons de pago) y
porque cuadran con lo investigado el 2026-08-02 para la comparativa 1:1 — no
porque se hayan verificado en origen, y la página lo dice. Semrush y Ahrefs se
describen por estructura de coste (módulo + suite), sin cifra cerrada, porque
las fuentes públicas se contradicen entre sí.

**S5 — hecho (2026-08-13).** `/blog/que-es-una-auditoria-geo`, cluster
`playbooks`. Publica las **seis dimensiones** de la auditoría técnica
(`lib/web-audit/page-checks.ts`) con sus umbrales exactos de comportamiento
—título 15-70 caracteres, descripción 50-160, frescura 180/540 días, 300
palabras visibles, un solo `<h1>`, dos `<h2>` mínimo— pero **no el reparto de
puntos entre ellas**: el borrador inicial sí los publicaba y el fundador
decidió lo contrario, porque es metodología del producto y regalarla no le da
al lector nada que no tuviera ya con las seis dimensiones nombradas. Detalle de
la corrección: log §69.

**Lo que la diferencia de un post de checklist cualquiera** es la sección
sobre la página sin fecha: puntuar la frescura como cero cuando no se
encuentra ninguna fecha convierte una ausencia de dato en un veredicto
negativo, así que esa dimensión se excluye del cálculo y el resto se reescala.
Es una decisión de método real del producto, y explicarla demuestra criterio
en vez de afirmarlo.

**Y declara dónde acaba:** una auditoría técnica dice si tu página *puede* ser
citada, no si *lo es*. Esa segunda pregunta solo se responde preguntando a los
motores. Sin esa frase, el artículo vendería la auditoría como si fuera la
medición entera.

Portada dibujada en SVG y rasterizada a WebP (§47: un `og:image` en SVG deja la
tarjeta social en blanco). No es decorativa: seis barras de igual anchura, una
por dimensión — deliberadamente sin variar tamaños, por el mismo motivo que el
texto no reparte puntos.

**S6 — hecho (2026-08-13).** `/blog/metricas-geo-que-medir`, cluster
`medicion`. El eje no son definiciones sino **el denominador**: la unidad de
observación es la respuesta, no el prompt (veinte prompts en tres motores son
sesenta observaciones), y de equivocar eso salen casi todos los errores de
medición del sector. Sobre esa base, las cinco métricas que significan algo
—tasa de mención, cuota de voz, posición cuando apareces, tasa de citación de
tu dominio, preparación técnica— y la trampa concreta de cada una.

**La sección que la diferencia** reproduce el hallazgo de ADR 0026 con su
tabla: ocho entidades que aparecen *siempre segundas* quedan ordenadas de 5,50
a 8,65 por una "posición media" que promedia las no-menciones. Esa métrica mide
frecuencia y la llama posición — un error real que este producto cometió,
corrigió y documentó.

**Con test que la mantiene viva** (`lib/blog/metricas-geo.test.ts`): el
artículo publica constantes del producto (`MIN_RESPONSES_FOR_BAND`,
`DEFAULT_SCORE_WINDOW_SIZE`, qué motores tienen grounding), así que caducaría
solo si el código cambiara. El test las importa y las contrasta contra el
texto. Detalle: log §73.

**Arrastra un refresco obligado:** `/blog/que-es-el-geo-score` seguía
publicando los cuatro componentes y los pesos de GEO Score **v2**, superados
por GEO-SCORE-V4 el 2026-08-05 — mientras `/docs/metodologia/geo-score` ya
publicaba los cinco. Actualizado en este mismo PR, con `dateUpdated` (primer
uso real del campo, T-c). Detalle: log §74.

**Revisión del fundador (2026-08-13):** *"no quiero exponer cosas tan concretas
del producto, como pesos reales para un cálculo o estos códigos ADR"*. Los pesos
del GEO Score y los códigos ADR salen de **todo** el contenido publicado —seis
superficies los tenían, y tres con la fórmula v2 ya retirada encima— y se
sustituyen por el orden de importancia y por fuentes verificables desde fuera.
Supersede en parte a §74. Detalle y alcance: log §75.

**Y dos fallos de descubribilidad**, del mismo patrón que §62: S1 nunca lo
había abierto el piloto (estaba en el fixture y no en el journey) y cuatro
artículos declaraban portada pero renderizaban el degradado con icono en su
propia cabecera. Los dos corregidos, los dos con test nuevo.

---

## Capa E — Observatorio

Requiere Task Intake y aprobación propia (coste de escaneos + metodología
publicada). No planificado en este calendario hasta esa aprobación.
