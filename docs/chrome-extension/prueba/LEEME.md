# GenScore (prueba) · extensión de Chrome

Versión de prueba de la alternativa A (CHROME-EXT-1, paso 01 de «Probarla casi
en real»). Aprobada por Denis el 2026-10-28 con datos de ejemplo en la cuenta.

- **La revisión de la página es real**, en cualquier web: título, descripción,
  indexación, canónica, h1, idioma, JSON-LD, fecha, primer párrafo, qué motores
  deja entrar su `robots.txt`, `llms.txt`, y si vende algo, producto, precio,
  stock, botón de compra y devoluciones.
- **La parte de cuenta es inventada** y lleva siempre la etiqueta «Ejemplo»:
  Puntuación GEO, motores, rivales, plan y prompts. Se activa con el
  interruptor «Cuenta de ejemplo» del pie del panel.
- **No toca producción.** No llama a genscore.es salvo cuando pulsas un enlace
  («Analizar dominio», «Entrar», «Abrir la consola»), que abre una pestaña
  normal con `utm_source=chrome-extension`.

## Instalarla (tres pasos)

1. Descomprime `genscore-prueba-0.6.3.zip` en una carpeta.
2. Abre `chrome://extensions` y activa «Modo de desarrollador» (arriba a la derecha).
3. Pulsa «Cargar descomprimida» y elige la carpeta `extension`.

Fija el icono con la chincheta de la pieza de puzle. Para revisar una página,
pulsa el icono o `Alt+Mayús+G` (en Mac, Opción). Con el panel en reposo, una
barra en miniatura enseña el gesto y el icono de verdad lleva un punto azul que
parpadea (Chrome no deja dibujar sobre su barra).

Debajo hay un solo botón, **Escanear automáticamente las páginas**: la primera
vez Chrome pide permiso para «leer y cambiar tus datos en todos los sitios
web», y desde entonces cada página se revisa sola con el panel abierto. Se
quita en el pie del panel. Sólo leemos la página abierta y nada sale del
navegador.

El panel sale en modo claro; el botón de la luna del pie lo pasa a oscuro.

## Tu cuenta (desde la 0.6.0)

Pulsa «Entrar» en el panel e inicia sesión en GenScore en la pestaña que se
abre. Al volver al panel, el desplegable enseña tus dominios y la visión
general de tu dominio, leídas de tu cuenta en sólo lectura. La extensión no
guarda ninguna contraseña ni token: usa la misma sesión que la web, y si
cierras sesión allí, el panel vuelve a «Entrar». Esta prueba lee la vista
previa del PR, así que hay que iniciar sesión en esa dirección.

Mientras estás en la consola, el panel enseña el dominio que tienes
seleccionado allí (o el que elijas en el desplegable). En cualquier otra
página, pulsa el icono de GenScore de la barra (o Alt+Mayús+G) para
analizarla.

## Qué probar

- Tu web, la de dos rivales y una revista que te cite.
- Una ficha de producto: aparece el indicador «Agentes».
- Arregla algo pequeño (la descripción, el `llms.txt`), recarga la página y
  pulsa el icono: la nota cambia y te dice de cuánto a cuánto.
- Con «Cuenta de ejemplo» activa: tu dominio, otra web, y «Probar esta web como
  mi dominio de ejemplo».

## Cómo está hecha

| Fichero | Qué hace |
|---|---|
| `manifest.json` | MV3. Permisos: `activeTab`, `scripting`, `storage`, `sidePanel`. El de sitios (`<all_urls>`) es opcional y sólo se pide al pulsar «Escanear automáticamente las páginas». |
| `sw.js` | Al pulsar el icono abre el panel y lee la página. Guarda el resultado por pestaña en `storage.session` y lo borra al navegar. |
| `collect.js` | Lo que se ejecuta dentro de la página: DOM, más `robots.txt`, `llms.txt` y la cabecera `X-Robots-Tag` del mismo dominio. |
| `score.js` | Puro. De los datos de la página a la «Nota SEO + IA» (IA 55, Google 45; Agentes aparte) y a las tarjetas «Haz esto». Los motores se leen con los mismos tokens que la Auditoría agéntica (`lib/agentic-audit/agents.ts`). |
| `sample.js` | La cuenta de ejemplo. Todo inventado. |
| `panel.*`, `core.js` | El panel, con los tokens, componentes y ayudantes de la consola «Instrumento». `panel.css` y `core.js` se generaron desde ese prototipo. |

Tests: `node --test docs/chrome-extension/prueba/tests/score.test.cjs`.
