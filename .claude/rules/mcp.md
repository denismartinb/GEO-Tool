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
- **Ningún texto vende fuera de `que_es_genscore`**: ni precios, ni
  descuentos, ni enlaces de pago o de cambio de plan. Sólo un enlace
  informativo a `/precios` en el aviso de solo lectura. Lo vigila
  `format.test.ts`, junto con rayas largas y versiones de modelo. Las
  excepciones de captación están abajo (log §425).
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

## Siguiente paso (MCP-NEXT-STEPS-1, log §422)

- **Ninguna respuesta acaba en un callejón.** Si el siguiente paso vive en la
  consola, la respuesta lleva el enlace (relleno si sabemos el dominio); si no
  hay nada que hacer, dice por qué. Lo vigila `scenarios.test.ts`: un estado
  nuevo de una herramienta entra con su escenario.
- **Los enlaces también van en `structuredContent`**: hay clientes que sólo
  enseñan el objeto estructurado.
- **`?dominio=` sólo rellena el asistente**, validado con `isWellFormedDomain`;
  no guarda nada. Una cuenta sin hueco en el plan no recibe enlace al alta.
- **Sin cuenta, ninguna respuesta enlaza a `/dashboard/`.**

## Captación (MCP-ACQUISITION-1, log §425)

- **Dos direcciones, un manejador** (`lib/mcp/http.ts`): `/api/mcp` es el
  perfil `claude` y `/api/mcp/chatgpt` el perfil `chatgpt`. Cada una tiene su
  metadata en `/.well-known/oauth-protected-resource<ruta>`.
- **En ChatGPT nada nombra un precio, un plan, la prueba ni un descuento**
  (normas de apps de OpenAI), ni en el texto ni en `structuredContent`, y no
  se llama a Stripe. Sólo un enlace informativo a `/precios`. Lo vigilan
  `acquisition.test.ts` y `route.test.ts`.
- **En Claude, planes y precios sólo en `que_es_genscore`, y sólo cuando la
  persona pregunta.** Los precios salen de `SELLABLE_PLANS`; el precio
  fundador, sólo si `getFounderOffer` lo confirma. Nunca un enlace a checkout.
- **El gancho es una línea, sólo sin cuenta** (`measureHook`), con el alta
  rellena (`/signup?dominio=`) cuando sabemos el dominio.
- **Todo enlace público lleva `utm_source=<perfil>&utm_medium=mcp` y la
  herramienta como campaña** (`publicUrl`). Los de la consola no.
- **`buscar_guias` sólo responde con lo que dicen nuestras guías**, con su
  enlace; sin coincidencia lo dice y enlaza al blog. El texto sale de
  `lib/mcp/guides/blog-index.json`, generado del MDX; título y fecha, de
  `BLOG_POSTS`. Sin embeddings ni base vectorial: búsqueda por palabras, sin
  coste por consulta.

## Prompts (MCP-PROMPTS-1, log §428)

- **`ver_prompts` junta la lista activa con la matriz del último escaneo**
  (`buildExtPrompts`). Un prompt sin escanear es «pendiente», nunca «no te
  nombra»; la mención no se recalcula, sale de `buildReportModel`.
