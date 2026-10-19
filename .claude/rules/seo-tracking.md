# Seguimiento de palabras (SEO-TRACK-1) — invariantes

Se inyectan solos al tocar `lib/seo-tracking/**` y `app/api/cron/seo-serp/**`.
Cada regla es trazable a `docs/brand/design-decisions-log.md` §341.

- **Lo que se guarda es DataForSEO, nunca Search Console.** Las tablas `seo_*`
  guardan resultados públicos de Google vistos por DataForSEO. De Search
  Console solo puede llegar la palabra que el cliente decide vigilar. Guardar
  filas de Search Console sigue prohibido (`.claude/rules/search-console.md`).
- **Escribe el servidor con service role, siempre filtrando por `project_id` y
  `owner_user_id`.** Las funciones de `manage.ts` reciben ids ya verificados
  (`requireActiveProject` + `requireUser`) y vuelven a comprobar que el
  proyecto es de ese dueño. El cron descarta toda palabra cuyo
  `owner_user_id` no sea el dueño real del proyecto.
- **El cron es el motor.** Pasadas de 10 minutos que toman lo pendiente de la
  semana, con presupuesto y techo de gasto, nunca un tope de filas ni una
  cadena de auto-llamadas (`.claude/rules/scan.md`).
- **La semana se ancla al lunes UTC (`weekStartUtc`)**, una foto por palabra y
  semana, con escritura idempotente. Nunca «siete días desde la última».
- **Topes con el plan efectivo** (`resolveSystemPlanId` en el cron,
  `getPlanForUser` en las acciones). Un plan desconocido no tiene nada.
- **Lo que corta nuestro presupuesto no se guarda como error del
  proveedor.** Solo se guardan errores con categoría y texto propio
  (`errors.ts`), nunca el mensaje de DataForSEO.
- **`auth` y `balance` paran la pasada y avisan al operador una vez por
  semana**, nunca al cliente. No se guardan como error de la palabra, que
  sigue pendiente. La marca de `seo_tracking_alerts` se escribe sólo si el
  correo salió.
- **El interruptor `seo_tracking_enabled` sólo falla hacia encendido si falta
  la columna.** Cualquier otro error deja la pasada sin nada que buscar.
- **Los topes también rigen lo que se refresca de enlaces:** fila `is_own` más
  los rivales más antiguos hasta el tope del plan.
- **Dejar de vigilar es `tracked=false`, nunca borrar**: el borrado en cascada
  se lleva el historial de fotos.
- **Top 20 (`SERP_DEPTH`).** Subir la profundidad multiplica el coste por
  palabra: se mide antes y se apunta en el histórico.

## Pantalla (PR B, log §342)

- **«Qué hacer» sale de reglas, nunca de un LLM** (`topic-actions.ts`, pura).
  Cada paso cita su dato: Top 10, preguntas de Google, mapa local, URL y
  título propios, enlaces o CTR de Search Console. Nunca se lee el contenido
  de una página de terceros.
- **`seo_action_states` guarda sólo tema y clave del paso**, ni texto ni
  cifras. Las claves llevan el dato que identifica el caso (palabra, ruta,
  término) para que un paso nuevo no herede la marca de otro.
- **«Descubrir» cuesta: 5 búsquedas al día por cuenta**, compartidas por las
  dos fuentes de pago, contadas en `seo_discovery_runs` en cuanto la llamada
  llega a DataForSEO. Un rechazo antes de llamar no cuenta. Los resultados no
  se guardan.
- **Volver a añadir una palabra con `tracked=false` la recupera dentro del
  tope.** Añadirla a otro tema la mueve. Nunca se borra.
- **Sin migración, apagado o sin plan, la pantalla de Search Console sigue
  exactamente igual.** El bloque nuevo nunca sustituye a lo que ya había.
- **La primera foto se toma al guardar** (log §342, punto 8): las acciones
  que añaden palabras o rivales lanzan en `after()` la pasada del cron
  limitada a ese proyecto ya verificado. Es un acelerador, el motor sigue
  siendo el cron (`*/10 * * * *`), que sólo trabaja lo pendiente de la
  semana. Nunca una cadena de auto-llamadas.
- **El cliente no ve qué día se refresca.** Ningún texto dice «lunes» ni una
  hora; se habla de «la última foto» y «la foto anterior». Si la primera foto
  tarda, se dice que tarda, nunca que ha fallado.
