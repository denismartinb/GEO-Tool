# Seguimiento de palabras (SEO-TRACK-1) — invariantes

Se inyectan solos al tocar `lib/seo-tracking/**` y `app/api/cron/seo-serp/**`.
Cada regla es trazable a `docs/brand/design-decisions-log.md` §340.

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
