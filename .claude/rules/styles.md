---
description: Cómo se reparten las hojas de estilo entre lo público y la consola.
paths:
  - "app/globals.css"
  - "app/console.css"
---

# Reglas de las hojas de estilo

Se inyectan solas al tocar `app/globals.css` o `app/console.css`. Cada
invariante es trazable a un documento — una regla que nadie puede justificar es
peor que ninguna, porque una sesión futura la obedecerá igual.

- **`globals.css` se sirve en TODA página; `console.css` sólo tras iniciar
  sesión.** Un estilo que sólo pinta la consola no tiene por qué descargarlo
  quien entra a `/blog`. `app/dashboard/layout.tsx` es quien importa
  `console.css` (PRELAUNCH-HARDENING-1 Fase V, V5; log §54).
- **Nada entra en `console.css` si su clase aparece fuera de
  `app/dashboard/**`.** Lo comprueba `tests/console-css-scope.test.ts`, y el
  fallo que evita es silencioso: la página pública no rompe, simplemente se
  queda sin estilo. La regla es tosca a propósito y deja fuera cosas que sí son
  de consola (la pantalla de notificaciones, la campana), porque sus clases se
  escriben desde `components/`. Un clasificador más fino —grafo de imports— se
  probó y **se equivocó hacia el lado peligroso**: dio por «sólo consola» el
  sistema de artículos del blog, cuyas clases se aplican desde `lib/` (log
  §54).
- **`console.css` se carga DESPUÉS de `globals.css`, así que mover una regla
  puede cambiar quién gana.** `globals.css` no está por capas: hay secciones
  posteriores —MOBILE-1 es el caso gordo, el layout de consola en móvil— que
  sobrescriben a propósito reglas de consola anteriores. Antes de mover una
  sección hay que comprobar que ninguna sección posterior vuelve a encabezar
  un selector con las mismas clases. Se identificaron 16 solapes de ese tipo y
  por eso quedan ~33 KB sin mover (log §54).
- **Ampliar el corte pasa por ordenar la cascada primero.** `@layer`, o mover
  MOBILE-1 entero. No es una limpieza: cambia quién gana en cada empate de
  especificidad, así que va en su propia fase con su propia pasada de piloto.
- **En `html` y `body`, recortar es `overflow-x: clip` — NUNCA `hidden`.**
  `hidden` en un eje fuerza al otro a computar de `visible` a `auto` (CSS
  Overflow 3 §3.2), y eso convierte al elemento raíz en contenedor de scroll.
  En Chrome acaba en un scrollport cuyo `overflow` usado es `hidden`, donde la
  especificación permite el scroll programático y **prohíbe al navegador
  ofrecer cualquier mecanismo al usuario**: el 2026-08-20 la zona pública
  entera era imposible de scrollear en Chrome —ni rueda, ni teclado, ni
  barra— mientras `window.scrollTo()` seguía funcionando (log §124). `clip`
  recorta exactamente igual y no crea contenedor de scroll ni convierte de eje.
  La firma a reconocer, porque no se parece a nada más: **`scrollTo` funciona y
  la entrada de usuario no**. Si vuelve a pasar, lo primero que hay que pedir
  es `getComputedStyle(document.documentElement).overflowY` junto a
  `scrollHeight`/`innerHeight`, no capturas.
- **Nada de lo que sólo rompe el documento se ve desde la consola, y el piloto
  tampoco lo ve.** La consola no scrollea el documento (`.shell` es
  `100dvh`/`overflow:hidden`; el scroller es `.dash-content`), así que enmascara
  cualquier fallo del scroll de página y lo hace parecer exclusivo de
  marketing. Y el `ux-pilot` hace capturas, no scroll: las 57 superficies
  públicas salieron ✅ en las tres anchuras en la misma pasada en que el sitio
  era inusable (log §124). Un cambio en `overflow`/`overscroll-behavior` de
  `html` o `body` **se verifica ejercitando rueda y teclado**, no mirando que
  la pantalla renderice.
- **Chromium headless sobre Linux no reproduce esto**, así que ni CI ni el
  piloto son red aquí: el mismo build que era inusable en Chrome/macOS
  scrolleaba bien en Chromium 141 sobre Linux (log §124). Vale para descartar
  causas —seis variantes de `overflow`/`overscroll` probadas, ninguna
  reproducía—, no para dar por bueno un arreglo de scroll.
- **Un token de tinta que aprueba AA sobre blanco no lo aprueba sobre un fondo
  hundido.** `--ink-3` (#6b7385) da 4,76:1 sobre `#fff` y **4,44:1** sobre
  `--surface-sunk` (#f6f7f9) — por debajo del 4,5:1, por seis centésimas que a
  ojo no existen. Lo cogió el chequeo de contraste del piloto en los filtros de
  Recomendaciones (log §55). Antes de reutilizar un token de texto sobre una
  superficie distinta de aquella donde ya se usaba, se recalcula; y la
  jerarquía entre pestaña activa e inactiva se sostiene en el fondo y la
  sombra del estado activo, no en aclarar la inactiva hasta que no se lee.
- **Convertir un `<button>` en `<a>` NO es neutro, aunque la clase declare su
  propio `display`.** Antes de cambiar el elemento hay que buscar reglas de
  tipo `.ancestro a { … }`: existen precisamente porque ahí dentro sólo había
  enlaces, y una de ellas —`.lp-mobnav a`, especificidad `(0,1,1)`— le gana a
  la clase del botón —`.lp-cta`, `(0,1,0)`—, así que le impone su color, su
  tamaño y su relleno. En V4 eso dejó «Prueba gratis» con el texto gris sobre
  fondo azul en el cajón móvil, y el razonamiento de que serían «idénticos por
  construcción» era incompleto: cubría los estilos propios del elemento, no las
  reglas que sólo se activan al cambiar de etiqueta (log §54, corrección del
  2026-08-11). El barrido correcto es
  `grep -n "^\.<zona>[a-z0-9-]* .*a[ ,{:]" app/globals.css`. **No es la anécdota
  de un PR: hay al menos dos instancias del mismo patrón en zonas que no se
  parecen en nada.** La segunda la encontró el piloto al día siguiente —
  `.blog-body a` (0,1,1) contra `.btn-primary` (0,1,0), que dejaba el CTA de un
  artículo en índigo oscuro sobre índigo, 1,58:1 (log §55). Se arregla
  **excluyendo los botones de la regla del ancestro** (`a:not(.btn)`), no
  parcheando cada variante: es lo que esas reglas siempre quisieron decir —van
  de enlaces de prosa— y cubre las variantes que aún no existen. Desde Q5b el
  piloto calcula el contraste de todo control visible y falla por debajo de AA
  (`tests/pilot/support/page-audit.ts`, log §55), así que este caso concreto ya
  no depende de que alguien mire la captura — pero el barrido sigue haciendo
  falta: el contraste coge el color, no el tamaño ni el relleno que esa misma
  regla también impone.
- **El idiom `width:100vw; margin-inline:calc(50% - 50vw)` asume que su
  ancestro está centrado en el viewport COMPLETO — falso en cualquier pantalla
  de consola por encima de 760px**, donde `.shell` reserva `--sidebar-w` de
  ancho real y `.dash-content` (el ancestro de hecho de todo lo que se monta
  ahí dentro) es más estrecho que el viewport y está desplazado a la derecha.
  Sin corrección, la caja renderiza con su borde izquierdo a
  `--sidebar-w / 2` del borde real — ni en el viewport ni en `.dash-content` —
  y el sobrante de la derecha es justo lo que dejaba a `.dash-content` con
  scroll horizontal implícito. `.mrk-full` lo tenía (`ScanMissionRocket` /
  `ReentryMission`, cortado detrás de la barra lateral en escritorio, log
  §132): la corrección va en un `@media (min-width: 761px)` — el mismo corte
  donde `.shell` deja de colapsar — que rederiva el mismo break-out contra
  `.dash-content` en vez del viewport (`width: calc(100vw - var(--sidebar-w))`
  y un margen izquierdo que cancela el propio centrado/padding de `.page`, vía
  las variables `--page-max-w`/`--page-pad-x` para que ambos lados compartan la
  misma geometría). Cualquier elemento nuevo bajo `app/dashboard/**` que
  reutilice este idiom de full-bleed necesita la misma corrección — no es
  exclusivo de `.mrk-full`.
- **Un fixture de verificación que no incluye el reset real de la app
  verifica un modelo de caja distinto del que se despliega, y puede dar
  "exacto" sobre una fórmula que en producción no lo es.** `@tailwind base;`
  (primera línea de `app/globals.css`) trae el Preflight de Tailwind, que
  pone `box-sizing: border-box` en todo elemento — así que `.page`, capado
  por `max-width`, renderiza exactamente ese ancho (el padding vive DENTRO
  del presupuesto). Una fórmula de sangrado verificada contra un fixture que
  concatena sólo las hojas de estilo propias (`sed '/^@tailwind/d'` para
  poder cargarlas en un navegador sin PostCSS) pierde ese reset y cae al
  valor por defecto del navegador (`content-box`, donde el padding se SUMA al
  `max-width`) — dos modelos que difieren en exactamente
  `2 × page-pad-x` en el ancho total de una caja topada, y por tanto en su
  desplazamiento de centrado. Una corrección calibrada contra el fixture
  incompleto (log §160, la misma fase) pasó las nueve anchuras de su propio
  fixture con hueco cero y dejó la escena real 34px corta en cada borde en
  cuanto `.page` llegaba a toparse — encontrado por el fundador en el
  preview, no por el fixture, porque el fixture nunca preguntó "¿coincide
  este `box-sizing` con el que carga la app?". **Para verificar geometría con
  `--tw-*`/Preflight de por medio, arranca el fixture desde la SALIDA
  COMPILADA (`.next/static/chunks/*.css` tras `pnpm run build`, buscando el
  chunk que contenga las clases en juego), no desde una concatenación manual
  de fuentes** — es lo único que garantiza que el reset, el orden de cascada
  y las capas de Tailwind son los que de verdad se sirven. Diagnosticado
  pidiendo al fundador que inspeccionara el hueco en DevTools: el selector
  marcó `.dash-content`, es decir, `.mrk-full` genuinemente no llegaba ahí —
  ese dato desde el navegador real es lo que descartó "el código ya está
  bien, es caché" antes de gastar una vuelta más de fixture equivocado.
- **Un selector `.a > .b` para un componente full-bleed asume que `.b` es
  hijo DIRECTO de `.a` en TODAS sus pantallas — compruébalo, no lo asumas por
  la pantalla donde ya se verificó.** `.mrk-fill` (log §160) se probó primero
  contra `.page > .mrk-full` (cierto en 5 de 6 pantallas) y contra `.cm2-scope
  > .page.cm2-page > .mrk-full` (el envoltorio de Competidores, ya conocido) —
  y ninguno de los dos cubría Auditoría web, donde `.wa2-scope.wa2-page` mete
  a `.mrk-full` un nivel más adentro, como NIETO de `.page`, no hijo. El
  selector con `>` simplemente nunca casaba ahí: sin error de consola, sin
  warning, la misión seguía con su comportamiento antiguo en silencio.
  Combinador de descendiente (sin `>`) para que case a cualquier profundidad,
  y `display: contents` en cada envoltorio intermedio para que `flex: 1`
  siga significando algo una vez que el selector ya casa — las dos piezas
  hacen falta, ninguna sustituye a la otra. Y dos envoltorios que se PARECEN
  no son intercambiables: `.cm2-page` va combinado en `.page` (su propio
  `max-width` SÍ es el de `.page`), `.wa2-page` es un hijo aparte (su
  `max-width` deja de pintar nada en cuanto es `display: contents`, y `.page`
  sigue topado por el global) — copiar la variable de sangrado de uno al otro
  sin releer esa diferencia dejó la escena 20px corta por los dos lados, y
  sólo lo cazó el fixture, no el razonamiento por analogía. Antes de dar un
  patrón por cubierto: `grep -n "<FirstScanTakeover\|<ReentryMission"` y mira
  qué hay entre esa línea y el `.page` más cercano, en las 6 pantallas.
- **`container-type`/`contain: layout` en cualquier ancestro dentro de
  `.dash-content` es del tipo de riesgo que no se toma a la ligera.** Convierte
  al elemento en el containing block de sus descendientes `position: fixed`, y
  `.dash-content` contiene modales, drawers y el popup del tour de onboarding —
  todos `fixed` y pensados contra el viewport real. Es la solución "correcta"
  de libro para el problema anterior (`cqw` en vez de rederivar `vw` a mano) y
  se descartó por eso mismo en log §132: convertiría esos overlays en overlays
  contenidos sin que ninguna pantalla que los usa lo supiera, sin ningún
  ux-pilot en ese PR para cazarlo.
- **Un `height: 100%` puede caer en referencia circular dentro de un grid con
  fila implícita (`auto`), y el navegador no avisa — sólo desborda su
  contenedor en silencio.** `place-items`/`align-items` sólo alinean DENTRO de
  la pista; no la dimensionan. Sin `grid-template-rows` explícito, una fila
  `auto` se dimensiona por su contenido, así que un hijo con `height:100%`
  cuyo propio contenido depende de esa misma altura (p. ej. un `calc(100% -
  X)` más abajo) puede resolver contra el contenido en vez de contra la caja
  del grid — comprobado con Playwright en `.mrk-scene-slot > .mrk-pad-wrap`
  (log §132): la fila se dimensionó a 674px, el contenido, en vez de a los
  640px reales de la caja, y el sobrante se recortó por `overflow:hidden` dos
  niveles más arriba, silenciosamente. La corrección que sí funciona es
  `position: absolute; inset: 0` en el hijo — lo saca del grid entero y le da
  una altura garantizada por el `position:absolute` del propio contenedor, sin
  depender de cómo el grid decida dimensionar su fila. Cuando un hijo dentro de
  un grid/flex de fila implícita necesita una altura fiable derivada de un
  ancestro con caja garantizada, `position:absolute;inset:0` es más robusto que
  `height:100%` — no lo contrario intuitivamente, pero es lo que midió el
  navegador.
- **Un fondo que ocupa una sección entera tiene que terminar en el color de la
  sección de debajo.** La costura entre dos bloques a ancho completo no se ve
  en una maqueta —el artboard acaba justo en ese canto— ni en una captura de
  800 px de alto, porque el hero de la portada mide 1154 px en escritorio y
  1193 en móvil: se ve en la página real, y lo que aparece es una **línea
  horizontal recta**. Ha pasado dos veces seguidas en la misma zona por dos
  vías distintas: el aura descartada lo tuvo que tapar con un desvanecido
  enmascarado, y la variante de degradado que volvía a teñir el final del hero
  lo reprodujo tal cual (log §141). Un `linear-gradient` que termine en el
  color del vecino no necesita máscara ninguna; si el fondo no puede terminar
  ahí, el desvanecido va **en porcentaje**, no en px, para seguir el alto real
  de la sección. Y se verifica sobre una captura de **página completa**, nunca
  sobre el recorte del viewport.
- **Un modificador `--dark` suelto NO gana a su clase base: califícalo por
  sección.** `.lp-kicker--dark` y `.lp-kicker` valen los dos (0,1,0), así que
  decide el orden dentro del fichero — y las clases base de la landing viven
  al final. El resultado no es un fallo visible: es un color que se declara,
  se documenta y **no llega a pintarse nunca**. Pasó dos veces en la misma
  sección: primero con la escala tipográfica (log §143) y, con el diagnóstico
  ya escrito tres líneas más arriba en el mismo fichero, otra vez con los
  colores (log §144), donde dejó la bajada de la única superficie oscura del
  sitio a **2,34:1**, por debajo de AA. Lo que engaña es que uno de los tres
  modificadores sí funcionaba, y sólo porque su clase base no declaraba
  `color`. La forma correcta es `.lp-how .lp-kicker--dark` (0,2,0), que deja de
  depender del orden.
- **Fidelidad a una maqueta se MIDE en un navegador, no se lee en dos hojas de
  estilo.** Abrir el `.dc.html` aprobado y la página real en el mismo Chromium
  y comparar `getComputedStyle` más la caja de cada pareja de elementos
  encontró 36 diferencias en una sección que ya se había dado por ajustada a
  ojo (log §144). Y se compara la **distancia**, no la propiedad: un
  `margin-bottom` de 122px daba un hueco real de 136 porque la fila de al lado
  centra su contenido; la propiedad coincidía con la maqueta y el resultado no.
- **Un estado inicial oculto que sólo deshace una isla de cliente esconde la
  sección entera sin JavaScript.** `opacity: 0` / `scaleX(0)` en el CSS a secas,
  revelados al llegar una clase que pone `useEffect`, significa que sin JS esa
  clase no llega nunca (log §144). El estado oculto cuelga de una clase que
  pone la propia isla —`.is-armed`— y así el servidor pinta siempre algo
  legible. Mismo espíritu que `prefers-reduced-motion` en
  `.claude/rules/onboarding.md`: la degradación es el contrato, no una
  degradación.
- **Un tramo responsive se escribe JUNTO a lo que corrige, no en el bloque de
  esa anchura que pille más cerca.** `app/globals.css` tiene una decena de
  `@media (max-width: 560px)` repartidos, y meter las reglas móviles de una
  sección nueva en uno anterior a sus reglas base significa que **no pintan
  nada**: misma especificidad, gana la última. El síntoma no es un color raro,
  es una sección rota —una respuesta de FAQ en una columna de 111px, un galón
  que no aparece— y no se ve leyendo, sólo midiendo `getComputedStyle` (log
  §146). Es la QUINTA vez que el orden de este fichero decide en vez de la
  intención: la escala tipográfica (§143), los colores de la superficie oscura
  (§144), la escala móvil de la FAQ (§146), el prefijado de «Cinco pantallas»
  (§154) y la franja 561-720 de esas mismas pantallas (§155).
  **Agrupar por `@media` es exactamente el error.** En §155 los tres arreglos
  de una franja se escribieron juntos en un solo bloque, nacido al lado del
  primero de ellos; los otros dos quedaron por delante de sus reglas base y no
  se aplicó ninguno. El instinto es agrupar lo que comparte anchura — y lo que
  manda es lo que comparte elemento. Si un bloque `@media` corrige dos
  selectores distintos, casi siempre tienen que ser dos bloques.
- **Un `<dialog>` no cuelga de nada que pueda ocultarse.** `showModal()`
  promociona a la capa superior sólo lo que está en el árbol de renderizado:
  metido dentro de un contenedor con `display: none` a esa anchura, el diálogo
  devuelve `open === true`, se cierra con `Esc` —es modal de verdad— y mide
  **0×0**. Ningún estado dice «roto»; sólo el `getBoundingClientRect()` (log
  §156, el modal de «El cambio de reglas» dentro de `.lp-rules-navslot`).
- **Un estado inicial oculto cuelga de una clase que pone la isla, nunca del
  CSS a secas** — y si el control que lo revela también lo pinta la isla, con
  más razón: sin JS quedarían la mitad de la pantalla escondida y ninguna forma
  de pedirla (log §144 y §156).
- **Un elemento recortado no desborda la página, y por eso es peor.** Un
  barrido de anchuras que sólo mira `document.scrollWidth` da por bueno lo que
  un contenedor con `overflow: hidden` está cortando por dentro: el marco de
  «Cinco pantallas» recortó una tarjeta, un ranking y una cápsula entre 561 y
  720px con once anchuras «sin desbordamiento» (log §155). Se mide **cada
  elemento contra la caja de su contenedor**, no el documento. Y eso TAMPOCO
  basta: un elemento puede caber en el panel y estar cortado por un
  `overflow: hidden` intermedio, así que se mide además
  `scrollHeight > clientHeight` en todo lo que esconde su contenido — es lo que
  destapó el `</script>` cortado de la demo del hero (log §157). Excepción
  legítima y única: un `<img>` con `object-fit: cover` dentro de
  `overflow: hidden` recorta **por diseño**; eso es el encuadre, no un fallo.
- **Un bloque de código dentro de una maqueta va en `white-space: pre` con
  scroll horizontal.** Envolviendo, cambia de número de líneas según la
  ventana, y entonces el hueco que lo contiene hay que dimensionarlo para el
  peor caso en TODAS las anchuras — o se corta en la estrecha. Uno que se
  desplaza mide siempre lo mismo (log §157).
- **`--ink-3` sólo aprueba AA sobre BLANCO PURO. Sobre `--canvas` no.** La
  cifra, para no volver a deducirla: 4,76:1 sobre `#ffffff` y **4,44:1** sobre
  `#f6f7f9` — seis centésimas por debajo del mínimo. Ha caído tres veces en la
  misma zona en un día: la nota del cierre sobre el degradado del hero, esa
  misma nota otra vez al pensar que bastaba con subir un escalón, y las
  pestañas de «Cinco pantallas» (log §146, §154). Sobre cualquier superficie
  que no sea blanca —`--canvas`, un degradado tintado, una tarjeta gris— el
  texto secundario va en `--ink-2` (7,50:1). Y el fondo se mide **pintado**: un
  elemento con `background` en atajo tiene `background-color` transparente, así
  que preguntárselo al navegador devuelve el blanco del `body` y da un número
  que ahí no es cierto.
- **Un marco de alto fijo con escenas apiladas se mide contra la escena MÁS
  ALTA, así que el blanco de las cortas se arregla en las largas.** Es
  contraintuitivo y por eso está escrito: la demo del hero enseñaba 220px de
  vacío bajo la escena 0 y la escena 0 no tenía nada que corregir — el cuerpo
  estaba en 508 porque la escena 4 medía 509 (log §158). Antes de tocar la
  pantalla que enseña el problema, medir las cinco y arreglar la que manda. Y
  **«móvil» no significa «apilar»**: la escena 4 pasó de 215 a 115px volviendo
  a dos columnas, que además es como se ve en escritorio.
- **Una barra de avance es un reloj o no es nada — pero «reloj» se mide por
  segmento, no por la barra entera.** Cada tramo que anima su relleno saca su
  duración del mismo valor que gobierna el avance real —pasado como
  `animation-duration` desde el código, nunca duplicado en el CSS— y esa
  animación sólo existe mientras el reloj corre de verdad para ESE tramo:
  fuera de pantalla, con la reproducción automática apagada o en el último
  paso, no se anima. Lo que NO es progreso inventado es un tramo ya
  completado quedándose lleno y quieto — eso es estado real (una escena que ya
  se vio), no una animación fingiendo seguir en marcha, así que no tiene por
  qué desaparecer con el reloj (`components/landing/hero-demo.tsx`,
  `.lp-hx-avance`, log §159 — corrige la primera versión de esta regla, log
  §158, escrita para una barra continua de un solo tramo). Una barra sigue
  siendo progreso inventado si ANIMA sin que vaya a pasar nada; no lo es por
  seguir mostrando, ya quieta, algo que de verdad pasó
  (CLAUDE.md, "no fake progress").
- **Un elemento animado por `transform` DENTRO de un contenedor con scroll
  propio hereda una segunda animación que no controla: la del scroll mismo.**
  Su posición en pantalla es `translateX − scrollLeft`, y si algo más también
  anima `scrollLeft` —un `scrollTo({behavior:"smooth"})` disparado por el mismo
  clic, por ejemplo— hay dos relojes independientes restándose. `behavior:
  "auto"` no basta para desactivar el segundo: por la spec de CSSOM View,
  `"auto"` hereda el `scroll-behavior` computado del elemento, así que si una
  regla de CSS ya declara `scroll-behavior: smooth` en ese contenedor —como la
  tira de `.lp-prod-tabs` en móvil, para el gesto táctil—, `"auto"` sigue
  animándose igual. Sólo `behavior: "instant"` lo bloquea de verdad. Medido con
  Playwright en `ProductTabs`: la pastilla llegó a **−309px** en un viewport de
  375px, fuera de pantalla, antes de asentarse (log §159). Chromium headless
  colapsa `"smooth"` a un solo fotograma y no lo reproduce — mismo límite que
  ya consta más abajo para bugs de scroll en este repo; el diagnóstico se
  valida por el mecanismo, no por ver el parpadeo en el arnés.
- **En un contenedor `display:flex` con `gap`, un nodo de texto entre
  elementos inline es su propio ítem flex — el `gap` se cuela también ahí,
  aunque el JSX no tenga espacio en el marcado.** `.lp-promo-row` (`gap:
  7px`) mezclaba texto suelto y `<s>`/`<b>` como hijos directos, y el hueco
  apareció entre `</b>` y la coma que la seguía inmediatamente en el código
  — nada en el JSX lo explicaba (log §159, item 23). Un contenedor `flex`
  con `gap` que necesita fluir como una frase (con puntuación pegada, sin
  huecos entre palabras) envuelve esa frase en un único hijo; el `gap` sólo
  debe separar bloques de verdad distintos —aquí, el badge de la frase—, no
  palabras sueltas dentro de una.
- **`animation-delay` NEGATIVO adelanta la animación esa fracción de su
  propio ciclo — no la retrasa.** Con `animation-delay: -4.5s` sobre un
  ciclo de 13,5s, en `t=0` la fila ya está en el 33% de su recorrido, no en
  el 0%. Generalizar una rotación de 2 mensajes (retardo a mitad de ciclo,
  keyframes simétricos) a 3 mensajes cambiando sólo el retardo (a un
  tercio) sin recalcular dónde caen los keyframes de salida deja una fila
  arrancando A MITAD de su propia transición de salida — parcialmente
  visible y solapada con la que sí está en su fotograma inicial (log §159,
  item 23: "que tarde un par de segundos en rotar el primer mensaje, sino
  queda raro, se tapan" — se tapaban). La transición de salida de cada fila
  tiene que completarse ANTES del punto de retardo de la siguiente fila, con
  margen. Se verifica leyendo `element.getAnimations()[0].currentTime` en
  varios instantes del ciclo completo — no reproduciendo la animación de
  verdad, que Chromium headless no hace con fidelidad (dos entradas más
  arriba en este fichero).
- **Un `justify-content: center` en el padre no centra las líneas que un
  hijo `flex-wrap` genera POR DENTRO de sí mismo.** Centra ese hijo como
  bloque en la línea del padre — nada más. `.price-pay-icons` (flex, wrap,
  anidado dentro de `.price-pay-badges`, que sí centraba) caía a
  `flex-start` en cada fila que generaba al envolver, así que en desktop y
  tablet (una sola línea, cabe entera) se veía centrado y en móvil (dos
  líneas) las dos quedaban pegadas a la izquierda — invisible salvo en el
  ancho exacto donde de verdad envuelve (log §180). Cualquier flex
  container anidado que pueda envolver por sí mismo necesita su PROPIO
  `justify-content`; el del ancestro no se hereda a las líneas internas.
- **Un margen simétrico pequeño se ve como «pegado al borde», no como
  «centrado».** Un `.price-pay-badges` centrado midió 9,875px de margen
  izquierdo y 9,89px de derecho a 768px — prácticamente idénticos — y a
  simple vista parecía alineado a la izquierda comparado con las capturas de
  al lado, donde el contenido dejaba más aire (log §182). El contenido casi
  llenaba el contenedor disponible (692 de 712px), así que el margen real era
  correcto pero demasiado pequeño para que el ojo lo distinguiera del cero.
  Antes de descartar un centrado por «se ve a la izquierda», mide
  `getBoundingClientRect()` de ambos lados y compara los dos números — no la
  captura contra otra captura de una anchura distinta.
