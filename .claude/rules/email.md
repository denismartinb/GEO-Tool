---
description: Invariantes de los correos al cliente, sus categorías y la baja.
paths:
  - "lib/email/**"
  - "app/baja/**"
  - "app/api/email/**"
---

# Correos al cliente y baja

Se inyectan solos al tocar el envío de correos, la página `/baja` o la ruta de
baja en un clic. Cada regla es trazable a un documento — una regla que nadie
puede justificar es peor que ninguna, porque una sesión futura la obedecerá
igual.

- **Todo correo al cliente pertenece a UNA categoría de
  `lib/email/categories.ts`, y la categoría decide la baja, no la plantilla.**
  `service` (alta, facturación, cambios de plan, borrado) no se puede
  desactivar porque es lo que la cuenta necesita para funcionar; el resto
  —`score_drop`, `weekly_digest`, `first_scan`, `lifecycle`— se corresponde
  con una columna de `profiles` y lleva pie de baja y cabeceras
  `List-Unsubscribe` vía `optionalEmailEnvelope`
  (`docs/brand/design-decisions-log.md` §232). Un correo opcional nuevo
  añade su categoría ahí, con su columna y su texto, en el mismo PR.
- **Un correo que incluye una oferta ya no es sólo de servicio.** El fin de
  prueba con precio de lanzamiento lleva baja aunque su motivo principal sea
  informativo (§232).
- **Nunca un correo comercial sin una baja que funcione.** Sin
  `EMAIL_UNSUBSCRIBE_SECRET` no se firma ningún enlace; los avisos que el
  cliente pidió caen al pie de Ajustes de siempre, pero la categoría
  `lifecycle` no se envía en absoluto (§232; art. 21 LSSI).
- **Darse de baja no puede exigir sesión, y por eso el token ES la
  identidad.** HMAC de `(cuenta, categoría)` con versión (`v1:`), sin tabla ni
  caducidad: un enlace de un correo de hace seis meses tiene que seguir
  funcionando. `verifyUnsubscribeToken` es la quinta puerta de identidad de
  `tests/service-role-identity.test.ts`, y sólo autoriza
  `setEmailPreferenceAsService`: una columna de preferencia de esa cuenta,
  nada más. Rotar el secreto invalida todos los enlaces ya enviados.
- **Un GET nunca da de baja a nadie.** Los antivirus y las vistas previas
  abren enlaces solos. El pie lleva a `/baja`, que pide confirmar; la ruta
  `/api/email/unsubscribe` sólo aplica en POST (RFC 8058, el botón de Gmail) y
  un GET redirige a `/baja` (§232).
- **Cada cambio de preferencia deja fila en `email_preference_events`**, venga
  de Ajustes, del enlace o del botón del cliente de correo. Es la única prueba
  de que una baja se respetó. Se escribe DESPUÉS del flag, y si falla se
  registra en el log sin deshacer la baja que la persona pidió.
- **La base legal de los correos de ciclo de vida es la relación contractual
  y el interés legítimo, no un consentimiento** (fundador, 2026-09-28, §232):
  el alta informa, sin casilla, y la baja está en Ajustes y en cada correo.
  No se reescribe como "aceptas recibir…" dentro de las condiciones: un
  consentimiento metido en las condiciones generales no vale como tal para el
  RGPD.
- **Las alertas de operador nunca van al cliente** (`OPS_ALERT_EMAIL`); regla
  heredada de `.claude/rules/scan.md`.
- **Nada con forma de comentario JSX dentro de un template literal de HTML.**
  `wrap(...)` no es JSX: `{/* … */}` sale tal cual en la bandeja del cliente
  (log §202).
- **Los correos de la prueba no salen sin su interruptor.** Todo lo de
  `lib/email/lifecycle/` pasa por `isLifecycleEmailEnabled()`
  (`LIFECYCLE_EMAILS_ENABLED` + secreto de baja); el ejecutor ni siquiera
  programa el correo de primer escaneo con el interruptor apagado (§233).
- **Las reglas de envío viven en `decideTrialEmail`, que es pura.** Una regla
  nueva (ventana, silencio, prioridad) se escribe ahí y se prueba ahí; el
  runner sólo lee datos y ejecuta la decisión (§233).
- **Un envío se anota en `email_sends` sólo si Resend lo aceptó.** Anotar
  antes convierte un fallo de envío en un correo perdido para siempre (§233;
  misma regla que el deduplicado de avisos de `.claude/rules/scan.md`).
- **Cifras de verdad o variante sin cifra.** Menciones sobre respuestas, no
  sobre prompts; la Puntuación GEO con `resolveGeoScore`; precios de `PLANS`
  y promo sólo si `getActivePromoPlanIds()` la incluye. Ninguna plantilla
  tiene un número por defecto (§233, §183, §182).
- **Todo texto que viene de fuera va por `escapeHtml`**: dominio, nombre de
  competidor, título y descripción de una recomendación (§233).
- **Recordar la confirmación es reenviar la de Supabase, una vez.**
  `auth.resend({ type: "signup" })` con el mismo `emailRedirectTo` del alta,
  dentro de una ventana de 24 h que el cron diario pisa una sola vez. No se
  construye un enlace propio de confirmación: el flujo tras el clic tiene que
  ser el de siempre (§234).
- **El fin de prueba se envía una vez, gane quien gane.** El cron y
  `applyTrialExpiry` comparten `sendTrialEndEmailOnce`, que decide y anota en
  `email_sends`; con el interruptor encendido, la consola ya no manda su
  plantilla antigua. Antes sólo salía cuando la persona volvía, y quien no
  volvía no recibía nada (§238).
- **La recuperación (D+3, D+10) se ancla al envío del fin de prueba, nunca a
  `trial_ends_at`**, que la consola borra al degradar (§238).
- **Nada personal en la secuencia automática.** La variante del D+10 firmada
  por el fundador no existe a propósito (fundador, 2026-10-09: evitar el
  contacto personal, §238). Sin plazas de precio fundador, no hay D+10.
- **Un tipo nuevo en `email_sends` necesita migración**: 0037 fija `kind` con
  un `check` (0038 lo amplió, §238). El test de `winback-schedule.test.ts`
  comprueba que la migración permite todos los tipos que se anotan.
- **El último aviso de la prueba (`trial_d5`) sale el último día, 12–36 h
  antes del final, y con escaneo lleva el informe** (§254). El informe del
  correo sale de `buildReportModel` y cumple `.claude/rules/report.md`. Se
  escapa todo lo que viene del escaneo, porque aquí no hay React. Si no se
  puede cargar, el correo sale sin informe, nunca deja de salir. El proyecto
  sale de la consulta por `owner_user_id` del destinatario: el cliente de
  servicio no tiene RLS que lo proteja.
- **Un enlace del correo a una página con sesión pasa por `/login?next=`**, y
  `next` sólo se acepta tras `safeNextPath` (§254). Así quien no tiene la
  sesión abierta aterriza donde pidió y no en el panel.
