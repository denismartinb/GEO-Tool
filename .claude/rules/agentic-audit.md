---
description: Invariantes del comprobador y la landing de comercio agéntico.
paths:
  - "lib/agentic-audit/**"
  - "app/comercio-agentico/**"
  - "app/api/comercio-agentico/**"
  - "components/agentic/**"
  - "app/dashboard/projects/*/agentic-audit/**"
---

# Comercio agéntico — invariantes

Se inyectan solos al tocar `lib/agentic-audit/**`,
`app/comercio-agentico/**`, `app/api/comercio-agentico/**`,
`components/agentic/**` y `app/dashboard/projects/*/agentic-audit/**`. Cada
regla es trazable a `docs/adr/0043-agentic-visibility-score.md` o a
`docs/brand/design-decisions-log.md` §317, §318, §319, §322 y §323.

- **Nunca nos hacemos pasar por un agente.** Se pide como el bot de GenScore
  (`AUDIT_USER_AGENT`). Los anti-bots verifican a los agentes reales por IP o
  firma, así que copiar su user-agent no da su respuesta. El reto se cuenta
  como «tu web pone un reto a las visitas automáticas», nunca como «ChatGPT
  está bloqueado». El acceso por asistente sale sólo de robots.txt.
- **La lista de URLs es fija y del propio dominio.** La página que da el
  visitante, robots.txt, sitemap.xml, cuatro ficheros `/.well-known/` y, en
  Shopify o WooCommerce, una URL de catálogo (`interopProbePaths`). Ni un
  enlace seguido: eso sería un crawler, prohibido sin aprobación. Lo fija
  `run-audit.test.ts`. El checkout no se recorre: Compra mide sólo la ficha.
  **Única excepción, sólo en la consola** (fundador, 2026-10-17, log §323):
  con `discover`, si la página no es una ficha, se pide **exactamente una**
  página más, la que `find-product.ts` saca de bytes ya descargados
  (catálogo, `<loc>` del sitemap, JSON-LD o enlaces de la página). Mismo
  dominio o subdominio, mismo guardián SSRF, nunca un índice de sitemaps ni
  un segundo intento. El comprobador gratuito no usa `discover`.
- **El guardián SSRF se importa de `lib/web-audit/fetch-page.ts`.** Cada salto
  de redirección se verifica antes de seguirlo, sólo https, nada de IP
  literales, sólo el dominio y sus subdominios.
- **Los pesos son del fundador**: 30/30/20/20 (`COMPONENT_WEIGHTS`), y dentro
  de cada componente los checks suman 100. Cambiarlos mueve todos los
  resultados y pide adenda al ADR 0043.
- **`unknown` no suma ni resta.** Lo que no pudimos medir se queda fuera de
  los dos lados. Un bloqueo a nuestra petición nunca puede leerse como fallo
  de la tienda: un reto anti-bots a nuestro robot es `unknown`, no `fail`
  (log §319), porque un agente verificado o con navegador puede pasarlo.
- **Siempre salen los cinco componentes** (fundador, log §319). El que no se
  puede medir lleva el círculo vacío y dice por qué; nunca desaparece.
- **Sin ficha de producto no hay nota total.** Comprensión y Compra se miden
  en una ficha; una portada no las suspende por no tener producto.
- **Interoperabilidad es «N de 4» y no entra en la nota.** Nunca se escribe
  «sin puntos» ni «informativo» (fundador, 2026-10-17). Un feed que no se ve
  desde fuera es `unknown`, nunca `absent`.
- **El comprobador cuenta en `public_checks` con `engine = 'agentic'`** y sus
  propios límites (`AGENTIC_CHECK_LIMITS`). El comprobador de ChatGPT excluye
  esas filas: uno no puede gastar los límites del otro. La fila se escribe
  antes de salir a la red y los límites fallan cerrado.
- **La landing dice que Pro ya tiene la auditoría agéntica** desde la Fase
  2a (log §322): «La auditoría agéntica ya está en la consola de Pro» y la
  tarjeta lleva «Nuevo». Lo que aún no existe («Preguntas de compra», varias
  fichas a la vez) lleva «Próximamente». No se anuncia nada de 2b–2d hasta
  que esté en producción.
- **La animación del comprobador sólo escenifica el ritmo** (log §318).
  Antes de la respuesta, sólo las URL que el servidor pide de verdad
  (`scan-script.ts` las saca de `interopProbePaths` y `ASSISTANT_ROBOTS_TOKENS`).
  Después, cada dato y cada estado salen de la respuesta. Nunca un porcentaje
  ni un valor de ejemplo. Si el motor añade o quita una comprobación, el guion
  cambia con él.
- **`facts` es texto de terceros.** Se limpia y se recorta en
  `page-facts.ts` y se pinta sólo como texto, nunca como HTML.

## Consola: «Auditoría agéntica» (Fase 2a, log §322)

- **Propiedad antes que nada.** `runConsoleAgenticAuditCore` comprueba con
  el cliente del usuario que el proyecto es suyo; sólo entonces escribe con
  service role, siempre filtrando por `project_id` y `owner_user_id`. El
  dueño sólo lee `agentic_audits` (RLS).
- **El plan falla cerrado.** `isProOrAbove(resolveSystemPlanId(perfil))`;
  sin perfil no se revisa. Nunca `getPlanForUser`, que cae a Pro.
- **Sólo el dominio del proyecto o un subdominio** (`isSameOrSubdomain`).
- **La fila se escribe antes de salir a la red**, y el límite (5 por
  proyecto cada 24 h) cuenta todas las filas, también las fallidas. Si no se
  puede contar, no se revisa.
- **Sin la migración 0043 la pantalla dice que no está disponible todavía**,
  nunca un error ni un 404.
- **Nada por agente salvo robots.txt.** La consola no afirma cómo responde
  la web a cada agente: ni lo medimos ni podemos sin hacernos pasar por él.
- **Los checks no enseñan puntos**, sólo estados. «Subes a N» sale de
  `scoreIfChecksPass`, nunca de sumar ganancias.

## Consola automática (log §323)

- **Nadie pega una URL para empezar.** La revisión corre sola tras cada
  escaneo (`runScheduledAgenticAudit`, desde `audit-job-runner.ts`, como
  mucho cada 20 h por proyecto) y al abrir la pantalla sin revisión o con una
  de más de 48 h (`shouldAutoReview`). No hay «Revisar ahora»; «Elegir otra
  ficha» sí, y cuenta en el tope de 5 al día como cualquier revisión.
- **Corre en paralelo con la auditoría técnica y nunca hace fallar el
  trabajo.** Su peor caso (`AGENTIC_STEP_MAX_MS`) cabe en
  `TECHNICAL_RESERVE_MS`; si el motor gana tiempo, ese test manda.
  El plan se lee con `resolveSystemPlanId` con service role y los ids del
  propio trabajo, nunca de fuera.
- **La misma ficha mientras exista**, y una búsqueda nueva desde la portada
  sólo si esa ficha responde rápido con error, dentro del mismo presupuesto
  de `AGENTIC_DISCOVER_BUDGET_MS`.
- **Sin tienda no hay nota.** `found: "none"` dice «No hemos encontrado una
  tienda en tu web», y Comprensión y Compra salen «En una ficha», nunca
  como suspenso.
- **La espera es un spinner.** «Buscando una ficha de producto en tu
  tienda», sin pasos ni porcentajes: nada sabe por dónde va.
