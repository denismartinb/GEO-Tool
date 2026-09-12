# PDF-EXPORT-PLAN-1 — diseño aprobado

Referencia de diseño para el informe que sustituye al `.md` de "Exportar
plan" en Recomendaciones. El fundador vio tres plantillas en un canvas
(Ejecutiva, Checklist operativa, Informe de consultoría) y aprobó la
**Informe de consultoría** el 2026-09-10.

`informe-consultoria.html` es una instantánea estática de las dos páginas
aprobadas (portada editorial + contenido con secciones numeradas), a tamaño
A4 real (794×1123px, 96dpi). Ábrelo directamente en un navegador para verlo.

La implementación real vive en
`app/dashboard/projects/[projectId]/recommendations/export-report.tsx` +
`export-report.css`, y se dispara con `window.print()` desde el botón
"Exportar plan" — ver Task Intake Report PDF-EXPORT-PLAN-1 y
`docs/brand/design-decisions-log.md` §213.
