# Evidencia · ONBOARDING-PROPOSALS-1 / ONBOARDING-IDENTITY-1

Código de la UI: `bd732500` (rama `claude/onboarding-proposal-quality-grq3xv`, PR #553). El commit que añade estas
imágenes no cambia código de producto. Decisiones y límites: `docs/brand/design-decisions-log.md` §237.

## Qué es y qué NO es esta evidencia

- **Todas las imágenes son FIXTURE — datos simulados.** Se hicieron con Playwright contra `next dev` local y una
  página temporal que **no está en el repo**: sustituye las server actions por respuestas fijas (`suggestAction`
  devuelve datos inventados; `createAction` no hace nada). **No hay Gemini, ni Supabase, ni preview de Vercel, ni
  datos reales**, y ninguna imagen prueba que el alta real funcione. Una banda amarilla «FIXTURE» aparece arriba en
  cada captura.
- **Una imagen no es una prueba de interacción.** Enseña lo que se pinta en un estado concreto. Lo que se ejercitó
  con el navegador está en la tabla de abajo, y el resto está cubierto (o no) por tests unitarios.
- Las dimensiones son `fullPage` (390 × alto de página y 1280 × alto de página).

## Imágenes

| Fichero | Viewport | Estado | Qué enseña |
|---|---|---|---|
| `390-blocked-1-descripcion.png` | 390 | Portada bloqueada (`homepage_unreadable`) | Aparece «No hemos podido leer tu web» con el campo de descripción. **Se ve el recorte de la barra de dominio a la derecha: ya está en `main` (la columna mide 407 px antes de cualquier tarjeta nueva).** |
| `1280-blocked-1-descripcion.png` | 1280 | Ídem | Mismo estado en escritorio. |
| `390-blocked-2-competidores.png` | 390 | Tras escribir una descripción | Identidad pendiente («Elcorteingles» sale del dominio), criterio de la propuesta, chips «con fuente» / «sin verificar». |
| `1280-blocked-2-competidores.png` | 1280 | Ídem | Ídem en escritorio. |
| `390-ok-2-competidores.png` | 390 | Portada legible | Nombre «El Corte Inglés» propuesto desde el título; sin aviso de pendiente; alias propuesto. |
| `1280-ok-2-competidores.png` | 1280 | Ídem | Ídem en escritorio. |
| `390-ok-3-prompts.png` | 390 | Paso de prompts | País e idioma con selector, avisos «no son búsquedas reales», resumen «Estimado», etiqueta por prompt. |
| `1280-ok-3-prompts.png` | 1280 | Ídem | Ídem en escritorio. |
| `390-blocked-3-prompts.png`, `1280-blocked-3-prompts.png` | 390 / 1280 | Prompts tras la ruta «bloqueada» | Mismo paso alcanzado por el otro camino. |

## Qué se verificó con interacción (guion de Playwright, contra el fixture)

Transcrito de la salida del guion, 390 y 1280, casos `blocked` y `ok`:

- Teclado: `Enter` en el campo de dominio lanza la propuesta.
- Caso `blocked`: el campo `#business-description` aparece; al rellenarlo y pulsar «Generar con esta descripción»
  se llega al paso de competidores.
- Marca propuesta: `blocked` → «Elcorteingles» (pendiente); `ok` → «El Corte Inglés».
- Se edita el nombre comercial y se escribe el alias genérico «tienda» + `Enter`: se rechaza con «Es una palabra
  genérica del sector, no un nombre de tu marca.». Un alias válido («Club del Gourmet») se añade con `Enter`.
- Sin desbordamiento horizontal del documento en los pasos 1, 2 y 3, en los cuatro casos.
- Selector de idioma: enfocado y cambiado con `ArrowDown` (de «es» a «en»).

## Qué NO se verificó

- Ninguna llamada real a Gemini ni a Supabase; ni la creación real del proyecto ni el envío de los campos ocultos
  `brand` y `brand_aliases` a la server action (lo cubren tests unitarios de `createProject`/`createProjectCore`
  y `parseConfirmedAliasesField`, no el navegador).
- Recorrido completo con la tecla Tab (orden de foco) y lector de pantalla.
- Otros navegadores (sólo Chromium) y otros anchos.
- Doble clic, recarga, timeout y trial expirado en el navegador (cubiertos, si lo están, a nivel de `createProjectCore`).
- El paso 1 a 390 px en `main` sigue recortado: no se ha corregido (CSS, fuera de este PR).
- Los dos mensajes de consola de hidratación que aparecieron en el caso `blocked` vienen de la página fixture (lee
  `window` al renderizar), no del producto; en el caso `ok` no aparecen.

## Cosas que se ven en las capturas y NO son del producto

- El distintivo rojo «N · 2 Issues» es el overlay de desarrollo de Next; viene de los avisos de hidratación de la página
  fixture (ver arriba), no de un error del asistente.
- Los favicons de los competidores salen rotos o vacíos: el fixture no tiene red y los servicios de favicon no responden.
