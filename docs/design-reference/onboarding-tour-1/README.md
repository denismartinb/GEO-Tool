# ONBOARDING-TOUR-1 — «Aprende cómo funciona»

**Estado: Fase 0 (prototipo). Ninguna línea de producto implementada todavía.**

`prototype.html` es la referencia de diseño de un tour animado de **50,0 s en
ocho pasos**, en **dos carcasas** que se intercambian con el selector de arriba:

- **Modal de consola** — se muestra la primera vez que un usuario entra.
- **Hero de la landing** — el mismo tour dentro del `.browserframe` en la
  página pública, bajo el titular real de `app/page.tsx`.

El escenario, el reloj, los ocho pasos y **los textos** son idénticos en las
dos; sólo cambia lo que los rodea. Se intercambian por CSS sobre el mismo DOM:
duplicar el marcado sería garantizar que las dos versiones se separen a la
primera corrección.

Se abre directamente en el navegador, sin servidor ni dependencias.

---

## Los ocho pasos

El montaje —dominio, competidores, prompts, escaneo— ocupa **8,3 s de 50**. El
resto es producto.

| # | t (s) | dur | Pantalla | Qué se ve |
|---|---|---|---|---|
| 1 | 0,7–5,7 | 5,0 | Nuevo dominio | Se teclea el dominio; un spinner marca que la IA sigue trabajando; aparecen competidores y **prompts**, con el panel de prompts destacado |
| 2 | 5,7–9,0 | 3,3 | Escaneo | Gemini, Claude y ChatGPT marcándose · 30 respuestas |
| 3 | 9,0–15,5 | 6,5 | Visión general | Gauge 0→48, las cuatro señales, tres KPI |
| 4 | 15,5–21,0 | 5,5 | Evolución | Curva de seis escaneos 31→48, con su delta y el distintivo de escaneo automático |
| 5 | 21,0–26,5 | 5,5 | Recomendaciones | Tres acciones con impacto estimado; zoom sobre la primera |
| 6 | 26,5–35,5 | 9,0 | Generar solución | Clic → «Generando…» → FAQ escrito → «Marcar como aplicada» |
| 7 | 35,5–41,5 | 6,0 | Auditoría web | Salud técnica 64 y tres arreglos con sus puntos |
| 8 | 41,5–50,0 | 8,5 | Visión general | Gauge 48→71, +23 pt, la curva se extiende, cambia de franja, «2 ajustes nuevos» |

El paso 6 es el más largo del tour a propósito: es el único que enseña que el
producto no se limita a señalar el problema.

## La cabecera

Título fijo — **«Aprende cómo funciona»** — y **un subtítulo que cambia en cada
paso** explicando lo que se ve debajo. Es la única línea de texto que se mueve.
En la carcasa de landing el título fijo es el titular de marketing real («Que la
IA hable de tu marca») y el subtítulo dinámico es el mismo.

## Todos los pasos miden lo mismo

El lienzo tiene proporción fija y la cabecera y el pie son constantes, así que
lo único que variaba era el subtítulo. El JS **mide los ocho textos al ancho
actual y fija la altura al más alto** (`lockSubHeight()`), recalculándolo en
`resize` —el número de líneas depende del ancho— y al cambiar de carcasa —en la
landing el subtítulo se centra y se estrecha—. Sin eso el modal pega un salto
cada vez que se avanza de paso.

Medido: **569 px** de alto en escritorio, **529 px** a 768, **628 px** a 375,
constante en los ocho pasos.

## Los controles

**Atrás** y **Siguiente** cambian de paso: saltan a su inicio, lo reproducen
entero y **se detienen al acabarlo**. En el último paso, Siguiente se convierte
en la llamada a la acción («Ir a mi panel» o «Prueba gratis» según la carcasa).
Los ocho puntos del pie congelan el tour en el paso que se pinche.

## Invariantes que el prototipo ya respeta

Estos no son detalles de la maqueta: son las decisiones que la implementación
tiene que conservar.

1. **Un solo reloj.** Todo se deriva de `t` en milisegundos. No hay ni un
   `animation-delay`. Es lo que permite que Atrás/Siguiente salten a cualquier
   paso, y **congelar el tour en un paso concreto** — sin eso, el `ux-pilot`
   fotografía un fotograma al azar y su veredicto no vale nada. Los puntos del
   pie congelan en `paso.from + 3400 ms`, no al principio del paso: congelar en
   el arranque captura el gauge a cero y da una foto que no representa nada.
2. **Altura constante.** Ver arriba. Cualquier elemento nuevo cuyo tamaño
   dependa del paso rompe esto y hay que medirlo igual que el subtítulo.
3. **`prefers-reduced-motion: reduce` → fotograma final, en pausa.**
4. **No hay reproducción perpetua.** Arranca al entrar en el viewport, se para
   al salir y se para al terminar. Hay «Repetir».
5. **El cursor apunta a elementos, no a coordenadas.** Cada waypoint resuelve
   el centro real del elemento en cada fotograma. Los waypoints que señalan el
   menú llevan alternativa para móvil, donde el menú no existe.
6. **Las gráficas se miden del DOM**, así que se redibujan en `resize`. Su
   escala se **ajusta a la serie**: con una escala fija los seis primeros
   escaneos ocupaban un cuarto de la altura y la mejora no se leía.
7. **Móvil (≤560 px) tiene tratamiento propio, no una copia encogida.** Se
   retira el mini-menú, el lienzo pasa a 4:5, el hero se apila, las KPI se
   retiran y los puntos del pie bajan a su propia línea. Las dos carcasas deben
   dar al lienzo el **mismo ancho** en móvil.

## Lo que el prototipo afirma, y por qué se puede afirmar

Tres textos hacen afirmaciones sobre el producto. Ninguna es de folleto:

- **«Tu dominio se escanea continuamente».** `lib/scan/cron.ts` reescanea a
  diario en free/pro/agency y semanalmente en starter, disparado por el cron de
  Vercel `/api/cron/weekly-scans`. **Si esa cadencia cambia, este texto cambia
  con ella**, y el distintivo «Escaneo automático a diario» del paso 4 también.
- **La auditoría del paso 7** usa las comprobaciones y los pesos reales del
  diseño aprobado en `docs/design-reference/web-audit-issues-1/` — datos
  estructurados 15 pt/página, metadatos 5, formato respuesta-primero 5 — y los
  reparte entre las 14 páginas del ejemplo, igual que hace la pantalla real.
- **El salto de 48 a 71 del paso 8 es ilustrativo, no una promesa.** Lo que
  enseña es el mecanismo —cada escaneo recalcula la puntuación, así que lo
  aplicado se refleja en el siguiente— y el subtítulo lo dice con esas palabras.
  El número concreto depende del sitio. Si en la implementación alguien lo
  convierte en «+23 puntos garantizados», deja de ser un tour y pasa a ser una
  promesa que el producto no puede cumplir.

Las recomendaciones llegan ya ordenadas porque la pantalla real llega ordenada.
El dominio es ficticio a propósito.

## Verificado

Con Playwright sobre Chromium, en **las dos carcasas**, los **ocho pasos** y a
**375 / 768 / 1280 px** (48 combinaciones):

- **altura del modal constante en los ocho pasos**, en cada carcasa y ancho;
- sin desbordamiento horizontal en ningún ancho;
- sin recortes de contenido dentro del lienzo en ninguno de los ocho pasos;
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
