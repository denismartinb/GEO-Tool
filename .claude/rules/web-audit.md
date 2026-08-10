---
description: Invariantes de la zona de Auditoría web (cobertura, auditoría técnica, plan de acción).
paths:
  - "app/dashboard/projects/*/web-audit/**"
  - "lib/web-audit/**"
---

# Auditoría web — invariantes

Fuente canónica: `docs/specs/web-audit/README.md` ("Shared invariants") y
`docs/specs/web-audit/ROADMAP.md` (**única fuente del orden de fases** — los
identificadores `WEB-AUDIT-*` son nombres estables, no un orden).

## Antes de ampliar

Esta zona es **adyacente a "crawler"**, que está en la lista de prohibido de
`CLAUDE.md`. Cualquier fase nueva que amplíe la superficie de fetch necesita su
propio Task Intake, revisión de data-guardian y aprobación explícita del
fundador. Un fetch acotado a páginas del dominio propio no es un crawler; en
cuanto haya descubrimiento de enlaces o recorrido, sí lo es.

## Invariantes

- **Ningún número de relleno.** Todo se calcula desde datos persistidos, y los
  bloques de fases no implementadas simplemente no se renderizan.
- **Matching de dominio propio fail-closed**: normalizar y comparar por límite
  de etiqueta (`evilacme.com` nunca casa con `acme.com`). Misma semántica que
  `lib/recommendations/domain-coverage.ts` y `lib/scoring/run-scoring.ts`.
- **El texto narrativo de Gemini nunca es hecho verificado** — se muestra con el
  aviso de "interpretación de la IA".
- **Puerta Pro**: leer `profiles.current_plan` en crudo vía `isProOrAbove`
  (`lib/billing.ts`), nunca vía `getPlanForUser`/`resolvePlan`.
- **La puerta cubre la cobertura, no la salud técnica** (ADR 0035). La
  cobertura es Pro porque son llamadas a Gemini por lotes; la auditoría técnica
  corre en **todos los planes** porque no gasta LLM y porque su nota es un
  componente del GeoScore (ADR 0033): gatearla hacía que el número principal
  midiera distinto número de componentes según el plan.
- **Una mitad que no se esperaba no deja la auditoría «Parcial».** Cualquier
  superficie que informe del estado de una auditoría tiene que distinguir
  *falta una mitad* de *esa mitad no se pidió* (`coverageExpected` /
  `technicalExpected`, `lib/web-audit/run-audit-status.ts`). Etiquetar lo
  segundo como lo primero marca un defecto permanente donde no falta nada. Dos
  motivos, y a esa función le da igual cuál: el plan no incluye la cobertura
  (ADR 0035) o el dueño apagó esa mitad (WEB-AUDIT-AUTO-SPLIT-1, migración
  0031). Los llamadores los combinan con AND. El parámetro se llamó
  `coverageIncludedInPlan` hasta que apareció el segundo motivo y el nombre
  dejó de describir la pregunta.
- **Los límites son gasto real**: 5/día/proyecto para cobertura, presupuesto
  propio y separado para la auditoría técnica.
- **Presupuesto ADR 0003**: todo corre síncrono bajo `maxDuration = 60`.
  Cualquier función con varias llamadas de red lleva un presupuesto total de
  reloj holgadamente por debajo, y **degrada parcialmente en vez de morir**.
- **Contenido no confiable**: todo HTML traído de la web se sanea con
  `sanitizeField` antes de persistir o renderizar. HTML crudo no se almacena ni
  se renderiza jamás. Desde PRELAUNCH-HARDENING-1 Fase R (log §43) esa función
  vive **sólo** en `lib/text/sanitize.ts`: hasta entonces había tres copias
  idénticas y esta regla, que ya decía "el patrón existente" en singular, no
  era cierta. No vuelvas a copiarla — un arreglo del escapado tiene que llegar
  a todos los llamadores a la vez.
- **RLS**: lecturas con el cliente de usuario; cualquier escritura con
  service-role prueba propiedad antes con el cliente de usuario.

### Las dos mitades tienen interruptor propio, y por defecto están apagadas

WEB-AUDIT-AUTO-SPLIT-1 (migración 0031) sustituye el interruptor único de la
0030 por uno por mitad: `auto_coverage_audit_enabled` y
`auto_technical_audit_enabled`, los dos `default false`. Un control único
obligaba a elegir entre *pagar grounding en este dominio* y *perder un
componente del GeoScore*, que no son la misma decisión (coste medido:
`docs/llm-cost-analysis-2026-08.md`).

Consecuencias, y son reglas:

- **Leer los flags falla CERRADO**, al revés que la 0030. Con defecto `true`,
  una lectura fallida tenía que significar «córrelo» o un error transitorio
  paraba todas las auditorías de forma invisible. Con defecto `false` el error
  caro es el contrario: gastar una campaña que el fundador apagó. Comparar con
  `=== true`, nunca con `!== false` — es lo que hace que una migración sin
  aplicar (columna ausente → `undefined`) caiga en «apagado».
- **Los flags se releen al ejecutar, no se llevan en `payload_json`.** Un job
  puede esperar un ciclo de backoff entero, y un control que dice «detiene la
  próxima auditoría» tiene que cumplirlo. Viajan en la misma fila que
  `loadProjectContext` ya carga para `owner_user_id`/`domain`, así que no
  cuestan consulta.
- **Una mitad apagada nunca aparca una continuación.** No hay nada a lo que
  volver: aparcar re-despacharía el job hasta el tope de continuaciones sin
  lograr nada — la misma trampa que ADR 0035 documentó para la cobertura sin
  plan. Por eso el interruptor técnico se comprueba **antes** del reserve de
  presupuesto, no después.
- **`auto_web_audit_enabled` (0030) sigue en el esquema y ya no lo lee nadie.**
  No es un respaldo: no reintroducir lecturas. Se dejó porque tirar una columna
  es un cambio destructivo con su propia aprobación.

## Excepción registrada: la auditoría automática tras escaneo

`lib/web-audit/audit-job-runner.ts` (AUDIT-AFTER-SCAN-1, ADR 0027) llama a los
dos núcleos de auditoría con el **cliente de servicio**, porque en esa ruta no
existe sesión de usuario por construcción: la dispara el final de un escaneo,
que en producción es automático y diario.

Dicho con precisión, porque la formulación cómoda sería falsa: en esa ruta el
filtro `.eq("owner_user_id", user.id)` **es tautológico** — el `owner_user_id`
se lee de la propia fila del proyecto y se devuelve como valor del filtro. No
es ahí donde está la protección.

Lo que sí protege el aislamiento es que **el `projectId` es derivado en
servidor y jamás aceptado desde una petición**: sale de una fila de `jobs` que
el ejecutor creó para una ejecución que acababa de terminar, y `jobs.run_id`
tiene FK a `scan_runs(id, project_id)`. El endpoint `/api/cron/run-audit` no
acepta ningún identificador de proyecto en su cuerpo — sólo `chainIndex`.

Si alguna vez esa ruta pasa a aceptar un `projectId` de fuera, esta excepción
deja de valer y hace falta una prueba de propiedad real.

### El presupuesto del barrido es compartido, no por trabajo

En `processDueWebAuditJobs` (AUDIT-AFTER-SCAN-1, ADR 0027) **un trabajo sólo
se reclama cuando ya es seguro que se puede ejecutar ahora**: de uno en uno,
contra un reloj único (`SWEEP_BUDGET_MS`) que cubre toda la invocación, y
pasando a cada trabajo el presupuesto que *queda*, nunca uno nuevo.

No es preferencia de estilo. Reclamar es bloquear: un trabajo reclamado y no
ejecutado queda en `running` y fuera de la cola durante `STALE_LOCK_MS` (10
min), y si la plataforma mata la invocación tampoco llega a despacharse la
cadena. Con presupuestos por trabajo, un barrido de 3 se iba a ~126 s bajo un
`maxDuration` de 60 (ADR 0003) y degradaba justo en el caso para el que existe
la red de seguridad: el que encuentra cola. Misma razón para el reserve de la
auditoría técnica — si no cabe entera, el trabajo se aparca como
**continuación** (sin gastar intento), porque la cobertura ya está persistida
y reentrar cuesta una llamada cacheada.

Cualquier fase que añada trabajo por trabajo (más lotes, otro núcleo de
auditoría) tiene que reajustar `MIN_JOB_BUDGET_MS` y el reserve, no sólo
subir el límite del lote.

### Reclamar un trabajo abandonado consume intento

En `claimDueWebAuditJobs`, la rama que rescata trabajos varados en `running`
**incrementa `attempt_count`** (data-guardian R1, 2026-08-04). Los cierres
ordenados no son los únicos que mueven ese contador precisamente porque una
invocación matada por la plataforma nunca llega a ellos: sin cobrar el intento
aquí, un trabajo que la plataforma mate de forma sistemática se re-reclamaría
cada `STALE_LOCK_MS` para siempre, gastando llamadas reales de Gemini en cada
ciclo, sin alcanzar jamás `max_attempts` y por tanto **sin enviar nunca el
email de alerta**. `runWebAuditJob` rechaza y falla un trabajo que ya esté en
su techo, antes de cualquier llamada a Gemini.

### Lo que dispara la auditoría es `scan_runs`, no la fila de `jobs`

`backfillMissingWebAuditJobs` reconcilia ejecuciones `completed` de las últimas
24 h que no tengan fila `web_audit`, y las encola. Corre al inicio de cada
cadena del worker.

No es redundancia con el encolado en línea: **es lo que hace cierto** que una
auditoría no se pierda. El encolado vive en la misma invocación que marca la
ejecución `completed`, y si esa invocación muere entre ambas cosas no hay fila,
ni log, ni `catch` — y sin fila nada volvía a mirar esa ejecución, porque el
barrido sólo recorre `jobs`. Ocurrió en producción el 2026-08-04, en 1 de 3
escaneos reales, coincidiendo con un despliegue (ADR 0027, sección
"Consecuencias").

Regla derivada, y la lección se ha repetido tres veces en esta zona: **lo que
no está reconciliado contra un registro durable de la base de datos, se
pierde.** Cualquier fase que añada un paso nuevo a esta tubería tiene que
poder responder «¿qué lo vuelve a intentar si la invocación muere aquí?».

El desfase de `BACKFILL_GRACE_MS` (5 min) no es cosmético: sin él la
reconciliación compite con el encolado en línea, y como el deduplicado es un
SELECT-luego-INSERT y no una restricción, se insertarían dos filas.

**El backfill sólo mira la ejecución más reciente de cada proyecto**, y eso
tampoco es una optimización. Los dos núcleos derivan su objetivo solos —«la
última ejecución completada de ESTE proyecto»— e ignoran el `run_id` del
trabajo, que es sólo clave de deduplicado. Un trabajo que nombra una ejecución
vieja **no audita esa ejecución**: audita otra vez la más reciente. La primera
versión encolaba todo lo no cubierto de la ventana y en su primer barrido real
creó nueve trabajos para un proyecto, además de pintar nueve filas históricas
de Escaneos como «En curso» por un trabajo que jamás produciría su propia
auditoría (2026-08-05, visto leyendo la captura del pilot de la PR #333, no por
ninguna aserción).

### Ninguna pestaña de navegador es el motor de una auditoría

El bucle de cliente que reanuda una campaña de cobertura es un **acelerador**,
nunca el motor: iOS Safari suspende el JavaScript de una pestaña en segundo
plano, y la campaña se para con su fila en `running` y nadie que la reanude
(ADR 0038 — 13 minutos de campaña, ~8 lotes, parada en seco al bloquearse el
móvil). Todo trabajo que continúe después de enviar una respuesta se despacha
desde el servidor.

Consecuencias, y son reglas, no matices:

- **Un despacho está entregado sólo si la respuesta lo dice.** `fetch` se
  resuelve con 401/404/500 y sólo rechaza ante fallo de transporte, así que un
  `await fetch(...)` sin comprobar informa de un worker inalcanzable igual que
  de uno sano. Comprobar `response.ok` y registrar estado y URL (ADR 0038;
  mismo invariante que `.claude/rules/scan.md`).
- **Un preview no tiene crons.** Vercel sólo los ejecuta contra producción, así
  que allí no corre el barrido diario, ni el backfill, ni el rescate de locks.
  Una prueba de auditoría en preview hay que leerla sabiendo que la red de
  seguridad no está puesta.
- **Abrir la pantalla despierta lo vencido.** Si hay un job `web_audit` vencido
  o abandonado, el render despacha una pasada del worker. Es seguro porque el
  claim es un UPDATE atómico condicional: un despacho duplicado es un no-op.
  El job se lee con el cliente de usuario (RLS `jobs_select_owner`), no con
  service-role — un render no necesita más privilegio del que ya tiene.

### Una etiqueta de estado se mide contra el reloj

«Auditando…» derivado de `status='running'` sin antigüedad es una afirmación
que no caduca nunca, y una fila de campaña sólo la limpia una campaña que
termina — así que cualquier forma de fallar quedaba presentada como trabajo en
curso eterno (ADR 0038). `deriveAuditPillState`
(`lib/web-audit/audit-liveness.ts`) es el único sitio donde se decide.

- Movimiento reciente (`AUDIT_CAMPAIGN_STALE_MS`) → «Auditando…»; cualquier
  otra cosa viva → «Auditoría pendiente».
- **Un job en `retrying` nunca es «Auditando…»**, por fresca que esté la fila de
  campaña: el backoff llega a 10 h. Misma lección que AUDIT-IN-RUNS-1 aprendió
  para la tabla de Escaneos.
- `AUDIT_CAMPAIGN_STALE_MS` y `WEB_AUDIT_STALE_LOCK_MS` responden preguntas
  distintas (qué dice una etiqueta / cuándo es seguro robar un job) y no deben
  colapsarse en una constante compartida.

### Un fallo del driver tiene que llegar a la pantalla

`WebAuditProvider` guardó un `error` que nadie leía durante toda una fase,
porque los botones que lo consumían se retiraron en AUDIT-NO-BUTTON-1 y el
estado quedó huérfano (ADR 0038). Cualquier estado de error que esta zona
escriba necesita un consumidor que lo pinte, o no existe. `WebAuditDriveNotice`
es ese consumidor; no renderiza nada cuando no hay error, porque es el canal de
fallo y no un segundo indicador de estado.

### Un aviso de regresión es una transición, nunca un estado

`lib/web-audit/regressions.ts` (WEB-AUDIT-ALERTS-1, log §27) compara la
auditoría anterior con la actual. Ningún aviso salta porque algo *esté* mal,
sólo porque *ha pasado* a estarlo. Es lo único que impide que un trabajo
diario se convierta en una regañina diaria: una condición que persiste produce
exactamente un aviso, el día que apareció.

De ahí, y son consecuencias de la regla, no preferencias:

- **Sin lado anterior explícito no hay aviso.** Primera auditoría, campo que
  no existía en la fila antigua (`sitemapFound` es `undefined` en snapshots
  previos a WEB-AUDIT-R3), agente que la auditoría anterior no vigilaba:
  todos son *desconocido*, no *empeorado*. Comparar con `=== true` /
  `=== false`, nunca por veracidad.
- **`inconclusive` no es regresión.** Un tema que pasa a inconcluso mueve el
  porcentaje de cobertura sin que nada haya empeorado, porque encoge el
  denominador. Por eso la comparación de cobertura es **por tema**, jamás
  entre los dos porcentajes agregados.
- **El suavizado ya existe aguas arriba.** `performing`/`invisible` se deciden
  por mayoría sobre `CITATION_WINDOW_SIZE` escaneos (`opportunity-matrix.ts`,
  WEB-AUDIT-R6 fase 2) precisamente porque el grounding es un sensor ruidoso.
  No añadir una segunda capa de suavizado encima: sólo retrasaría una
  regresión real.

Consecuencia para la carga de datos: la comparación de cobertura lee
**cuatro** mapas, no dos (`COVERAGE_SCANS_COMPARED`), porque cada lado se
clasifica sobre la ventana de los tres escaneos anteriores a su propia fecha.
Con menos, la campana clasificaría un tema distinto que la pantalla a la que
enlaza — y un aviso que contradice su propia pantalla es peor que ningún
aviso.

Cualquier aviso nuevo de esta zona hereda las tres reglas y **debe emitirse
después** de que la fila que describe sea durable, con `emitNotification`
(fail-soft: un fallo al avisar nunca convierte una auditoría persistida en un
fallo).

### `jobs.last_error` lo lee el dueño del proyecto

`jobs` lleva RLS `jobs_select_owner`, así que el propietario puede leer
`last_error` directamente por PostgREST. Ahí va **siempre un código estable**,
nunca texto de error crudo — misma convención que el ejecutor de escaneos con
`getSanitizedScanError`. El detalle crudo va al `console.error` y al email del
operador, que no son superficies de usuario (data-guardian R2).
