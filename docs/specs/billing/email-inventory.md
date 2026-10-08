# Auditoría de correos contra el contrato de 99 € (EMAIL-AUDIT-1)

Origen: comentario del Director en #549 (2026-10-08, «gate previo a lifecycle real»). Rama `feat/contract-99-local`.
**Nada se ha enviado ni activado**: sin Resend, sin envíos, sin configuración, sin SQL, sin Stripe. Esta auditoría lee código y fixtures.

## 0. Lo que se sabe y lo que NO

| Afirmación | Estado |
|---|---|
| Qué dicen y a quién envían los correos **según el código de esta rama** | **Verificado** leyendo el código y renderizando cada plantilla con datos ficticios (tests, previews) |
| El correo con la oferta antigua que mostró el dueño (Pro 59/179, Starter 19/45, 5 dominios, ~100 prompts, diario, escasez 31 oct) | **Coincide con el código de `main`** antes del contrato de 99 €. No se sabe qué versión estaba desplegada ni a qué destinatarios llegó |
| Valor **LIVE** de `LIFECYCLE_EMAILS_ENABLED`, de `EMAIL_UNSUBSCRIBE_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `OPS_ALERT_EMAIL`, y si la migración 0036 (`notify_lifecycle`, `notify_first_scan`) está aplicada | **unknown LIVE**. No hay acceso a Vercel/Resend/Supabase de producción desde aquí y no se ha buscado ninguno |
| Quién ha recibido ya algún correo real | **unknown LIVE** (no hay lectura de Resend) |

Cómo comprobar el alcance real **sin tocar nada** (lo hace el dueño): en Resend, *Emails* filtrado por asunto y fechas (solo
lectura, sin exportar direcciones a GitHub); en Vercel, solo **nombres** y alcance de las cuatro variables (no valores); en
Supabase, el recuento agregado `select count(*) from information_schema.columns where table_name='profiles' and column_name in ('notify_lifecycle','notify_first_scan')` (debe dar 2).

## 1. Mecánica común (código)

- Todo envío pasa por `sendEmail` (`lib/email/transactional.ts`): HTML generado por la app → `Resend.emails.send`. Sin `RESEND_API_KEY` no hace nada y devuelve `false`.
- Remitente: `RESEND_FROM_EMAIL`, y si falta, **`onboarding@resend.dev`** (dominio de pruebas de Resend).
- **Los correos comerciales de ciclo de vida** (primer escaneo listo, D1, D3, D5) solo salen si `LIFECYCLE_EMAILS_ENABLED === "true"` **y** hay secreto de baja (`isLifecycleEmailEnabled`). Sin secreto, jamás salen, valga lo que valga la variable.
- Preferencias (columnas de `profiles`): `notify_score_drop_alert`, `notify_weekly_digest`, `notify_first_scan`, `notify_lifecycle`. Son `boolean NOT NULL DEFAULT true`
  (migraciones 0020 y 0036): **por defecto el usuario está dentro** (opt-out). El código trata `!== false` como «dentro»; `null` no puede existir tras aplicar la migración.
  Si la 0036 **no** estuviera aplicada: el runner de D1/D3/D5 falla (`query_failed`, HTTP 500) y el de «primer escaneo» no encuentra perfil y **no envía nada** (falla cerrado).
- Excluidos siempre de la secuencia de prueba: cuentas con suscripción, *comped* (`COMPED_ACCOUNT_EMAILS`) y cuentas internas.
- Cron `lifecycle-emails`: diario 07:45 UTC (`vercel.json`), con `CRON_SECRET`.
- **Hallazgo (privacidad):** `sendEmail` escribe la **dirección del destinatario** en el log de error cuando Resend rechaza o falla (`console.error` con `to`). Eso son datos personales en los logs de Vercel. No se ha cambiado.

## 2. Inventario de correos al cliente

Columna «Contrato»: ✅ coincide con el contrato de 99 €/3 dominios/75/semanal; ⚠️ verdadero **hoy** pero contradice la prueba opt-in de 14 días o la gracia de 3 días (cambia con B5/B6); ❌ falso o retirado.

| Correo | Disparo (código) | Quién lo puede recibir | Puerta / flag | Contrato |
|---|---|---|---|---|
| Bienvenida | `app/signup/actions.ts` (si hay sesión al registrarse) y `app/auth/callback/route.ts` (primer inicio tras confirmar) con `isFreshSignup` | cualquier alta nueva, dirección escrita en el formulario/OAuth | **no depende de `notify_*`**; solo de que exista `RESEND_API_KEY`. El texto «te avisaremos 2 días antes» solo se escribe si el ciclo de vida está activo | ⚠️ «Tu prueba Pro · 7 días»: cierto mientras `handle_new_user` (0017) dé 7 días; **contradice** la prueba opt-in de 14 días |
| Plan confirmado | webhook Stripe `checkout.session.completed` y cambio de plan en `customer.subscription.updated` | email de facturación de la sesión de Checkout / `profiles.email` | sin flag; solo suscripciones reales | ✅ el nombre del plan viene de `PLANS` (hoy «Pro») |
| Fallo de pago | webhook `invoice.payment_failed` | **`invoice.customer_email` de Stripe** (puede diferir del email de cuenta) | sin flag | ⚠️ dice «Reintentaremos el cobro automáticamente en los próximos días» y **no** menciona la gracia de 3 días ni el modo solo lectura (B6 sin implementar: no puede prometerlo aún) |
| Cancelación programada | webhook `customer.subscription.updated` con `cancel_at` | `profiles.email` | sin flag | ✅ |
| Prueba terminada | `applyTrialExpiry` (`lib/billing.ts`), de forma **perezosa** cuando el usuario abre la consola con la prueba caducada | el propio usuario, `profiles.email` | sin flag | ⚠️ «Se acabaron tus 7 días de Pro»: depende del mismo 7 días |
| Aviso de caída de puntuación | `lib/scan/score-alert.ts` tras un escaneo | `profiles.email` | `notify_score_drop_alert !== false` | ✅ (no cita precios ni cuotas) |
| Resumen semanal | `lib/scan/weekly-digest.ts` (cron) | `profiles.email` de los dueños de proyectos | `notify_weekly_digest !== false` | ✅ |
| Cuenta eliminada | `app/dashboard/settings/profile/actions.ts` | el propio usuario | sin flag | ✅ |
| Primer escaneo listo | `lib/email/lifecycle/runner.ts` al terminar el primer escaneo | dueño del proyecto | ciclo de vida activo **y** `notify_first_scan !== false`, no excluido | ✅ |
| D1 «te falta un paso» | cron diario, ventana 20–72 h desde el alta | cuentas **con prueba en curso** | ciclo de vida activo, `notify_lifecycle !== false`, sin suscripción, no excluida, ≤1 correo/48 h, no lunes | ⚠️ «Te quedan N días de Pro» y ventanas colgadas de la fecha de **alta**: no valen para una prueba de 14 días que empieza tras el diagnóstico |
| D3 «primera acción» | ventana 72–120 h | ídem | ídem | ⚠️ ídem |
| D5 «quedan 2 días» | 36–60 h antes de `trial_ends_at` | ídem | ídem | ⚠️ ídem. **Corregido en esta rama:** ya no cita Starter, ni testimonio, y el precio dice «IVA incluido» |
| Recordatorio de confirmación | cron: altas con contraseña sin confirmar a las 20–44 h | cuentas no confirmadas | ciclo de vida activo (mismo cron) | ✅ lo envía Supabase (`auth.resend`), no usa nuestras plantillas |
| Alertas de operador (escaneo, LLM, vigilante, barrido, altas nuevas, cambios de automatización…) | varios puntos de `lib/scan`, `lib/llm`, `lib/admin`, `lib/web-audit` | **`OPS_ALERT_EMAIL`**, nunca el cliente | `isOpsAlertConfigured()` (destino **y** transporte) | n/a (no se renderizan aquí) |

## 3. Qué se encontró y qué se hizo

1. **Testimonio inventado (`nordikaQuote`, correo D5).** Nombre, empresa y una cifra de crecimiento, con el comentario «confirmed as real (log §146)». **El fundador confirmó el 2026-10-08 que era inventado**; el comentario era falso. **Retirado de todos los renders** del correo; **no se sustituye**, no se anonimiza y no se conserva la cifra. Un correo solo vuelve a llevar testimonio con el original y el permiso del cliente en el repositorio. La **portada pública** llevaba el mismo caso (cita, persona, dos imágenes, cifra): **retirada también** (ver §7).
2. **Starter en D5.** El correo podía ofrecer «Starter por N €/mes» (plan que ya no se ofrece) si su cadencia difería de la de Pro. **Retirado**; D5 ya no recibe una oferta de Starter y el runner no la calcula.
3. **Precio sin IVA.** El cuadro de precio de D5 decía «99 €/mes» sin «IVA incluido»; los precios públicos del contrato son con IVA incluido. **Corregido.**
4. **Test de contrato sobre todos los renders** (`lib/email/email-claims.test.ts`): ningún precio antiguo (59/179/449/19/45 €), ningún plan retirado (Starter/Agencia), ninguna cuota antigua (5 dominios, ~100 prompts), ninguna cadencia diaria, ninguna fecha límite 31 de octubre, ningún testimonio, **solo el precio 99 €**, pie de baja en los comerciales y «IVA incluido» en D5. Probado por mutación: reintroducir cada defecto lo hace fallar.
5. **Lo que NO se ha corregido (depende de decisiones/esquema):**
   - Bienvenida, «prueba terminada», D1/D3/D5: dicen **7 días** y cuelgan de la fecha de alta; la prueba aprobada es de **14 días, opt-in, sin tarjeta, tras el diagnóstico completo**. Un test fija hoy el «7 días» **con un comentario** que obliga a cambiarlo junto con B5: **que ese test esté en verde no es un aval del texto**.
   - Fallo de pago: no menciona la gracia de 3 días ni la lectura solo (B6).
   - `sendEmail` registra la dirección del destinatario en los logs.
   - Remitente por defecto `onboarding@resend.dev` si falta `RESEND_FROM_EMAIL`.
   - La bienvenida no respeta ninguna preferencia (es transaccional); ninguna de las preferencias existentes la cubre.

## 4. Propuesta (no implementada)

- **Antes de activar `LIFECYCLE_EMAILS_ENABLED` con usuarios reales:** B5 (la prueba y sus fechas) o, mientras tanto, mantener el ciclo de vida apagado. Con la bandera apagada hoy salen la bienvenida (con «7 días»), el aviso de prueba terminada y los correos de Stripe: **la bienvenida y «prueba terminada» ya describen una prueba que el contrato cambia**.
- Reencuadrar D1/D3/D5 sobre `trial_ends_at` y el inicio real de la prueba, no sobre `created_at`.
- Texto de fallo de pago cuando B6 exista: gracia de 3 días y solo lectura hasta pagar.
- No registrar `to` en `sendEmail`.

## 5. Previews seguros

`docs/specs/billing/evidence/email-audit/` (14 correos, `.html` y `.png` a 640 px): datos ficticios (`ejemplo-marca.test`, «Competidor de ejemplo»), **sin destinatario**, y **todo enlace absoluto sustituido por `#`**, de modo que no hay enlaces de baja firmados ni tokens. Se regeneran con
`EMAIL_PREVIEW_DIR=<ruta> pnpm vitest run lib/email/email-claims.test.ts` y `node docs/specs/billing/evidence/email-audit/capture.cjs`.
**Límite:** la imagen de cabecera es remota y las capturas se hicieron sin red, así que sale rota; no es un defecto de la plantilla. Los PNG no demuestran cómo se ve en Gmail/Outlook.

## 6. Qué no se ha hecho

Ninguna llamada a Resend ni a Supabase, ninguna lectura de configuración de producción, ninguna activación de variable, ningún envío de prueba, ningún cambio de SQL. No se ha usado Resend para el editor ni para *outreach*.

## 7. Testimonio inventado: retirada en todo el repositorio y auditoría de otras afirmaciones de clientes

Retirado (rama `feat/contract-99-local`, **pendiente de merge y despliegue, que son del dueño**): la sección de la portada
(`components/landing/landing-page.tsx`), `public/home/nerea.webp`, `public/home/nordika-home.webp`, los estilos `.lp-testi*`
de `app/globals.css`, `nordikaQuote` y sus tests. Rectificados: log §146 (que lo daba por real; se conserva el texto y se
marca como falso), los README de `docs/design-reference/home-2026-08/` y `lifecycle-emails-1/`, el comentario de código
y la celda de zona de CLAUDE.md. Vigilancia: `tests/no-invented-customer-claims.test.ts`.

**Conservado a propósito:** los artboards `.dc.html` de `docs/design-reference/` (home, plantillas de correo y un diseño
descartado) siguen conteniendo la sección. Son artefactos históricos de diseño, no contenido del producto; se anotó en sus
README que no son fuente. Reescribirlos es borrar historia: decisión del dueño.

**Auditoría del resto del contenido** (`app/`, `components/`, `lib/`, `public/`; búsqueda de casos de éxito, «nuestros
clientes», testimonios, logos, reseñas, cifras de crecimiento):
- Sin otros testimonios, logos de clientes, reseñas ni `aggregateRating` (el esquema SEO lo dice expresamente).
- Las cifras del blog son de terceros **con fuente** (p. ej. Conductor 2026) o dicen «no hemos medido»; no he verificado
  cada cita de cada artículo, solo que no hay cifras de clientes propios.
- **Hallazgo abierto (no tocado):** la demo de la portada usa **marcas reales** (IKEA, Leroy Merlin, Kave Home, Maisons du
  Monde, El Mueble) con **cifras ilustrativas inventadas**, declaradas «ilustrativas» solo en comentarios de código
  (decisión del fundador del 2026-08-22); no encontré un rótulo visible para el visitante. Es la misma clase de riesgo
  (métricas inventadas, ahora atribuidas a marcas reales). Agrava el caso que el titular de esa sección dice «Esto es
  exactamente lo que tienes el primer día. Sin demos preparadas» justo encima de una maqueta de `ikea.es` con cifras de
  ejemplo (visto en el render local de la rama). Decisión del dueño: rotular visiblemente («datos de
  ejemplo»), usar marcas ficticias o dejarlo.
- Los fixtures de tests y de los previews usan nombres ficticios etiquetados (`ejemplo-marca.test`).