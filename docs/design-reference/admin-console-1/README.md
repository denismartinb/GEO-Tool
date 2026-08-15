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

### Pedido por el fundador el 2026-08-12 (para Fase 2, sin aprobar aún)

Dos peticiones. Ninguna es implementable tal cual está enunciada: las tres
comprobaciones de abajo salen de leer el esquema y el código actuales, y
cambian el diseño de ambas.

> **Estado (2026-08-12):** la mitad de lectura de la petición B está
> **implementada** en ADMIN-CONSOLE-2a (log §71): la tabla muestra el agregado
> `activos/total` de escaneo recurrente y auditoría automática, marca los
> recurrentes inertes por plan Free, y calcula el coste estimado con su
> procedencia. Lo que sigue pendiente es **modificarlos** (2b) y el **borrado
> permanente** (2c), descritos abajo.

**A. Selección múltiple de usuarios y borrado permanente desde la tabla.**

- **Ya existe un borrado de cuenta y hay que reutilizarlo, no escribir otro.**
  `deleteAccount()` en `app/dashboard/settings/profile/actions.ts` (DATA-MGMT-1)
  tiene el desmontaje ordenado y probado: cancelar la suscripción real de
  Stripe primero (un fallo real de Stripe aborta antes de borrar nada), luego
  los datos, luego `auth.admin.deleteUser`. Dos caminos de borrado
  independientes divergen — es exactamente la duplicación que persiguió
  PRELAUNCH-HARDENING-1 Fase R. Lo correcto es extraer ese desmontaje a un
  helper compartido y que `/admin` lo llame.
- **El orden no es opcional, lo impone el esquema.** `projects.owner_user_id` y
  `scan_runs.triggered_by_user_id` son `references auth.users(id) on delete
  restrict` (migración 0001): borrar el usuario de `auth` con proyectos vivos
  **falla**, no cascadea. Sólo `profiles.id` es `on delete cascade`.
- **La selección múltiple multiplica el radio de daño, y eso pide límites que
  no existen en el borrado individual.** Un clic en «seleccionar todo» borra la
  base de clientes entera y no hay deshacer. Como mínimo: confirmación
  escribiendo algo que no sea «sí», tope duro de filas por lote, nunca un
  «todos» preseleccionado, aviso por email al operador *después* del hecho, y
  decirlo en la interfaz: esto no se puede revertir.
- Sigue estando en la lista de **prohibido sin aprobación explícita** de
  CLAUDE.md (borrado duro). Necesita Task Intake propio.

**B. Ver y modificar por usuario el escaneo y la auditoría automáticos, con su
coste.**

> **Estado (2026-08-13):** implementada por completo en ADMIN-CONSOLE-2b
> (log §79): la lectura (2a) y ahora la escritura, con motivo obligatorio y
> aviso por email en cada cambio, reutilizando las mismas precondiciones que
> ya corren en `/debug`. Gap descubierto al construirla y NO corregido aquí:
> la lectura de 2a no comprueba que la mitad de auditoría de cobertura exige
> Pro+ (`plan_required` en `audit-job-runner.ts`), así que un proyecto por
> debajo de Pro con esa columna ya en `true` se muestra como "activo, con
> coste" aunque el backend lo salte — mismo defecto que la columna retirada
> de §71, en `lib/admin/automation.ts`, sin tocar todavía.

- **Esos interruptores son POR PROYECTO, no por usuario.**
  `recurring_scans_enabled` (migración 0008, por defecto `false`),
  `auto_web_audit_enabled` (0030, por defecto `true`) y las dos mitades de
  auditoría `auto_technical_audit_enabled` / `auto_coverage_audit_enabled`
  (0031) cuelgan de `projects`. Un usuario con cinco dominios puede tenerlos
  mezclados. **Una sola casilla por usuario sería mentira** en cuanto dos
  proyectos discrepen: la columna tiene que ser un agregado con regla
  declarada (`3/5`, o tri-estado todos/algunos/ninguno) y el interruptor real
  vivir en el detalle, por proyecto.
- **Activar el escaneo recurrente a un usuario Free no haría nada, y parecería
  que sí.** `runRecurringScanSweep` descarta los proyectos de plan Free
  (`skipped_plan_ineligible`, `lib/scan/cron.ts`) y `recurring_scans_enabled`
  en la práctica no puede llegar a `true` en Free. Desde `/admin` hay que
  impedirlo o mostrarlo explícitamente, no dejar un interruptor que se queda
  puesto sin efecto.
- **El coste es medido, no inventado.** Las cifras reales por motor y por
  escaneo están en `docs/llm-cost-analysis-2026-08.md`, y dependen del número
  de prompts, de los motores activos (0033) y del muestreo (0032) — todo ello
  por proyecto. Cualquier cifra por usuario es una **estimación** y se etiqueta
  como tal, con su base a la vista (CLAUDE.md, "no fake metrics").
- **Modificarlos desde `/admin` es escribir sobre datos de otro.** Hoy esos
  interruptores se escriben por server actions con ámbito de dueño (ver el
  comentario de la migración 0030); desde `/admin` sería una escritura con
  service-role sobre el proyecto de un cliente. Eso es Fase 2 y exige su propio
  Task Intake, con motivo obligatorio y registro, como el resto de escrituras.

`/admin` queda fuera del alcance del `ux-pilot` por diseño: la cuenta piloto
es una cuenta de cliente, nunca la del operador, y no hay forma segura de que
el piloto complete un desafío AAL2 sin comprometer el segundo factor real del
fundador. La verificación de esta fase es manual.
