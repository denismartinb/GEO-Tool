# FREE-REPORT-1 — «Pide tu informe GEO gratis» (diseño aprobado)

Aprobado por el fundador el 2026-10-09 en el lienzo «Pide tu informe GEO
gratis · UX», tras tres rondas de cambios. Este directorio es la copia en el
repo que exige `CLAUDE.md` («The approved design must live in the repo»): el
lienzo es un artefacto de chat que ni CI ni una sesión futura pueden abrir.

| Fichero | Pantalla |
|---|---|
| `Main.dc.html` | Landing en escritorio (`/gratis/informe-geo`) |
| `Movil.dc.html` | Landing a 390 px, con el error de correo temporal |
| `Confirmacion.dc.html` | Lo que sustituye al hero tras enviar |
| `Email-solicitante.dc.html` | Correo de confirmación al solicitante |
| `Email-operador.dc.html` | Correo al operador (`OPS_ALERT_EMAIL`) |

Son ficheros del formato del lienzo (`<x-dc>`): no se abren tal cual en un
navegador. La imagen de la portada que referencian por `/_blob/…` es
`public/informe-gratis/portada-ejemplo.webp`.

**Cambios que pidió el fundador sobre la primera versión** (todos en el diseño
de aquí):

1. La respuesta a «¿Por qué tarda 48 h?» dice también que se repiten las
   búsquedas en distintos momentos.
2. El texto de privacidad no dice que el email sea «sólo para el informe»:
   una línea genérica de aceptación de la política, más una casilla opcional
   sin marcar (necesaria para poder enviar correo
   comercial a quien no es cliente, art. 21.1 LSSI).
3. En vez de una portada esquemática con «[Tu marca]», la portada real del
   informe de La Fábrica del SEO, anonimizada («Tu Marca», `tumarca.es`); los
   porcentajes son los de ese informe.
4. Titular con más fuerza: degradado azul a cian en la segunda mitad, burbuja
   de pregunta con cursor y el resplandor de la portada del PDF.
5. Titular final del fundador: «Cuando tu cliente le pregunta a la IA, ¿te
   nombra a ti o a tu competencia?».
6. La casilla ofrece «los estudios de GenScore sobre qué marcas recomienda la
   IA» en vez de «consejos y novedades» (log §249, las tres vías de
   consentimiento).
7. «Qué incluye» en rejilla de 3×2 en escritorio (con `auto-fit` quedaban
   cuatro arriba, dos abajo y un hueco).

**Desviaciones conscientes en la implementación:**

- El correo al solicitante lo firma «El equipo de GenScore», no una persona:
  regla de no contacto personal del fundador (log §238).
- Su pie no lleva «Darme de baja»: el solicitante no tiene cuenta y la baja
  firmada de `lib/email/unsubscribe.ts` es por cuenta. El correo es la
  respuesta a su petición, no comercial.
- En móvil no se pinta la burbuja de pregunta (no estaba en `Movil.dc.html`).
