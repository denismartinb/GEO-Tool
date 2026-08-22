# HERO-GRADIENT-1 — el fondo del hero de la portada

Diseño aprobado por el fundador el 2026-08-22 e implementado en el mismo PR.
Es **un degradado lineal vertical y nada más**: ni capas, ni elementos, ni
máscaras.

```css
background: linear-gradient(180deg,
  #cfe0fa   0%,   /* el tinte, sólo en el borde de arriba */
  #e4edfb  14%,   /* a la altura del titular ya ha cedido la mitad */
  #f6f9fe  28%,
  #ffffff  44%,   /* desde el campo de dominio, blanco puro */
  #ffffff 100%);  /* el 100 % TIENE que ser blanco: ver abajo */
```

| Fichero | Qué es |
|---|---|
| `f-banda-superior-escritorio.png` | El hero entero a 1280 px, sobre la landing real. |
| `f-banda-superior-movil.png` | El hero entero a 390 px. |
| `descartado-aura/` | El aura que se construyó primero y el fundador rechazó. Se guarda, no se borra. |

Las capturas son de la **landing real** con el degradado inyectado, no de una
maqueta: es lo que el fundador miró para elegir. Se tomaron con el hero entero
en el encuadre a propósito — el recorte a 800 px oculta la costura con la
sección de motores, que es donde se decide si un fondo funciona.

## Por qué el F y no los otros siete

Se dibujaron ocho degradados (A-H) tras descartar el aura. Los criterios que
decidieron, en orden:

1. **El color no puede invadir el formulario.** El campo de dominio y los dos
   botones son lo único que el hero tiene que conseguir. En A, C, D y G el
   tinte todavía se nota a esa altura; en F se ha agotado antes.
2. **El final tiene que ser blanco.** B y H terminan en color y dejan una línea
   horizontal recta contra la sección de motores. Es el mismo fallo que el aura
   tuvo que tapar con un desvanecido enmascarado, reaparecido por otra vía.
3. **Discreto antes que vistoso.** Es el mismo criterio con el que se había
   elegido el aura «Fondo 5». E cumplía los dos anteriores pero era tan tenue
   que no se distinguía de no tener fondo.

## Lo que NO se implementó

En las capturas se ve el hero de producción. Las maquetas del aura
(`descartado-aura/`) llevan **otro titular, otra bajada y una tarjeta-demo de
ChatGPT** que no son los de producción: ese rediseño del hero sigue sin
aprobar y necesita su propio Task Intake. Sólo se tocó el fondo.

## Los invariantes viven en el CSS

Por qué las paradas están donde están, por qué el 100 % es blanco y por qué
esta zona ya no necesita las precauciones de apilamiento que sí necesitaba el
aura están anotados en `app/globals.css`, junto a `.lp-hero--home`. Se
documentan ahí y no aquí a propósito: es lo que se abre para modificarlos.
