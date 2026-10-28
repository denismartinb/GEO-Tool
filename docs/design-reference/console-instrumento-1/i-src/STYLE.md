# GenScore · Instrumento (i-src)

Sistema de la dirección «Instrumento», fase 1. Build: `python3 build.py` → `proto/i-consola.html`.

## Estructura

| Fichero | Qué contiene |
|---|---|
| `0-head.html` | `<title>`, viewport, Google Fonts (Figtree, JetBrains Mono). Nada más. |
| `1-body.html` | Sprites SVG (`%%LOGOS%%` se rellena con los logos de `proto/*.svg`), shell, capas (⌘K, foco, notas, avisos). |
| `css/1-tokens.css` | Tokens en `:root`, oscuro en `@media` con `:root:not([data-theme="light"])` y en `:root[data-theme="dark"]`. Reset. |
| `css/2-shell.css` | Barra del prototipo, menú, cabeceras, scroller, desenfoque progresivo, placeholder. |
| `css/3-components.css` | Todos los componentes compartidos y sus reglas de móvil y movimiento reducido. |
| `screens/<key>.css` | Lo propio de una pantalla. |
| `js/core.js` | Utilidades, datos comunes, componentes, registros, router. |
| `screens/*.js` | Una pantalla por fichero (y sus datos, p. ej. `recs-data.js`). |
| `js/boot.js` | Delegación de eventos, cableado y primer render. |

El build concatena CSS (`css/*` y luego `screens/*.css`, en orden alfabético) y JS (`core.js`, `screens/*.js`, `boot.js`) dentro de una IIFE.

## Añadir una pantalla

1. `screens/<key>.js`:
   ```js
   SCREENS.prompts = { title: 'Prompts', render(){ return `...` }, after(root, first){ /* bind */ } };
   ACT.miAccion = (el, e) => { /* data-act="miAccion" data-arg="..." */ };
   CMDS.push(['Acciones', 'Texto en ⌘K', 'icono', () => {...}]);
   ```
2. Si necesita estilos propios, `screens/<key>.css`.
3. La clave debe existir en `NAV` (core.js). Una ruta de `NAV` sin `SCREENS[key]` pinta el placeholder: el menú, ⌘K y los enlaces `data-route` ya funcionan.

Navegación: `data-route="key"` en cualquier enlace o botón (`data-idx` opcional para abrir el plan en una acción). Estado compartido en `U`. `render(animate)` repinta la ruta; `armMotion` anima sólo la primera visita.

## Tokens y tipografía

- Color: `--ink` `--ink-2` `--ink-3` `--ink-4` (tinta), `--blue` `--blue-soft` `--blue-tint` (familia GenScore, nunca morado), `--warm` (único acento cálido: lo que frena), `--pos`, superficies `--canvas` `--surface` `--surface-2` `--surface-3`, reglas `--rule` `--rule-2`.
- Bloque profundo: `--d-ink`, `--d-ink-2`, `--d-ink-3`, `--d-rule` (sólo dentro de `.deep`).
- Figtree para todo; cifras grandes en peso 300 con tracking negativo y `.num` (tabulares). JetBrains Mono (`.mono`, `code.p`) sólo para dominios y rutas.
- Movimiento: `--d1` 120 ms, `--d2` 200 ms, `--d3` 320 ms, `--d4` 600 ms; `--std` (0.2,0,0,1), `--out` (0.2,0.8,0.2,1), `--spring` (0.3,1.4,0.5,1). Con movimiento reducido todo queda en su fotograma final.

## Componentes (core.js)

| Componente | API | Notas |
|---|---|---|
| Esfera | `dial(score)` | 101 marcas, 270°, 40 y 70 grabados. Única pieza donde mandan las marcas. |
| Anillo de marcas | `tickRing(v, label)` | Acento pequeño (p. ej. comercio agéntico). |
| Marcas | `ticks(n, on, {cls, id})` | Sólo esfera, fila de motores, contador de escaneo y acentos. |
| Barra fina | `bar(v, {max, cls, color, delay, label})` | Barra continua con marcador al final. Clases `thin`, `ink`, `warm`, `nomark`. Sustituye a las barras de marcas. |
| Ranking | `ranking(rows, {metric, second})` | Puesto grande, logo, mención protagonista, flecha de cambio, barra fina, puesto medio. Fila propia `.me` con «Tú». |
| Bloque profundo | `<div class="deep">` + `.planx` | El único sitio donde la página rompe su calma. Uno por pantalla como mucho. |
| Pasos | `<ol class="steps">` | Numerados con línea de unión. Pensados para `.deep`. |
| Contador rodante | `roll(v)`, `setRoll(el, v)` | |
| Gráfico de línea | `lineChart(vals, dates, opts)`, `spark(v, c)` | |
| Péndulos | `pendulumSvg()`, `penObserve()` | Ambiente del escaneo, nunca progreso. Se paran fuera de pantalla y con la pestaña oculta. |
| Tarjeta | `.card` > `.card-h` + `.card-b` | |
| Pestañas | `seg(id, opts, cur, act)`, `segInd(el)` | Indicador deslizante. |
| Mazo | `makeDeck(el, items, {card, isDone, ptk, nav, onSlide, start})` → `{idx, go, layout, refresh, nextOpen, items}` | Apilado en escritorio, deslizamiento nativo con snap en móvil. |
| Marcas de progreso | `progressTicks(n, {id, labels})` | |
| Modo foco | `openFocus(html, after)`, `closeFocus()` | Capa a pantalla completa con un mazo sobre cualquier lista. |
| Deslizar para confirmar | `slideHtml(id)`, `bindSlides(root, onConfirm)` | |
| Escala de objetivo | `goalScale([antes, ahora, objetivo])` | Objetivos de Google: se siguen solos. |
| Acordeón de pastillas | `.pacc` > `.pill[aria-expanded]` + `.pbody` | En móvil, fila con scroll horizontal. |
| Lista a escala | `.toolbar`, `.search`, `.fchips/.fchip`, `.grp`, `.lrow`, `.more`, `.empty-s` | Grupos de 3 filas + «Ver N más». |
| Confirmación en línea | `.inl` | |
| Avisos | `toast(t, s, icon, undo)` | Pila de 3, con «Deshacer». |
| Barra de comandos | `cOpen()`; ⌘K / Ctrl+K | Pantallas, `CMDS`, cambio de tema. |
| Desenfoque progresivo | `edges()` | Bordes del scroll. |
| Chips de fuente | `srcChip('ia' | 'google' | 'agent')` | Toda recomendación lleva exactamente una. |
| Panel lateral | `pshOpen(html, {label, after, onClose})`, `pshPaint(html)`, `pshClose()`, `pshHead(título, {kicker, extra})` | Hoy en `screens/prompts.js` (candidato a core). Derecha en escritorio, hoja inferior en móvil. Esc, foco atrapado, vuelve el foco al cerrar. Cuerpo `.psh-b`, pie `.psh-f`. |
| Favicon con monograma | `aFav(clave, cls)` | Hoy en `screens/prompts.js`. Como `fav()`, con una inicial discreta si la marca no tiene logo dibujado. |

## Patrón de página

Eyebrow con dominio → `h1` → `.lead` corto con enlaces a otras pantallas → `.pills` (fecha, acciones) → `.alert` si algo frena → bloques `.sec` con `.eyebrow`, en `.grid2` / `.grid57`. Un solo `h1`. Copy corto, sin subtítulos en tarjetas.

## Reglas que se mantienen

- Cabecera móvil de 64 px: hamburguesa + «Nubaria ⌄» a la izquierda; campana con sólo el número y avatar a la derecha.
- En una recomendación, la acción («Haz esto») es el titular. Las preguntas se pliegan en «Visto en N preguntas ⌄».
- Sin «Marcar como hecho» sólo en lo que el usuario no puede ejecutar: los objetivos de puesto en Google (escala que se sigue sola). Lo que hace él mismo sí se marca, también el contacto con terceros («Escribe a guiapymes.es…»): enviar el correo depende de él, así que lleva «Marcar como hecho» (deslizar para confirmar) con la nota «Verás si te incluyen en tu próximo escaneo».
- Etiquetas de fuente IA, Google y Agentes en una sola cola.
- La puntuación agéntica y la Salud SEO van aparte: nunca mueven la Puntuación GEO.
- Motores sólo por su nombre (ChatGPT, Gemini, Claude, Perplexity), sin versión.
- Sin rayas largas en el texto. Datos de ficción (Nubaria y rivales).
- Sin `alert()` ni `confirm()`. Sin scroll horizontal a 375 y 390.
