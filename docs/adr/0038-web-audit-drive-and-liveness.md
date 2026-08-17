# ADR 0038 — La auditoría tampoco puede depender de una pestaña abierta

- **Estado:** aceptado (WEB-AUDIT-DRIVE-1, 2026-08-07)
- **Zona:** Auditoría web — `.claude/rules/web-audit.md`
- **Relacionado:** ADR 0027 (AUDIT-AFTER-SCAN-1, la cola de auditoría), ADR 0037
  (SCAN-DRIVE-1, el mismo fallo un piso más abajo), ADR 0003 (`maxDuration=60`)

## Contexto: el fallo del 2026-08-07, segunda parte

El mismo día en que SCAN-DRIVE-1 arregló que un escaneo dependiera del
navegador del usuario, el fundador escaneó `genscore.es` en el preview, el
escaneo **terminó bien** — y la auditoría se quedó colgada. La pantalla decía
«Auditando…» junto a «Todavía no has auditado tu web», indefinidamente.

Los datos de `generated_solutions` cuentan la historia entera:

| status | created_at | updated_at | tamaño |
|---|---|---|---|
| `running` | 19:01:44 | **19:14:44** | 11.323 |
| `completed` | 16:45:05 | 19:01:27 | 3.555 |

La campaña arrancó bien al terminar el escaneo (19:01:44) y **avanzó durante 13
minutos**, hasta 11.323 bytes — con 31 prompts a 4 temas por lote, unos 8 lotes,
casi terminada. A las 19:14:44 se paró en seco y no volvió a moverse.

Lo que la conducía en esos 13 minutos era el bucle de cliente de la propia
pantalla de Auditoría web (`WebAuditProvider`), que reanuda campañas a medio
hacer mientras alguien tiene la página abierta. El fundador bloqueó el móvil.

Es **exactamente ADR 0037**, un piso más arriba: trabajo de servidor cuyo único
motor real era una pestaña de navegador. Y aquí había tres agravantes propios.

### 1. En un preview no hay ningún motor de backend

Los crons de Vercel sólo se ejecutan contra producción. En un despliegue de
preview, `/api/cron/run-audit` —con su barrido diario, su backfill contra
`scan_runs` y su rescate de locks caducados— **nunca se invoca**. El único
disparo posible es el self-fetch posterior al escaneo… que apunta al propio
preview, protegido por deployment protection, y recibe un 401.

Toda la red de seguridad que ADR 0027 diseñó con cuidado es correcta y sigue
siéndolo **en producción**. En el entorno donde se hace la prueba final antes
de lanzar, no existe.

### 2. El 401 era invisible

`fetch` sólo rechaza ante un fallo de transporte. Un 401, un 404 o un 500 se
resuelven con normalidad, y `triggerWebAuditRun` no miraba `response.status`.
Un worker inalcanzable y un worker que arrancó bien producían exactamente el
mismo registro: ninguno. (El mismo agujero se arregló en la cadena de escaneo
en ADR 0037; aquí seguía abierto.)

### 3. La pantalla era incapaz de enseñar un fallo

`WebAuditProvider` guarda un `error`, y **nada lo leía**. Está documentado en el
propio fichero: los dos botones que lo consumían desaparecieron en
AUDIT-NO-BUTTON-1 y el estado se quedó huérfano. El driver se rinde tras 3
fallos lanzados seguidos, o al primer fallo bien formado, y escribe ese error
en el vacío.

Mientras tanto la pastilla seguía diciendo «Auditando…», porque se derivaba de
una fila `status='running'` **sin ninguna noción de antigüedad** — y esa fila
sólo la limpia una campaña que termina. De modo que *cualquier* forma de fallar
se presentaba igual: «Auditando…» eterno junto al estado vacío, sin nada en
ninguna parte que dijera qué había pasado.

## Decisión

Cuatro cambios, ninguna migración, ningún cambio en la política de reintentos
ni en los presupuestos de la cola.

### 1. Un despacho rechazado se registra como rechazado

`triggerWebAuditRun` comprueba `response.ok` y registra estado y URL. Se
registra, nunca se lanza: la fila sigue siendo el contrato y el barrido diario
sigue recuperándola.

### 2. La pastilla mide el reloj, no sólo el estado

`deriveAuditPillState` (`lib/web-audit/audit-liveness.ts`, puro y con tests)
decide entre `auditing` / `pending` / `idle` a partir de dos entradas: cuándo
persistió la campaña su último lote, y en qué estado está el job.

- Campaña que ha escrito hace menos de `AUDIT_CAMPAIGN_STALE_MS` (5 min) →
  «Auditando…». Un lote está acotado por el presupuesto de invocación del
  worker (42 s) y la continuación se despacha en segundos, así que 5 minutos
  está holgadamente por encima de cualquier hueco legítimo.
- Todo lo demás que siga vivo → **«Auditoría pendiente»**. Incluye
  explícitamente un job en `retrying`, por muy fresca que esté la fila de
  campaña: el backoff llega a 10 horas y decir «Auditando…» ahí es mentira
  plana. Es la misma lección que AUDIT-IN-RUNS-1 ya había aprendido para la
  tabla de Escaneos, aplicada a la cabecera.

`AUDIT_CAMPAIGN_STALE_MS` es deliberadamente **distinto** de
`WEB_AUDIT_STALE_LOCK_MS` (10 min) aunque hoy vivan cerca: aquél decide cuándo
es seguro robarle un job a otra invocación —equivocarse cuesta llamadas a
Gemini duplicadas—, éste decide qué dice una etiqueta —equivocarse engaña al
usuario. Preguntas distintas, libertad para moverse por separado.

### 3. El error del driver se renderiza

`WebAuditDriveNotice` consume el `error` del contexto y lo pinta. No pinta nada
cuando no hay error: es el canal de fallo, no un indicador de estado — la
pastilla ya es dueña de «qué está pasando ahora», y duplicarlo es el error que
la revisión del fundador del 2026-08-04 ya corrigió una vez.

### 4. Abrir la pantalla despierta al worker

Si existe un job `web_audit` para el último escaneo y está **vencido**
(`pending`/`retrying` pasado su `next_attempt_at`) o **abandonado** (`running`
con el lock caducado), la carga de la página despacha una pasada del worker vía
`after()`.

Es seguro en un render por la misma razón que en ADR 0037: el worker reclama
con el mismo UPDATE atómico condicional, así que un despacho duplicado es un
no-op y no una segunda auditoría. El predicado (`isWebAuditJobDue`) es puro y
sólo pasa para un job genuinamente vencido o genuinamente abandonado, así que
un render normal no despacha nada.

El job se lee con el cliente de usuario, no con service-role: `jobs` lleva RLS
`jobs_select_owner` y el propietario tiene derecho a ver el estado de su propio
job. Una ruta de render no necesita más privilegio del que ya tiene.

`WEB_AUDIT_STALE_LOCK_MS` se mueve a `audit-job.ts` para que la página pueda
preguntarlo sin importar `audit-job-runner.ts`, que arrastraría la cobertura de
Gemini, la auditoría técnica y el cliente de email a un render.

## Consecuencias

- Una auditoría abandonada se recupera cuando alguien abre la pantalla, en vez
  de esperar al cron de las 07:00 UTC.
- Una campaña parada deja de afirmar que está trabajando, y un fallo del driver
  deja de ser invisible.
- Un worker inalcanzable aparece en los logs en lugar de parecer sano.
- **Un preview sigue sin tener crons.** Esto no lo arregla nada de aquí: lo que
  cambia es que ahora la pantalla lo dice, el 401 se registra, y abrir la
  página empuja la cola. Un preview sigue siendo un entorno con menos garantías
  que producción, y una prueba de auditoría hecha allí hay que leerla sabiéndolo.

## Lo que esta fase NO hace

- **No añade reconciliación de campañas al estilo `reconcileStuckScanRuns`.**
  Una campaña de cobertura abandonada sigue sin estado terminal propio; se
  reanuda, no se cierra. Bastaría para el fallo observado, pero cerrar una
  campaña es decidir que su trabajo persistido ya no cuenta, y eso necesita su
  propio Task Intake.
- **No toca la política de reintentos, el backoff ni los presupuestos** de la
  cola. Nada de lo de aquí cambia cuánto Gemini se gasta.
- **No cambia la puerta Pro de la cobertura** ni el reparto cobertura/técnica
  de ADR 0035.
