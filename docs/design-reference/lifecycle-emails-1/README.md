# LIFECYCLE-EMAILS-1 — diseño aprobado

Aprobado por el fundador el 2026-09-28 (log §232), a partir del artefacto
«Plantillas de email, consentimiento y baja» (versión 3, con sus cambios:
alta sin casilla, un solo enlace de baja en el fin de prueba «tardío»,
comportamiento de bienvenida/D1 anotado).

`plantillas-y-baja.html` es ese artefacto tal cual. Autocontenido: la cabecera
de marca va incrustada como data URI, así que se abre sin red.

## Qué contiene y qué fase lo implementa

| Pieza | Fase | PR |
|---|---|---|
| Pantalla `/baja` (confirmar + deshacer) | B · EMAIL-UNSUB-1 | este |
| Ajustes → Notificaciones (4 interruptores + fila fija de cuenta) | B | este |
| Línea legal del alta, sin casilla | B | este |
| Apartado «Comunicaciones comerciales» de /privacidad | B | este |
| Pie de baja + cabeceras `List-Unsubscribe` en los avisos | B | este |
| Bienvenida ajustada, Primer escaneo listo, D1, D3, D5 | C · LIFECYCLE-TRIAL-1 | pendiente |
| Fin de prueba (y variante «tardía»), D+3, D+10 (dos variantes) | D · LIFECYCLE-WINBACK-1 | pendiente |

## Invariantes de diseño que el piloto debe comprobar

- Las cifras de las plantillas son de ejemplo (`clinicaaurora.es`). En
  producción cada número se lee del escaneo real, o la plantilla cae a su
  variante sin cifra. Nunca una cifra inventada.
- Precios y fecha de la promo salen de `PLANS` y `PROMO_ENDS_AT`
  (`app/pricing/plans-data.ts`), nunca escritos a mano.
- El único testimonio permitido es el de Nordika Home (real, log §146).
- Un solo enlace de baja por email, en el pie.
- Remitente del D+10 personal: `soporte@genscore.es` (fundador, 2026-09-28).
