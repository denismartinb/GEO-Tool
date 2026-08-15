# NOT-FOUND-ROCKET-1 — «Fuera de trayectoria»

**Estado: implementado.** Fase cerrada el 2026-08-12 — ver
`docs/brand/design-decisions-log.md` §86 y `.claude/rules/mission-rocket.md`.
La implementación vive en `components/not-found-mission.tsx` y en el bloque
`nf-` de `app/globals.css`.

`concepts.html` es **el diseño aprobado**, y está aquí porque tiene que estarlo:
un artefacto de chat no es un input: ni CI ni una sesión futura pueden abrir
esa URL, así que la mitad de fidelidad del `ux-pilot` no se ejecutaría nunca
(CLAUDE.md, "Dos entradas obligatorias"). Es autocontenido — las tipografías
de marca van incrustadas — así que se abre en un navegador sin servir nada.

## Qué contiene

Tres maquetas completas y navegables, cada una con conmutador escritorio /
móvil 390 px:

1. **Fuera de trayectoria** — la elegida por el fundador (2026-08-12). Cabecera
   blanca del sitio y escena del cohete a sangre completa bajo ella.
2. **Sin resultados que citar** — descartada. La URL fallida como consulta y la
   navegación como lista de fuentes citables.
3. **Falta un segmento** — descartada. El anillo del logo con un segmento
   apagado.

Las dos descartadas se conservan a propósito: son el registro de qué se
consideró y por qué no se eligió, igual que un ADR superado no se borra.

## Lo que el piloto compara contra esto

- Cabecera **blanca** (la del sitio) sobre cuerpo oscuro. No es un descuido de
  contraste: fue una instrucción explícita del fundador.
- La escena ocupa el ancho completo y el alto de la ventana menos la cabecera.
- En horizontal: misión a la derecha, texto a la izquierda. En vertical: misión
  arriba, texto abajo.
- El planeta se ve entero abajo; el cohete no toca ni el titular ni el kicker.

## Diferencias conocidas entre la maqueta y lo implementado

- La maqueta encierra cada pantalla en un marco fijo (568 px de alto en
  escritorio, 390×720 en móvil) y usa **container queries** para adaptarse a
  ese marco. La implementación usa media queries y el alto real de la ventana
  (`100dvh`), porque en producción no hay marco. Los puntos de corte son 900 px
  (apilado) y 640 px (móvil).
- La maqueta no dibuja el pie de marketing; la página real sí lo lleva, debajo
  de la ventana, con los mismos enlaces que el resto del sitio.
- La maqueta no cubre el 404 **de dentro de la consola**
  (`app/dashboard/not-found.tsx`), que no es una pantalla de diseño sino un
  estado vacío sobrio. Ver el histórico para por qué existe.
