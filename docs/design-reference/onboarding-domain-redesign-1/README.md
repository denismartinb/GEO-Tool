# ONBOARDING-DOMAIN-REDESIGN-1 — Dirección B, "Consola"

**Estado: implementado.** Fase cerrada el 2026-08-20 — ver
`docs/brand/design-decisions-log.md` y la fila "Dominios y depuración" del
mapa de zonas en `CLAUDE.md`. La implementación vive en
`components/onboarding-wizard.tsx` y el bloque `onb2-` de `app/console.css`.

`direccion-b-aprobada.html` es **el diseño aprobado**, y está aquí porque
tiene que estarlo: un artefacto de chat no es un input, ni CI ni una sesión
futura pueden abrir esa URL, así que la mitad de fidelidad del `ux-pilot` no
se ejecutaría nunca (CLAUDE.md, "Dos entradas obligatorias"). Es
autocontenido — abre en cualquier navegador sin servir nada ni depender del
runtime del editor de Design Canvas.

## Qué contiene

Las cinco pantallas del flujo de alta de dominio en la dirección elegida, más
el primer paso a 375px:

1. **B1 · Dominio** — formulario + panel "Resumen del lanzamiento" (pendiente).
2. **B2 · Carga — analizando** — la sugerencia de Gemini, embebida en la
   tarjeta (checklist + esqueleto de filas), no una cortina a pantalla completa.
3. **B3 · Competidores** — lista sugerida, editable, con chip "sugerido" solo
   en las filas que de verdad vinieron de Gemini.
4. **B4 · Prompts** — lista editable con categoría real y reparto por
   categoría calculado del propio estado.
5. **B5 · Carga — creando** — el envío final, mismo patrón embebido que B2.
6. **B · 375px** — el primer paso en móvil.

## Por qué B y no A o C

Tres direcciones se plantearon en el lienzo de `/design` (2026-08-20):

- **A "Cuenta atrás"** — la metáfora del cohete de la misión (`docs/design-
  reference/scan-states-1/`) llevada al onboarding entero: cielo a sangre,
  torre de lanzamiento como indicador de paso. Descartada: es la que más se
  aleja del resto de la consola — tres pantallas de marketing antes de
  trabajar.
- **B "Consola"** (elegida) — el onboarding se parece al producto: mismo
  sistema que Visión general (Bricolage Grotesque + Figtree, azul `#2563EB`,
  sombra de marca, etiqueta de sección fuera de la tarjeta). Su idea
  funcional clave: las cargas dejan de ser una cortina a pantalla completa y
  pasan dentro de la tarjeta.
- **C "Rampa lateral"** — panel nocturno fijo a la derecha con el cohete
  subiendo por una torre según se completan pasos. Descartada: se come 420px
  de ancho fijo (330px en la pantalla de prompts) y en móvil se degrada a una
  banda que pierde casi toda su fuerza.

## Lo que el piloto compara contra esto

Toda copia visible en las cinco pantallas, la migración completa de tokens
(nada de índigo `#4F46E5` ni Hanken Grotesk en esta pantalla), el panel
"Resumen del lanzamiento" con datos reales del estado (nunca inventados), y
que ninguna de las dos cargas tape el panel de resumen ni el contexto de la
pantalla.

**Desviación deliberada frente a la maqueta, y por qué no es un bug:** en la
maqueta el chip "sugerido" aparece en todas las filas de competidores porque
el ejemplo no tenía datos reales de qué vino de dónde. En la implementación
real, `Competitor` lleva un campo `source` — el chip solo se pinta en filas
con `source === "suggested"`; una fila añadida a mano con "Añadir competidor"
nunca lo lleva, para no afirmar una sugerencia de IA que no existió.
