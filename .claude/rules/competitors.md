---
description: Invariantes de la zona de Competidores (pantalla, sugerencias y métricas comparativas).
paths:
  - "app/dashboard/projects/*/competitors/**"
  - "lib/competitors/**"
---

# Competidores — invariantes

Aplican automáticamente al tocar esta zona. Historia completa y el porqué de
cada decisión: `docs/brand/design-decisions-log.md` §10 y §11.

## Entrada inicial (alta de proyecto)

- **Un tope de cuántos competidores acepta el asistente que la interfaz no
  enseña es pérdida de datos silenciosa, no un límite razonable.**
  `parseInitialCompetitors` (`lib/projects/project-form.ts`) recortaba a
  `MAX_INITIAL_COMPETITORS` (5) mientras el asistente
  (`components/onboarding-wizard.tsx`) dejaba añadir filas sin tope y su
  contador decía "10 competidores listos" — el servidor descartaba las
  últimas 5 sin error ni aviso (log §123, ONBOARDING-COMPETITORS-CAP-1).
  El tope de entrada del usuario vive en `MAX_USER_COMPETITORS` (10),
  **distinto** de `MAX_INITIAL_COMPETITORS` (5, cuántos competidores se le
  piden a Gemini como sugerencia): no son el mismo número ni el mismo
  concepto, y reunificarlos reabre este mismo bug. Cualquier tope de entrada
  del usuario se refleja en la UI (botón deshabilitado, contador con el
  máximo) en el mismo cambio que lo introduce.

## Origen de las sugerencias

- **Las sugerencias salen del `business_profile` real del proyecto** (perfil
  cacheado + búsqueda grounded, `lib/competitors/suggest-competitors.ts`),
  **nunca de `other_brands_mentioned`**. Volver a la segunda fuente reabre el
  caso Mozilla → AliExpress/Carrefour: marcas reales presentes en el texto que
  no compiten con nada (log §11, ADR 0020, ADR 0022).
- **Sin perfil no se sugiere.** Se dice honestamente que no se ha podido
  identificar el negocio; nunca se cae al modo ciego por dominio que ADR 0020
  eliminó, ni se inventa un dominio plausible.
- La caché (`projects.suggested_competitors`) **se guarda en crudo y se filtra
  en lectura**. Así seguir a un sugerido lo quita sin invalidar nada y dejar de
  seguirlo lo devuelve. No mover el filtro al momento de escritura.
- **Nunca ofrecer** el dominio del propio proyecto ni un competidor ya dado de
  alta, **activo o inactivo** — uno desactivado a propósito no vuelve como
  sugerencia.

## Poblaciones de datos (no unificar sin decisión explícita)

Conviven a propósito dos ventanas distintas, y mezclarlas rompe la lectura:

| Bloque | Ventana |
|---|---|
| Cuota de voz, terreno por tema, matriz de motores | **Acumulado** de todos los escaneos completados |
| Brecha de prompts, competidores sugeridos | **Último escaneo completado** |

El motivo del segundo grupo: un conteo acumulado sólo puede crecer, así que el
ruido de escaneos antiguos nunca desaparecería aunque el escaneo nuevo esté
limpio (log §11).

## Métricas

- **El puesto del último escaneo se calcula en un solo sitio:
  `rankLatestPositions` (`lib/competitors/latest-positions.ts`).** Lo llaman las
  dos pantallas que lo publican — la lista de Competidores y la panorámica
  competitiva de Visión general. Cuando cada una ordenaba por su cuenta, la
  misma marca salía 1ª en una y 2ª en la otra sobre el mismo escaneo
  (PANORAMA-PARITY-1, log §36). Se le pasan **entidades activas**, no filas del
  ranking persistido: un competidor desactivado tras el escaneo sigue dentro del
  ranking y así desaparece de las dos a la vez. La marca se casa por `is_brand`,
  nunca por nombre.
- **Las dos listas publican la misma cifra: la tasa de mención del último
  escaneo.** La panorámica enseñaba cuota de voz sin etiquetar y se leía como si
  fuera la mención de la otra pantalla (37% contra 48% para la misma marca, log
  §36). La cuota de voz sigue viva y visible en el **pódium** de Competidores,
  donde está etiquetada como tal y calculada sobre todos los escaneos. Un número
  sin etiqueta hereda el significado del número parecido que el usuario ya vio.

## La panorámica de Visión general tiene cuatro estados, no uno

`computePanoramaState` (`lib/competitors/panorama-state.ts`) es la única
fuente de qué estado aplica; no derivar ninguno de estos casos inline en la
página. Tratar los tres últimos como variaciones del primero es exactamente el
bug que motivó PANORAMA-EMPTY-1 (log §36, addendum 2026-08-07): seis filas de
`0%` sin explicación en el primer escaneo de un cliente nuevo, y una tarjeta
titulada "Tu puesto cuando apareces" cuyas barras no incluían la fila de la
propia marca cuando caía fuera del top 5.

- **`empty`** — nadie fue mencionado. Se decide por `mentionRate`, nunca por
  el ranking: tiene que dispararse con o sin datos de posición, porque "¿hubo
  alguien?" es una pregunta distinta de "¿hay puesto?". Sin tabla, sin
  gráfico — un bloque que lo dice con palabras.
- **`unranked`** — escaneo anterior a geo-score-v3 (ADR 0026, sin backfill)
  con menciones reales. Lista sólo-mención, sin columna de puesto.
- **`ranked` dentro del top 5** — el caso que valida el piloto.
- **`ranked` fuera del top 5, o marca sin mención mientras otros sí tienen
  puesto** — las barras (`topRows`) son **siempre** el top 5 real, nunca
  rellenadas con la fila de la marca para fingir que la incluyen; van
  etiquetadas "Top 5 posiciones" para no leerse como la misma afirmación que
  el titular. Si la marca cae fuera del top 5, su fila se añade al final de
  la **tabla** (no del gráfico) tras un separador visual — nunca un hueco sin
  explicar. **Si la marca no tiene puesto en absoluto, no se le añade fila**:
  el titular dice "No apareciste en este escaneo" y eso basta (decisión
  explícita del fundador, 2026-08-07: *"En el D que lo diga el titular. No
  hace falta la fila al final"*).
- **La lista muestra un ranking 1..N sin repetidos, no la media en crudo.** El
  dato de fondo sigue siendo `avg_position_when_mentioned`, pero una media casi
  nunca vale 1,00, así que enseñarla hacía que la lista pareciera no tener a
  nadie en primera posición (log §15). **Empates: desempata la tasa de mención**
  (a igual puesto medio, quien sale en más respuestas va antes), y el nombre
  como último criterio sólo para que el orden sea estable entre renders. El
  porcentaje que desempata se muestra en la fila, para que el criterio sea
  visible y no arbitrario.
- **Una media sobre pocas respuestas no adelanta a una media sobre muchas.**
  `avg_position_when_mentioned` no dice sobre cuántas respuestas promedia, así
  que comparar n=1 con n=26 no es un matiz: Euskaltel salió UNA vez en 30, fue
  primero en esa respuesta y encabezó las dos pantallas con un 1,00, por delante
  de Movistar (26 de 30) — «Euskaltel 1º · 3% de mención» (fundador,
  2026-08-27, log §171). El suelo vive en `rankLatestPositions`
  (`MIN_MENTION_RATE_FOR_RANK` 10%, `MIN_MENTIONS_FOR_RANK` 2) y por tanto
  arregla las dos pantallas a la vez, que es para lo que ese módulo existe.
  **Es un suelo, no un filtro**: por debajo la entidad conserva fila, media y
  tasa reales, se ordena detrás y la fila DICE por qué («pocas menciones»).
  Esconderla cambiaría una impresión falsa por una ausencia. Se expresa en
  **tasa** y no en cuenta a propósito — 3 menciones son el 10% de 30 respuestas
  y el 0,6% de 500 —, y el suelo absoluto sólo cubre el otro extremo. Una
  entrada sin ninguna de las dos cifras se deja cualificada: degradar por una
  clave que nunca se escribió es inventar un veredicto sobre un hueco. **Y se
  compara la tasa REDONDEADA**, la que la fila imprime: un 9,6% se pinta como
  «10%» y, juzgado en crudo, llevaría la etiqueta «pocas menciones» al lado de
  una cifra que a la vista cumple el suelo exactamente. La regla que el usuario
  puede comprobar es la que ve en pantalla.
- **La posición mide rango, no frecuencia** (ADR 0026 `position-when-mentioned`).
  No reintroducir el promedio con penalización `N+1` de ADR 0005: producía que
  una marca poco mencionada quedase por encima de Chrome o Safari.
- El set de competidores se reconcilia según ADR 0018 — dos números con el mismo
  significado y distinto valor es un fallo, no un matiz.
- "Ausente" en brecha de prompts debe coincidir con la fórmula de
  `competitor_gap_score` (ADR 0011). Hay un test que lo fija; no relajarlo.

## Gráfico de evolución del puesto

- **Un escaneo sin dato de posición para NINGUNA marca no se dibuja.** Ocupar un
  hueco del eje X con una columna vacía corta todas las líneas a la vez y se lee
  como un gráfico roto (TREND-WINDOW-1, log §15).
- **Que una serie suelta valga null sí es información** ("esa marca no salió en
  ese escaneo") y debe seguir cortando **su** línea. No confundir los dos casos.
- **La línea une puntos con rectas, nunca en escalera.** El gráfico usaba pares
  `H`/`V` argumentando que "un puesto no se desliza por los valores
  intermedios" — pero un escalón afirma que el valor se mantuvo plano hasta el
  instante del escaneo siguiente, que es una afirmación *más* fuerte sin medir
  que una diagonal, y se lee como un fallo de dibujado. Los puntos marcan la
  medición; la línea sólo conecta (`buildSeriesPaths`, log §15).
- **Mínimo 4 escaneos para dibujar tendencia** (`MIN_TREND_POINTS`). Dos puntos
  es el mínimo matemático de una recta y el número equivocado de producto: sale
  como dos rayas planas de lado a lado y parece roto.
- **Ventana de los últimos 15 escaneos** (`MAX_TREND_POINTS`,
  `lib/competitors/trend-window.ts`). Se **filtra primero y se recorta después**:
  al revés se gastarían huecos de la ventana en columnas que no pintan nada.
- La lista "puesto medio · último escaneo" se ancla al **último escaneo real**,
  nunca al último punto que sobreviva a la ventana — si no, el encabezado
  mentiría.
- **El gráfico espera; la tabla no.** Una tendencia necesita historia, pero
  "quién va por delante ahora mismo" se responde desde el **primer** escaneo:
  la lista de puesto medio se muestra siempre que haya datos, y sólo el gráfico
  se oculta hasta `MIN_TREND_POINTS`. La etiqueta de sección cambia según lo
  que haya debajo, para no prometer una evolución que la tarjeta no enseña.
- **Lo que nunca se pinta es un cascarón vacío: ni etiqueta ni tarjeta si no
  hay ni gráfico ni tabla.** Se probó explicar la espera con un mensaje
  honesto y el fundador lo cortó igual (2026-08-04): un bloque que sólo sabe
  decir "todavía no" es ruido en todas las visitas, y redactarlo mejor no lo
  arregla. Ojo: esto convive con que un escaneo anterior a geo-score-v3 no
  tiene `avg_position_when_mentioned` para nadie (ADR 0026 decisión 4, sin
  backfill), así que un proyecto con mucha historia puede pasar días sin
  bloque. Es lo esperado.
- **La lista tiene tres columnas —marca · mención · puesto— y cada una lleva su
  etiqueta encima.** El **puesto va el último, a la derecha, y es la cifra más
  pesada** de la fila: es el dato del bloque. Puesto a la izquierda como dígito
  pequeño y gris, el fundador pasó por encima de él dos veces sin verlo (*"no la
  había visto"*, log §15). Se escribe como ordinal (`3º`): "3" es una viñeta.
- La regla es **la etiqueta va sobre el dato que nombra**, no "a la derecha":
  con un solo encabezado a la derecha, "ranking" acabó nombrando los
  porcentajes y la columna de puesto se quedó sin etiqueta.
- **Sin InfoTip en ese encabezado.** Pegado al borde del viewport, la burbuja se
  abre fuera de pantalla y sale cortada (log §15). Un tooltip que no se puede
  leer estorba más de lo que explica.
- **Las marcas apagadas de la leyenda no son marcas rotas.** Sólo las primeras
  `DEFAULT_VISIBLE` series arrancan encendidas; el resto se activan pulsando.
  El fundador las leyó como deshabilitadas, así que el atenuado se mantiene
  suave y va acompañado de una pista explícita. Un interruptor que parece
  muerto no lo pulsa nadie.

## Layout

- El botón **"Gestionar" va en la etiqueta de sección**, nunca en la cabecera
  fija: todas las cabeceras de consola son iguales (log §3.2, decisión del
  fundador ya tomada dos veces).
