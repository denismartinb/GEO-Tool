# WEB-AUDIT-ISSUES-1 — referencia de diseño aprobada

**Origen del gap que esto arregla:** la fase 2 de este rediseño se aprobó en una
conversación de chat con un artefacto de claude.ai (URL efímera, no accesible
desde una sesión de agente futura ni desde el runner de GitHub Actions que
ejecuta el pilot automático). El PR #289 se implementó contra ese artefacto,
pero cuando el fundador revisó el preview real encontró varias discrepancias
(gauges distintos, botones en la cabecera, matriz de oportunidad que no
estaba en el mockup...) que ni el pilot automático ni una revisión mía propia
detectaron — porque **nadie, ni humano ni agente, comparó el build final
contra este fichero**. Ver `docs/brand/design-decisions-log.md` §9 para el
detalle completo de qué se decidió y por qué.

## Qué es `opcion-b-rev4-aprobada.html`

La última revisión (rev. 4) del artefacto de diseño que el fundador aprobó
explícitamente ("Me gusta la propuesta!") antes de que arrancara la
implementación de la fase 2. Ábrelo en un navegador o con el `Read`/`WebFetch`
de un agente — es HTML autocontenido, sin dependencias externas.

## Regla a partir de ahora

Cuando una fase de diseño se apruebe vía artefacto de chat, el artefacto final
**se copia a `docs/design-reference/<FASE>/` en el mismo PR que lo implementa**
— nunca queda solo como enlace en el historial de conversación. El agente
`ux-pilot` (`.claude/agents/ux-pilot.md`) necesita poder abrir la referencia
real para aplicar su checklist de fidelidad de diseño (6 puntos: añadidos,
desaparecidos, claridad, duplicados, valores que parecen rotos, jerarquía) —
sin esto, esa mitad de su trabajo es estructuralmente imposible, con
independencia de lo bien que esté escrito el resto del harness.
