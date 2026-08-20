# ADR 0040 — Detectar el primer login por `email_confirmed_at`, no por proximidad de `created_at`

**Date:** 2026-08-20
**Status:** Accepted
**Deciders:** Founder + Director
**Fase:** WELCOME-EMAIL-FRESHNESS-FIX-1

---

## Context

El fundador reportó que un registro nuevo no había recibido ni el correo de
bienvenida ni el correo de alerta interno de nuevo registro
(`sendNewSignupOpsAlertEmail`, vía `sendNewSignupOpsAlert`,
`lib/admin/signup-alert.ts`). El log de envíos de Resend confirmó que ninguno
de los dos correos se había ni siquiera intentado — no aparecía ningún intento
fallido, sólo ausencia total. En cambio, otros correos transaccionales
(confirmación de cuenta, fin de prueba Pro) sí se entregaban con normalidad,
descartando un problema de configuración de Resend.

Ambos correos comparten el mismo guard en `app/auth/callback/route.ts`:
`isFreshSignup(user)`, ejecutado tras `exchangeCodeForSession` — el paso que
completa el login cuando el usuario hace clic en el enlace de confirmación de
email (registro con contraseña y "Confirm email" ON) o entra por primera vez
con Google.

La implementación anterior comparaba `last_sign_in_at` con `created_at` y los
consideraba "el mismo evento" si estaban a menos de 5 segundos:

```ts
const NEW_USER_WINDOW_MS = 5000;
function isFreshSignup(user) {
  return Math.abs(lastSignInAt - createdAt) < NEW_USER_WINDOW_MS;
}
```

Esto funciona para OAuth, donde Supabase marca `created_at` y
`last_sign_in_at` casi en el mismo instante. Pero para un registro con
contraseña que requiere confirmación por email, `created_at` se marca en el
momento del `signUp()`, mientras que `last_sign_in_at` sólo se marca cuando el
usuario de verdad hace clic en el enlace — algo que casi nunca ocurre en menos
de 5 segundos en el mundo real (se tarda en abrir el correo). El guard
devolvía `false` casi siempre, así que ni el correo de bienvenida ni el de
alerta se llegaban a invocar — sin excepción, sin log, sin rastro en Resend.
Exactamente lo que reportó el fundador.

## Decision

Sustituir la señal de "registro recién creado" por una que no dependa de
cuánto tarde un humano en revisar su correo: comparar `email_confirmed_at`
con `last_sign_in_at`, no `created_at` con `last_sign_in_at`.

```ts
function isFreshSignup(user: {
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
}): boolean {
  if (!user.last_sign_in_at || !user.email_confirmed_at) return false;
  return Math.abs(
    new Date(user.last_sign_in_at).getTime() - new Date(user.email_confirmed_at).getTime()
  ) < NEW_USER_WINDOW_MS;
}
```

`email_confirmed_at` sólo se escribe **una vez**, en el instante en que la
cuenta confirma su email por primera vez — y ese es exactamente el mismo
instante en que este `exchangeCodeForSession` crea la primera sesión real
(`last_sign_in_at`). Da igual si el usuario tarda cinco segundos o cinco días
en hacer clic: los dos timestamps siempre caen juntos en esa primera
confirmación. Para un usuario que vuelve a entrar (OAuth recurrente,
magic link, recuperación de contraseña sobre una cuenta ya confirmada),
`email_confirmed_at` queda congelado en el pasado mientras `last_sign_in_at`
salta a "ahora" en cada login — los dos se separan y el guard sigue devolviendo
`false` para ellos, igual que antes.

No requiere columna nueva ni migración: `email_confirmed_at` ya lo expone
Supabase Auth en el objeto de usuario.

## Consequences

- El correo de bienvenida y el de alerta interna se envían ahora de forma
  fiable en el registro con contraseña + confirmación por email, sin importar
  cuánto tarde la persona en hacer clic.
- Un test nuevo (`app/auth/callback/route.test.ts`) cubre explícitamente el
  caso de latencia real (~11 minutos entre `created_at` y la confirmación) y
  sigue afirmando que un usuario que vuelve a entrar no dispara ninguno de los
  dos correos.
- No cubre un caso ya fuera de alcance: si Supabase alguna vez deja de marcar
  `email_confirmed_at` en el mismo request que `last_sign_in_at` (cambio de
  comportamiento del proveedor), el guard volvería a fallar en silencio — el
  mismo riesgo estructural que ya tenía la versión anterior, ahora apoyado en
  un campo distinto.

## Referencias

`app/auth/callback/route.ts` · `app/auth/callback/route.test.ts` ·
`app/signup/actions.ts` (camino de sesión inmediata, sin tocar) ·
`lib/admin/signup-alert.ts` · `lib/email/transactional.ts`
(`sendWelcomeEmail`, `sendNewSignupOpsAlertEmail`).
