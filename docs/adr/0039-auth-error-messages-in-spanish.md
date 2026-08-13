# ADR 0039 — Los errores de login y registro siempre en castellano

**Date:** 2026-08-12
**Status:** Accepted
**Deciders:** Founder + Director
**Fase:** AUTH-ERRORS-ES-1

---

## Context

Auditoría pedida por el fundador sobre los mensajes de error de login, registro
y regeneración de contraseña. `app/forgot-password/actions.ts` ya estaba
íntegramente en castellano. `app/login/actions.ts` y `app/signup/actions.ts`
solo traducían un código de error cada uno (`email_not_confirmed`,
`over_email_send_rate_limit`); cualquier otro código —incluidos los más
comunes, credenciales inválidas y usuario ya registrado— caía en un fallback
que mostraba **`error.message` de Supabase sin traducir**, en inglés
("Invalid login credentials", "User already registered"...).

Esto no era un descuido puntual: `login/actions.test.ts` y
`signup/actions.test.ts` tenían un test cada uno que **afirmaba ese
comportamiento a propósito** ("passes through other Supabase error messages
unchanged"). Además viola directamente `.claude/rules/server-actions.md`:
"No raw database/provider errors surfaced to the UI — map to safe messages."

## Decision

Ningún `error.message` crudo de Supabase llega nunca al usuario en login o
registro. Cada action mantiene un diccionario `Record<código, mensaje en
castellano>` y, para cualquier código no mapeado, cae a un mensaje genérico en
castellano — nunca al texto original del proveedor.

- `app/login/actions.ts` — `LOGIN_ERROR_MESSAGES` mapea `email_not_confirmed`
  e `invalid_credentials`; fallback: "No se pudo iniciar sesión. Inténtalo de
  nuevo."
- `app/signup/actions.ts` — `SIGNUP_ERROR_MESSAGES` mapea
  `over_email_send_rate_limit`, `user_already_exists` y `weak_password`;
  fallback: "No se pudo crear la cuenta. Inténtalo de nuevo."

Los tests que afirmaban el paso literal del mensaje en inglés se reescribieron
para afirmar lo contrario: que ese código concreto se traduce, y que cualquier
código no mapeado usa el fallback genérico en vez del texto del proveedor.

## Consequences

- Login y registro quedan alineados con `forgot-password`, que ya cumplía
  esto.
- Un código de error de Supabase todavía no visto en producción caerá en el
  mensaje genérico en vez de romper el idioma — más seguro que el
  comportamiento anterior, aunque menos específico para el usuario hasta que
  se observe y se añada su propio mapeo.
- No cubre el resto de la superficie de auth (`app/dashboard/settings/profile/actions.ts`,
  billing, etc.) — no se auditó en esta fase porque no estaba en el alcance
  pedido (login/registro/regeneración de contraseña).

## Referencias

`.claude/rules/server-actions.md` ("No raw database/provider errors") ·
`app/login/actions.ts` · `app/signup/actions.ts` · `app/forgot-password/actions.ts`
(precedente ya conforme).
