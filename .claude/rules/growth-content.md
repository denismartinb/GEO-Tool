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
- **El contenido explica el problema y el criterio; no explica nuestra
  máquina** (fundador, 2026-08-13; log §76). Qué mira el producto, sí. Cuántas
  piezas tiene, cómo las combina, con qué umbrales decide y qué hace cuando
  falta una, no. La primera pasada de esta regla quitó los pesos y dejó "una
  media ponderada de cinco señales", que es quitar las cifras de la receta y
  dejar la receta. El motivo no es sólo competitivo: una métrica que se explica
  entera en una frase parece reproducible en una tarde, y eso **abarata el
  producto delante del comprador**. Lo vigila `article-honesty.test.ts`
  (detector de mecánica) sobre artículos, glosario, `/docs` y comparativas — y
  `metricas-geo.test.ts` cubre además la landing `/geo`, que no es contenido y
  publicaba la fórmula entera.
- **Ni los pesos del compuesto ni los códigos ADR se publican** (fundador,
  2026-08-13; log §75). Los pesos son configuración del producto: se publica el
  **orden de importancia** ("la presencia es la que más manda"), nunca el
  reparto. Un `ADR-00NN` como fuente de una cifra no acredita nada fuera —el
  lector no puede abrir ese documento— y sí publica el índice de nuestras
  decisiones internas; en su lugar, "Metodología de GenScore" o la evidencia
  real. **Tampoco en `/docs`**: la metodología publicada se quedó sin la tabla
  de pesos el mismo día, por decisión expresa del fundador — si el reparto no
  se publica, no se publica en ninguna parte, y menos en la página a la que los
  artículos mandan al lector a buscarlo. Lo cubre `article-honesty.test.ts`
  sobre las cuatro superficies (artículos, glosario, `/docs` y comparativas).
  `ProductMock` conserva `weight` en el fuente **sin pintarlo**: es lo que hace
  verificable el número del gauge.
- **Lo que el artículo le pide al lector que ejecute se ata con un test, y el
  test lo extrae del artículo.** Una expresión regular, un fragmento de
  configuración o un comando publicados son lo único ejecutable de una pieza —
  y prosa dentro de un MDX no la compila nadie. El test la saca del bloque
  publicado (nunca una copia: una copia sigue verde con el artículo diciendo
  otra cosa) y comprueba que hace lo que el texto promete dos párrafos más
  arriba. Un fallo así se descubre en la cuenta del lector, no en la nuestra.
  El caso: la expresión de fuente de `como-medir-trafico-chatgpt-ga4`, que
  además tenía que **no** capturar `google` — recogerlo se habría comido el
  canal orgánico entero del lector, convirtiendo el consejo publicado en un
  daño (`ga4-chatgpt.test.ts`; log §83).
- **Si lo publicado pasa por una transformación, el test mira el lado de
  después — o se quita la transformación.** MDX trata el texto suelto de un
  hijo JSX como texto con escapes, así que se come las barras invertidas sin
  avisar: `chatgpt\.com` se publicó como `chatgpt.com`, con cada punto como
  comodín, mientras un test llamado *"escapa los puntos"* pasaba en verde
  porque leía el MDX del disco. **Un guardián que mira el lado equivocado de
  una transformación es peor que ninguno**, porque apaga la sospecha. El
  remedio elegido no fue una comprobación más lista sino eliminar la diferencia:
  el valor vive en un módulo TS, el MDX lo renderiza como expresión y el test
  importa ese mismo valor (`lib/blog/ga4-source-regex.ts`; log §83).
- **Una cifra de terceros va con su fuente y con su tamaño de muestra, o no
  va.** El `source` del `<Stat>` es cómo este proyecto cumple la regla de
  arriba: sin él la cifra se lee como nuestra. Y un porcentaje ajeno sin
  denominador es la misma trampa que el artículo de métricas denuncia, cometida
  por nosotros. Cuando además viene de un único estudio, el texto dice que lo
  utilizable es el orden de magnitud, no el decimal (log §83).
- **Un allow-list de motores cubre el cuerpo, nunca la metadata.** El permiso
  para nombrar Perplexity en un artículo existe para temas de mercado —cómo lo
  clasifica GA4, una comparativa— y no se extiende al `<title>`, a la
  descripción ni al CTA, donde sigue mordiendo la regla de que no se nombran
  motores que el producto no ejecuta (log §83).
- **Si una cifra del producto llega a publicarse, se ata al código con un
  test.** Regla de segunda línea: la primera es no publicarla. Cuando una pieza
  sí depende de un dato nuestro —los umbrales de comportamiento de la auditoría,
  por ejemplo, que sí se publican porque el lector los usa sobre su propia
  web— el test importa la constante real y la contrasta con el texto, para que
  el cambio de código y el refresco del artículo caigan en el mismo PR. Prosa
  en un MDX no la mira ningún compilador. El caso que lo motivó:
  `/blog/que-es-el-geo-score` llevó ocho días publicando los pesos de GEO Score
  v2 mientras `/docs/metodologia/geo-score` publicaba los de v4 — el sitio
  contradiciéndose a un enlace de distancia (log §74). La solución definitiva
  fue mejor: retirar el dato, porque **lo que no se publica no se queda
  rancio** (log §75).

## Imágenes

- **Ningún visual es decorativo: todos son evidencia** (ADR 0026
  `article-imagery-policy`). Cada imagen es una captura que prueba la
  afirmación, un ejemplo enmarcado del patrón que se enseña, o una tarjeta de
  dato con su fuente. Si una imagen no prueba nada, no va.
- **Una figura cuyo contenido es una tabla se declara `<Figure wide>`.**
  `.art-frame` nace con `overflow: hidden` —correcto para un `ProductMock` o un
  SVG, pésimo para una tabla: la columna que no cabe desaparece sin dejar gesto
  que la recupere, y suele ser la que lleva la conclusión de la figura. Es el
  fallo de `/docs/metodologia` del §77 un nivel más adentro. Se coló en dos PRs
  seguidos porque no tiene síntoma —la página carga limpia y el piloto la marca
  ✅— así que lo vigila `article-recipes.test.ts`, que busca la fila separadora
  de una tabla dentro de un `<Figure>` y exige `wide` (log §83).
- **La portada se juzga en la tira de 96 px, no en el lienzo donde se dibuja.**
  En el artículo va en `.blog-cover-compact` —96 px de alto a todo el ancho, con
  `object-fit: cover`—, o sea una tira de ~11,7:1 sobre un lienzo de 4:1: sólo
  se ve **el tercio central de la altura**. Todo lo que importe tiene que caber
  ahí, y ningún elemento puede quedar cortado en un rectángulo plano sin
  principio ni final: eso se lee como una imagen rota, no como una decisión
  (§73). La portada de S8 tenía las barras apoyadas fuera de la banda y en gris
  pizarra, el único color fuera de la familia, y en escritorio era exactamente
  eso. Antes de dar una portada por buena, renderízala en 1124×96 con
  `object-fit: cover` y mírala (log §83).
- **Un valor que el lector tiene que copiar entero va en `<CodeBlock wrap>`.**
  Para código de verdad, deslizar es correcto: partir la línea cambia lo que
  dice. Para una cadena única y sin espacios —una expresión regular, una
  clave— deslizar es lo contrario de lo que hace falta, porque **no se puede
  copiar lo que no se ve** y la pista "Desliza →" sólo aparece bajo 640 px, así
  que en escritorio se ve cortada y sin aviso. El ajuste es visual: un salto
  blando no mete ningún `\n` en el portapapeles (log §83).
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
