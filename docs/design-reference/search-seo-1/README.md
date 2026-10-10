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

**Fase 1b (log §274).** La vista Auditoría SEO se construyó con los checks de
hoy: «Salud técnica» en vez de Salud SEO, cuatro áreas, sin Core Web Vitals,
velocidad ni móvil (fase 2), sin botón de Search Console (fase 3) y sin puntos
por fila. El acceso de bots de IA va en la columna lateral, junto a las
páginas revisadas.
