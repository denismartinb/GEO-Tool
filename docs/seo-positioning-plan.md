# Plan de posicionamiento SEO+GEO — GenScore (SEO-POS-1)

**Fecha:** 2026-08-09 · **Estado:** propuesto, pendiente de aprobación del
fundador · **Rama:** `claude/genscore-seo-positioning-plan-nxo451`

**Objetivo:** crecer el tráfico orgánico único de `www.genscore.es` de forma
sostenida, posicionando a GenScore como la referencia en castellano del sector
(posicionamiento GEO, aparecer en ChatGPT, SEO para IA) — tanto en Google como
en los propios motores generativos.

**Relación con lo ya aprobado:** este plan **no sustituye a GROWTH-2** — lo
audita, lo prioriza y lo completa. Las capas A–D de `docs/content-strategy.md`
están shipeadas en su primera versión; aquí se decide qué keywords atacar con
esa maquinaria y qué deuda técnica SEO hay que saldar primero. La sesión del
contractor de **performance/tiempos de carga corre en paralelo**: los hallazgos
de rendimiento de esta auditoría se le transfieren (sección 2.4), no se
implementan aquí.

---

## 1. Diagnóstico ejecutivo

La base técnica de GROWTH-2 (sitemap real con tests, canonicals, JSON-LD por
tipo de contenido, RSS, llms.txt, 46 URLs indexables) existe y es mejor que la
de la mayoría de sitios de este tamaño. Pero la auditoría de hoy encuentra
**16 gaps**, y los tres primeros son exactamente donde más duele:

1. **La home y `/pricing` no tienen metadata propia** — las dos URLs
   comerciales más valiosas del sitio se titulan "Genscore" a secas, sin
   descripción propia ni canonical, porque ambas son `"use client"` y no
   pueden exportar `metadata`.
2. **Ninguna página de contenido tiene Open Graph propio** — los 10 posts,
   4 comparativas, 5 docs y 16 páginas de glosario comparten título e imagen
   OG genéricos al compartirse.
3. **`/glosario` y `/comparativas` están huérfanas de navegación** — 21 URLs
   sin flujo de enlazado interno desde ninguna nav ni footer.

Además, **Search Console no estaba verificada** cuando se escribió esta
auditoría — sin ella no hay medición de nada de lo demás. **Resuelto el
2026-08-11:** el fundador dio de alta la propiedad (tipo Dominio, verificada
por DNS). Queda enviar el sitemap; ver Fase M.

## 2. Auditoría técnica — estado y gaps priorizados

### 2.1 Lo que ya está bien (no tocar)

- Sitemap programático con tests (`app/sitemap.ts` + `sitemap.test.ts`),
  fechas deliberadamente manuales para no degradar la señal de frescura.
- Canonicals absolutos y consistentes (sin trailing slash) en todo el
  contenido; `lang="es"`, `locale es_ES`, dominio único `www.genscore.es`.
- JSON-LD por tipo: `Organization` global, `BreadcrumbList` en todo el
  contenido, `Article` en los 10 posts, `DefinedTermSet`/`DefinedTerm` en
  glosario, `ItemList` en comparativas, `FAQPage` en 3 páginas.
- Test estático de integridad de enlaces (`lib/blog/article-links.test.ts`).
- Robots correcto para `/dashboard`, `/api`, `/auth`; ninguna página pública
  con `noindex` accidental.

### 2.2 Gaps P0 — bloquean o degradan la indexación/medición

| # | Gap | Evidencia | Arreglo |
|---|-----|-----------|---------|
| T1 | Home y `/pricing` sin metadata (título "Genscore", sin canonical, sin descripción) | `app/page.tsx:1` y `app/pricing/page.tsx:1` son `"use client"` | Dividir en page server + componente cliente; título/descripción con la keyword primaria de cada una |
| T2 | Verificar Search Console y enviar sitemap | Runbook en `docs/environment-contract.md` | ✅ **Hecho (2026-08-11).** Propiedad verificada (tipo Dominio, por DNS — `GOOGLE_SITE_VERIFICATION` resultó innecesaria) + sitemap enviado y leído: «Correcto», 47 páginas descubiertas |
| T3 | `/glosario`, `/comparativas` y `/docs` huérfanas de nav/footer | `app/page.tsx:78-83,304-311`, `blog-page-shell.tsx`, `docs-page-shell.tsx` | Añadir un bloque "Recursos" al footer de los 4 shells (landing, blog, docs, legal) con las 4 superficies de contenido |
| T4 | www/apex sin redirect verificable en el repo | Sin `redirects()` en `next.config.ts` ni en `vercel.json` — se resuelve en la configuración de Vercel, no en código | ✅ **Confirmado por el fundador (2026-08-11):** `genscore.es` redirige a `www.genscore.es` |

### 2.3 Gaps P1 — pierden CTR, señales o PageRank

| # | Gap | Evidencia | Arreglo |
|---|-----|-----------|---------|
| T5 | Cero OG/Twitter por página en todo el contenido | Solo `app/layout.tsx:54,63`; las portadas reales de `public/blog/<slug>/` no se usan como OG | Añadir `openGraph`/`twitter` a los helpers de metadata de blog/comparativas/glosario/docs, reutilizando las portadas existentes |
| T6 | `llms.txt` desactualizado a mano (lista 5 de 10 posts, 1 de 3 comparativas, 0 glosario) | `public/llms.txt` estático, sin test | Generarlo desde las mismas SSOT que el sitemap (`BLOG_POSTS`, `GLOSSARY_TERMS`, `DOCS_NAV`, comparativas) como route handler + test que impida el drift. Es el fichero que el propio producto predica — que esté rancio es un golpe de credibilidad |
| T7 | Sin `not-found.tsx` global (404 pelado de Next, sin nav ni enlaces) | `notFound()` se lanza desde `/blog/[cluster]` y `/glosario/[termino]` | `app/not-found.tsx` con marca, buscador de contenido y enlaces a hubs |
| T8 | `/pricing` con FAQ y planes sin datos estructurados | `PLAN_FAQ`/`PLANS` en `plans-data.ts:158+`; `FaqPageSchema` ya existe | `FAQPage` en `/pricing` y `/geo`; valorar `SoftwareApplication`+`Offer` |
| T9 | `Article.dateModified` siempre = `datePublished`; sin campo de refresco | `article-schema.tsx:26`; `BlogPost` sin `dateUpdated` | Añadir `dateUpdated` opcional a `BlogPost` y propagarlo a schema + meta visible. Prerrequisito de la cadencia de refrescos de `content-strategy.md` §4.4 |
| T10 | Auth pages indexables, thin, tituladas "Genscore" | `robots.ts` no las excluye; enlazadas desde todos los shells | `robots: { index: false }` en `/login`, `/signup`, `/signup/confirm`, `/forgot-password` |
| T11 | RSS invisible (nada enlaza `/feed.xml`) | Sin `alternates.types` ni `<link rel="alternate">` | `alternates.types` en metadata de `/blog` + enlace visible en el índice del blog |

### 2.4 Gaps P2 — transferir o coordinar

| # | Gap | Destino |
|---|-----|---------|
| T12 | Middleware corre en cada request pública (Supabase `getClaims()` + `Set-Cookie` que rompe caché CDN en `/blog/*`, `/docs/*`, `/glosario/*`) | **Sesión de performance** (contractor). Excluir rutas de contenido público del matcher es gratis y mejora TTFB de crawlers |
| T13 | Landing y `/pricing` 100% client-rendered; 4 familias de fuentes globales; sin config de `images` | **Sesión de performance.** T1 (split server/client) deja el terreno preparado |
| T14 | 3 posts incumplen el mínimo de 3 enlaces internos (§4.3): `que-es-geo-generative-engine-optimization` tiene **0** | Fase C de este plan (refrescos) |
| T15 | 3 posts sin `Article.image`; fechas de sitemap de pilares 2 días rancias | Fase T de este plan (barrido pequeño) |
| T16 | Ledger de capa A en `content-calendar.md` desincronizado del código (marca 🔲 lo que ya existe) | Corregir en el primer PR de este plan |

## 3. Base de keywords objetivo

Investigación de agosto 2026 (18 búsquedas; competitividad estimada
cualitativamente por quién posiciona, no por KD numérico — al verificar Search
Console y contratar/usar un tool de keywords se refinan los volúmenes).

### 3.1 Lectura estratégica

**El "qué es GEO" informacional ya está perdido**: lo ganaron en 2025 escuelas
de negocio (IEBS, UNIR), HubSpot ES y decenas de agencias. Pero la capa
siguiente — **medición, comparación de herramientas y verificación** ("¿mi
marca aparece en ChatGPT?", "¿con qué herramienta lo mido?", "alternativas a
Profound en español") — está en manos de dominios de menos de un año
(CreceRank, Trendsights, GEOPilot, blogs personales, incluso Quora). Esa capa
es exactamente donde vive GenScore como producto, y la ventana se estima en
**3-6 meses** antes de que se cierre.

**Terminología**: "posicionamiento GEO" gana en español de forma abrumadora.
"AEO" está capturado por HubSpot; "LLMO" es residual y ambiguo. Decisión:
**"posicionamiento GEO" como término primario del sitio, con "AEO" y "SEO
para IA" como secundarios en las mismas páginas** (triple targeting, como ya
hacen los ganadores). Coherente con el naming actual del producto y el blog.

**Inglés: no competir a corto plazo.** Los SERPs ingleses de la categoría son
pay-to-play de tools financiadas con VC (Profound ~$1B de valoración). El
diferencial defendible de GenScore es el mercado en español, hoy casi vacío
de competencia con autoridad.

**Contexto zero-click**: ~48% de las queries ya disparan AI Overview (activo
en España desde 03-2025, Modo IA en español desde 09-2025). Las piezas
informacionales de este nicho deben diseñarse **para ser citadas por los
motores**, no solo para el clic — lo que valida la estrategia GEO propia del
sitio (respuesta directa en los primeros 100 palabras, datos propios citables,
schema).

### 3.2 Clusters priorizados

| Prio | Cluster | Keywords núcleo | Intención | Competencia | Página destino |
|---|---|---|---|---|---|
| **1** | Verificación | "cómo saber si mi marca aparece en ChatGPT", "monitorizar marca en ChatGPT", "cómo saber si la IA cita tu web" | Transaccional (pre-producto) | **Baja** — Quora posiciona | Página nueva + free checker (ver Fase P) |
| **2** | Alternativas | "alternativas a Profound", "alternativas a Otterly", "alternativas a Peec AI", "Semrush AI Toolkit vs Ahrefs Brand Radar" (todo en ES) | Transaccional | **Virgen en ES** | Serie `/comparativas` (formato ya shipeado) |
| **3** | Herramientas | "herramientas GEO en español", "mejores herramientas GEO 2026", "herramienta GEO gratis" | Comercial-transaccional | Media, subiendo rápido | `/comparativas/mejores-herramientas-geo-en-espanol` (refrescar + ampliar) |
| **4** | Pyme/local | "cómo hacer que ChatGPT recomiende mi negocio" (+cola: restaurante, clínica, despacho…) | Comercial | Media — blogs personales | Cluster playbooks + variantes sectores |
| **5** | Auditoría | "auditoría GEO", "checklist GEO" | Mid-funnel | **Baja** | Página nueva ligada a la feature real de auditoría web |
| **6** | Métricas | "métricas GEO", "share of voice en IA", "tasa de citación" | Info→Comercial | **Baja** — 1 competidor serio | Cluster medicion (pilar a reforzar) + glosario |
| **7** | Motor a motor | "cómo aparecer en Perplexity", "cómo aparecer en Google AI Overviews", "aparecer en Gemini", "Modo IA de Google" | Info/Comercial | Baja-media | Serie playbooks con estructura idéntica |
| **8** | Analítica | "medir tráfico desde ChatGPT en GA4", canal "Asistente de IA" | Info | Baja-media (feature GA4 de 05-2026, query nueva) | Post medicion |
| 9 | Definiciones | "AEO vs GEO", "LLMO", "optimización para buscadores de IA" | Info | Media (HubSpot) | Glosario + pilar fundamentos (ya existe; solo secundarias) |

Queda **explícitamente descartado**: pelear "qué es GEO"/"posicionamiento GEO"
genérico con una pieza nueva (saturado), y cualquier contenido en inglés.

### 3.3 Preguntas PAA reales (para H2s y FAQPage schema)

Recogidas verbatim de lo que posiciona hoy: ¿Cómo saber si mi marca aparece en
ChatGPT, Gemini o Perplexity? · ¿Cómo hacer que ChatGPT recomiende mi empresa?
· ¿Qué herramientas miden la visibilidad de una marca en la IA? · ¿Qué es una
auditoría GEO? · ¿Cuánto cuesta el posicionamiento GEO? · ¿GEO reemplazará al
SEO? · ¿Cómo aparecer en Perplexity con tu empresa? · ¿Cómo ver en Google
Analytics el tráfico que llega desde ChatGPT? · ¿Cuál es la diferencia entre
SEO, AEO y GEO?

### 3.4 Dónde citan los motores (para la pata off-site)

Reddit ~40% de frecuencia de cita agregada (Perplexity ~47%), Wikipedia
(ChatGPT ~48%), YouTube (AI Overviews ~23%), LinkedIn. Solo el 11% de dominios
son citados por ChatGPT y Perplexity a la vez → hay que trabajar cada canal.
ChatGPT busca vía Bing → **Bing Webmaster Tools es un requisito, no un
opcional**. Los rankings "Top agencias GEO España" salen por nota de prensa.

---

## 4. Plan por fases

Orden pensado para: (1) no medir a ciegas, (2) saldar la deuda técnica que
multiplica todo lo demás, (3) atacar la ventana de 3-6 meses de los clusters
1-3 antes de que se cierre. Cada fase = PRs pequeños con Human Gate, como
siempre. Un push por iteración pilotable (BUILD-BUDGET-1).

### Fase M — Medición primero (fundador, sin código, ~30 min)

- [x] **Search Console verificada (2026-08-11).** Propiedad de tipo **Dominio**
      (`genscore.es`), verificada por DNS — cubre apex, `www` y cualquier
      subdominio de una vez, así que **no hace falta una segunda propiedad para
      `www`** ni la variable `GOOGLE_SITE_VERIFICATION` (esa solo sirve para el
      método de etiqueta HTML). Detalle y cómo distinguir el tipo de propiedad:
      `docs/environment-contract.md`. **T2 parcialmente cerrado.**
- [x] **Sitemap enviado y leído (2026-08-11).** Estado «Correcto» en Search
      Console, **47 páginas descubiertas** — coincide con lo que genera
      `app/sitemap.ts`, así que Google está viendo el inventario completo, no
      un subconjunto. **T2 cerrado.**
- [x] **Redirect apex → www confirmado (2026-08-11)** por el fundador en el
      navegador. **T4 cerrado.** No es verificable desde el entorno de los
      agentes: el proxy de salida bloquea genscore.es (comprobado el mismo
      día), así que esta comprobación es siempre manual — una sesión no puede
      cerrarla por su cuenta ni dar por hecho el resultado.
- [x] **Bing Webmaster Tools dado de alta y sitemap enviado (2026-08-11).**
      Estado «Success», **47 URLs descubiertas, 0 errores, 0 avisos** — el
      mismo número que Google, señal de que ambos índices ven el inventario
      completo y coincidente. Importa porque es el índice que consulta
      ChatGPT: para el objetivo GEO pesa tanto como Google.
- [ ] (Ya disponible) Panel PostHog: canal de adquisición organic/referral
      para tener la línea base de tráfico único antes del plan.

**✅ FASE M CERRADA (2026-08-11).** Google y Bing verificados, ambos leyendo
el sitemap con 47 URLs y sin errores, redirect apex→www confirmado. Ya hay
dónde medir todo lo demás.

**Nota de expectativas:** aunque todo esté bien configurado, Search Console y
Bing tardan días en mostrar datos — un panel vacío al día siguiente no
significa que algo esté mal. La primera lectura útil del bucle de §5 no será
inmediata.

### Fase T — Deuda técnica SEO (agentes, 2-3 PRs pequeños)

**PR T-a (P0) — ✅ hecho (2026-08-09, este PR).** T1 (metadata + canonical
reales en home y `/pricing` vía split servidor/cliente; verificado en el HTML
del build), T3 (las 4 superficies de contenido en los 5 pies de marketing,
desde una lista compartida), T16 (ledger de capa A sincronizado). 20 tests
nuevos, 1810/1810 en verde, `pnpm run validate` limpio. Detalle: log §46.

**PR T-b (P1) — ✅ hecho (2026-08-09, este PR).** T5 (OG/Twitter por página
desde un constructor único, `lib/seo/metadata.ts`), T6 (`llms.txt` generado
desde las SSOT + test anti-drift; el estático listaba la mitad del contenido),
T7 (`not-found.tsx` global), T10 (`noindex` en las 4 pantallas de acceso), T11
(RSS descubrible y enlazado). 19 tests nuevos, 1829/1829 en verde.

Tres fallos reales encontrados al implementarlo, todos verificados sobre el
HTML del build y no sobre el código: el `openGraph` de una página **reemplaza**
el del layout raíz (T-a había dejado sin `og:image` a la home y a `/pricing`),
un `og:image` en SVG da tarjeta en blanco (3 portadas lo son), y las portadas
PNG reales son cuadradas de 1254×1254, no 1200×630. Detalle: log §47.

**PR T-c (P1, pequeño) — ✅ hecho (2026-08-10).** T8 (`FAQPage` solo en
`/pricing`, reusando `PLAN_FAQ` real; `/geo` se queda fuera a propósito, no
tiene ningún FAQ real que marcar), T9 (`dateUpdated` opcional en `BlogPost` →
`ArticleSchema.dateModified` + `openGraph.modifiedTime` + componente
`PostMeta` visible; ningún post tiene fecha de refresco todavía, es la
tubería), T15 (3 portadas nuevas — diseñadas como evidencia real del artículo,
no decoración — para `que-es-el-geo-score`, `llms-txt-guia-practica` y
`como-conseguir-que-chatgpt-te-cite`; fecha de sitemap de `sectores`
independizada de los otros tres pilares). 33 tests nuevos, 1885/1885 en
verde. Detalle: log §48.

T12 y T13 se transfieren a la sesión de performance (nota abajo).

### Fase C — Contenido sobre la ventana de oportunidad (agentes, la maquinaria GROWTH-2)

Sustituye la cola genérica del calendario por esta cola priorizada — cada
pieza sigue siendo un PR con brief de `seo-geo-research`, redacción de
`growth-content`, ledger en `content-calendar.md` y Human Gate:

| Orden | Pieza | Cluster kw | Capa |
|---|---|---|---|
| C1 | ✅ **Hecho (2026-08-10)** — "Cómo saber si tu marca aparece en ChatGPT, Gemini y Claude" (título corregido: la redacción original de esta fila decía "…y Perplexity", que no es un motor soportado hoy — se habría publicado el mismo reclamo falso que PRICING-TRUTH-1 retiró del producto). CTA al escaneo gratuito real. Detalle: `docs/content-calendar.md`, log §50 | 1 | B/playbooks |
| C2 | ✅ **Hecho (2026-08-10)** — `/comparativas/genscore-vs-profound`. Precio de Profound sin cifra fija a propósito: su web ya no lo publica y las fuentes de terceros se contradicen. Detalle: `docs/content-calendar.md`, log §58 | 2 | C/comparativas |
| C3 | ✅ **Hecho (2026-08-12)** — `/comparativas/alternativas-a-otterly`. Organizada por el límite que empuja a buscar alternativa (tope de prompts, motores como add-on, ejecución, idioma), no por ranking. Reencuadrada tras revisión del fundador (log §67): posiciona en vez de arbitrar, cada ventaja del competidor va con el contexto de a quién le sirve, y cada alternativa —Genscore incluida— declara dónde no llega, con test que exige por nombre nuestros límites reales. Detalle: `docs/content-calendar.md`, log §66 y §67 | 2 | C/comparativas |
| C4 | ✅ **Hecho (2026-08-12)** — pilar de 6 a 8 herramientas. Entran CreceRank (competencia directa en castellano, obligó a corregir un "solo Genscore" que había dejado de ser cierto) y Mentio (sin cifra de precio: las fuentes lo confunden con GetMentioned). **TrendSights descartada**: es monitorización de medios, no GEO. Detalle: `docs/content-calendar.md`, log §68 | 3 | C/comparativas |
| C5 | ✅ **Hecho (2026-08-13)** — `/blog/que-es-una-auditoria-geo`. Publica las seis dimensiones de `page-checks.ts` con sus umbrales exactos, sin el reparto de puntos (revisión del fundador: es metodología, no buena práctica), un checklist de 13 puntos ejecutable a mano sobre el código fuente, y declara dónde acaba una auditoría técnica. Detalle: `docs/content-calendar.md`, log §69 | 5 | B/playbooks |
| C6 | ✅ **Hecho (2026-08-13)** — `/blog/metricas-geo-que-medir`. Se organiza alrededor del denominador (la unidad es la respuesta, no el prompt) y publica la tabla de ADR 0026: ocho entidades que aparecen siempre segundas, ordenadas de 5,50 a 8,65 por una "posición media" que promedia las no-menciones. Con test que ata las constantes publicadas al código (`metricas-geo.test.ts`). Arrastra el refresco del pilar `que-es-el-geo-score`, que seguía en los pesos de GEO Score v2. Detalle: `docs/content-calendar.md`, log §73 y §74 | 6 | B/medicion |
| C7 | "Cómo aparecer en Perplexity" | 7 | B/playbooks |
| C8 | ✅ **Hecho (2026-08-14)** — `/blog/como-medir-trafico-chatgpt-ga4`. Cierra la capa de medición. El eje no es "dónde está el canal nuevo de GA4" (eso lo cuentan veinte guías) sino que **ese canal se mueve sin que se mueva el tráfico**: sólo ve las visitas que traen referente y esa proporción cambia sola. Con las tres ausencias declaradas —Perplexity en Referencia, AI Overviews en orgánico, lista de asistentes no pública— y el techo dicho en voz alta: GA4 cuenta clics, no menciones. Test que extrae del artículo la expresión regular publicada y comprueba que compila y captura lo que el texto promete. Detalle: `docs/content-calendar.md`, log §85 | 8 | B/medicion |
| C9 | ✅ **Hecho (2026-08-15)** — `/blog/como-hacer-que-chatgpt-recomiende-tu-negocio` (PR #409). Abre la cola sectorial local: por qué una pregunta local se juega entre dos o tres negocios y qué mueve de verdad la recomendación (coherencia de datos, reseñas recientes, contenido específico, presencia local). **Techo y guardián añadidos después** (log §91): la keyword la ocupan páginas que garantizan resultados, así que el artículo declara que nadie puede garantizar una recomendación y un test persigue que esa frase no desaparezca | 4 | B/playbooks |
| C10 | Glosario: +5 términos de la capa de medición ("share of voice en IA" ya existe; añadir p. ej. "auditoría GEO", "AI Mode", "answer engine", "cita de fuente", "brand monitoring en IA") | 6/9 | D/glosario |

Las W4-W6 pendientes del calendario actual encajan (W4≈C6, W5 y W6 siguen
valiendo) — se reordenan, no se tiran. Los 3 posts con enlazado interno
deficiente (T14) se arreglan como los "refrescos" de la cadencia semanal.
Cadencia: la ya aprobada (§5 de `content-strategy.md`), sin cambios.

### Fase P — Free checker "¿Aparece tu marca en ChatGPT?" ⚠️ (requiere su propio Task Intake)

La oportunidad nº 1 de la investigación y el patrón de mayor conversión
demostrado (Semrush free checker, HubSpot AEO Grader): una página pública que
ejecuta una comprobación real y pide el email/registro para el informe
completo. **No se implementa bajo este plan**: toca pipeline de escaneo, coste
por consulta, rate limiting y superficie de abuso (data-guardian), y bordea
"fake scans" si no se diseña con escaneos reales. Si el fundador la aprueba,
será su propio Task Intake con presupuesto de coste explícito. Mientras tanto,
C1 cumple el papel con CTA al plan Free real.

### Fase A — Autoridad y off-site (fundador, con material preparado por agentes)

Del análisis de citas (§3.4). Los agentes preparan el material; publicar y
conversar es del fundador (`content-strategy.md` §3 ya lo asigna así):

- [ ] **Reddit**: presencia útil (no spam) en r/SEO_espanol e hilos de
      herramientas — es la fuente nº 1 de citas de Perplexity.
- [ ] **YouTube**: 2-3 vídeos cortos ("cómo saber si ChatGPT te menciona") —
      fuente nº 1 de AI Overviews.
- [ ] **Nota de prensa de datos propios** cuando el Observatorio (capa E,
      aprobación aparte) genere el primer estudio: "qué marcas españolas cita
      ChatGPT en [sector]". Es el arma que ninguna agencia ES tiene.
- [ ] Directorios B2B (G2/Capterra) y perfiles (LinkedIn) — ya listado en §3
      de content-strategy.
- [ ] EUIPO pendiente de Fase 0 del launch-plan: recomendable antes de
      invertir en difusión pagada del nombre.

### Coordinación con la sesión de performance

Los gaps T12 (matcher del middleware excluyendo rutas públicas de contenido —
gratis y mejora TTFB/caché CDN para crawlers) y T13 (landing/pricing 100%
client, 4 familias de fuentes, sin config de `images`) son de esa sesión. El
split server/client de T1 conviene hacerlo **antes** o coordinado, porque les
deja el terreno preparado. Core Web Vitals son señal de ranking: su trabajo
suma directamente a este plan.

---

## 5. Medición y bucle de control

**KPI norte:** visitantes únicos orgánicos/mes (PostHog, canal organic +
referral de IA) y, como leading indicators: impresiones/clics en GSC y Bing
WMT, nº de keywords en top 10, y **visibilidad de GenScore en los propios
motores de IA medida con GenScore** (dogfooding: proyecto propio monitorizando
"mejor herramienta GEO en español", "cómo saber si mi marca aparece en
ChatGPT", etc. — somos nuestro propio caso de uso y el primer estudio de
datos del Observatorio puede salir de ahí).

**Bucle mensual** (cabe en la cadencia semanal ya aprobada):
1. GSC/Bing: qué queries ganan impresiones sin clics → refrescos dirigidos.
2. PostHog: qué piezas convierten a registro → más de ese cluster.
3. GenScore sobre GenScore: ¿nos cita ya algún motor? → informe al fundador.
4. Vigilancia de CreceRank y Trendsights (los dos rivales que ejecutan este
   mismo playbook).

**Riesgos declarados:** los volúmenes son estimaciones cualitativas hasta que
GSC acumule datos; el tráfico referral desde IA es hoy ~1% del total del
mercado (aunque convierte ~4x mejor — el argumento B2B, no el de volumen); la
ventana de los clusters 1-3 puede cerrarse antes si CreceRank/Trendsights
aceleran.

---

## 5.1 Trabajo relacionado, fuera de las fases numeradas

**COMPARATIVAS-DESIGN-1 — ✅ hecho (2026-08-11).** Task Intake propio, aprobado
por el fundador tras revisar el preview de S2. No estaba en el plan original:
surgió de una pregunta directa sobre por qué `/comparativas` se veía más
plana que el resto del sitio. Las 4 páginas de comparativas migraron de
`legal-body` (la clase de las páginas legales) al mismo sistema de bloques
que usa el blog — `KeyTakeaway`, `CompareTable`+`Pill`, `Verdict`, `ArticleCta`
real. Sin cambios de dato. Detalle: log §59.

---

## 6. Qué se pide aprobar

1. **Fase M** (fundador, 30 min) — sin riesgo, desbloquea la medición.
2. **Fase T** (3 PRs técnicos pequeños) — sin tocar áreas prohibidas.
3. **Fase C** (cola de 10 piezas reordenando el calendario) — usa la
   maquinaria GROWTH-2 ya aprobada; solo cambia el orden y el objetivo.
4. **Fase P** — NO se aprueba aquí; si interesa, pedirá su propio Task Intake.
5. **Fase A** — tareas del fundador con material preparado por agentes.

> Do you approve this plan? I will not implement until you confirm.

