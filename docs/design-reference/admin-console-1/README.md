# ADMIN-CONSOLE-1 — referencia de diseño

Propuesta para dos peticiones del fundador (2026-08-11): un email de aviso en
cada alta de usuario, y una pantalla `/admin` «muy securizada que solo pueda
acceder yo» con gestión de los usuarios de la plataforma. Presentada como
artefacto, aprobada la misma conversación («Perfecto. Implementa en loop»).

## Ficheros

| Fichero | Qué es | Para qué |
|---|---|---|
| `propuesta-admin-console.html` | El Task Intake completo: recomendación de autenticación razonada frente a cuatro alternativas descartadas, maqueta navegable de `/admin/users` y el email de aviso, y el desglose de fases | Referencia de implementación de la Fase 1 y entrada del `ux-pilot` si algún día se le da alcance para verla (ver "Pendiente" abajo) |

Es HTML autocontenido, sin dependencias externas — se abre en un navegador,
con `Read` o con `WebFetch` desde una sesión de agente. Ningún número de la
maqueta es una medición real: los datos (usuarios, dominios, escaneos) son
ilustrativos, igual que en el resto de `docs/design-reference/`.

## Qué se implementó de la Fase 1, y qué no

Implementado tal cual se propuso:

- Email de aviso en los dos puntos de alta reales (`sendNewSignupOpsAlertEmail`).
- `ADMIN_USER_IDS` (allow-list por UUID) + AAL2 obligatorio, con las cinco
  capas descritas en la sección 2 de la maqueta.
- `/admin/users`: tabla, filtros por estado, buscador, panel de detalle.

Desviaciones deliberadas respecto a la maqueta, y por qué:

- **Sin botones «Abrir en Supabase» / «Abrir en Stripe».** La maqueta los
  proponía; construirlos exige una URL real por entorno (project ref de
  Supabase, modo test/live de Stripe) que no estaba confirmada. Se optó por
  mostrar los IDs en texto seleccionable en vez de un enlace potencialmente
  roto o apuntando al entorno equivocado.
- **Sin gráfica de altas ni «Escaneos 24h».** No pedidos explícitamente por
  el fundador — eran ambientación de la maqueta. Las cuatro KPI que sí se
  implementaron (cuentas, en prueba, de pago, MRR estimado) salen de datos ya
  cargados por la propia tabla, sin consulta adicional.
- **Sin «Reenviar bienvenida» ni ninguna acción de escritura.** La maqueta ya
  las marcaba como Fase 2/3; Fase 1 es sólo lectura por diseño (ver
  `.claude/rules/admin.md`).

## Pendiente

Fases 2 (escritura acotada: ampliar prueba, cambiar plan, con motivo
obligatorio) y 3 (salud de la plataforma agregada) siguen tal como las
describe la sección 4 de la maqueta — sin Task Intake propio todavía.

`/admin` queda fuera del alcance del `ux-pilot` por diseño: la cuenta piloto
es una cuenta de cliente, nunca la del operador, y no hay forma segura de que
el piloto complete un desafío AAL2 sin comprometer el segundo factor real del
fundador. La verificación de esta fase es manual.
