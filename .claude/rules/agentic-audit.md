---
description: Invariantes del comprobador y la landing de comercio agéntico.
paths:
  - "lib/agentic-audit/**"
  - "app/comercio-agentico/**"
  - "app/api/comercio-agentico/**"
  - "components/agentic/**"
  - "app/dashboard/projects/*/agentic-audit/**"
  - "app/dashboard/projects/*/agentic-visibility/**"
  - "app/dashboard/projects/*/_components/agentic-overview-card*"
---

# Comercio agéntico — invariantes

Se inyectan solos al tocar `lib/agentic-audit/**`,
`app/comercio-agentico/**`, `app/api/comercio-agentico/**`,
`components/agentic/**`, `app/dashboard/projects/*/agentic-audit/**`,
`app/dashboard/projects/*/agentic-visibility/**` y la tarjeta de Visión
general (`_components/agentic-overview-card*`). Cada
regla es trazable a `docs/adr/0043-agentic-visibility-score.md` o a
`docs/brand/design-decisions-log.md` §317, §318, §319, §322, §323, §325, §332, §340 y §407.

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
- **Qué página extra se pide lo decide `findDiscoveryCandidate`, y sólo
  cambia el orden, nunca el número** (log §407). En un escaparate
  (`looksLikeStorefront`: plataforma, carrito o tarjetas de producto) va
  primero una ficha; fuera de él, el enlace del menú a precios. Los precios
  impresos solos no hacen escaparate. Nunca se elige ayuda, legal, carrito
  ni un fichero. Un evento va el último.
- **Un producto agotado no suspende el botón de compra** (log §407). Si
  todas sus ofertas dicen `OutOfStock`, `SoldOut` o `Discontinued`,
  `add_to_cart` es `unknown`: «Avísame» es el botón correcto.
- **El guardián SSRF se importa de `lib/web-audit/fetch-page.ts`.** Cada salto
  de redirección se verifica antes de seguirlo, sólo https, nada de IP
  literales, sólo el dominio y sus subdominios.
- **Los pesos son del fundador**: 30/30/20/20 (`COMPONENT_WEIGHTS`), y dentro
  de cada componente los checks suman 100 en un producto físico (en otros tipos,
  lo que no aplica sale de la cuenta, §325). Cambiarlos mueve todos los
  resultados y pide adenda al ADR 0043.
- **`unknown` no suma ni resta.** Lo que no pudimos medir se queda fuera de
  los dos lados. Un bloqueo a nuestra petición nunca puede leerse como fallo
  de la tienda: un reto anti-bots a nuestro robot es `unknown`, no `fail`
  (log §319), porque un agente verificado o con navegador puede pasarlo.
- **Siempre salen los cinco componentes** (fundador, log §319). El que no se
  puede medir lleva el círculo vacío y dice por qué; nunca desaparece.
- **Sin página de venta no hay nota total.** Comprensión y Compra se miden
  en una página que vende algo (`classifyOffer`); una página que no vende
  nada no las suspende.
- **Interoperabilidad es «N de 4» y no entra en la nota.** Nunca se escribe
  «sin puntos» ni «informativo» (fundador, 2026-10-17). Un feed que no se ve
  desde fuera es `unknown`, nunca `absent`.
- **El comprobador cuenta en `public_checks` con `engine = 'agentic'`** y sus
  propios límites (`AGENTIC_CHECK_LIMITS`). El comprobador de ChatGPT excluye
  esas filas: uno no puede gastar los límites del otro. La fila se escribe
  antes de salir a la red y los límites fallan cerrado.
- **La landing dice que Pro ya tiene la auditoría agéntica** desde la Fase
  2a (log §322): «La auditoría agéntica ya está en la consola de Pro» y la
  tarjeta lleva «Nuevo». Lo que aún no existe (varias fichas a la vez) lleva
  «Próximamente»; «Preguntas de compra» lo perdió al llegar (§332). No se
  anuncia nada de 2b–2c hasta que esté en producción.
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
- **La fila se escribe antes de salir a la red**, y los límites cuentan
  también las filas fallidas. Si no se puede contar, no se revisa. Son dos
  (§325): 5 al día las que pide el cliente («Elegir otra página») y 30 al día
  las automáticas (`AGENTIC_AUTO_DAILY_LIMIT`). Una automática lleva
  `{ automatic: true }` en `result` desde el insert; una fila sin la marca
  cuenta como del cliente.
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
  página» sí, con su tope de 5 al día.
- **Si la última revisión no encontró nada, cada visita la relanza**
  (fundador, 2026-10-18, §325), con la separación de 10 minutos
  (`AGENTIC_SCREEN_MIN_GAP_MS`) y detrás de la escena de búsqueda, nunca
  enseñando el «none» viejo mientras corre. Sin eso la pantalla se quedaba
  bloqueada dos días.
- **Corre en paralelo con la auditoría técnica y nunca hace fallar el
  trabajo.** Su peor caso (`AGENTIC_STEP_MAX_MS`) cabe en
  `TECHNICAL_RESERVE_MS`; si el motor gana tiempo, ese test manda.
  El plan se lee con `resolveSystemPlanId` con service role y los ids del
  propio trabajo, nunca de fuera.
- **La misma ficha mientras exista**, y una búsqueda nueva desde la portada
  sólo si esa ficha responde rápido con error, dentro del mismo presupuesto
  de `AGENTIC_DISCOVER_BUDGET_MS`.
- **Sin nada a la venta no hay nota.** `found: "none"` dice «No hemos
  encontrado qué vendes en tu web», y Comprensión y Compra salen «Al
  vender», nunca como suspenso (§325).
- **La espera es ambiente.** «Buscando qué vendes en tu web» con
  `AgenticLoadingScene`: ni pasos, ni porcentajes, ni datos de la web, porque
  nada sabe por dónde va. Quieta con movimiento reducido (§325).

## Lo que vendes (log §325)

- **Detectar de más.** `classifyOffer` reconoce producto físico, software,
  servicio, curso, reserva, entradas, suscripción y la red de seguridad
  `offer` (precio y botón de compra). Ante la duda, cuenta. La excepción: en
  una plataforma de tienda, una página que no es ficha no cuenta por ruta ni
  por red de seguridad.
- **Lo que no aplica no resta.** Stock (físico y entradas), identificadores y
  envío (sólo físico), pagos rápidos (no en servicios ni reservas) salen de
  la lista según `offerKind`. Los pesos 30/30/20/20 no cambian.
- **Sigue siendo una sola página más.** `findSellCandidate` sólo se usa si
  `findProductCandidate` no da nada, y saca la página de los mismos bytes.
- **`pageKind: "product"` significa «vende algo».** No se renombra: las
  revisiones guardadas sin `offerKind` se leen como producto físico.

## Preguntas de compra y Visibilidad en agentes (log §332)

- **Una pregunta de compra se reconoce con una regla fija, sin IA**
  (`classifyPurchaseQuestion`). Dónde comprar o contratar, precio, o qué
  elegir para comprarlo; nunca el cómo, el qué es, las diferencias o las
  opiniones salvo que también pidan dónde o cuánto. Cambiar la regla cambia
  todas las cifras: se vuelve a medir sobre preguntas reales y se anota en el
  histórico. La pantalla dice qué cuenta (`PURCHASE_RULE_SENTENCE`).
- **Las tres cifras salen del último escaneo y de sus dueños.** La mención es
  `extracted_json.brand.mentioned`; «Citan tu web» sólo cuenta citas de
  grounding de tu dominio (`isBrandDomain`) y sólo en motores de
  `GROUNDED_PROVIDERS`: Claude sale como «No busca en la web», nunca como 0%.
  Una respuesta sin extracción no entra. No suman 100.
- **Marketplace es una lista fija** (`MARKETPLACES`), por dominio citado o
  por nombre como palabra con su mayúscula. Tu propio marketplace no cuenta.
- **Por debajo del suelo** (`PURCHASE_MIN_QUESTIONS`, `PURCHASE_MIN_ANSWERS`)
  se listan las preguntas, pero no sale ningún porcentaje.
- **«Te encuentra» no lleva color**: nada dice qué porcentaje es bueno.
- **Preguntas de compra no entra en la Visibilidad agéntica ni en la
  Puntuación GEO.** Los pesos 30/30/20/20 no cambian.
- **Dos entradas de menú, dos aspectos** (fundador, 2026-10-18, §332):
  «Visibilidad en agentes» es el resumen con el aspecto del prototipo
  (`av-*`) y «Auditoría agéntica» la pantalla técnica de la 2a. No se juntan
  en pestañas. Las tarjetas de componente enlazan a la auditoría con
  `?componente=`, que la página valida contra la lista fija.
- **«Qué hacer primero» no enseña puntos por arreglo**, aunque el prototipo
  los pintara: la cifra es la de la franja, de `scoreIfChecksPass`.
- **La URL revisada sólo se enseña cuando algo no fue bien.** Con la página
  leída y con nota, la tarjeta dice «Tienda analizada» con un check; sin
  lectura o sin nota, «Página revisada» con la URL (log §332).

## Tarjeta en Visión general (log §340)

- **La tarjeta la decide `overviewAgenticCard`, y sólo ella.** Pro, Agencia y
  la prueba la ven con una revisión que encontró algo que vendes y tiene nota;
  si no, no sale nada. Starter ve la invitación a Pro (fundador, 2026-10-18);
  cualquier otro plan, nada. Sin perfil, falla cerrado.
- **Sin puntos por arreglo y sin Interoperabilidad**, igual que en
  «Visibilidad en agentes». La tarjeta no menciona la Puntuación GEO: el
  fundador quitó esa frase (log §340).
- **Va en su propio `Suspense`.** La auditoría agéntica no puede retrasar
  Visión general.

## Agentes que compran (AGENTIC-SHOPPERS-1, log §427)

- **Encontrar y entrar son dos preguntas.** «Te encuentra» sale de robots.txt
  y sólo con el índice que documenta el fabricante (`SHOPPING_AGENTS.findsVia`).
  «Para entrar» es lo que encontró nuestro robot identificado y nunca afirma
  qué le pasa a un agente verificado (§319).
- **Un agente que no publica cómo se identifica es «No se ve desde fuera»**,
  nunca verde, y no recibe interruptor ni token inventado (Grok Bot,
  Instinct, Tab). Se añade uno sólo con documentación del fabricante.
- **Meta cuenta por `meta-webindexer`, nunca por `meta-externalfetcher`**:
  Meta dice que ese puede saltarse robots.txt.
- **Los consejos de esa tarjeta no tienen puntos** y salen de un dato medido
  (reto anti-bots, plataforma Shopify).

## Agentes que leen y que navegan (AGENTS-BROWSER-1, log §453)

- **Lo que ve un navegador vive en `result.browser`**, escrito sólo por la
  pasada de AI-READ-2 (`lib/agentic-audit/browser-pass.ts`) sobre la página
  que ya eligió la auditoría. Un render por proyecto y semana; una lectura
  fresca de la misma URL se copia, no se vuelve a pedir. Nunca otra página.
- **Nunca entra en la nota.** Ni en la Visibilidad agéntica ni en la
  Puntuación GEO.
- **Sólo lo que se ve al abrir, sin pulsar nada**, y sin afirmar lo que el
  render no trae: ni geometría («tapa la mitad») ni ventanas que salen tarde.
- **Un reto anti-bots al navegador es `blocked` y no resta**, como en §319.
- **Gemini no va en «los que leen sin navegador»**: responde desde el índice
  de Google, que ejecuta el JavaScript.
- **Todo el texto de los carriles sale de `agentLanes`** (pura, con test).
  Sin lectura, el carril de los que navegan no inventa estaciones.
- **«Con navegador y sin él» sale de `twoWindows` y las notas de las
  comprobaciones de `browserCheckNotes`** (log §454), las dos puras. Un campo
  de la lectura que falte (`name`, `stock`, `productData`) es «Sin medir»,
  nunca «No aparece». «Sólo con JavaScript» exige que el HTML no lo traiga y
  el navegador sí lo vea.

## Botón y cookies (log §456, §457)

- **Un botón cuenta por su etiqueta entera si es «Añadir» o «Comprar» a
  secas**, y sólo fuera de menú, cabecera y pie. «Añadir a mi lista» nunca.
  Las tres lecturas (navegador, HTML y extensión) dicen lo mismo.
- **Un aviso de cookies sólo resta si tapa la página** (`cookiesCover`):
  ventana con fondo, `aria-modal`, clase de ventana o centro de su
  herramienta, o el scroll bloqueado. Una franja, o una lectura guardada sin
  `cookieCover`, no cuenta en contra. La línea dice el motivo en una frase.
- **Cada campo bajo las ventanas lleva su frase (`say`)** con lo que vio
  ese agente (log §458); nunca «Están», «Nada» o «No aplica» solos. La
  lectura del navegador y la revisión sin JavaScript cuentan los datos de lo
  que se vende con la misma regla.

## Datos verdaderos (AGENTS-TRUTH-1, log §464)

- **El precio sale de `price-read.ts` en la auditoría y en el navegador**, con
  su unidad; el lector de la extensión aplica las mismas reglas. Un cambio en
  una se copia en la otra en el mismo PR.
- **Una contradicción entre los datos y la página nunca aprueba** (precio o
  stock): baja a «a medias» y se dice.
- **Una tarifa o póliza es un servicio aunque use `Product`** (`looksLikeTariff`):
  sin stock y con permanencia y desistimiento.
- **Un botón de FAQ, diálogo, acordeón, menú, recomendador o pregunta nunca es
  el de compra**; pedir contacto es su propio estado (`lead`).
- **Portadas y listados no puntúan precio ni botón.**
- **Una página de error o un reto en castellano no es la ficha**, y un error
  espera la semana antes de volver a abrirse (coste de Cloudflare).
- **Un cambio en las reglas del navegador sube `BROWSER_READ_RULES`** cuando
  haría falsa una lectura guardada: sólo se guarda la lectura, no el HTML, y
  una lectura con reglas anteriores se vuelve a abrir una vez (log §464 adenda).
- **Una columna por agente, sin «Punto por punto»** (Denis, log §464 adenda
  «una columna por agente»): cada columna es la ficha dibujada de ese agente
  y, justo debajo, sus campos compactos en el mismo orden que la otra. Un
  problema se tiñe y lo que sólo llega con JavaScript lleva «JS» en la columna
  del que navega. Se nombran por el agente («Agentes que leen», «Agentes que
  navegan»); nunca «sin navegador / con navegador». Las dos columnas van de
  lado a lado también en el móvil.
