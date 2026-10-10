# Scan Pipeline Rules

These invariants apply automatically when touching the scan pipeline
(`lib/scan/**`). Owned by the `reliability` and `gemini-pipeline` agents.
Every rule here is traceable to a document — a rule nobody can justify is
worse than no rule, because a future session will obey it anyway.

- **Never cap the work by row count.** Bound a pass by concurrency and by
  wall-clock budget, never by "process the first N rows". A row limit silently
  turns unfinished work into invisible work: `MAX_EXTRACTION_RESULTS = 20`
  discarded a third of every 30-row run for months with no error and no log
  (`docs/adr/0029`). Anything a pass cannot reach must remain eligible for the
  next one.
- **No mute rows.** A run may not reach `completed` while it holds an engine
  answer nothing has tried to extract. Either extracted data or a categorized
  `extraction_error` — never a silent gap (`docs/scan-lifecycle.md`,
  Invariants §4; `docs/adr/0029`).
- **Never dispatch a whole batch on the same tick.** Bounding concurrency is
  not the same as spreading the starts: a batch that claims N prompt jobs and
  fires them simultaneously puts N calls per engine on a provider from a
  standing start, which is a good way to manufacture the 429 that then kills
  the batch. `EXTRACTION_CONCURRENCY` exists for exactly this shape one stage
  later; generation went without it until LLM-RESILIENCE-1
  (`lib/scan/pacing.ts`, log §56). The stagger is bounded in both directions —
  a hard ceiling on the total spread, and dropped entirely when the invocation
  is short on budget, because finishing inside `maxDuration` outranks pacing.
- **Every outbound provider call needs a timeout and a bounded retry.** If you
  add a call, it goes through a retrying helper. The extraction path lacked
  both while generation had both, which is why every provider outage killed
  extraction alone and left the product looking healthy
  (`docs/adr/0029`, "Cause 2").
- **Persist categorized, self-authored error messages.** `category: message`,
  where the message is a constant this codebase wrote. Never persist a raw
  provider or transport message (`.claude/rules/gemini.md`, "Sanitize all
  errors"; `lib/llm/extraction-errors.ts`).
- **Budget new work against the invocation, not against itself.** A step added
  inside `executePendingScan` shares the ~60s `maxDuration` with everything
  else already there. Compute one absolute deadline at entry and thread it
  down; never give a new step its own fixed allowance. Giving extraction a
  per-pass 25s put the final batch's invocation at ~70s of work in a 60s
  function and killed a real scan (`docs/adr/0029`, Addendum). The same
  arithmetic applies to any loop that *calls* `executePendingScan`: ask
  before an iteration whether its whole worst case fits, never after one
  whether time has already run out — a `do { … } while (elapsed < budget)` lets
  an iteration start at 39s and run another 45 (`docs/adr/0037`,
  `lib/scan/drive-budget.ts`).
- **El presupuesto se impone a lo que está en vuelo, no sólo a lo que
  empieza.** Preguntar "¿queda tiempo?" antes de lanzar una llamada no basta
  si esa llamada conserva su timeout completo: una extracción empezada a los
  44 s duraba hasta los 64 s, Vercel mataba la invocación antes del
  `after()` del siguiente tramo, y la cadena de alberdiderma.es murió así
  seis días, dos de ellos sin ningún problema de proveedor
  (`docs/brand/design-decisions-log.md` §228). Toda llamada nueva dentro de
  `executePendingScan` recorta su timeout al deadline (patrón de
  `fetchExtractionWithRetry`) y no se empieza sin margen para una llamada
  real. Y lo que el presupuesto corta **no se persiste como error del
  proveedor**: una fila marcada `timeout:` por falta de tiempo sale para
  siempre del conjunto elegible, y eso es pérdida de datos.
- **Una cadena rota se reanuda antes de reemplazarse.** Un run parado con
  trabajo reclamable se re-despacha donde se quedó (`lib/scan/resume.ts`,
  con tope de reanudaciones y de antigüedad), en vez de marcarlo `failed` y
  empezar uno nuevo que repite todas las llamadas ya pagadas (§228). El tope
  vive en `job_logs` y **se escribe antes del despacho**: un run que nunca
  se puede reanudar con éxito tiene que llegar igualmente al tope y caer al
  camino de fallo y aviso.
- **La elegibilidad de un trabajo programado se ancla a SU horario, nunca a una
  ventana móvil hacia atrás desde `Date.now()`.** El barrido recurrente
  preguntaba "¿hace menos de 24h del último escaneo?" cuando la pregunta que
  contesta bien es "¿se ha escaneado desde el disparo anterior?". Con la
  ventana móvil, cualquier run *fuera del horario del cron* —un escaneo manual,
  un reintento de `reconciliation.ts`— caía dentro de ella en el disparo
  siguiente y le costaba al proyecto un día entero de su cadencia; un escaneo
  manual a las 13:08 del 27 dejó a un proyecto de plan diario sin escaneo el 28
  (`docs/brand/design-decisions-log.md` §192). El margen de seguridad que había
  antes (`CRON_DRIFT_SAFETY_MARGIN_MS`) parcheaba el problema simétrico —la
  deriva del propio disparo— y no podía cubrir éste: un margen sólo mueve el
  borde de una ventana que sigue siendo móvil. `mostRecentCronFiringAt` +
  `resolveEligibilityCutoffIso` son el ancla, y `RECURRING_CRON_UTC_HOUR`
  **tiene que seguir a `vercel.json`**: un desajuste ahí es invisible en
  ejecución y desplaza la elegibilidad de todos los proyectos, así que lo
  vigila `lib/scan/cron-schedule.test.ts` contra el propio fichero.
- **La aritmética de "¿cabe otra invocación?" tiene UN dueño:
  `lib/scan/drive-budget.ts`.** No es una preferencia de organización: la forma
  "después" (`if (elapsed > budget) break`) se arregló en el driver de primer
  plano en ADR 0037 y se quedó sin arreglar en el barrido recurrente, un nivel
  por encima y en otro fichero, durante meses — el mismo fallo que ADR 0029
  Adenda ya había documentado un nivel por debajo. Tres pisos, dos arreglos, un
  agujero. Todo driver que llame a `executePendingScan` en bucle pregunta
  **antes** de una iteración si su peor caso entero cabe, y lo pregunta a una
  función de ese módulo (`canStartAnotherScanInvocation`,
  `canStartAnotherSweepBatch`), nunca a una comparación escrita a mano
  (`docs/brand/design-decisions-log.md` §192). El coste de acertar aquí es
  mayor que perder un lote: en el barrido, las DOS cadenas de continuación
  —la del barrido y la de cada escaneo— viven en `after()`, que no corre si
  Vercel mata la función antes de responder, así que un desbordamiento no
  retrasa trabajo, lo hace desaparecer.
- **Any claim held across a step long enough to be killed needs a lease.**
  `reconcileStuckScanRuns` only ever touches `scan_runs`, never `jobs`, so a
  job left `running` by a dead invocation is stranded forever unless something
  can take it over. Use the atomic `UPDATE ... WHERE locked_at < now - lease
  RETURNING` pattern (`docs/adr/0029`, Addendum). This covers **every** job
  kind, not just the one that prompted it: the same rule was written for
  `scan_finalize` and left unapplied to `scan_prompt` for months, even though a
  prompt batch spends longer in provider calls than finalize ever does
  (`docs/adr/0037`). A lease must also be **bounded** — a stale job with no
  attempts left is failed, not reclaimed again, or one poison job consumes
  every pass forever.
- **La cadena de `/api/scan/continue` es un acelerador; el motor es el cron
  `/api/cron/scan-continue`, cada 5 minutos.** Vercel corta con 508 una cadena
  de auto-llamadas a los pocos saltos aunque la URL esté bien: el 2026-10-10
  la del barrido de las 06:00 murió hacia el quinto salto y el run esperó once
  minutos al vigilante, que sólo reanuda `SCAN_RESUME_CAP` veces
  (`docs/brand/design-decisions-log.md` §262). El pase de `lib/scan/drain.ts`
  re-despacha todo run joven, parado al menos lo que dura un lease y con
  trabajo reclamable, y **no escribe nada**: ni marca de reanudación, ni
  `updated_at`, ni jobs. Así un re-despacho que no avanza deja el run igual de
  parado y el camino de reanudar/fallar del vigilante sigue viéndolo. Si se le
  añade una escritura, ese contrato se rompe y un run muerto puede no fallar
  nunca. Lo vigila `vercel-crons.test.ts`.
- **Never let a browser be the only thing driving a scan.** Work that continues
  after a response is sent must be dispatched server-side; a client-side loop
  is an accelerator, never the engine. A phone that locks its screen suspends
  the tab's JavaScript, and the campaign then stops with its remaining jobs
  `pending` and nothing able to claim them — 31 prompts, two failed runs, 50
  real answers discarded (`docs/adr/0037`). Two drivers racing is safe here
  *because* batch claims are atomic; suppressing one to avoid "redundant" work
  is what removed the only driver that survives a locked phone.
- **A retry must start what it creates.** Creating a replacement `scan_runs`
  row is not a retry: nothing on the server executes a `pending` run on its own.
  Whatever creates one dispatches it too (`docs/adr/0037`).
- **A dispatch is delivered only if the response says so.** `fetch` resolves on
  401/404/500 and rejects only on transport failure, so an unchecked
  `await fetch(...)` reports a blocked self-call as a successful hand-off — and
  a safety net that cannot be seen failing is not a safety net. Check
  `response.ok` and log the status and the URL (`docs/adr/0037`). Escrita para
  `triggerScanContinuation` y no aplicada a `triggerSweepContinuation`, que
  está un nivel por encima y hacía exactamente lo mismo mal: un `await fetch`
  pelado, la cadena de proyectos parada en un eslabón y
  `continuationScheduled: true` en el log de resumen de todas formas
  (`docs/brand/design-decisions-log.md` §192). **Toda** auto-llamada del
  pipeline, no sólo la que motivó la regla.
- **Toda auto-llamada construye su URL con `getSiteUrl()`, que nunca acaba en
  "/".** `NEXT_PUBLIC_SITE_URL` de producción lleva barra final y las tres
  auto-llamadas del pipeline iban a `https://www.genscore.es//api/...`, que
  Vercel rechazaba con 508 — lo vio el `response.ok` de la regla anterior,
  pero sólo en un log que nadie leía (`docs/brand/design-decisions-log.md`
  §241). Concatenar `process.env.NEXT_PUBLIC_SITE_URL` a mano reabre el fallo.
- **El barrido tiene sus propios fallos, y también tienen que llegar al
  operador.** La regla de abajo se escribió para lo que pasa DENTRO de un run
  y se aplicó sólo ahí: un escaneo del cron que revienta antes de existir como
  run, un proyecto expulsado del recurrente por `skipped_failure_streak`, una
  pasada que aplaza trabajo sin escanear nada o una cadena de continuación
  rechazada no producen filas de `scan_prompt_results`, así que
  `checkAndSendScanHealthAlert` no puede verlos — vivían en un `console.info`
  (`docs/brand/design-decisions-log.md` §194). `collectSweepFindings` decide
  qué despierta al operador y es pura: **los silencios se prueban igual que
  los avisos**, porque `skipped_recent`, `skipped_plan_ineligible` y
  `skipped_active_run` son el funcionamiento normal y alertar de ellos sería
  el correo diario que se aprende a ignorar. Y **el barrido no puede usar
  `job_logs` como almacén de deduplicado**: esa tabla exige una FK real a
  `(job_id, run_id, project_id)` y el barrido no tiene job, así que el
  deduplicador es el propio disparo diario (un correo por pasada, no por
  proyecto).
- **A failure the operator can fix must reach the operator.** Persisting a
  categorized error is half the job; if nothing reads it, the incident is still
  invisible — OpenAI's 429s ran four days and Claude's ran unnoticed entirely
  (`docs/adr/0029`, Fase B). Alert on what is actionable (`quota`, `config`, a
  dead engine, a run out of retries), stay silent about model noise, and dedupe
  across projects: an alert that fires twenty times is one that gets ignored.
- **Un aviso no puede depender de que el run termine ni de que alguien
  mire.** Hasta ALERTS-ALWAYS-1 todas las alertas colgaban del final de un
  run (finalize) o de una reconciliación que sólo corre al abrir una
  pantalla, crear un run o pasar el barrido diario — y un run cuya cadena
  muere no termina nunca, así que alberdiderma.es falló seis días seguidos
  sin un solo correo (`docs/brand/design-decisions-log.md` §227). El
  vigilante (`lib/scan/watchdog.ts`, cada 15 min) es el sitio donde vive
  "¿hay algún cliente que haya dejado de recibir datos?": reconcilia runs
  parados de TODOS los proyectos, busca `quota`/`config` en runs en curso,
  avisa de todo run `failed` y de todo proyecto recurrente sin escaneo
  completado en su último ciclo. Un fallo nuevo que el operador deba conocer
  se añade ahí o se asegura que ahí se vea; nunca sólo en un camino que
  requiere que el run acabe. Y la marca de deduplicado se escribe **después**
  del envío, nunca antes: si el canal falla, la siguiente pasada repite.
- **El código de sistema actúa sobre el plan EFECTIVO, nunca sobre
  `current_plan` crudo.** La caducidad de la prueba es perezosa (se aplica
  cuando el usuario abre la consola), así que leer la columna tal cual hizo
  que el barrido escaneara durante diez días cuentas con la prueba caducada
  (§229). Barrido, creación de escaneos, reintento automático, ejecutor y
  vigilante resuelven el plan con `resolveSystemPlanId` (`lib/billing.ts`),
  que aplica caducidad y comped sin escribir nada. Y un aviso de fallo sólo
  sale si alguien espera ese dato: runs de ≤48 h, lanzados por una persona o
  de una cuenta con plan que incluye escaneos. Un run parado de hace días
  (zombi) se falla sin reintento ni aviso.
- **An alert's own failure must be diagnosable where you already work.** A
  `console.error` in a short-lived runtime log is not a diagnosis — persist the
  reason (`docs/adr/0029`, "What the first real delivery cost to learn"). And a
  probe that checks one segment of a delivery path must not report on the whole
  path: destination configured is not transport configured.
- **Operator alerts never go to the customer.** Backend trouble a customer
  cannot act on is noise about someone else's problem — use `OPS_ALERT_EMAIL`,
  never their address (`lib/email/transactional.ts`, precedent
  AUDIT-AFTER-SCAN-1).
- **Progress shown to a user must cover every stage that keeps them waiting.**
  A bar that measures one stage of two reads as "stuck" the moment the other
  one starts, and adding work behind an existing progress figure silently
  makes that figure a lie (`docs/adr/0029`, Fase C). Counters must be measured
  from real rows; a split between stages may be a presentation convention, but
  no number under it may be invented.
- **El trabajo de UN prompt vive en `lib/scan/prompt-job.ts`, no en el
  ejecutor.** `executor.ts` opera la campaña —reclamar lotes, presupuesto de la
  invocación, finalizar, puntuar, notificar— y `prompt-job.ts` opera un job:
  transiciones de estado, una llamada por motor con reintentos compartidos,
  inserción de resultados y registro. Estaban en el mismo fichero de 1.523
  líneas, y lo segundo es justo lo que se abre para depurar por qué falló un
  prompt concreto (log §81). Trabajo nuevo por prompt va ahí; trabajo nuevo por
  campaña, en el ejecutor — y en ambos casos se presupuesta contra la
  invocación, no contra sí mismo.
- **`lib/scan/` es una feature, no el vocabulario común del repositorio.** Si un
  símbolo de aquí lo importan módulos que no escanean —facturación, auditoría
  web, competidores— casi siempre es que está en el sitio equivocado, no que la
  dependencia sea legítima. `AuthenticatedContext` vivía en `scan/types.ts` y lo
  importaban diecisiete módulos ajenos, siendo como es el tipo de retorno de
  `requireUser` (`lib/auth.ts`); las constantes de UNA llamada a un LLM vivían
  en `scan/constants.ts` y hacían que el transporte de un proveedor dependiera
  del escaneo (`lib/llm/constants.ts`, log §82). La dirección correcta es
  siempre la misma: **el escaneo sabe que llama a LLMs; la capa de LLM no tiene
  por qué saber que existe un escaneo.** Antes de añadir un símbolo a
  `scan/types.ts` o `scan/constants.ts`, preguntar quién más va a importarlo. Y
  la salida NO es un módulo `lib/domain/` genérico: cada símbolo tiene un dueño
  natural, y un cajón llamado «domain» es donde acaban las cosas que nadie
  quiso clasificar.
- **Terminal states stay terminal, and progress must bump `updated_at`.** Any
  path that defers work instead of finishing it must write to `scan_runs` so
  `reconcileStuckScanRuns` can tell a deferring run from a stalled one
  (`docs/scan-lifecycle.md`, "Timeout detection").
- **A constant sized for one execution model must be re-checked when the model
  changes.** SCAN-CHAIN-1 (`docs/adr/0014`) turned a run into many batches and
  the extraction cap was never revisited — that gap is the whole of ADR 0029.
- **A column read on the scan-creation critical path needs its own query, and
  its own fail-safe direction.** `createPendingScanRunCore`'s project select is
  on the path of every scan the product creates; a column PostgREST doesn't
  know about (a migration not yet applied) fails that select ENTIRELY, not
  just the one field. `sampling_enabled` (SAMPLING-DEBUG-TOGGLE-1, migration
  0032) is read in its own separate query for exactly this reason, and reads
  toward the current shipped behaviour (sampling ON) on any failure — the
  opposite fail direction from the web-audit halves (migration 0031), which
  read toward OFF because failing there only skips one audit, never a scan
  (`docs/brand/design-decisions-log.md` §53). The per-engine switches
  (ENGINE-DEBUG-TOGGLE-1, migration 0033) read the same way, in `executor.ts`
  as well as `run-creation.ts`, for the same reason — but unlike sampling,
  the empty result is also a correctness bug, not just an imprecise score:
  zero engines is zero LLM calls and a `total_prompts` stuck at 0, the exact
  fake-scan shape "no mute rows" already forbids. Both call sites reject
  outright (`no_engines_enabled`) rather than create or run that scan
  (`docs/brand/design-decisions-log.md` §54).
- **Any fetch that follows a redirect to a host this codebase doesn't control
  needs the same SSRF guard as `lib/web-audit/fetch-page.ts`, imported —
  never reimplemented.** `resolveGroundingRedirect` followed Gemini's
  grounding redirects with a plain `redirect: "follow"` for months: no
  resolved-IP check, no hop-by-hop reverification, the exact gap
  `fetch-page.ts`'s own header explains is unsafe for a host you don't
  control. Found by `data-guardian` while scoping CITED-DIFF-1, fixed as
  CITATION-REDIRECT-SSRF-1 regardless of that phase's own fate — severity was
  medium (the response body is never read, only `response.url`), but any
  future phase that DOES read the body would turn this into an exfiltration
  channel, so it does not wait to become urgent (`docs/brand/
  design-decisions-log.md` §185). Unlike `fetch-page.ts`, this resolver has
  no domain allowlist — landing on any public site is the point — so the
  guard here is `hostnameResolvesToPublicIp` alone (imported, not copied),
  never `isAllowedAuditHost`. And unlike a per-hop timeout, the budget is one
  absolute deadline computed once per attempt (HEAD, then separately GET) and
  threaded through every hop — the same "budget against the invocation, not
  against itself" lesson ADR 0029 already established, since ADR 0006 already
  named redirect resolution as the dominant risk to the scan's 60s budget
  (ADR 0003) before any of this.
- **A run's own recommendation rows are user state, not regenerable scratch —
  clear them the same way their neighbors already do.** The finalize block's
  delete+insert of the current run's `recommendations` (right after the
  resolve/supersede writes for OTHER runs, both scoped to `status='active'`)
  had neither that scope nor an error check, unlike those two neighbors. It
  was not a live bug — `executePendingScan` returns for any terminal run
  before it ever reads the `jobs` table (this function's own entry guard), so
  finalize cannot re-run against a run a user could have already acted on —
  but it depended entirely on that guard, not on anything local to this
  write, to stay safe. Fixed regardless as RECS-FINALIZE-DURABILITY-1: the
  delete now scopes to `status='active'` like its neighbors, and both the
  delete and the insert check their error and log it via `logJob` — a failed
  delete skips the insert (the thing that would otherwise duplicate the run's
  whole backlog on top of untouched old rows), and a failed insert is at
  least diagnosable instead of a bare `console.error`
  (`docs/brand/design-decisions-log.md` §188). No unique constraint on
  `(project_id, run_id, dedupe_key)` exists yet to close this at the schema
  level — accepted residual risk, not this phase's scope.
- **Una cuenta `free` no escanea, ni siquiera la primera vez.** Desde
  TRIAL-ONLY-1 `free` no es un plan que se venda sino el estado de una cuenta
  sin plan (prueba terminada o suscripción cancelada), en solo lectura:
  `createPendingScanRunCore` rechaza todo run suyo —manual, reintento o cron—
  con `free_plan_scan_limit_reached`, leyendo el plan efectivo. El primer
  escaneo de toda alta ocurre en la prueba de Pro (`0017_reverse_trial.sql`).
  Si algún día vuelve un plan gratuito que escanee, tendrá otro id, no éste
  (`docs/brand/design-decisions-log.md` §243).
