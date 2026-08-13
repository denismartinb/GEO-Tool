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

- **Ni los pesos del compuesto ni los códigos ADR se publican** (fundador,
  2026-08-13; log §75). Los pesos son configuración del producto: se publica el
  **orden de importancia** ("la presencia es la que más manda"), nunca el
  reparto. Un `ADR-00NN` como fuente de una cifra no acredita nada fuera —el
  lector no puede abrir ese documento— y sí publica el índice de nuestras
  decisiones internas; en su lugar, "Metodología de GenScore" o la evidencia
  real. Lo cubre `article-honesty.test.ts` sobre artículos, glosario y
  comparativas. `ProductMock` conserva `weight` en el fuente **sin pintarlo**:
  es lo que hace verificable el número del gauge.
- **Una cifra del producto publicada en prosa se ata al código con un test.**
  Un artículo que dice "diez respuestas mínimo" o "Claude no busca en la web"
  caduca solo: cambia la constante y el texto pasa a mentir sobre nuestra
  propia metodología sin que nada falle, porque es prosa en un MDX. El test
  importa la constante real y la contrasta con lo publicado, de forma que el
  cambio de código y el refresco del artículo caen en el mismo PR o no cae
  ninguno (`lib/blog/metricas-geo.test.ts`; log §73). El caso que lo motivó:
  `/blog/que-es-el-geo-score` llevaba ocho días publicando los pesos de
  GEO Score v2 mientras `/docs/metodologia/geo-score` publicaba los de v4 —
  el sitio contradiciéndose a sí mismo a un enlace de distancia (log §74).

## Imágenes

- **Ningún visual es decorativo: todos son evidencia** (ADR 0026
  `article-imagery-policy`). Cada imagen es una captura que prueba la
  afirmación, un ejemplo enmarcado del patrón que se enseña, o una tarjeta de
  dato con su fuente. Si una imagen no prueba nada, no va.
- **Declarar la portada no es enseñarla.** `BlogCover` sólo pinta la imagen si
  recibe `image`; sin esa prop cae al degradado con icono, que es el respaldo
  de los artículos *sin* portada — "un icono de algo que no carga bien", el
  fundador. Cuatro artículos estuvieron así: portada correcta en `/blog`, en la
  tarjeta social y en el schema, y degradado en su propia cabecera, porque los
  tests de portada miraban `BLOG_POSTS` y el disco, nunca el MDX
  (`covers.test.ts`, "el artículo enseña la portada que declara"; log §73).

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
  (log §59). `KeyTakeaway` para el resumen, `CompareTable`+`Pill` para la
  tabla ("Gana aquí" en la celda donde gana el competidor — mismo patrón que
  `llms-txt-guia-practica.mdx`), `ArticleCta` real al final.
- **Las dos secciones "Cuándo elegir X" llevan el mismo peso visual.** Ambas
  van en `Verdict`, con su propia etiqueta. La primera versión (log §59) puso
  `Verdict` solo en la del competidor y dejó la de Genscore como `<h2>`+`<p>`,
  razonando que `Verdict` era para admisiones honestas y no para argumentos de
  venta. El efecto real fue el contrario del buscado: el caso del competidor
  quedaba destacado en bloque y el nuestro en texto plano, así que la página
  se leía como si Genscore perdiera incluso donde no perdía (fundador,
  2026-08-11; log §60). La honestidad la sostienen la tabla —con su "Gana
  aquí" en las filas reales— y el propio texto, no la asimetría tipográfica.
- **Una fila solo se marca como victoria del competidor si es un beneficio
  para quien compra.** Levantar más dinero no lo es: no mejora ningún
  resultado del cliente y corta en las dos direcciones (respaldo, pero también
  presión por rentabilizar la ronda). La fila de financiación de
  `genscore-vs-profound` estaba marcada como victoria y era conceder un punto
  que no es un punto (log §60). Las victorias legítimas son capacidades que el
  comprador nota: cobertura multi-país, usuarios incluidos, número de motores,
  reseñas públicas acumuladas.
- **La tabla comparativa marca las victorias de los DOS lados.** Marcar solo
  las del competidor no es más honesto: hace que la página se lea como si
  Genscore perdiera en todo aunque el reparto real de filas esté a nuestro
  favor, porque las únicas insignias visibles al escanear están en su columna
  (fundador, 2026-08-11; log §61). Lo fijan dos tests por comparativa: que
  haya victorias en ambos lados y que ninguna fila esté marcada para los dos.
- **El índice del blog no publica un recuento de artículos.** Con pocos
  subraya lo pequeño que es el catálogo y con muchos no ayuda a elegir qué
  leer (fundador, 2026-08-11; log §61).
- **Publicar un artículo del blog incluye sus DOS listas del piloto: el
  fixture (`BLOG_SLUGS`) y el mapa del journey (`BLOG_POSTS_BY_CLUSTER`).** Son
  dos ficheros distintos mantenidos a mano y sólo el primero tenía guardián,
  así que `como-saber-si-tu-marca-aparece-en-chatgpt` (S1) pasó tres días con
  `PILOT PASS` sin que el piloto lo abriera nunca: un post ausente del journey
  no da 404, simplemente no se mira, y eso no tiene síntoma. El cluster va con
  el slug y se compara también, porque uno equivocado cambia en silencio lo que
  el piloto espera de la página pilar (`fixture-drift.test.ts`, "todo artículo
  publicado lo pilota alguien"; log §73).
- **Publicar una comparativa incluye su journey de piloto y su entrada de
  fixture, en el mismo PR.** A diferencia del blog, las comparativas no se
  pilotan con un bucle: cada una es una página a mano y un `test(...)` a mano,
  así que olvidar la mitad no rompe nada visible. `genscore-vs-profound` se
  publicó sin ninguna de las dos y acumuló **dos `PILOT PASS` sin que el
  piloto llegara a abrirla** — incluido el del PR que la rediseñaba (log §62).
  Lo fijan los dos tests de `tests/pilot/fixtures/fixture-drift.test.ts` que
  contrastan `COMPARATIVAS` contra el spec y contra el fixture.
- **Un `PILOT PASS` es la lista de lo que el piloto vio, no una afirmación
  sobre lo que el PR cambió.** El piloto no sabe qué prometía el PR; cruzar su
  tabla con las pantallas que toca el diff es trabajo del Director y no lo
  hace nadie más (log §62).

## El encuadre: quien escribe esto dirige el marketing de Genscore

Estas reglas conviven con las de honestidad de arriba y **no las derogan**. El
hecho comprobable no se recorta nunca; lo que se decide aquí es el orden, el
espacio y el contexto (fundador, 2026-08-12: *"no nos podemos permitir que
dejes a la competencia mejor en las comparativas […] transmite que casi siempre
Genscore es la mejor opción"*; log §67).

- **Ninguna ventaja del competidor se lista suelta.** Va con el contexto que
  dice a quién le sirve de verdad, y ese contexto tiene que ser tan cierto como
  la ventaja. Cuatro victorias suyas enumeradas a pelo al principio de una
  página se leen como "gana él", aunque tres le sean irrelevantes al lector
  (`OTTERLY_STRENGTHS` es `{claim, context}` por esto, con test).
- **La página no cede la autoridad de quien la escribe.** La primera versión de
  `alternativas-a-otterly` abría diciendo "esto lo escribe un competidor, no te
  fíes del todo". Es cierto y es un regalo: invita a descontar todo lo que
  viene después, incluido lo que es verificable. La credibilidad se demuestra
  con datos fechados y con la contrapartida declarada, no con una advertencia
  previa contra uno mismo.
- **Nunca se recomienda al lector que no nos elija.** Un bloque "cuándo NO
  deberías cambiar" con el mismo peso visual que el nuestro es publicidad del
  competidor pagada por nosotros. La cautela legítima (cambiar de herramienta
  reinicia el histórico) se cuenta como lo que es —un argumento para empezar ya
  donde te vas a quedar— y en párrafo normal, no en `Verdict`.
- **Las FAQ se redactan desde la pregunta que trae el lector, y se responden a
  nuestro favor cuando la respuesta honesta lo permite.** "¿Es mala herramienta
  X?" nos pone a defender al competidor; "¿cuál es la mejor alternativa a X?"
  es la misma búsqueda real y admite una respuesta verdadera que nos favorece.
- **Lo que sigue sin negociarse:** los límites reales del producto que un
  comprador comprobaría en dos clics se declaran. Hoy son que no ejecutamos
  Perplexity ni Copilot y que no hay desglose por país — con test que los exige
  por nombre en `alternativas-a-otterly.test.ts`. Ocultarlos es el error que
  PRICING-TRUTH-1 obligó a retirar del producto, y delante de un competidor se
  paga más caro. Se declaran situados, no en titular.
