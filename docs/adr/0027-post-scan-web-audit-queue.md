# ADR 0027 — La auditoría web se ejecuta en backend tras cada escaneo, por cola

- **Estado:** aceptada (AUDIT-AFTER-SCAN-1, aprobada por el fundador 2026-08-04)
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
- Ambos núcleos de auditoría se llaman con el cliente de servicio porque en
  esta ruta no hay sesión por construcción. La propiedad **no** se debilita:
  siguen filtrando por `.eq("owner_user_id", user.id)` contra el propietario
  real leído de la fila del proyecto, y el resto de consultas se acotan al
  mismo `projectId` ya demostrado.

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
