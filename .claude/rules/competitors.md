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
- **Ventana de los últimos 15 escaneos** (`MAX_TREND_POINTS`,
  `lib/competitors/trend-window.ts`). Se **filtra primero y se recorta después**:
  al revés se gastarían huecos de la ventana en columnas que no pintan nada.
- La lista "puesto medio · último escaneo" se ancla al **último escaneo real**,
  nunca al último punto que sobreviva a la ventana — si no, el encabezado
  mentiría.

## Layout

- El botón **"Gestionar" va en la etiqueta de sección**, nunca en la cabecera
  fija: todas las cabeceras de consola son iguales (log §3.2, decisión del
  fundador ya tomada dos veces).
