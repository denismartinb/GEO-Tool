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
  §146). Es la tercera vez que el orden de este fichero decide en vez de la
  intención: antes con la escala tipográfica (§143) y con los colores de la
  superficie oscura (§144).
