# Servidor MCP (Claude y ChatGPT) — invariantes

Se inyectan solos al tocar `lib/mcp/**`, `app/api/mcp/**`, `app/oauth/**`,
`app/.well-known/**`, `lib/page-review/**` y `lib/ext/project-data.ts`. Cada
regla es trazable a `docs/brand/design-decisions-log.md` §418.

- **Todas las herramientas son de solo lectura** (`readOnlyHint: true`,
  `destructiveHint: false`). Una herramienta que escriba es la Fase 4 y
  necesita su propio Task Intake aprobado.
- **Las herramientas de cuenta leen `loadExtProjectData`**, el mismo lector que
  el panel de la extensión. No se recalcula ninguna cifra en `lib/mcp/`: el
  formateo sólo pone en palabras lo que ya trae el payload.
- **El token OAuth se usa como cliente del propio usuario** (anon key +
  `Authorization: Bearer`), y RLS decide qué ve. Nunca service role para datos
  de cuenta. Un dominio que no es de la cuenta es «no encontrado».
- **Ningún texto vende**: ni precios, ni descuentos, ni enlaces de pago o de
  cambio de plan (directorio de ChatGPT). Sólo un enlace informativo a
  `/precios` en el aviso de solo lectura. Lo vigila `format.test.ts`, junto con
  rayas largas y versiones de modelo.
- **`lib/page-review/collect.cjs` y `score.cjs` no se editan a mano**: se
  regeneran con `node scripts/sync-page-review.mjs` desde la extensión y
  `sync.test.ts` falla si se separan.
- **`revisar_pagina` lee sólo la página pedida y su propio origen**, con
  `fetchOnDomain` (guarda SSRF) y como mucho `MAX_REQUESTS` peticiones. Nunca
  sigue enlaces a otras webs: eso sería un rastreador.
- **Cada revisión cuenta en `public_checks` antes de salir ninguna petición**
  (`engine = mcp_page`), y esas filas quedan fuera del techo del comprobador
  gratuito.
- **No se guarda la conversación.** PostHog recibe herramienta, cliente y si
  había cuenta; nunca argumentos, URL ni respuesta.
- **El 401 de una herramienta de cuenta lleva `WWW-Authenticate` con
  `resource_metadata`**: es lo que abre el flujo OAuth en los clientes.
- **La pantalla de consentimiento sólo redirige a lo que devuelve Supabase** y
  rechaza `javascript:` y `data:` (`safeRedirect`).
