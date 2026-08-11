---
description: Invariantes del contenido de adquisición orgánica (blog, comparativas, docs, glosario).
paths:
  - "app/blog/**"
  - "app/comparativas/**"
  - "app/docs/**"
  - "app/glosario/**"
  - "lib/blog/**"
  - "lib/comparativas/**"
  - "lib/docs/**"
  - "lib/glosario/**"
---

# Contenido / GROWTH — invariantes

Arquitectura y reglas de redacción: `docs/content-strategy.md`.
Historia de decisiones visuales: `docs/brand/design-decisions-log.md` §12 y §13.

## Honestidad (la regla dura)

- **Toda afirmación sobre metodología, feature o capacidad del producto debe
  trazarse a un ADR o al código real.** Si no se puede trazar, no se publica
  (content-strategy §4.5).
- **Ninguna cifra de mercado de terceros se presenta como dato propio de
  Genscore.** Sólo el Observatorio (capa E, con aprobación aparte) genera dato
  propio real.
- **Un peso no es un valor medido** (log §13). No presentar un parámetro de
  configuración del score como si fuera un resultado observado.

## Imágenes

- **Ningún visual es decorativo: todos son evidencia** (ADR 0026
  `article-imagery-policy`). Cada imagen es una captura que prueba la
  afirmación, un ejemplo enmarcado del patrón que se enseña, o una tarjeta de
  dato con su fuente. Si una imagen no prueba nada, no va.

## Redacción

- La densidad de palabra clave es un **techo, no un objetivo** (§4.2).
- Copy de cara al usuario en castellano; código, identificadores, comentarios y
  commits en inglés.
- El nombre público es **Genscore**. "GEO Studio" es el nombre interno del repo
  y "Lumira" está retirado — no reintroducir ninguno en copy de usuario.

## Si esto lo escribe la sesión semanal automática

Su encargo completo está en `docs/agentic-weekly-post.md` — leerlo antes de
seguir. Dos invariantes que no son cosméticos (log §19):

- **La rama se llama `claude/weekly-post/<slug>`.** Fuera de ese prefijo, el
  workflow que garantiza que el PR se abra (`weekly-post-pr.yml`) no dispara, y
  el artículo se queda en una rama que nadie mira.
- **El mensaje del último commit es el PR**: asunto → título, cuerpo → cuerpo.
  Si el PR lo abre el workflow, ese mensaje es lo único que el agente controla,
  así que ahí va lo que el fundador necesita para decidir: qué se publica, la
  URL de preview y qué queda pendiente. **Corto** — se lee en el móvil.
- **La portada la dibuja el agente**, en SVG, dentro del repo
  (`docs/agentic-weekly-post.md` §4). Un artículo semanal ya no deja tests
  rojos por falta de portada, y `COVER_DEBT` sigue congelada: no se añade nada
  a esa lista nunca.

## Al cerrar una pieza

- Actualizar `docs/content-calendar.md` **en el mismo PR** que publica la pieza
  (una fila por pieza). El calendario es el libro mayor: una pieza publicada que
  no aparece ahí queda invisible para la siguiente sesión.

## Enlazado de las superficies de contenido

- **Toda superficie de contenido publicada se enlaza desde los pies de
  marketing, y desde la lista compartida.** Las cinco shells
  (`landing-page`, `pricing-page`, `blog-page-shell`, `docs-page-shell`,
  `legal-page-shell`) renderizan `components/marketing-content-links.ts`; no se
  añade un `<Link>` a mano en un pie. `/glosario` y `/comparativas` se
  publicaron sin enlazar y pasaron meses con 21 URLs sin un solo enlace
  entrante del propio sitio, porque el test de enlaces comprueba que los
  enlaces que existen resuelvan, no que lo publicado esté enlazado (log §46;
  `components/marketing-content-links.test.ts`).
- **Una página de marketing nunca es `"use client"` en su raíz.** Eso impide
  exportar `metadata`, y la página se queda sin título, sin descripción y sin
  canonical propios sin que nada falle: es exactamente lo que les pasó a la
  home y a `/pricing`. El patrón es página de servidor con la metadata +
  componente cliente aparte (log §46; `app/pricing/pricing-metadata.test.ts`).
- **La metadata no nombra motores que el producto no ejecuta.** Hoy son Gemini,
  Claude y ChatGPT. Un `<title>` con Perplexity o AI Overviews es el mismo
  reclamo falso que PRICING-TRUTH-1 retiró del producto, solo que en el sitio
  donde más se ve (log §46).

## Metadata y señales de las páginas públicas

- **Toda página pública construye su metadata con `contentMetadata()`**
  (`lib/seo/metadata.ts`), nunca a mano. La razón no es estilo: en Next el
  `openGraph` de una página **reemplaza** el del layout raíz en vez de
  fusionarse campo a campo, así que declarar solo `title`/`description` le quita
  a la página `og:image`, `og:site_name`, `og:locale` y la tarjeta de Twitter
  enteras, sin ningún error visible. Pasó en la home y en `/pricing` (log §47).
- **Un `og:image` sólo puede ser una imagen rasterizada.** Ninguna red social
  renderiza SVG: la tarjeta sale en blanco. Tres portadas del blog son SVG y por
  eso `ogImageFor()` cae a la imagen de marca en vez de usarlas (log §47).
- **No se declaran medidas de una imagen cuyo tamaño no se conoce.** Las
  portadas reales son cuadradas de 1254×1254; anunciarlas como 1200×630 describe
  mal el activo. `width`/`height` solo para la imagen de marca (log §47).
- **`llms.txt` y el sitemap se generan de las SSOT, nunca a mano.** El estático
  derivó hasta listar la mitad del contenido publicado sin que nada avisara — y
  es el fichero sobre el que el producto publica una guía
  (`lib/seo/llms-txt.ts`, `llms-txt.test.ts`; log §47).
- **Una pantalla sin valor de búsqueda lleva `robots: { index: false, follow:
  true }`**, no una línea en `robots.ts`: `Disallow` impide rastrear, no
  indexar, y estas pantallas están enlazadas desde todos los shells de
  marketing (log §47).

## Comparativas y el sistema de bloques del blog

- **`/comparativas/*` usa el mismo sistema de bloques que el blog, no
  `legal-body`.** Hasta COMPARATIVAS-DESIGN-1 (2026-08-11) cada comparativa
  nueva copiaba fielmente la primera (`genscore-vs-otterly`, GROWTH-2 Fase
  2.4), construida antes de que existiera el sistema de bloques del blog
  (GROWTH-3 Fase 3.1) — cuatro páginas arrastrando la misma clase que usan
  `/privacidad`/`/terminos`/`/cookies` sin que nadie lo hubiera decidido así
  (log §52). `KeyTakeaway` para el resumen, `CompareTable`+`Pill` para la
  tabla ("Gana aquí" en la celda donde gana el competidor — mismo patrón que
  `llms-txt-guia-practica.mdx`), `ArticleCta` real al final.
- **Las dos secciones "Cuándo elegir X" llevan el mismo peso visual.** Ambas
  van en `Verdict`, con su propia etiqueta. La primera versión (log §52) puso
  `Verdict` solo en la del competidor y dejó la de Genscore como `<h2>`+`<p>`,
  razonando que `Verdict` era para admisiones honestas y no para argumentos de
  venta. El efecto real fue el contrario del buscado: el caso del competidor
  quedaba destacado en bloque y el nuestro en texto plano, así que la página
  se leía como si Genscore perdiera incluso donde no perdía (fundador,
  2026-08-11; log §53). La honestidad la sostienen la tabla —con su "Gana
  aquí" en las filas reales— y el propio texto, no la asimetría tipográfica.
- **Una fila solo se marca como victoria del competidor si es un beneficio
  para quien compra.** Levantar más dinero no lo es: no mejora ningún
  resultado del cliente y corta en las dos direcciones (respaldo, pero también
  presión por rentabilizar la ronda). La fila de financiación de
  `genscore-vs-profound` estaba marcada como victoria y era conceder un punto
  que no es un punto (log §53). Las victorias legítimas son capacidades que el
  comprador nota: cobertura multi-país, usuarios incluidos, número de motores,
  reseñas públicas acumuladas.
- **La tabla comparativa marca las victorias de los DOS lados.** Marcar solo
  las del competidor no es más honesto: hace que la página se lea como si
  Genscore perdiera en todo aunque el reparto real de filas esté a nuestro
  favor, porque las únicas insignias visibles al escanear están en su columna
  (fundador, 2026-08-11; log §54). Lo fijan dos tests por comparativa: que
  haya victorias en ambos lados y que ninguna fila esté marcada para los dos.
- **El índice del blog no publica un recuento de artículos.** Con pocos
  subraya lo pequeño que es el catálogo y con muchos no ayuda a elegir qué
  leer (fundador, 2026-08-11; log §54).
