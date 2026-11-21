# Extensión de Chrome de GenScore (CHROME-EXT-1)

Línea nueva propuesta por Denis el 2026-10-25: una extensión de Chrome que junta
SEO y GEO como canal de captación de genscore.es.

Estado: **extensión de prueba construida** (2026-10-28), fuera de la app y sin
tocar producción. Denis eligió la alternativa A (2026-10-25); la revisión 5
(2026-10-27) la rehace con el diseño de la consola nueva, y el 2026-10-28 aprobó
el paso 01 de la prueba: revisión real de la página y cuenta de ejemplo. La
versión conectada a su cuenta (paso 02) y la publicación en la tienda siguen
sin aprobar.

| Fichero | Qué es |
|---|---|
| [`task-intake-report.md`](./task-intake-report.md) | Alcance, premisas corregidas, reutilización, backend por fase, coste y Hobby, ficha, embudo, recomendación, MVP y riesgos |
| [`ux-options.html`](./ux-options.html) | Las tres alternativas de UX del panel (Estudio, Mapa, Instrumento), con flujo, pros y contras y esfuerzo |
| [`prueba/`](./prueba/LEEME.md) | La extensión de prueba (MV3, panel lateral), sus tests y los tres pasos para instalarla en modo desarrollador |
| [`prototipo-navegable.html`](./prototipo-navegable.html) | Alternativa A navegable (revisión 5, diseño de la consola «Instrumento»): sin cuenta, «Analizar dominio» con el alta y el asistente de la consola, y con cuenta en Starter y Pro, con los mismos límites. Cabecera en dos formas (Cuadro y Pila), información nueva sin IA y cómo probarla casi en real |

Cuando se apruebe una opción, su HTML se copia a
`docs/design-reference/chrome-ext-1/` en el PR que la implemente, como pide
`CLAUDE.md`.
