# ONBOARDING-TOUR-1 — tour de bienvenida en la consola

**Estado: Fase 0 (prototipo). Ninguna línea de producto implementada todavía.**

`prototype.html` es la referencia de diseño de un tour animado de **20,0 s**,
en **dos carcasas** que se intercambian con el selector de arriba:

- **Modal de consola** — se muestra la primera vez que un usuario entra en la
  consola, mientras su primer escaneo sigue corriendo.
- **Hero de la landing** — el mismo tour dentro del `.browserframe` en la
  página pública, bajo el titular real de `app/page.tsx`.

El escenario, el reloj y los cinco actos son **idénticos** en las dos; sólo
cambia lo que los rodea y el tiempo verbal de los rótulos (en la consola el
usuario ya añadió su dominio y su escaneo ya corre; en la landing todavía no ha
hecho nada). Se intercambian por CSS sobre el mismo DOM: duplicar el marcado
sería garantizar que las dos versiones se separen a la primera corrección.

Se abre directamente en el navegador, sin servidor ni dependencias.

---

## Por qué dos carcasas

La primera decisión fue «consola, primer login». Al plantearse después que el
referente del sector vive en la **web pública al aterrizar**, la elección dejó
de ser obvia: son dos trabajos distintos con el mismo motor detrás. En vez de
elegir a ciegas, el prototipo monta las dos para poder compararlas movidas.

Lo que cambia entre ellas es poco y está acotado: el cromo de navegador (sólo
landing), la cabecera (modal de bienvenida frente a titular de hero), el pie
(«Saltar / Ir a mi panel» frente a «Prueba gratis») y el tiempo verbal de los
actos 1-3. Todo lo demás — los cinco actos, el cursor, el reloj — es el mismo
componente.

## Por qué un tour filmado y no *coach marks*

El patrón habitual de onboarding en producto — señalar los elementos reales de
la pantalla con globitos — no sirve aquí. En el momento exacto en que se
mostraría, el escaneo está en `pending` y la Visión general todavía no tiene
datos: los globitos apuntarían a pantallas vacías. Un tour filmado funciona con
independencia del estado de los datos y, además, enseña justo lo que está a
punto de aparecer.

## Los cinco actos

| # | t (s) | Pantalla | Rótulo |
|---|---|---|---|
| — | 0,0–0,8 | entrada del cursor | — |
| 1 | 0,8–3,5 | Wizard «Nuevo dominio» | Tu dominio ya está dentro · *Empieza por tu dominio* |
| 2 | 3,5–8,0 | Escaneo en curso | Ahora mismo estamos escaneando · *Lanzamos tus prompts en varios motores* |
| 3 | 8,0–12,5 | Visión general | Cuando acabe: tu GeoScore · *Tu GeoScore, y de qué se compone* |
| 4 | 12,5–16,2 | Competidores | Frente a quién pierdes |
| 5 | 16,2–20,0 | Recomendaciones | Y qué cambiar primero · *…y exactamente qué cambiar primero* |

Primer rótulo: carcasa de consola. En *cursiva*: carcasa de landing.

Cinco actos y no siete: por debajo de ~3 s por pantalla el rótulo no da tiempo
a leerse. El acto 1 es un recordatorio en pasado — el usuario acaba de hacerlo —
y por eso es el más corto; el acto 2 es el más largo porque es lo que está
ocurriendo de verdad mientras mira, y explica la espera.

## Invariantes que el prototipo ya respeta

Estos no son detalles de la maqueta: son las decisiones que la implementación
tiene que conservar.

1. **Un solo reloj.** Todo se deriva de `t` en milisegundos. No hay ni un
   `animation-delay`. Es lo que permite rebobinar a cualquier instante y
   **congelar el tour en un acto concreto** — sin eso, el `ux-pilot` fotografía
   un fotograma al azar y su veredicto no vale nada. Los puntos del pie hacen
   exactamente eso, y congelan en `acto.from + 1800 ms`, no al principio del
   acto: congelar en el arranque captura las barras a cero y da una foto que no
   representa el acto.
2. **`prefers-reduced-motion: reduce` → fotograma final, en pausa.** Sin
   movimiento de ningún tipo.
3. **No hay reproducción perpetua.** Arranca al entrar en el viewport, se para
   al salir y se para al terminar. Hay «Repetir».
4. **El cursor apunta a elementos, no a coordenadas.** Cada waypoint resuelve
   el centro real del elemento en cada fotograma, así que sigue siendo correcto
   a cualquier ancho. Los waypoints que señalan el menú llevan alternativa para
   móvil, donde el menú no existe.
5. **Móvil (≤560 px) tiene tratamiento propio, no una copia encogida.** Se
   retira el mini-menú, el lienzo pasa a vertical, el hero se apila y el
   tooltip desaparece. Medido: a 375 px el acto 5 necesita 414 px de contenido,
   por eso el lienzo es 3/5 y no 3/4. Las dos carcasas deben dar al lienzo el
   **mismo ancho** en móvil: con proporción fija, 24 px de diferencia de
   relleno se convirtieron en 40 px de altura y recortaron el acto 5.
6. **Sin comportamiento inventado.** Las filas de Competidores se pintan ya
   ordenadas porque la pantalla real llega ordenada; animar una reordenación
   sería enseñar algo que el producto no hace. Los números son los mismos que
   la landing ya tiene aprobados como ilustrativos (`SHOT_*` en `app/page.tsx`)
   y el dominio es ficticio a propósito.

## Verificado

Con Playwright sobre Chromium, en **las dos carcasas** y a 375 / 768 / 1280 px:

- sin desbordamiento horizontal en ningún ancho;
- sin recortes de contenido dentro del lienzo en ninguno de los cinco actos;
- sin errores de consola;
- `prefers-reduced-motion` aterriza en el fotograma final, en pausa.

## Pendiente

- **Decidir la carcasa.** Es lo único que bloquea la Fase A.
- **Fase A** — implementar `<ProductTour />`. Si la elegida es la consola, requiere decidir
  dónde se persiste «ya visto»: `localStorage` (sin migración) frente a columna
  en la tabla de usuario (**migración de esquema, prohibida sin aprobación
  explícita del fundador**). Si la elegida es la landing, esa decisión
  desaparece: no hay nada que recordar por usuario.
- Entrada en `docs/brand/design-decisions-log.md` — se escribe en el PR que
  implemente la Fase A, no antes: hasta entonces no hay decisión cerrada que
  registrar.
- Casilla de la zona en el mapa de `CLAUDE.md` (zona nueva: «Onboarding»).
