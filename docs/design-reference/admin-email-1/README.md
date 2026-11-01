# ADMIN-EMAIL-1 · Captación de email en el Panel de negocio

Maqueta aprobada por Denis el 2026-11-01 («Perfecto»), artefacto
https://claude.ai/artifact/Ei7HyuzW9VKoVzneFCdoCa, copiada aquí tal cual
(`maqueta.html`, con vista de escritorio y de móvil a 390 px).

**Las cifras de la maqueta son de ejemplo.** La página real lee Supabase y
Resend (log §420).

## Diferencias con la maqueta, y por qué

- **Vive en su propia pestaña, «CRM» (`/admin/crm`)**, no dentro del Panel de
  negocio: lo pidió Denis al revisar el PR. Mismo selector de periodo y mismo
  filtro de cuentas que el panel.

- **El gráfico de contactos cubre los últimos 28 días**, como el de visitas y
  altas, y no cambia con el periodo. Las tarjetas sí cambian.
- **«Emails por contacto y semana» no compara con «28 días»**: Resend guarda
  30 días, así que no hay periodo anterior completo. La tarjeta lo dice.
- **Aperturas y clics salen como «—»** mientras el seguimiento no esté
  demostrado (hoy está apagado en Resend, log §417), con el motivo.
- **La nota bajo el gráfico** dice que una cuenta borrada desaparece de toda la
  línea (la maqueta decía «el día que se borra»): no guardamos cuándo se borró.
