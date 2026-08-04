# ADR 0027 — La auditoría web se ejecuta en backend tras cada escaneo, por cola

- **Estado:** aceptada (AUDIT-AFTER-SCAN-1, aprobada por el fundador 2026-08-04).
  Migración 0027 aplicada a mano en Supabase el 2026-08-04 y verificada.
- **Contexto relacionado:** ADR 0003 (`maxDuration=60`), ADR 0014 (encadenado
  de lotes de escaneo), ADR 0016 (barrido diario auto-encadenado)

## Contexto

La auditoría web (cobertura de dominio + salud técnica) solo se ejecutaba
desde el botón «Auditar ahora»: un bucle en primer plano conducido por la
pestaña del navegador del usuario. `domain-coverage.ts` lo documenta
explícitamente — el encadenado en segundo plano se descartó en su día por ser
poco fiable tras la protección de despliegues de preview de Vercel.

El producto se mueve a escaneos diarios automáticos. En ese modelo **no hay
nadie delante cuando termina el escaneo**, así que la pantalla insignia
sencillamente no se actualizaría nunca para las cuentas que más importan. El
requisito del fundador fue explícito: engancharlo detrás del escaneo, en el
backend, con reintentos de verdad y un email de alerta si acaba fallando.

## Decisión

La auditoría posterior al escaneo es **una fila en la tabla `jobs`**, no una
llamada fire-and-forget.

1. `lib/scan/executor.ts` encola un job `web_audit` justo después de que la
   ejecución quede `completed` de forma duradera, y despacha el worker con
   `after()`. Encolar antes competiría con los propios datos que audita.
2. `/api/cron/run-audit` (protegido con `CRON_SECRET`) reclama los jobs
   vencidos y los ejecuta. Se auto-encadena mientras quede trabajo.
3. Un cron diario de Vercel (`0 7 * * *`) recorre la cola como red de
   seguridad.

La migración 0027 amplía `jobs_type_chk` para admitir `'web_audit'`. No hay
tabla nueva ni columna nueva: `attempt_count`, `max_attempts`,
`next_attempt_at`, `last_error` y los estados `retrying`/`failed` ya modelan
exactamente una política de reintentos.

### Dos bucles que no se mezclan

- **Continuación** — la campaña de cobertura es intrínsecamente multi-petición
  (4 temas por llamada bajo el presupuesto de 60 s). Avanzar sin terminar
  **no es un fallo** y no toca `attempt_count`.
- **Reintento** — un error real. Consume intento y aplica el backoff
  documentado (1 min → 5 min → 25 min → 2 h → 10 h; 6 intentos ≈ 12,5 h).

Confundirlos sería un bug real: una campaña de 8 lotes agotaría un
presupuesto de 6 intentos antes de terminar y avisaría de un fallo que nunca
ocurrió.

### Reclamar es bloquear: el presupuesto del barrido es uno solo

Una invocación reclama **un trabajo cada vez**, y sólo si lo que queda del
reloj compartido (`SWEEP_BUDGET_MS`) basta para ejecutarlo entero. La primera
versión reclamaba el lote completo y daba a cada trabajo un presupuesto propio
medido desde su propio arranque, lo que sumaba 3 × 42 s bajo un `maxDuration`
de 60 (ADR 0003).

Eso no degradaba suavemente. Un trabajo reclamado y no ejecutado se queda en
`running` y desaparece de la cola durante `STALE_LOCK_MS` (10 min), y la
muerte de la invocación se lleva por delante el `after()` que encadenaba la
siguiente. El resultado era que **una cola se drenaba a ~un trabajo al día**,
en silencio, justo en el barrido diario que existe precisamente para
encontrar cola.

Por lo mismo, la auditoría técnica sólo arranca si cabe entera
(`TECH_AUDIT_TOTAL_BUDGET_MS` + margen). Si no cabe, el trabajo se aparca como
**continuación** —no como reintento—: la cobertura ya está persistida, así que
reentrar cuesta una llamada de cobertura cacheada y la técnica arranca con el
reloj a cero.

## Consecuencias

- Un `after()` perdido no es una auditoría perdida: la fila sigue `pending` y
  vencida, y el cron diario la recoge. El despacho es una optimización; la
  fila es el contrato.
- Los límites de 5/día **no** se aplican a la ruta automática: existen para
  acotar lo que un humano puede disparar a clics, y la ruta automática ya
  está acotada por algo más estricto (como mucho una por ejecución
  completada). El gate de plan Pro **sí** se mantiene: es una frontera
  comercial, no un límite de uso.
- Coste: cada escaneo pasa a gastar también las llamadas de grounding de la
  auditoría. Asumido explícitamente por el fundador. `AUTO_WEB_AUDIT_ENABLED=false`
  es la salida de emergencia.
- **La ruta automática se salta la comprobación del límite, pero sí gasta el
  contador** (data-guardian R3a, 2026-08-04). `checkGenerationRateLimit` cuenta
  filas de `generated_solutions` y `checkSnapshotRateLimit` cuenta filas de
  `web_audit_snapshots`; la ruta automática no las consulta, pero **inserta
  igual las filas que se cuentan**. Con un escaneo diario es 1 de 5 y da igual.
  Con varios escaneos en un mismo día, «Auditar ahora» puede empezar a decir
  "has alcanzado el límite" por un presupuesto que el usuario no gastó.
  Separarlos de verdad exige un discriminador en esas tablas, es decir
  esquema: queda como coste conocido, no como algo que se nos pasó.
- **El gasto automático es 1:1 con los escaneos, y los escaneos de Pro+ no
  tienen tope diario** (data-guardian R3b). El plan Free está acotado por
  construcción (una única ejecución completada, `lib/scan/run-creation.ts`),
  pero en Pro+ la única puerta es `active_run_exists`. Antes el gasto de
  auditoría estaba topado en 5/día/proyecto pasara lo que pasara; ahora hereda
  un eje que ya era ilimitado. No es un eje **nuevo** de abuso —el escaneo en
  sí es lo caro y ya lo era—, pero el peor caso de un Pro lanzando escaneos en
  serie sube de 5 campañas/día a decenas. Recomendación de data-guardian, sin
  implementar por no ser mecánica aprobada: un techo automático generoso
  (~20/día/proyecto reutilizando `checkGenerationRateLimit` con otro `config`,
  sin tocar esquema) que convierta "ilimitado" en "acotado y aburrido".
- Ambos núcleos de auditoría se llaman con el cliente de servicio porque en
  esta ruta no hay sesión por construcción. Dicho con precisión, porque la
  formulación cómoda sería falsa: aquí el filtro
  `.eq("owner_user_id", user.id)` **es tautológico** — el `owner_user_id` se
  lee de la propia fila del proyecto y se devuelve como valor del filtro. Lo
  que protege el aislamiento es que **el `projectId` es derivado en servidor y
  jamás aceptado desde una petición**: sale de una fila de `jobs` creada por
  el ejecutor para una ejecución recién terminada, y `jobs.run_id` tiene FK a
  `scan_runs(id, project_id)`. `/api/cron/run-audit` no acepta ningún
  identificador de proyecto en su cuerpo, sólo `chainIndex`. Si algún día lo
  aceptara, hace falta una prueba de propiedad real (ver
  `.claude/rules/web-audit.md`).

## Alternativas descartadas

- **Llamar a la auditoría en línea al final del escaneo.** No cabe: el
  escaneo ya consume su presupuesto de 60 s, y la campaña de cobertura
  necesita varias peticiones más.
- **Repetir el bucle de primer plano desde un cron.** No resuelve nada — el
  problema no es quién conduce el bucle, sino que un fallo se tragaba en
  silencio.
- **Una tabla de cola propia.** `jobs` ya tiene backoff, intentos, claim
  atómico y último error. Duplicarla habría sido inventar un mecanismo
  paralelo para no ampliar un CHECK.
