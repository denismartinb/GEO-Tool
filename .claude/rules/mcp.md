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

## Directorio de ChatGPT (MCP-CHATGPT-SUBMIT-1, log §430)

- **Lo que pide OpenAI va sólo en el perfil `chatgpt`** (`protocolOptionsFor`):
  inicio de sesión por herramienta con `_meta["mcp/www_authenticate"]`,
  scopes `openid` y `email`, y `outputSchema` con `structuredContent` siempre
  presente. El perfil `claude` no cambia sin volver a probarlo en Claude.
- **El paquete de `docs/chatgpt-plugin/package/` no lleva credenciales**: la
  cuenta de revisión se escribe en el portal. Una herramienta nueva entra en su
  descripción y, si cambia la ficha, se sube un ZIP nuevo.

## Plugin de WordPress (WP-PLUGIN-2, log §432)

- **`/api/ext/*` acepta el token OAuth del plugin** por `readExtRequestAccount`
  (`lib/ext/request-account.ts`), con `accountFromBearer`. Con cabecera
  `Authorization` decide sólo la cabecera, nunca la cookie. Sigue siendo sólo
  lectura y RLS del usuario.
- **`seoScore` de `/api/ext/project` es la nota del bloque SEO de la auditoría**
  (`buildExtAudits`), la «Salud SEO» de la consola, nunca `model.technical.score`
  («Diagnóstico técnico» de la Puntuación GEO). Lo vigila `summary.test.ts`
  (log §432, adenda 1.1.2).
- **Las próximas acciones son el plan de Visión general** (`selectPlanWithLevers`
  en `loadReportInput`), sin la tarjeta de Google (log §432, adenda «mismo plan»).
- **`check` y `urls` de cada problema de auditoría, y `draft` del plan, son
  para el plugin** (WP-PLUGIN-3, log §432 adenda 1.3.0): `urls` sólo lleva
  URL http(s), como mucho `EXT_AUDIT_URLS`, y vacía en lo que es de todo el
  sitio.
- **`type`, `rival`, `page` y `drivers` de cada acción del plan son para el
  plugin** (WP-PLUGIN-4, log §432 adenda 1.4.0): `page` sólo es una URL propia
  http(s) confirmada por la cobertura (`toExtPlanItem`); `rival` y `drivers`
  salen de `recommendationSubjects`, sin recalcular nada.
- **`draft` de una acción de cita sólo sin página propia** (WP-PLUGIN-4, log
  §432 adenda 1.4.1): con página, el plugin ofrece «Añadir dato» en ella; sin
  ella, borrador con sus preguntas (`isDraftable`).

## Elección de herramienta (MCP-CONNECTOR-TUNING-1, log §452)

- **Las instrucciones del servidor y las descripciones dirigen la elección**:
  «cómo está un dominio» va a las herramientas de cuenta, «recomendaciones»
  son siempre las de `ver_recomendaciones` (nunca productos ni compras), y
  tras un «no está en la cuenta» `revisar_pagina` sólo se ofrece. Lo vigila
  `app/api/mcp/route.test.ts` en las dos direcciones.
- **`tools_triggered` del paquete de ChatGPT es texto separado por comas**,
  como dice la especificación de OpenAI, y cada nombre es una herramienta real
  (`lib/mcp/chatgpt-package.test.ts`).

## Dominio fuera de la cuenta (MCP-CONNECTOR-TUNING-2, log §463)

- **La oferta de revisión va en la respuesta de la herramienta**, no sólo en
  instrucciones: `formatNotFound` y `listar_dominios` (con o sin `dominio`)
  dicen que no hay datos, dan el alta si cabe y ofrecen `revisar_pagina`
  «solo si lo pides», con `publicReview.run = "only_if_asked"`. ChatGPT no
  siguió la regla cuando sólo estaba en las instrucciones (§463).
- **Ninguna herramienta de cuenta ejecuta la revisión pública por su cuenta.**
