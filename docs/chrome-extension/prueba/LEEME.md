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

1. Descomprime `genscore-prueba-0.3.0.zip` en una carpeta.
2. Abre `chrome://extensions` y activa «Modo de desarrollador» (arriba a la derecha).
3. Pulsa «Cargar descomprimida» y elige la carpeta `extension`.

Fija el icono con la chincheta de la pieza de puzle. Para revisar una página,
pulsa el icono o `Alt+Mayús+G` (en Mac, Opción). Cuando cambias de página, el
panel ofrece dos botones:

- **Revisar esta página** pide permiso sólo para esa web («leer y cambiar tus
  datos en alberdiderma.es»). Desde entonces esa web se revisa sola con el
  panel abierto.
- **Revisar automáticamente las páginas** pide permiso para todas las webs. Es
  el aviso duro de Chrome, así que sólo lo ve quien lo pulsa. Se quita en el
  pie del panel.

En una web que el panel no ha leído nunca en esa pestaña, Chrome no nos deja
ver su dirección, así que ahí sólo sirve el icono.

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
| `manifest.json` | MV3. Permisos: `activeTab`, `scripting`, `storage`, `sidePanel`. El de sitios (`<all_urls>`) es opcional y sólo se pide al pulsar «Revisar esta página». |
| `sw.js` | Al pulsar el icono abre el panel y lee la página. Guarda el resultado por pestaña en `storage.session` y lo borra al navegar. |
| `collect.js` | Lo que se ejecuta dentro de la página: DOM, más `robots.txt`, `llms.txt` y la cabecera `X-Robots-Tag` del mismo dominio. |
| `score.js` | Puro. De los datos de la página a la «Nota SEO + IA» (IA 55, Google 45; Agentes aparte) y a las tarjetas «Haz esto». Los motores se leen con los mismos tokens que la Auditoría agéntica (`lib/agentic-audit/agents.ts`). |
| `sample.js` | La cuenta de ejemplo. Todo inventado. |
| `panel.*`, `core.js` | El panel, con los tokens, componentes y ayudantes de la consola «Instrumento». `panel.css` y `core.js` se generaron desde ese prototipo. |

Tests: `node --test docs/chrome-extension/prueba/tests/score.test.cjs`.
