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
- **Un plan sin cobertura no está «Parcial».** Cualquier superficie que informe
  del estado de una auditoría tiene que distinguir *falta una mitad* de *esa
  mitad no está en tu plan* (`coverageIncludedInPlan`,
  `lib/web-audit/run-audit-status.ts`). Etiquetar lo segundo como lo primero
  marca un defecto permanente donde no falta nada.
- **Los límites son gasto real**: 5/día/proyecto para cobertura, presupuesto
  propio y separado para la auditoría técnica.
- **Presupuesto ADR 0003**: todo corre síncrono bajo `maxDuration = 60`.
  Cualquier función con varias llamadas de red lleva un presupuesto total de
  reloj holgadamente por debajo, y **degrada parcialmente en vez de morir**.
- **Contenido no confiable**: todo HTML traído de la web se sanea con el patrón
  existente (`sanitizeField`) antes de persistir o renderizar. HTML crudo no se
  almacena ni se renderiza jamás.
- **RLS**: lecturas con el cliente de usuario; cualquier escritura con
  service-role prueba propiedad antes con el cliente de usuario.

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
