---
description: Invariantes de la zona de Competidores (pantalla, sugerencias y métricas comparativas).
paths:
  - "app/dashboard/projects/*/competitors/**"
  - "lib/competitors/**"
---

# Competidores — invariantes

Aplican automáticamente al tocar esta zona. Historia completa y el porqué de
cada decisión: `docs/brand/design-decisions-log.md` §10 y §11.

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

- **La lista muestra un ranking 1..N sin repetidos, no la media en crudo.** El
  dato de fondo sigue siendo `avg_position_when_mentioned`, pero una media casi
  nunca vale 1,00, así que enseñarla hacía que la lista pareciera no tener a
  nadie en primera posición (log §15). **Empates: desempata la tasa de mención**
  (a igual puesto medio, quien sale en más respuestas va antes), y el nombre
  como último criterio sólo para que el orden sea estable entre renders. El
  porcentaje que desempata se muestra en la fila, para que el criterio sea
  visible y no arbitrario.
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
