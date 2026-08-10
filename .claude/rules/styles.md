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
