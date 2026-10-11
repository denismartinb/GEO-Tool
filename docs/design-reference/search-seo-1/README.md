# SEARCH-SEO-1 — Posicionamiento en buscadores

`maqueta.html` es la maqueta que aprobó el fundador el 2026-10-10 («Sí!!! me
encanta»), con escritorio (1440 px) y móvil (390 px). Tiene cuatro vistas:

- **Visión general**: la franja «Prioridad 1 · tu web», que sólo sale con un
  freno real, el enlace de «Diagnóstico técnico» a Auditoría SEO (retirado
  por el fundador; en su lugar va la tarjeta de Auditoría SEO, log §271) y la tarjeta «Buscadores».
- **Auditoría SEO**: la nota de Salud SEO, las áreas con etiquetas GOOGLE/IA,
  Core Web Vitals, «Qué arreglar» y las páginas revisadas.
- **Posición en Google**: Search Console.
- **Posición en Google sin conectar**.

Los datos de la maqueta son de ejemplo. El plan por fases y las decisiones
están en `docs/brand/design-decisions-log.md` §271. Lo que todavía no está
construido aparece aquí porque es el diseño aprobado, no porque exista.

Una salvedad que el diseño no recoge: Recomendaciones **no** copia todos los
fallos SEO. Sigue mostrando sólo los frenos duros (log §167). El fundador lo
aprobó al aceptar el plan.

`tarjeta-auditoria-seo.html` es la tarjeta de Auditoría SEO de Visión general,
aprobada el 2026-10-10 («si perfecto»). Se construyó sin la nota proyectada
(«62 → 79»), sin la nota de revisión y sin botón, que el fundador quitó, y sin
el estado «auditoría en marcha». En escritorio, si «Indicadores clave» deja
hueco, los motores suben a él y la tarjeta va a la derecha del desglose, a
petición del fundador (log §271).

**Fase 1b (log §275).** La vista Auditoría SEO de `maqueta.html` se
construyó primero tal cual, con los checks de hoy. Al verla, el fundador echó
de menos las pestañas, la tarjeta «Si arreglas…», los puntos por problema y
una auditoría propia de GEO, y eligió partir la pantalla en dos bloques.
`auditoria-geo-seo.html` es esa maqueta, aprobada el 2026-10-11 («Apruebo»),
en móvil (390 px) y escritorio (1280 px). **Sustituye a la vista Auditoría
SEO de `maqueta.html`.**

- Bloque **GEO** («¿Te puede citar la IA?»): cobertura de contenido, bots de
  IA, llms.txt, fragmentos, datos estructurados, respuesta al principio,
  listas o tablas, extensión y frescura.
- Bloque **SEO** («¿Te encuentra Google?»): título, meta description,
  encabezados, Open Graph, canonical, indexación, hreflang y sitemap.
- Cada bloque tiene su nota (con los pesos de siempre, así que juntas dan la
  Salud técnica), su tarjeta «Si arreglas…» y las pestañas Problemas ·
  Correcto · Páginas.
- Menú: «Auditoría GEO» en Posicionamiento en IA y «Auditoría SEO» en
  Posicionamiento en buscadores, las dos a la misma pantalla con
  `?bloque=geo|seo`. El fundador dejó abierta la idea de unirlas en una sola
  entrada, «Auditoría técnica», según cómo quede; de momento son dos.

Lo construido difiere de la maqueta en tres detalles: la evolución y el
historial de la cobertura, que la maqueta no dibujaba, van plegados dentro de
la tarjeta de cobertura; los temas que la IA ya cita van en la pestaña
Correcto del bloque GEO; y el acceso de bots va en la columna lateral del
bloque GEO.

## Fase 2: Salud SEO y velocidad (`salud-seo.html`, log §281)

Aprobada por el fundador el 2026-10-11 («Perfecto»), con un cambio: la tarjeta
de velocidad se llama **«Optimización de tu página Home»**, no «Velocidad de
tu portada» como en la maqueta.

- La nota del bloque SEO pasa a llamarse «Salud SEO» y suma seis checks
  nuevos y la velocidad, con los pesos de la tabla de la maqueta. Nada de eso
  entra en la Puntuación GEO.
- Tarjeta «Optimización de tu página Home»: LCP, INP y CLS en móvil y
  escritorio, con la fuente de los datos (usuarios reales o laboratorio).
- «Cómo se calcula tu Salud SEO» en la columna lateral, plegada.
- La tarjeta de Visión general enseña la Salud SEO y una línea de velocidad.

Lo construido difiere de la maqueta en dos detalles: en la tarjeta de Visión
general la Salud SEO va en su propia fila, encima del recuento por gravedad
que ya existía, y la pestaña Páginas puntúa cada página sólo con sus checks
de página (los de sitio cuentan en la nota del bloque).
