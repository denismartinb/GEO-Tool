# La portada de GenScore — diseño aprobado (2026-08)

El diseño completo de la portada, aprobado por el fundador, **con sus assets**.
Es la referencia contra la que se juzga fidelidad: si lo implementado no
coincide con estos ficheros, gana el fichero.

| Fichero | Qué es |
|---|---|
| `portada-escritorio.dc.html` | La home entera a 1280 px. 9.152 px de alto. |
| `portada-movil.dc.html` | La home entera a 390 px. 7.674 px de alto. |
| `canvas.json` | El manifiesto de artboards del lienzo. |
| `*.svg`, `*.jpg` | Los assets que las maquetas referencian. |

Lienzo vivo: <https://claude.ai/code/artifact/cb82bfa8-8d6c-452c-bc15-84ef90fca6a1>.
**El lienzo no sustituye a estos ficheros**: un CI o una sesión futura no puede
abrir esa URL, así que lo que vale para verificar es lo que está aquí. Cuando
el lienzo cambie, se vuelve a extraer y se commitea en el mismo PR que
implemente el cambio.

## Ábrelas en el navegador, no en un editor

Y **con scroll**: las cuatro tarjetas de la sección oscura entran con una
revelación por `IntersectionObserver`, así que una captura de página completa
sin desplazarse las fotografía a opacidad 0 y parecen faltar. No faltan.

Al abrirlas fallan dos peticiones y **las dos son normales**: `support.js` es el
runtime del editor del lienzo, que aquí no existe, y Google Fonts está
bloqueado en el sandbox de los agentes. Todos los assets locales cargan.

## Qué lleva, en orden

1. **Hero** — «¿Te recomienda la inteligencia artificial?», campo de dominio con
   CTA «Comprobar gratis», fila de motores, y una **demo de cinco escenas**
   (ver abajo).
2. «En Google competías por un clic. En la IA compites por ser la respuesta.» —
   dos tarjetas, SEO frente a GEO.
3. «Mides, entiendes, arreglas y mejoras» — **sección con fondo oscuro**, cuatro
   pasos numerados. Es la única superficie oscura de la zona pública.
4. «Cinco pantallas. Todo tu posicionamiento.»
5. «Cómo se gana una recomendación»
6. Testimonio (Nerea Solís · Nordika Home).
7. «Lo que nos preguntan antes de empezar» — FAQ de 6 preguntas.
8. «Averigua qué dice la IA de ti ahora mismo» — CTA final al comprobador.

## La demo del hero NO es una tarjeta estática

Son **cinco escenas** con un cursor animado y cinco botones de paso: *La
respuesta · Tu puntuación · Competidores · La solución · El resultado*. En las
maquetas su estado vive en las llaves del editor del lienzo (`{{sc0}}`,
`{{cx}}`, `{{go0}}`…), que aquí no resuelve nadie: **abiertas en un navegador
normal la tarjeta sale vacía con `{{url}}` en la barra**. No está rota; es que
el estado lo pone el editor.

En código eso es un componente con reloj, no un bloque de marcado. Antes de
implementarlo, leer `.claude/rules/onboarding.md`: el tour de bienvenida ya
resolvió este mismo problema y sus invariantes —un solo reloj derivado de `t`,
la línea de tiempo fuera del componente y con tests, todos los pasos con la
misma altura, `prefers-reduced-motion` congela en un fotograma que siga
contando la historia— se aplican igual aquí.

## El fondo del hero ya está en producción

Es `HERO-GRADIENT-1` (log §141), y estas maquetas ya lo llevan: el aura que
tenían antes se retiró de los dos artboards el 2026-08-22 para que la
referencia y la producción digan lo mismo. Las paradas del degradado están
calibradas contra la altura del hero **actual**; el hero de esta maqueta mide
distinto, así que quien lo implemente **recalcula las paradas** — está anotado
en `app/globals.css`, junto a `.lp-hero--home`.

## Lo que la maqueta cambia y NO está decidido

- **La navegación pasa de 7 enlaces a 4**, y se lleva «Comparativas», que es una
  decisión explícita del fundador (COMPARATIVAS-DESIGN-1, log §63). El nav es
  además fuente única de las ~57 superficies públicas, no sólo de la portada.
  Va en su propio PR, no en el de la portada.
- **El testimonio lleva nombre, empresa y una cifra** (+128 % de cuota de voz en
  IA). Publicarlo exige que sea una medición real de esa cuenta: CLAUDE.md
  prohíbe métricas falsas y aquí además hay una persona identificada.
