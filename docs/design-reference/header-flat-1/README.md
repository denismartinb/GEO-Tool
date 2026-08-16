# HEADER-FLAT-1 — diseño aprobado

`maquetas.html` es el artefacto que el fundador aprobó el 2026-08-15 antes de
que se tocara una línea de código. Se commitea aquí porque un enlace a un
artefacto de chat **no es un input verificable**: ni CI ni una sesión futura
pueden abrirlo, y la mitad de fidelidad-de-diseño del `ux-pilot` se quedaría
sin referencia contra la que comparar (CLAUDE.md, "Dos entradas obligatorias
antes de que una pasada del piloto signifique algo").

Ábrelo en un navegador. No depende de nada externo.

## Qué contiene

Maquetas a escala **1:1 sobre lienzo de 375 px** de la cabecera en las dos
zonas, con las medidas tomadas del navegador (`boundingBox()`) sobre la app
corriendo en local, no estimadas a ojo:

1. **Estado actual** de las dos cabeceras, con la tabla de qué las separaba.
2. **La restricción**: por qué la portada puede ser plana y la consola no podía
   copiarla literalmente.
3. **La propuesta**: cabecera plana, hamburguesa de dos rayas, campana sin caja.
4. **El resto de la web pública**: por qué la portada era la excepción y no la
   norma.

## Lo que el artefacto dice y el código acabó desmintiendo

Dos avisos del documento resultaron **falsos al implementarlo**, y se conservan
aquí a propósito en vez de editarlos, porque el histórico (§109) los cita como
ejemplo de suposición corregida por medición:

- El artefacto avisa de que dejar la cabecera de consola transparente arriesga
  que el contenido se lea por debajo y que el logo quede sobre el aviso lila.
  **Las dos cosas son falsas**: `.shell` es `overflow:hidden` a `100dvh` y quien
  scrollea es `.dash-content`, hermana de la cabecera. Nada pasa por debajo.
- El artefacto propone el mismo estado de cristal al desplazar para la zona
  pública. **No se implementó**: el `sticky` de esa cabecera lleva roto desde
  antes por `html { overflow-x: hidden }`, así que ese estado no se vería nunca.

## Lo que quedó fuera, medido y pendiente

El escritorio de las dos zonas. La marca de consola sigue en la barra lateral y
el chip de cuenta público sigue midiendo 101 px con sesión iniciada (63 px sin
ella) por un relleno heredado del cajón móvil. Ambas cosas están medidas y
maquetadas en un artefacto anterior; son estructura, no tratamiento, y esta
fase acotó lo segundo.
