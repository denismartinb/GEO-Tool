# ONBOARDING-TOUR-1 — «Aprende cómo funciona»

**Estado: Fase 0 (prototipo). Ninguna línea de producto implementada todavía.**

`prototype.html` es la referencia de diseño de un tour animado de **44,0 s en
siete pasos**, en **dos carcasas** que se intercambian con el selector de
arriba:

- **Modal de consola** — se muestra la primera vez que un usuario entra.
- **Hero de la landing** — el mismo tour dentro del `.browserframe` en la
  página pública, bajo el titular real de `app/page.tsx`.

El escenario, el reloj y los siete pasos son **idénticos** en las dos; sólo
cambia lo que los rodea. Se intercambian por CSS sobre el mismo DOM: duplicar
el marcado sería garantizar que las dos versiones se separen a la primera
corrección.

Se abre directamente en el navegador, sin servidor ni dependencias.

---

## El reparto del metraje

El montaje —dominio, competidores, prompts, escaneo— es lo que menos importa y
ocupa **7,3 s de 44**. El resto, el 83%, es producto: la puntuación, la
tendencia, y generar una recomendación de principio a fin.

| # | t (s) | dur | Pantalla | Qué se ve |
|---|---|---|---|---|
| 1 | 0,7–4,7 | 4,0 | Nuevo dominio | Se teclea el dominio y aparecen competidores y prompts propuestos |
| 2 | 4,7–8,0 | 3,3 | Escaneo | Gemini, Claude y ChatGPT marcándose · 30 respuestas |
| 3 | 8,0–15,0 | 7,0 | Visión general | Gauge 0→48, las cuatro señales, tres KPI |
| 4 | 15,0–21,0 | 6,0 | Evolución | Curva de seis escaneos, 31→48, con su delta |
| 5 | 21,0–26,5 | 5,5 | Recomendaciones | Tres acciones con impacto estimado; zoom sobre la primera |
| 6 | 26,5–36,0 | 9,5 | Generar solución | Clic → «Generando…» → FAQ escrito → «Marcar como aplicada» |
| 7 | 36,0–44,0 | 8,0 | Visión general | Gauge 48→71, +23 pt, la curva se extiende, cambia de franja |

El paso 6 es el más largo del tour a propósito: es el único que enseña que el
producto no se limita a señalar el problema.

## La cabecera

Título fijo — **«Aprende cómo funciona»** — y **un subtítulo que cambia en cada
paso** explicando lo que se ve debajo. Es la única línea de texto que se mueve,
y tiene altura mínima fija para que el modal no dé saltos al cambiar de paso.

En la carcasa de landing el título fijo es el titular de marketing real
(«Que la IA hable de tu marca») y el subtítulo dinámico es el mismo.

## Los controles

**Atrás** y **Siguiente** cambian de paso: saltan a su inicio, lo reproducen
entero y **se detienen al acabarlo**, para que se pueda avanzar a ritmo propio.
En el último paso, Siguiente se convierte en la llamada a la acción («Ir a mi
panel» o «Prueba gratis» según la carcasa). Los siete puntos del pie congelan
el tour en el paso que se pinche.

## Formato compacto

Medido en el prototipo: el modal ocupa **553 px de alto en escritorio**
(510 px a 768 px, 591 px a 375 px). Cabe como pop-up sin scroll y como hero
integrado sin comerse la página. Lo que lo permite:

- el lienzo es **2:1**, no 16:9;
- **no hay banda de rótulos** bajo el lienzo — ese texto se fue al subtítulo de
  la cabecera, que es donde el fundador lo pidió;
- el contenido **llena** el lienzo (`.card.fill`) en vez de flotar arriba: una
  tarjeta pequeña en un lienzo medio vacío se lee como una maqueta a medio
  hacer, no como una pantalla del producto.

## Invariantes que el prototipo ya respeta

Estos no son detalles de la maqueta: son las decisiones que la implementación
tiene que conservar.

1. **Un solo reloj.** Todo se deriva de `t` en milisegundos. No hay ni un
   `animation-delay`. Es lo que permite que Atrás/Siguiente salten a cualquier
   paso, y **congelar el tour en un paso concreto** — sin eso, el `ux-pilot`
   fotografía un fotograma al azar y su veredicto no vale nada. Los puntos del
   pie congelan en `paso.from + 3200 ms`, no al principio del paso: congelar en
   el arranque captura el gauge a cero y da una foto que no representa nada.
2. **`prefers-reduced-motion: reduce` → fotograma final, en pausa.** Sin
   movimiento de ningún tipo.
3. **No hay reproducción perpetua.** Arranca al entrar en el viewport, se para
   al salir y se para al terminar. Hay «Repetir».
4. **El cursor apunta a elementos, no a coordenadas.** Cada waypoint resuelve
   el centro real del elemento en cada fotograma, así que sigue siendo correcto
   a cualquier ancho. Los waypoints que señalan el menú llevan alternativa para
   móvil, donde el menú no existe.
5. **Las gráficas se miden del DOM**, así que se redibujan en `resize`. Su
   escala se **ajusta a la serie**: con una escala fija 20-100 los seis primeros
   escaneos ocupaban un cuarto de la altura y la mejora no se leía.
6. **Móvil (≤560 px) tiene tratamiento propio, no una copia encogida.** Se
   retira el mini-menú, el lienzo pasa a 4:5, el hero se apila, las KPI se
   retiran y los puntos del pie bajan a su propia línea — en una sola fila,
   puntos + Atrás + Siguiente desbordaban el viewport (medido: 421 px sobre
   375). Las dos carcasas deben dar al lienzo el **mismo ancho** en móvil: con
   proporción fija, 24 px de diferencia de relleno se convierten en decenas de
   píxeles de altura y recortan el contenido.
7. **Sin comportamiento inventado.** Las recomendaciones llegan ya ordenadas
   porque la pantalla real llega ordenada. El dominio es ficticio a propósito.
8. **El salto de 48 a 71 es ilustrativo, no una promesa.** Lo que el paso 7
   enseña es el mecanismo real —cada escaneo recalcula la puntuación, así que
   lo aplicado se refleja en el siguiente—, y el subtítulo lo dice con esas
   palabras. El número concreto depende del sitio. Si en la implementación
   alguien convierte esto en «+23 puntos garantizados», deja de ser un tour y
   pasa a ser una promesa que el producto no puede cumplir.

## Verificado

Con Playwright sobre Chromium, en **las dos carcasas**, los **siete pasos** y a
**375 / 768 / 1280 px** (42 combinaciones):

- sin desbordamiento horizontal en ningún ancho;
- sin recortes de contenido dentro del lienzo en ninguno de los siete pasos;
- sin errores de consola;
- `prefers-reduced-motion` aterriza en el fotograma final, en pausa.

## Pendiente

- **Decidir la carcasa.** Es lo único que bloquea la Fase A.
- **Fase A** — implementar `<ProductTour />`. Si la elegida es la consola,
  requiere decidir dónde se persiste «ya visto»: `localStorage` (sin migración)
  frente a columna en la tabla de usuario (**migración de esquema, prohibida
  sin aprobación explícita del fundador**). Si la elegida es la landing, esa
  decisión desaparece: no hay nada que recordar por usuario.
- Entrada en `docs/brand/design-decisions-log.md` — se escribe en el PR que
  implemente la Fase A, no antes: hasta entonces no hay decisión cerrada que
  registrar.
- Casilla de la zona en el mapa de `CLAUDE.md` (zona nueva: «Onboarding»).
