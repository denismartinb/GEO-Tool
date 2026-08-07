# ADR 0037 — Un escaneo no puede depender de que el móvil siga despierto

- **Estado:** aceptado (SCAN-DRIVE-1, 2026-08-07)
- **Zona:** Escaneo (pipeline) — `.claude/rules/scan.md`, `docs/scan-lifecycle.md`
- **Relacionado:** ADR 0003 (ejecución síncrona, `maxDuration=60`), ADR 0014
  (SCAN-CHAIN-1, ejecución por lotes autoencadenada), ADR 0029
  (EXTRACTION-RELIABILITY-1, lease del job de finalize)

## Contexto: el fallo del 2026-08-07

El fundador creó una cuenta nueva para la prueba final previa al lanzamiento y
escaneó `genscore.es` con 31 prompts. Falló. El reintento automático también
falló. Lo que quedó en base de datos:

| run | trigger | estado | error_summary | jobs completados | duración |
|---|---|---|---|---|---|
| `c472747b` | `user` | failed | `scan_timeout` | 20/31 | 4m 37s |
| `55fb9360` | `cron` | failed | `scan_timeout_retry_exhausted` | 30/31 | 15m 19s |

Y el reparto de `jobs`, que es el dato que cierra el diagnóstico:

```
c472747b  scan_prompt   completed  20
c472747b  scan_prompt   pending    11      <-- nadie los reclamó nunca
c472747b  scan_finalize pending     1
55fb9360  scan_prompt   completed  30
55fb9360  scan_prompt   pending     1
55fb9360  scan_finalize pending     1
```

**Cero jobs `failed`. Cero jobs `running`.** Los tres motores respondieron
correctamente a las 50 llamadas que llegaron a hacerse. No hubo caída de
proveedor, ni cuota agotada, ni invocación muerta a mitad de lote (eso habría
dejado zombis en `running`). Los jobs que faltaban simplemente **nunca fueron
pedidos por nadie**.

### Por qué no los pidió nadie

Desde ADR 0014 una campaña se ejecuta en lotes de `MAX_REAL_SCAN_PROMPTS` (10),
y hay dos maneras de encadenarlos: el *foreground driver* (el componente
cliente `AutoExecuteScan` llamando a `autoExecutePendingScan` en bucle) y la
*continuación en segundo plano* (`after()` → `/api/scan/continue`). El camino
manual —el botón "Lanzar escaneo", que es el que usa cualquier usuario real—
pasaba `scheduleContinuation: false` **y por tanto apagaba la segunda**. La
única cosa en todo el sistema que pedía el siguiente lote era un bucle
`setTimeout` dentro del navegador del usuario.

El fundador escaneaba desde el móvil. iOS Safari suspende el JavaScript de una
pestaña al bloquear la pantalla o cambiar de app. El bucle murió, nadie reclamó
el lote 3, `updated_at` dejó de moverse, y a los 120s `reconcileStuckScanRuns`
dio el run por muerto — correctamente, según su propia definición: había dejado
de avanzar.

El razonamiento original para apagar la continuación (ADR 0014) no era
absurdo: el driver foreground evita el secreto y funciona detrás de la
protección de despliegue de Vercel, y un despacho duplicado parecía trabajo
redundante. Lo que no se consideró es **dónde vive ese driver**. Un bucle en el
navegador no es un ejecutor; es una petición educada que el sistema operativo
del usuario puede cancelar en cualquier momento.

### Por qué el reintento tampoco funcionó

`attemptAutoRetry` creaba un `scan_runs` nuevo en `pending` y ahí terminaba su
trabajo. Nada del lado servidor ejecuta un run `pending`: sólo lo hace el mismo
driver de navegador que acababa de fallar. El run #2 avanzó a trompicones
durante 15 minutos —cada vez que el fundador abría una pantalla del proyecto—
hasta pararse otra vez, ya con el cupo de reintentos agotado. **Un reintento
que nadie arranca no es un reintento**; es la misma apuesta perdida, repetida.

### El agravante

Ninguno de los dos runs perdió datos por un fallo de los motores: perdió los
datos al reintentar. El run #2 no reanudó el #1 — generó 30 respuestas nuevas
desde cero. ~150 llamadas LLM reales acabaron en runs marcados `Fallido` y en
una pantalla que decía "El último escaneo no se pudo completar".

## Decisión

Tres cambios, todos dentro de `lib/scan/**` más el driver, sin migraciones.

### 1. La continuación en segundo plano es incondicional

Se elimina el parámetro `scheduleContinuation` de `executePendingScan`. Toda
invocación que reclame trabajo y deje trabajo pendiente programa el siguiente
lote vía `after()`, conduzca quien conduzca. El driver foreground sigue
existiendo (es más rápido y no depende del secreto), pero pasa de ser *el*
motor a ser un acelerador.

Que los dos convivan es seguro **por construcción, no por suerte**: los lotes
se reclaman con un `UPDATE ... WHERE status = 'pending' ... RETURNING` atómico,
así que un job sólo lo procesa la invocación cuyo update commitea primero. Esa
propiedad ya existía desde ADR 0014 y ya se usaba para exactamente esto; sólo
que estaba desactivada donde más falta hacía.

El coste que esto compra: en un preview con protección de despliegue el
self-fetch no llega y se registra un error por lote. Ruido en logs a cambio de
que un escaneo termine sin la pantalla encendida — es un cambio obviamente
bueno.

### 2. Los jobs `scan_prompt` tienen lease (`PROMPT_LOCK_LEASE_MS`, 90s)

No es la causa del incidente del 07-08, y conviene decirlo: los jobs estaban
`pending`, no `running`. Pero es el mismo agujero que ADR 0029 tapó para
`scan_finalize` y que nunca se extendió a los lotes, que son justamente la
parte que pasa decenas de segundos en llamadas a proveedores y por tanto la más
fácil de que Vercel mate a mitad. `reconcileStuckScanRuns` nunca toca `jobs`,
así que un job `running` abandonado es irrecuperable: la campaña no puede
observar "todos los prompts terminales" y finalize queda inalcanzable para
siempre.

Un job cuyo `locked_at` supera el lease puede ser reclamado con el mismo UPDATE
atómico condicional. Un job stale **sin intentos restantes** (`attempt_count >=
max_attempts`) se marca `failed` con un mensaje propio en vez de reclamarse:
sin ese corte, un job que mate a su invocación de forma fiable se reclamaría
eternamente.

### 3. El presupuesto del driver se mide antes, no después

`autoExecutePendingScan` decidía si seguir con
`do { ... } while (elapsed < 40s)`. Eso pregunta por el pasado cuando lo que
importa es el futuro: una iteración que arranca en el segundo 39 pasa el
control y puede gastar otros 45 (`SCAN_INVOCATION_WORK_BUDGET_MS`), llevando la
acción a ~84s dentro de un `maxDuration` de 60 — Vercel la mata a mitad de
lote. Es literalmente el error que el Addendum de ADR 0029 documentó un nivel
más abajo ("presupuesta contra la invocación, no contra sí misma") sin que
nadie revisara el nivel de arriba.

Ahora `canStartAnotherScanInvocation` (`lib/scan/drive-budget.ts`) exige que
quepa el **peor caso completo** de la siguiente invocación
(`SCAN_INVOCATION_WORST_CASE_MS`, 50s) por debajo de
`AUTO_EXECUTE_SAFE_CEILING_MS` (55s) antes de arrancarla. En la práctica el
driver hace un lote por petición y devuelve el control al cliente, que
re-conduce tras su pausa de 2s. Es más lento por lote y estructuralmente
incapaz de morir a mitad.

### 4. El reintento automático arranca el run que crea

`attemptAutoRetry` despacha ahora una continuación para el run nuevo. Va en su
propio try/catch, separado del de la creación, para que un despacho imposible
(sin contexto de request, sin secreto) no se registre como "auto-retry failed"
cuando el run sí existe.

`triggerScanContinuation` se mueve a `lib/scan/continuation.ts`, un módulo hoja
—mismo argumento que `lib/site-url.ts`— porque ahora lo necesitan dos módulos
que no deben importarse entre sí: el executor y la reconciliación (que ya es
alcanzable desde `run-creation.ts`).

## Consecuencias

- Un escaneo termina con el móvil bloqueado, la pestaña cerrada o el portátil
  dormido. Esto era el requisito implícito desde el primer día y no se cumplía.
- Un lote cuya invocación muere deja de ser un punto muerto permanente.
- El driver foreground ya no puede autoinfligirse la muerte por `maxDuration`.
- **Depende de `SCAN_CONTINUE_SECRET` en producción.** Sin él la red de
  seguridad queda muda y el sistema vuelve al comportamiento anterior
  (`triggerScanContinuation` lo registra explícitamente). Está en el checklist
  de `docs/environment-contract.md`; verificarlo forma parte del Human Gate de
  esta fase.
- Más invocaciones por campaña: cada lote arranca una función en vez de
  reutilizar la petición del driver. Es el precio de no depender del navegador.

## Lo que esta fase NO arregla

**Un reintento sigue reempezando en vez de reanudar.** Los 50 respuestas útiles
del incidente se habrían perdido igual con este PR: `attemptAutoRetry` crea una
campaña nueva y completa, no reencola los jobs recuperables del run anterior.
Es trabajo de su propia fase (SCAN-RESUME-1), con su propio Task Intake — toca
la semántica de qué es un run y qué significa "el último escaneo completado"
para el resto del producto, y meterlo aquí sería exactamente el PR con dos
preocupaciones que CLAUDE.md prohíbe.

**Quedan 4 jobs huérfanos** en `pending` colgando de los dos runs `failed` del
proyecto `a568026e` (11+1 `scan_prompt`, 2 `scan_finalize`). Son inertes —
nada los consulta, porque toda lectura parte de `scan_runs` y esos runs son
terminales— pero una sesión futura que mire la tabla `jobs` los verá. No se
limpian automáticamente: un barrido destructivo automático está prohibido sin
aprobación explícita (CLAUDE.md) y el coste de dejarlos es cero.
