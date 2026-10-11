# SEARCH-SEO-1 Fase 3b — «Posición en Google» con más datos de Search Console

Maqueta aprobada por el fundador el 2026-10-11 («Me parece perfecto.
Implementa todo»). Artifact original:
https://claude.ai/artifact/YAD9rWu2dF7sNUv2JCT1xr (no lo pueden abrir los
runners de CI; por eso las fuentes viven aquí).

- `Main.dc.html` — escritorio: «Tu posición en Google» (puesto medio, tramos,
  evolución), tabla de búsquedas con el puesto y la página que sale, «Tus
  páginas en Google» cruzadas con la Auditoría SEO, «Te ven, pero no entran»,
  «Preguntas que te hacen en Google» con «Vigilar en IA», móvil y ordenador,
  y dos páginas que compiten.
- `Mobile.dc.html` — los mismos bloques a 390 px.
- `Recs.dc.html` — recomendaciones con datos de Google en la pantalla de
  Recomendaciones. **Segunda fase, todavía no construida.**
- `canvas.json` — disposición del lienzo.

Los ficheros `.dc.html` cargan `support.js` del entorno de maquetas, que no se
copia: se leen como fuente (marcado y CSS), no se abren en un navegador. Las
cifras de la maqueta son ilustrativas; en el producto todo sale del Search
Console del cliente (log §287).
