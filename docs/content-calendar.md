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
| B4 | `/blog/geo-vs-aeo-vs-seo` (cluster fundamentos) | ✅ Hecho | — |

**B4 — hecho (2026-08-23).** `/blog/geo-vs-aeo-vs-seo`, keyword primaria "geo
vs aeo vs seo" (secundarias: aeo, llmo, generative engine optimization,
answer engine optimization, diferencia entre seo y geo). Encargo directo del
fundador, no del brief de `seo-geo-research`: el sector todavía no se ha
puesto de acuerdo en cómo llamar a esta disciplina, y la gente sigue
buscando más en términos de SEO que de GEO/AEO. El eje es **la confusión de
nomenclatura en sí** — de dónde sale cada sigla, quién usa cuál y por qué, y
cuándo conviene cada una — deliberadamente distinto del ya publicado
`/blog/que-es-geo-generative-engine-optimization` (que cubre "qué es GEO y
en qué se diferencia del SEO" en profundidad); ambos son del cluster
`fundamentos` y se enlazan entre sí, de forma recíproca vía `RelatedPosts`
(misma cluster) y con un enlace contextual explícito en el cuerpo hacia el
artículo existente para no duplicar su explicación.

Decisiones de honestidad tomadas:

- **Ninguna cifra de cuota de mercado entre GEO/AEO/SEO/LLMO.** El texto dice
  qué término "hemos visto usar más" entre herramientas y medios en español
  — una observación editorial en primera persona, no un dato de mercado
  verificado con fuente y tamaño de muestra. No se afirma ningún porcentaje
  de búsquedas ni de adopción.
- **El ejemplo de "un proveedor de este sector prefiere AEO a GEO" se deja
  sin nombrar la empresa concreta** en el cuerpo publicado, precisamente para
  no tener que sostener una cita textual de su blog que esta sesión no pudo
  verificar contra la fuente primaria (el proxy de salida bloqueó el fetch).
  Se mantiene sólo el hecho de que existe divergencia real de naming dentro
  del propio sector, que sí está bien corroborado.
- Ningún motor no soportado (Perplexity, Copilot) se nombra en ningún sitio
  del artículo — no hacía falta para el ángulo de esta pieza.
- Portada dibujada en SVG y rasterizada a WebP con `sharp` (Playwright no
  pudo descargar Chromium en este entorno — proxy de egress —, así que la
  conversión SVG→WebP se hizo con la librería `sharp` ya presente como
  dependencia transitiva, sin usar navegador). Verificada la tira de 96 px
  (`.blog-cover-compact`) simulando el recorte a 1124×96 antes de darla por
  buena: las cuatro siglas se leen enteras ahí, que es donde de verdad se ve
  la portada.

**Revisión del fundador (2026-08-23):** *"dale una vuelta para que parezca un
pelín más humano, quitando las típicas expresiones que genera la IA"* y *"genera
otra portada más visual y parecida al resto"*. Dos correcciones:

1. **Portada rehecha.** La primera era un degradado plano con un diagrama
   pequeño en el centro, y las otras 16 del catálogo comparten un lenguaje
   visual muy definido que aquella ignoraba: fondo casi negro azulado, paneles
   translúcidos con neón, y una composición de izquierda a derecha —muchas
   piezas dispersas → convergen en una lente → un panel resuelto—. La nueva la
   habla: las cuatro siglas como etiquetas dispersas sobre un muro de tarjetas
   de contenido, sus haces convergiendo en la lente, y a la derecha la
   respuesta generada con la marca mencionada y su cita. **El fallo no lo
   habría cogido ningún test**: `covers.test.ts` comprueba que la portada
   declarada existe y se enseña, no que se parezca a las demás. Sólo se ve
   poniendo las 17 una debajo de otra.
2. **Texto repasado para quitarle el acento de IA.** Los guiones largos pasan
   de 25 a 1, y se van los tics de construcción repetida ("en la práctica",
   "lo que sí", "cabe en una frase", "un ejemplo real de", "nota al margen") y
   sobre todo la antítesis "no es X, es Y", que aparecía siete veces y es la
   marca de fábrica más reconocible. Frases de longitud variada en vez del
   ritmo parejo de antes. No cambia ninguna afirmación ni ningún enlace: el
   recuento del cuerpo se queda en 1.556 palabras, dentro del rango de la
   guía, y los cuatro enlaces internos siguen donde estaban.

- **El SVG fuente de la portada NO vive en `public/`** sino en
  `docs/design-reference/blog-covers/`. Son 57 KB que ninguna página pide (la
  que se sirve es la WebP de 28 KB), y `public/` se sirve entero desde el mismo
  origen que las páginas públicas. El diagrama del cuerpo (`solapamiento.svg`,
  4 KB) sí se queda en `public/` porque el artículo lo carga.
- **Subido el tope de `tests/asset-budget.test.ts` de 1,5 a 1,75 MB**, con la
  razón escrita en el propio test, como manda su comentario de cabecera. No es
  para acomodar esta portada: en `main` quedaban **24 KB libres** de
  presupuesto y las portadas ya publicadas pesan entre 59 y 88 KB, así que el
  tope llevaba tiempo impidiendo publicar cualquier pieza nueva con portada.
- Añadido a las dos listas del piloto en este mismo PR: `BLOG_SLUGS` en
  `tests/pilot/fixtures/server.mjs` y `BLOG_POSTS_BY_CLUSTER` en
  `tests/pilot/journeys/public-pages.spec.ts`.

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
| S7 | Cómo aparecer en Perplexity | 7 — Motor a motor | `playbooks` | ✅ Publicado | #(este) |
| S8 | Cómo medir en GA4 el tráfico que llega desde ChatGPT | 8 — Analítica | `medicion` | ✅ Publicado | #401 |
| S9 | Cómo hacer que ChatGPT recomiende tu negocio (pyme) | 4 — Pyme/local | `playbooks` | ✅ Publicado | #409 |
| S10 | Glosario: +5 términos de la capa de medición | 6/9 — Métricas/Definiciones | `glosario` | ✅ Publicado | #(este) |

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
**Incluida `/docs/metodologia/geo-score`**, por decisión expresa del fundador
al preguntársele: no es un artículo, pero era la página a la que los artículos
mandaban a buscar el detalle. Supersede en parte a §74. Detalle y alcance:
log §75.

**Segunda pasada, mismo día (log §76):** la primera quitó los parámetros y dejó
la mecánica —"una media ponderada de cinco señales", la renormalización, los
umbrales—. El fundador lo señaló: además de desvelar el cálculo, **abarata la
métrica**. La línea definitiva es *el contenido explica el problema y el
criterio, no nuestra máquina*. Reescritos el pilar (retitulado "…y qué mide"),
el artículo de métricas, la doc de metodología, el glosario y **la landing
`/geo`**, que publicaba el desglose aritmético completo con los pesos de v2.

**Y dos fallos de descubribilidad**, del mismo patrón que §62: S1 nunca lo
había abierto el piloto (estaba en el fixture y no en el journey) y cuatro
artículos declaraban portada pero renderizaban el degradado con icono en su
propia cabecera. Los dos corregidos, los dos con test nuevo.

**S7 — hecho (2026-08-14).** `/blog/como-aparecer-en-perplexity`, cluster
`playbooks`. Task Intake previo: el borrador inicial iba a anunciar Perplexity
"próximamente disponible" en Genscore, y el fundador lo frenó — no hay fecha ni
decisión de producto real detrás, y decirlo habría repetido el mismo error que
PRICING-TRUTH-1 ya corrigió (`docs/launch-plan.md:361-378`). Investigación de
código previa a escribir (motor nuevo = migración de esquema + ADR de scoring +
subir el cap de motores de los planes, las tres cosas en Forbidden Without
Explicit Approval) confirmó que comprometer una fecha sin esa decisión habría
sido publicidad sin base. El fundador eligió "S7 sin la promesa".

La pieza trata Perplexity como **tema de mercado**, no como feature: qué lo
diferencia de Google y de un chat conversacional (respuestas con cita numerada
anclada a cada afirmación, no solo mención), qué mueve de verdad que te cite, y
un `Verdict` explícito de que Genscore no lo mide hoy, sin fecha. Añadido a
`ALLOWED_TO_MENTION_PERPLEXITY` con la justificación en el propio test — es el
único slug de esa lista cuando se escribió — el segundo lo añadió S8, ver
abajo.

**S8 — hecho (2026-08-14).** `/blog/como-medir-trafico-chatgpt-ga4`, cluster
`medicion`. Cierra el último hueco de la capa de medición: qué enseña el canal
«Asistente de IA» que GA4 estrenó el 13 de mayo de 2026, dónde se mira, y las
tres cosas que **no** cuenta — Perplexity se queda en Referencia, los AI
Overviews de Google van a Búsqueda orgánica, y la lista de asistentes
reconocidos no es pública.

**Lo que la diferencia de las veinte guías que ya existen sobre esto:** todas
explican dónde está el canal nuevo; ninguna dice que **el canal se mueve sin
que se mueva el tráfico**. Solo ve las visitas que traen referente, y la
proporción que lo trae cambia sola con cada versión de una aplicación, así que
dos meses idénticos en tráfico real dan lecturas distintas. Es la trampa de la
«posición media» de S6 con otro disfraz, y va con su figura de aritmética
declarada como ejemplo.

**Primera entrada del allow-list de Perplexity** (`article-honesty.test.ts`),
prevista por el propio diseño del test: aquí Perplexity no aparece como motor
nuestro sino como la fuente de tráfico que el lector no encuentra donde
debería. La metadata no lo nombra y el CTA nombra los tres motores que sí
ejecutamos — las dos cosas con test.

**Test propio** (`lib/blog/ga4-chatgpt.test.ts`): el artículo publica una
expresión regular para que el lector la pegue en su GA4, y prosa dentro de un
MDX no la compila nadie. El test la **extrae del `CodeBlock`** y comprueba que
compila, que captura los seis asistentes que el texto nombra, que no captura
`google`/`bing` (recogerlos se comería el canal orgánico entero) y que los
puntos van escapados. Además exige que toda cifra de tercero lleve su `source`
y su tamaño de muestra.

**Tres arreglos que salieron de mirar las capturas del piloto**, no de su tabla
—que dio ✅ en las tres anchuras las dos veces:

1. **Figuras recortadas en 375 px** (las dos nuevas y la de S6, que llevaba dos
   días así): perdían su última columna, que en las tres es la que lleva la
   conclusión. `.art-frame` recorta en vez de deslizar — correcto para un SVG,
   pésimo para una tabla. Nuevo `<Figure wide>`, con test que lo exige en
   cualquier figura que contenga una tabla.
2. **La expresión regular aparecía cortada en escritorio y sin aviso**, porque
   la pista de deslizar sólo existe bajo 640 px. Es el único entregable
   ejecutable del artículo y no se puede copiar lo que no se ve: nuevo
   `<CodeBlock wrap>`, ajuste visual que no mete saltos en el portapapeles.
3. **La portada se leía como un bloque gris roto** en la tira de 96 px del
   artículo, que sólo enseña el tercio central de la altura. Recompuesta dentro
   de esa banda y con el gris pizarra pasado a azul en familia.
4. **Y el peor, encontrado al verificar el anterior: MDX se comía las barras
   invertidas de la expresión regular.** El fichero decía `chatgpt\.com` y el
   lector copiaba `chatgpt.com`, con cada punto como comodín. El test lo
   aprobaba —tenía un caso llamado "escapa los puntos"— porque leía el MDX del
   disco, o sea el lado de antes de la transformación que rompía el dato. La
   expresión pasa a vivir en `lib/blog/ga4-source-regex.ts`, el MDX la renderiza
   como expresión y el test importa ese mismo valor: ya no hay dos versiones que
   puedan diferir.

Detalle de los cuatro: log §85.

**Fuentes:** el proxy de salida bloquea `support.google.com` y casi toda la
cobertura del anuncio, así que nada está verificado contra fuente primaria —
se triangularon fuentes secundarias coincidentes el 2026-08-14 y el artículo
publica esa fecha. Misma limitación declarada que con los precios de Otterly.
Detalle: log §85.

**S9 — hecho (2026-08-15).** `/blog/como-hacer-que-chatgpt-recomiende-tu-negocio`,
cluster `playbooks`. El eje: una pregunta local ("¿qué dentista en Chamberí
atiende urgencias el domingo?") sólo puede tener dos o tres respuestas
posibles, a diferencia de una pregunta genérica de categoría — así que un
negocio pequeño no compite contra el mercado entero, compite contra dos o tres
negocios reales de su zona. Cuatro palancas reales: datos consistentes
(nombre/dirección/teléfono) en toda la web, reseñas genuinas y recientes
(un motor que busca en tiempo real pesa más lo reciente), contenido propio
con la misma especificidad que la pregunta del cliente, y presencia
selectiva en directorios/prensa real de la zona — nunca comprada, con
`Checklist tone="evitar"` que lo dice explícito.

Ninguna cifra de terceros sin fuente: no hay un dato fiable y verificado de
cuánto pesa cada señal para un motor generativo en preguntas locales, así que
el artículo se queda en el criterio observable (qué mira un motor que busca
en la web) y no inventa un porcentaje. Mismo principio de honestidad que ya
rigió S6/S7.

**S10 — hecho (2026-08-15).** Cinco términos nuevos en `/glosario`, capa de
medición: tasa de mención, prominencia, mención verificada, variabilidad de
las respuestas de IA y LLMO. No son sinónimos sueltos de los 15 ya
publicados — cada uno cierra un error de cálculo concreto que S6
(`/blog/metricas-geo-que-medir`) ya había nombrado en prosa pero que no tenía
su propia entrada canónica a la que enlazar: prominencia explica por qué
promediar posición incluyendo las no-menciones invierte el ranking (el mismo
hallazgo de ADR 0026 que S6 reproduce con tabla), mención verificada distingue
confirmar contra el texto real de la respuesta frente a preguntarle al modelo
por su propio trabajo, y variabilidad explica por qué una sola consulta nunca
es una medición fiable.

`longDefinition` de cada término entre 150 y 300 palabras y ≥3
`relatedLinks` reales (cruzados entre sí, hacia glosario existente y hacia
`/blog/metricas-geo-que-medir`), verificado por `lib/glosario/terms.test.ts`.
Pasa también el guardián de honestidad (`article-honesty.test.ts`): ninguna
entrada cita un código ADR, publica un peso del compuesto ni explica la
mecánica de cálculo del GEO Score — LLMO, por ejemplo, se queda en "es un
término alternativo a GEO, mismo objetivo, sin reparto ni fórmula que contar".
`GLOSSARY_LAST_MODIFIED` actualizado en `app/glosario/[termino]/page.tsx` y
`app/sitemap.ts` (2026-08-13 → 2026-08-15), con su test de consistencia entre
ambos ficheros. `/glosario/page.tsx` es dinámico sobre `GLOSSARY_TERMS`, así
que las cinco entradas aparecen en el índice sin tocar esa página.

Con S9 y S10 mergeados se cierra la cola completa de 10 piezas de
SEO-POS-1 Fase C.

---

## Capa E — Observatorio

Requiere Task Intake y aprobación propia (coste de escaneos + metodología
publicada). No planificado en este calendario hasta esa aprobación.
