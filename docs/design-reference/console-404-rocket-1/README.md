# CONSOLE-404-ROCKET-1 · 404 de la consola «Fuera de trayectoria»

`opciones.html` es la maqueta que vio Denis el 2026-10-30 (tres opciones dentro
del marco «Instrumento», móvil y escritorio). Eligió la **A, «Fuera de
trayectoria»**, el 2026-10-31. La B («Sin lectura») y la C («El punto
perdido») quedan aquí solo como referencia; no están implementadas.

Lo que manda de la A:

- El cohete es el de la 404 pública (`components/not-found-mission.tsx`):
  misma silueta, paleta y dirección de vuelo.
- Ventana nocturna en una tarjeta. Ancho: el texto va sobre la escena, a la
  izquierda. Por debajo de 1100 px el texto baja debajo de la escena.
- Entrada de unos 3,2 s: la estela se dibuja tras el cohete, el giro se
  amortigua, el blanco enciende sus marcas y se traza la X. Después, ambiente:
  el cohete flota, los propulsores parpadean, las estrellas pasan y el blanco
  gira despacio.
- Con movimiento reducido, quieto en el último fotograma.
- Texto y botones sin cambios.

Histórico: `docs/brand/design-decisions-log.md` §388.
