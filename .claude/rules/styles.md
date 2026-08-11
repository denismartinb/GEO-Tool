---
description: Cómo se reparten las hojas de estilo entre lo público y la consola.
paths:
  - "app/globals.css"
  - "app/console.css"
---

# Reglas de las hojas de estilo

Se inyectan solas al tocar `app/globals.css` o `app/console.css`. Cada
invariante es trazable a un documento — una regla que nadie puede justificar es
peor que ninguna, porque una sesión futura la obedecerá igual.

- **`globals.css` se sirve en TODA página; `console.css` sólo tras iniciar
  sesión.** Un estilo que sólo pinta la consola no tiene por qué descargarlo
  quien entra a `/blog`. `app/dashboard/layout.tsx` es quien importa
  `console.css` (PRELAUNCH-HARDENING-1 Fase V, V5; log §54).
- **Nada entra en `console.css` si su clase aparece fuera de
  `app/dashboard/**`.** Lo comprueba `tests/console-css-scope.test.ts`, y el
  fallo que evita es silencioso: la página pública no rompe, simplemente se
  queda sin estilo. La regla es tosca a propósito y deja fuera cosas que sí son
  de consola (la pantalla de notificaciones, la campana), porque sus clases se
  escriben desde `components/`. Un clasificador más fino —grafo de imports— se
  probó y **se equivocó hacia el lado peligroso**: dio por «sólo consola» el
  sistema de artículos del blog, cuyas clases se aplican desde `lib/` (log
  §54).
- **`console.css` se carga DESPUÉS de `globals.css`, así que mover una regla
  puede cambiar quién gana.** `globals.css` no está por capas: hay secciones
  posteriores —MOBILE-1 es el caso gordo, el layout de consola en móvil— que
  sobrescriben a propósito reglas de consola anteriores. Antes de mover una
  sección hay que comprobar que ninguna sección posterior vuelve a encabezar
  un selector con las mismas clases. Se identificaron 16 solapes de ese tipo y
  por eso quedan ~33 KB sin mover (log §54).
- **Ampliar el corte pasa por ordenar la cascada primero.** `@layer`, o mover
  MOBILE-1 entero. No es una limpieza: cambia quién gana en cada empate de
  especificidad, así que va en su propia fase con su propia pasada de piloto.
- **Un token de tinta que aprueba AA sobre blanco no lo aprueba sobre un fondo
  hundido.** `--ink-3` (#6b7385) da 4,76:1 sobre `#fff` y **4,44:1** sobre
  `--surface-sunk` (#f6f7f9) — por debajo del 4,5:1, por seis centésimas que a
  ojo no existen. Lo cogió el chequeo de contraste del piloto en los filtros de
  Recomendaciones (log §55). Antes de reutilizar un token de texto sobre una
  superficie distinta de aquella donde ya se usaba, se recalcula; y la
  jerarquía entre pestaña activa e inactiva se sostiene en el fondo y la
  sombra del estado activo, no en aclarar la inactiva hasta que no se lee.
- **Convertir un `<button>` en `<a>` NO es neutro, aunque la clase declare su
  propio `display`.** Antes de cambiar el elemento hay que buscar reglas de
  tipo `.ancestro a { … }`: existen precisamente porque ahí dentro sólo había
  enlaces, y una de ellas —`.lp-mobnav a`, especificidad `(0,1,1)`— le gana a
  la clase del botón —`.lp-cta`, `(0,1,0)`—, así que le impone su color, su
  tamaño y su relleno. En V4 eso dejó «Prueba gratis» con el texto gris sobre
  fondo azul en el cajón móvil, y el razonamiento de que serían «idénticos por
  construcción» era incompleto: cubría los estilos propios del elemento, no las
  reglas que sólo se activan al cambiar de etiqueta (log §54, corrección del
  2026-08-11). El barrido correcto es
  `grep -n "^\.<zona>[a-z0-9-]* .*a[ ,{:]" app/globals.css`. **No es la anécdota
  de un PR: hay al menos dos instancias del mismo patrón en zonas que no se
  parecen en nada.** La segunda la encontró el piloto al día siguiente —
  `.blog-body a` (0,1,1) contra `.btn-primary` (0,1,0), que dejaba el CTA de un
  artículo en índigo oscuro sobre índigo, 1,58:1 (log §55). Se arregla
  **excluyendo los botones de la regla del ancestro** (`a:not(.btn)`), no
  parcheando cada variante: es lo que esas reglas siempre quisieron decir —van
  de enlaces de prosa— y cubre las variantes que aún no existen. Desde Q5b el
  piloto calcula el contraste de todo control visible y falla por debajo de AA
  (`tests/pilot/support/page-audit.ts`, log §55), así que este caso concreto ya
  no depende de que alguien mire la captura — pero el barrido sigue haciendo
  falta: el contraste coge el color, no el tamaño ni el relleno que esa misma
  regla también impone.
