# ADMIN-PANEL-1 — Panel de negocio en /admin

Diseño aprobado por el fundador el 2026-10-11 («Aprobado»), en el artefacto
https://claude.ai/artifact/AEUou7HHVKQsz14GFqV13q. Aquí están sus dos
artboards tal cual se aprobaron:

- `escritorio.dc.html`: página fluida, 1440 px de referencia.
- `movil.dc.html`: 390 px.

**Las cifras y los dominios de la maqueta son de ejemplo.** La página real
lee PostHog, Supabase, Stripe y Search Console (log §304).

## Diferencias con la maqueta, y por qué

Todas se deben a la misma regla: no pintar una cifra que no podemos medir.

- **Canales sin altas.** La maqueta tenía «Altas» y «Conversión» por canal.
  Las altas no guardan de qué canal vienen (la analítica es sin cookies y el
  registro no guarda `utm_source`), así que la tabla sólo enseña visitas y
  cuota, y lo dice.
- **«Páginas que traen altas» pasa a «Páginas de entrada»**, por lo mismo.
- **El embudo mezcla fuentes y cada paso dice la suya:** visitas de PostHog,
  altas y primer escaneo de Supabase, y checkout y pago de Stripe. Los
  eventos de PostHog del servidor sólo existen desde el 2026-10-09 y el de
  pago no ha saltado nunca, así que no sirven para un periodo de 28 días.
- **La señal «Abrió precios» no existe.** Una visita a /precios no se puede
  atar a una cuenta. Las señales reales son: checkout sin terminar (Stripe),
  días sin entrar y escaneos.
- **Google enseña clics, puesto medio y búsquedas en la página 2**, lo que ya
  carga la tarjeta de Visión general, en vez de impresiones y CTR.
- **El gráfico diario lleva las altas en escala propia**, porque en la misma
  escala que las visitas se quedan pegadas al suelo.
