---
description: Invariantes de la zona de Recomendaciones (generación, puntos potenciales, cobertura de dominio).
paths:
  - "app/dashboard/projects/*/recommendations/**"
  - "lib/recommendations/**"
---

# Recomendaciones — invariantes

## Motor (RECS-EVIDENCE-2, Fase 7, log §191)

- **`perPromptGapCards` agrupa por prompt ANTES de decidir el hallazgo, nunca
  al revés.** Un run ejecuta varios motores por prompt (migración 0009), así
  que iterar `promptResults` fila a fila y dejar que el dedupe final se
  quede sólo con la de mayor severidad pierde en silencio la evidencia de
  los motores perdedores cuando dos coinciden en el mismo hallazgo. Agrupar
  primero por `stableId` (`project_prompts.id`) y evaluar la condición sobre
  el grupo entero es lo que hace que el agrupamiento sea automático en vez de
  depender del dedupe genérico para no perder datos.
- **Nunca separar el dedupe por motor.** Se consideró y se descartó: convierte
  cada coincidencia entre motores en tarjetas adicionales, exactamente lo
  contrario de lo que pide "agrupación de acciones equivalentes,
  >95% sin duplicado". El motor es un atributo de la evidencia dentro de una
  tarjeta, no una dimensión nueva de identidad de la tarjeta.
- **`AffectedPromptDetail.provider`/`PromptResultInput.provider` viajan por
  `evidence_json`, nunca por una columna propia.** No hace falta migración:
  `evidence_json` ya es jsonb y ya guarda `prompt`/`competitors`/`domains`
  del mismo modo.
- **El glifo de motor en pantalla es SIEMPRE `getEngineMeta`/`EngineGlyph`
  (`lib/scan/engine-meta.ts`), nunca una copia local.** Es el mismo módulo
  que ya comparten Prompts y Overview — un motor nuevo sólo necesita una
  entrada ahí.
- **Ausencia de `provider` no se rellena con Gemini por defecto.** A
  diferencia de `normalizeProvider` (pensado para filas de escaneo reales,
  que nunca tienen `provider` null legítimamente), la evidencia persistida
  antes de esta fase simplemente no lo tiene — se pinta sin glifo, nunca se
  inventa.

## Puntos potenciales

- **Se calculan por recomputación contrafactual del score real**, nunca por el
  atajo `porcentaje × peso del componente` (**ADR 0017**, que rechazó
  explícitamente esa fórmula por dos motivos: ignora la renormalización de
  pesos de ADR 0015, y atribuye mal qué componente mueve cada tipo de
  recomendación — `increase_brand_prominence` no toca `presence` en absoluto).
- El contrafactual parte de `affected_prompt_ids` **reales y persistidos**. Sin
  ellos no hay cifra: se omite el número, no se estima.

## Honestidad

- **Nada de recomendaciones falsas** (lista de prohibido de `CLAUDE.md`). Una
  recomendación existe porque hay evidencia persistida que la respalda.
- **El texto narrativo de Gemini nunca es hecho verificado.** Se renderiza con
  el aviso de "interpretación de la IA" ya existente.
- Si una recomendación no puede calcular su impacto, se muestra sin impacto —
  nunca con un valor de relleno.

## Cobertura de dominio

- **Matching de dominio propio fail-closed**: normalizar (quitar esquema, `www.`,
  ruta) y comparar por límite de etiqueta, de forma que `evilacme.com` nunca
  case con `acme.com`. Misma semántica que `lib/scoring/run-scoring.ts` y
  `lib/web-audit/**` — si cambia en un sitio, cambia en los tres (ADR 0019).
- Los límites de generación son **contadores de gasto real**, no decoración:
  respetar el presupuesto por proyecto y día con su `generation_type` propio.

## Artefactos pegables (RECS-USEFULNESS-1 Fase A, log §126)

- **Un artefacto de código no se trunca nunca.** JSON-LD o marcado: o cabe
  entero y es sintácticamente válido, o se descarta. Medio schema no falla al
  pegarlo, falla después en la web del cliente — y llevaba un botón «Copiar» al
  lado. Prohibido volver a meter un `.slice()` en esa ruta: quien decide es
  `checkPasteableArtifact`, que sabe qué clase de artefacto tiene delante
  (`lib/recommendations/pasteable-artifact.ts`).
- **Todo lo que pretenda ser JSON se parsea antes de persistirlo**, incluido un
  `<script type="application/ld+json">` sin su cierre. La validación de
  evidencia no cubre esto: mira competidores y dominios inventados, no sintaxis.
- **El tope de longitud se decide contra el artefacto que le pedimos al
  modelo, no al revés.** El playbook de `create_faq_section` exige 2-4 pares
  pregunta/respuesta más su JSON-LD; con 1.200 caracteres eso era imposible por
  construcción. Si un playbook nuevo pide un artefacto mayor, el tope se
  recalcula — y el prompt dice explícitamente que **la integridad gana a la
  cobertura**: mejor un artefacto pequeño y completo que uno grande y cortado.
- **Se descarta el artefacto, no la solución.** El plan sigue siendo útil sin
  uno de sus ejemplos, y devolver un error entero le gasta al usuario una
  generación de su cupo diario a cambio de nada. Todo descarte se registra con
  su motivo (`artifact_dropped`): un artefacto que desaparece en silencio es
  invisible para el usuario y también para nosotros.

## Reescritura con IA ("Generar propuesta con IA")

- **El conjunto de dominios admitidos se DERIVA del prompt, no se recompone.**
  `buildRecommendationRewritePrompt` construye el texto y `domainsShownInPrompt`
  extrae de él lo que el guardián admite. Recomponerlo campo a campo falló tres
  veces por tres piezas distintas —páginas citadas (§137), competidores con
  dominio propio (§133) y el título de una página citada, que suele ser otro
  dominio (§134)—, y cada vez el modelo fue rechazado por repetir algo que tenía
  delante. Si añades un dato al prompt, ya queda anclado; si lo anclas sin
  enseñarlo, sobra.
- **El vocabulario de dominios vive en `anchored-domains.ts`; el guardián lo
  importa.** La primitiva es «qué es un dominio», el juicio es «esto está
  fabricado». Con la dependencia invertida, mockear el guardián en un test deja
  al conjunto sin extractor y el fallo se lee en pantalla como «el motor de IA
  falló» (§134).
- **El prompt y el guardián leen el MISMO conjunto de dominios anclados.**
  `collectAnchoredDomains` (`lib/recommendations/anchored-domains.ts`) es la
  única fuente: unión de `citation_domains`, `source_domains` y los dominios y
  hosts de `citation_pages`. Pasarle al guardián algo más estrecho que lo que
  el prompt ofreció es rechazar al modelo por obedecer — pasó con las páginas
  citadas, que el prompt pide nombrar y el guardián no admitía, y la tarjeta
  quedó imposible de generar (log §137).
- **Lo mismo vale para los competidores.** Un competidor de la lista del
  proyecto se admite —en el prompt y en el guardián a la vez— sólo si su propio
  dominio está en el conjunto anclado (`competitorsAnchoredByDomain`). El
  playbook pide clasificar cada dominio citado y marcar los que son
  competidores, cosa imposible sin nombrarlos, y el guardián los rechazaba por
  ello (log §133). El emparejado es por igualdad exacta de etiqueta de marca:
  `evilacme.com` no habilita «Acme» (ADR 0019).
- **Los TRES motivos del guardián nombran su término, y cada uno explica lo
  suyo.** Un juicio comparativo (Fase C) no se cuenta como «falta evidencia»:
  el dato estaba y lo que sobra es la afirmación de superioridad, así que el
  mensaje dice qué palabra lo tumbó. Mandar al usuario a mirar la evidencia
  cuando el problema es otro es peor que no decir nada (log §128, §134).
- **Un rechazo del guardián dice QUÉ término lo disparó, también en pantalla.**
  Diagnosticar «mencionaba datos que no están en la evidencia» exigía acceso a
  los logs de producción; costó dos vueltas enteras (log §137, §133). El
  término va saneado y recortado como cualquier salida del modelo.
- **Nada entra en ese conjunto que no venga de la evidencia persistida de esa
  tarjeta.** Ampliarlo con dominios "razonables" (redes sociales, plantillas,
  el dominio de un competidor) convierte el guardián en decoración: existe
  porque una instrucción en el prompt no es una frontera de seguridad.
- **Ese conjunto no lleva tope propio.** Está acotado por construcción y un
  recorte es exactamente lo que produjo el desajuste de §137 —
  `citation_domains` ya venía recortado a 8 desde el motor.
- **Cada rama de fallo dice algo distinto, y el guardián registra qué término
  lo disparó.** Cinco caminos compartiendo una frase hacen que un motor caído y
  una propuesta descartada sean indistinguibles desde el producto, que es lo
  que convirtió un fallo determinista en una investigación (log §137). El
  mensaje sigue siendo propio y saneado — nunca el error del proveedor
  (`.claude/rules/gemini.md`).

## Higiene de entidad (ENTITY-HYGIENE-1, P1-02, log §200)

- **`computeEmergingCompetitors` nunca recomienda seguir un asistente de IA
  como competidor.** Filtra por `isGenericEntityName`
  (`lib/entity-hygiene/generic-entities.ts`) antes de aceptar cualquier
  nombre de `other_brands_mentioned` — ese campo es salida cruda del modelo
  con sólo una instrucción blanda en el prompt de extracción, nunca una
  garantía de código. Detalle completo, y por qué la lista vive en un módulo
  compartido en vez de aquí, en `.claude/rules/competitors.md`.

## Escrituras

- `dismiss`/`rewrite`/`restore` verifican propiedad en servidor con el cliente
  de usuario antes de cualquier escritura con service-role (patrón
  data-guardian C5).

## Contrato de acción (ACTIONS-OBSERVABLE-1 slice 4a, docs/external-audit-2026-08.md Fase 4, log §203)

- **Ninguna acción de `RecCard` termina en nada.** Las dos acciones propias de
  la tarjeta (`handleRewrite`, `handleDismiss`) pasan por `useActionFeedback`
  (`components/ui/action-feedback.tsx`), que envuelve el reducer puro de
  `lib/ui/action-feedback.ts` — `idle | pending | success | error`, nunca un
  cuarto estado. Cualquier acción nueva en esta pantalla usa el mismo hook en
  vez de un `useState`+`useTransition` propio.
- **El acuse de éxito se anuncia con `role="status"` `aria-live="polite"`**
  (`ActionAnnouncement`). Antes de esta fase ninguna de las seis acciones de
  Recomendaciones anunciaba nada — ni siquiera visualmente, y menos aún para
  un lector de pantalla.
- **"Marcar como hecho" llama a `router.refresh()` en su propio éxito, igual
  que todas las demás acciones de esta tarjeta.** Una primera versión no lo
  hacía a propósito, para dejar sitio a un "Deshacer" en la propia tarjeta —
  el fundador la probó en el preview y la rechazó: un deshacer que sólo vive
  mientras la tarjeta sigue montada, y desaparece en cuanto navegas,
  "no sirve de nada" (2026-09-07). El deshacer real vive en otro sitio (ver
  abajo); esta tarjeta vuelve a comportarse como las demás.
- **El "Deshacer" de verdad vive en `ResolvedHistoryCard`, bajo "Resueltas",
  nunca en la tarjeta activa.** Es la única forma de que sobreviva a un
  refresco o a una navegación — que es precisamente lo que la versión
  anterior no conseguía. Se ofrece SÓLO cuando `item.status === 'dismissed'
  && item.run_id === latestCompletedRunId`: la lista activa filtra por
  `run_id = latestCompletedRun.id AND status='active'`
  (`recommendations/page.tsx`), así que restaurar una fila de un run más
  antiguo volvería su `status` a `'active'` pero la dejaría invisible en
  todas partes — ni en la lista activa (su `run_id` no es el vigente), ni ya
  en "Resueltas" (dejó de tener el `status` que esa pestaña lista). Esto
  exigió sacar `run_id` del recorte que `page.tsx` aplicaba antes de mandar
  `ResolvedHistoryItem` al cliente y pasar `latestCompletedRunId` como prop
  nueva — antes ninguno de los dos cruzaba la red.
- **`restore-recommendation.ts` es un espejo exacto de `dismiss-
  recommendation.ts`**, sin migración: `rec_status_chk`
  (`0010_recommendations_history.sql`) ya admite `'active'`. Cualquier
  cambio a uno de los dos se revisa contra el otro.
- **El vacío de nivel superior de la pantalla (`page.tsx`) sólo dispara
  cuando de verdad no hay nada en ningún sitio.** Antes bastaba
  `recs.length === 0`: marcar como hecha la única recomendación activa
  desmontaba `RecommendationsClient` entero, con él la pestaña "Resueltas" y
  sus datos ya pedidos al servidor — el fundador lo vio como una pantalla que
  "borraba" su acción. La condición es `recs.length === 0 &&
  resolvedHistoryForClient.length === 0`; con historial pero sin activas,
  `RecommendationsClient` sigue montado y su propio vacío interno («Nada que
  corregir ahora mismo») señala la pestaña "Resueltas" en vez de repetir el
  genérico "vuelve a Todas" (que sería falso: ya se está en Todas).
- **Lo que `react-dom/server` no puede probar se declara, no se calla.**
  `renderToStaticMarkup` no ejecuta clics, así que ningún test afirma que un
  clic real en "Deshacer" restaura la fila. Lo que sí se prueba por render
  (`ResolvedHistoryCard`, exportada igual que `RecCard`): las cuatro
  combinaciones de la condición de arriba — se ofrece del run vigente, no se
  ofrece de un run viejo, no se ofrece sobre una fila `resolved`, no se
  ofrece sin `latestCompletedRunId`. La transición real a "éxito" sólo la
  verifica `tests/pilot/journeys/actions/recommendation-actions.spec.ts`
  (`--journeys actions`) contra un preview real — mismo principio que ya
  protege el chip de control y la insignia de estado del artefacto más
  arriba en este fichero.
- **"Exportar plan" es la primera acción puramente de cliente que entra a
  este contrato** (ACTIONS-OBSERVABLE-1 slice 4b.1, log §210) — todas las
  anteriores eran server actions. `handleExport` se envuelve en un `async`
  que resuelve `{ success: true }` y captura cualquier fallo en
  `{ success: false, error }`, sin ampliar `lib/ui/action-feedback.ts` (que
  sólo espera una promesa).
- **PDF-EXPORT-PLAN-1 (log §213): el `.md` descargable ya NO es el formato
  principal.** `handleExport` invoca `window.print()` sobre `ExportReport`
  (`export-report.tsx`/`.css`, montado siempre oculto y visible sólo por
  `@media print`) en vez de crear un `Blob`/`<a download>`. El constructor
  del markdown (`buildExportPlanMarkdown`, `lib/recommendations/
  export-plan.ts`, puro y con test) sigue vivo, pero sólo como contenido del
  respaldo. `ExportPlanModal` **sigue siendo obligatorio**: si
  `typeof window.print !== "function"` (visor incrustado, sandbox, navegador
  sin soporte), se abre con el markdown completo y "Copiar al portapapeles"
  — la premisa que permite retirar la descarga de fichero como formato
  principal es que `window.print()` es una API nativa invocada directamente,
  sin el modo de fallo silencioso de un `<a download>` sintético bloqueado
  por política del navegador (motivo original del modal); un entorno SIN
  `window.print` sí es detectable en código, a diferencia de aquél. Riesgo
  residual conocido y aceptado, de otra naturaleza: un usuario que cancela
  el diálogo del sistema, o una política de impresión que lo bloquea sin
  lanzar excepción, no cae al modal — `window.print()` no distingue eso del
  código que lo llama.
- **El motor que respalda cada recomendación en el informe exportable viene
  de `recommendationEngineLabels`** (`lib/recommendations/export-plan.ts`),
  que lee `evidence_json.affected_prompt_details[].provider` — el mismo
  campo que ya pinta `RecCard` en pantalla — y lo traduce con
  `getEngineMeta`. Nunca una lista de motores propia; ausencia de
  `provider` se omite, nunca se asume Gemini por defecto (mismo principio
  que RECS-EVIDENCE-2, arriba).
- **La Puntuación GEO de la portada del informe exportable se lee de
  `resolveGeoScore` (`lib/metrics/run-metrics.ts`)**, nunca recalculada en
  esta pantalla — TRUST-METRICS-1 (log §183) es la regla que esto obedece.
  `page.tsx` lee `GEO_SCORE_LOOKBACK_ROWS` filas de `run_scores`, igual que
  cualquier otro consumidor del módulo; `null` cuando no hay suficientes
  runs, la portada omite la cifra en vez de inventarla.
- **El informe exportable usa el logo oficial (`BrandLogo`,
  `components/ui/brand-logo.tsx`), nunca una aproximación dibujada a mano**
  (log §214) — un cuadrado con degradado + texto no es la marca, por mucho
  que use los mismos colores.
- **`.xrp-cover` es la ÚNICA parte de `export-report.css` con altura fija y
  `overflow: hidden`** — es segura porque su contenido nunca varía en
  longitud. `.xrp-content` NUNCA lleva altura fija: una lista de
  recomendaciones que no cabe en una página tiene que fluir a la siguiente
  (`page-break-before: always` al empezar, `break-inside: avoid` por
  tarjeta), nunca recortarse en silencio. Fijar su altura recortó
  recomendaciones reales sin error ni aviso (log §214) — la misma clase de
  fallo que `.claude/rules/scan.md` prohíbe para el pipeline bajo "Never cap
  the work by row count", aplicada aquí a páginas de un documento.
- **Cualquier cambio a `export-report.tsx`/`.css` se prueba generando el PDF
  de verdad Y ABRIENDO SUS PÁGINAS, no capturando elementos** (log §216).
  El arnés: compilar el componente con esbuild, montarlo con
  `ReactDOM.createRoot` dentro de un contenedor con `overflow`+`transform`
  (§215), `page.pdf({ printBackground: true, preferCSSPageSize: true })`,
  `pdfinfo` para contar páginas y `pdftoppm` para rasterizarlas y mirarlas
  una a una. **La aserción que cierra el fallo del fundador: con 3
  recomendaciones el PDF tiene exactamente 2 páginas** — si la portada
  desborda, son 3. Una captura de elemento (`locator.screenshot()`) NO vale:
  sale bien mida lo que mida, porque no tiene noción de página, y por eso
  §214 y §215 dieron por bueno un informe cuya portada ocupaba página y
  media.
- **`box-sizing: border-box` en todo `.xrp-root`, y la portada mide 1122px**
  (A4 a 96dpi menos 1px, para absorber redondeos subpíxel que meterían una
  página en blanco). Su ausencia hizo que la caja midiera 1235px —altura +
  padding— y desbordara a una segunda página (log §216).
- **Los márgenes de las páginas de contenido van en una `@page` CON NOMBRE
  (`@page xrp-content-page`), nunca en un `padding` del contenedor.** Un
  padding se aplica una vez, al principio del bloque: las páginas 3 y
  siguientes salían con el texto pegado al borde del papel. La portada usa
  la página por defecto (`margin: 0`) para sangrar. **No intentes lo
  contrario** —márgenes en el `@page` general + márgenes negativos en la
  portada—: Chrome recorta el pintado al área de contenido y la portada sale
  con marco blanco (probado y descartado, log §216).
- **Ningún contenedor flex entre la lista y sus tarjetas.** Un flex no
  reparte sus hijos entre páginas impresas; el espaciado entre tarjetas es
  `margin-bottom`, no `gap` (log §216).
- **`ExportReport` se monta con `createPortal` en `document.body`, nunca
  directamente donde aparece `<ExportReport>` en el árbol.** Anidado dentro
  del layout de la consola (barra lateral, contenedores responsive), el
  informe hereda `overflow`/`transform` de sus ancestros reales y su
  portada se deforma — un fallo que un arnés de prueba sin esos ancestros
  NO puede ver (log §215). Si algún día esto cambia, la prueba tiene que
  reproducir un ancestro con `overflow: hidden` + `transform`, no sólo
  renderizar el componente aislado.
- **El resplandor decorativo de la portada es un PNG incrustado como data
  URI en `export-report.css`, ni degradado CSS ni SVG** (log §216). Un
  `radial-gradient` con canal alfa se rasteriza como color sólido en el
  camino de impresión de WebKit (§215), y el SVG fue una defensa que no
  bastó; un PNG se imprime idéntico en todos los motores. Incrustado y no
  servido desde `/public`: una imagen de fondo que depende de una petición
  de red puede no haber llegado cuando se abre el diálogo de impresión.

## Pantalla — "copiloto GEO" (RECS-REDESIGN-1, log §115)

- **Repintado de zona en `.rec2-scope`**, mismo mecanismo que `.ov2-scope`/
  `.cm2-scope`: reapunta los nombres de variable que sus descendientes ya leen,
  nunca toca `:root`. La cabecera de la pantalla (kicker + nombre de proyecto +
  `ScanStatePill`) va FUERA de `.rec2-scope` — sangra a los bordes con márgenes
  negativos y quedaría recortada dentro de la columna centrada de 460px.
- **Todo el motor emite `first_step`.** Un diagnóstico sin una primera acción
  concreta y acotada es lo que hacía inservibles las listas de referencia
  (Semrush, Otterly.AI) que motivaron el rediseño — no se añade un tipo de
  recomendación nuevo sin decidir su primer paso.
- **Todo tipo declara su entregable y su control** (`lib/recommendations/
  deliverable.ts`, RECS-ACCION-1a, log §127). El CTA nombra el artefacto que su
  playbook de `recommendation-rewrite-llm.ts` ya le pide al modelo ("Generar
  comparativa", no "Generar propuesta con IA"): si cambia un playbook, cambia
  el CTA con él o el botón promete una cosa y llega otra.
  `deliverable.test.ts` recorre `KNOWN_RECOMMENDATION_TYPES` y falla si una
  regla nueva llega sin decidirlo — misma disciplina que `first_step`. Un tipo
  sin entrada degrada al CTA genérico y **no afirma control ninguno**: decir
  "En tu web" sobre algo sin clasificar sería inventarse un hecho, misma
  dirección de fallo que el tri-estado de las sondas de la auditoría.
- **Del control sólo se pinta la excepción.** `third_party` e `in_app` llevan
  chip en la tarjeta plegada; `own_site` no, porque es lo que el usuario ya da
  por supuesto en 11 de los 15 tipos y repetirlo sería la tinta que §115 quitó
  de esa vista. La ausencia de chip significa "es tuyo". Lo que §115 retiró de
  ahí fue vocabulario del motor, no señales de triaje.
- **"Listo para copiar" se cuenta, no se estima.** La insignia del panel del
  plan sale de contar los placeholders (`[tu dato aquí]`) que el prompt de
  reescritura ya obliga a poner donde falta un dato. Se cuentan artefactos y
  pasos, nunca título ni resumen. Si algún día el prompt deja de exigir
  placeholders, esta cuenta deja de significar nada y hay que rehacerla. El
  regex excluye comillas y llaves a propósito: los JSON-LD llevan arrays, y
  contarlos como datos que faltan volvería la etiqueta ruido justo en el
  artefacto más pegable que se genera.
- **Lo que el piloto no puede alcanzar se prueba por render.** El chip de
  control (sólo en tipos externos) y la insignia de estado (sólo tras una
  escritura, que el piloto permanente no hace) son estructuralmente invisibles
  para `ux-pilot`. `recommendations-client.test.tsx` los renderiza con
  `react-dom/server` y asegura su contenido — incluida la **ausencia** del chip
  en `own_site`, que es lo que le da significado. No se retira ese test para
  «ya lo mira el piloto»: no puede (log §127).
- **El hueco de fuentes se divide por familia** (`pursue_comparator_sources`,
  `pursue_community_sources`, `pursue_media_sources`), reutilizando el
  clasificador de Páginas citadas. Las fuentes enciclopédicas quedan **fuera a
  propósito**: no se puede pedir a un usuario que entre en Wikipedia. Los tres
  tipos comparten la misma mutación contrafactual `authority` que el tipo
  original — sin lógica de scoring nueva.
- **Lo que depende de un tercero nunca encabeza el plan** (`planScore`,
  RECS-ACCION-1c, log §140). El contrafactual de los tipos `pursue_*` asume que
  TODAS las fuentes citadas acaban mencionando la marca, así que su cifra es
  generosa por construcción y ordenando sólo por puntos se comía el primer
  puesto. **Es un techo, no un filtro**: sin nada propio que hacer, una externa
  sigue subiendo — esconderla sería la otra forma de mentir. `in_app` cuenta
  como propio; un tipo sin control declarado no se penaliza.
- **Una cifra condicionada se etiqueta como tal.** «+11 pt · si te citan», no
  «potenciales» (`pointsCaption`). El número no cambia — cambia lo que declara,
  porque "que cinco terceros actúen" y "añade un párrafo a tu página" no son la
  misma promesa aunque ADR 0017 las calcule igual (log §140).
- **Un grupo enseña sus mejores, no todas.** `GROUP_PREVIEW_SIZE` (5) más «Ver
  las otras N», ordenadas con la misma `planScore` que ordena el plan — un solo
  criterio para toda la pantalla. El motor emite una tarjeta por prompt y eso no
  cambia (§115 punto 6), así que la densidad se resuelve en presentación. **No
  esconde nada**: el resto está a un clic (log §140).
- **Los bloqueos duros de la auditoría se enseñan aquí, y sólo ellos**
  (`findCitationBlockers`, log §167). Bots bloqueados, `noindex` y
  `nosnippet`/`max-snippet:0` hacen **imposible** la cita, así que salen sobre
  el backlog con sus URLs. No rompe el reparto de zonas —«La Auditoría arregla
  tu web; Recomendaciones consigue que te citen»—: no se duplica el catálogo ni
  se convierten en recomendaciones, se señala lo que impide el objetivo de esta
  pantalla y se manda a arreglarlo donde se arregla. Los otros trece checks
  técnicos **no** suben aquí; si algún día sube un cuarto bloqueo, tiene que
  ser porque impide la cita, no porque reste puntos.
- **El overlay de cobertura sólo alimenta tipos anclados a UN prompt**
  (`COVERAGE_OVERLAY_TYPES`, `lib/recommendations/coverage-overlay.ts`,
  AUDIT-RECS-JOIN-1 Fase B, log §172). Hoy: `add_citation_block` (mencionado,
  no citado) e `increase_brand_visibility` (no mencionado en absoluto). Un
  tipo de ámbito de campaña (`create_faq_section`,
  `strengthen_brand_entity_clarity`) no entra: no hay un único tema con el
  que cruzarlo.
- **El copy del overlay es por tipo, nunca compartido a ciegas.**
  `add_citation_block` y `increase_brand_visibility` disparan por motivos
  incompatibles —mencionado-sin-citar vs. no-mencionado— así que "la IA no lo
  está citando como fuente" es cierto para uno y falso para el otro. Un tipo
  nuevo en `COVERAGE_OVERLAY_TYPES` sin decidir su propio `overlayCopy` hereda
  el fallback genérico, nunca el texto de otro tipo.
- **`overlayCopyLocal` (cliente) es una copia deliberada de `overlayCopy`
  (servidor), y lleva su propio test de paridad campo a campo.** El overlay
  es server-only (arrastra `domain-coverage.ts`, que importa `"server-only"`),
  así que el cliente no puede importarlo — mismo motivo que ya duplicaba
  `CoverageOverlay`/`GeneratedSolution` ahí. Ninguna duplicación nueva se
  añade sin el test que la blinda: mismo principio que el guardián de tres
  vías de `GROUNDED_PROVIDERS` (`.claude/rules/web-audit.md`, log §130).
- **Este módulo sólo afirma problemas, nunca «está bien».** Es lo que hace
  segura la ausencia de un campo en una instantánea vieja: «nunca medido» se
  excluye solo, sin necesidad de un `isMeasured` propio. Si alguna vez se le
  pide que declare algo limpio, esa garantía se cae y hay que rehacerla.
- **"Alta prioridad" es un único criterio absoluto** (impacto × confianza),
  compartido entre la badge de la tarjeta y el filtro. No debe volver a existir
  un segundo criterio posicional (`priority_rank <= N`) conviviendo con él en
  la misma pantalla.
- **`activeRun` nunca oculta recomendaciones ya existentes.** El overlay a
  pantalla completa (`FirstScanTakeover`) sólo sustituye la pantalla cuando NO
  hay un `latestCompletedRun` — con datos, un escaneo en curso se refleja en la
  `ScanStatePill` del sticky-header, nunca tapando el backlog.

## Verificación de la predicción (RECS-LOOP-1 Fase A+B, ADR 0041, log §181, §190)

- **Nunca un delta de score entre dos runs.** Se evaluó y se rechazó
  explícitamente: no es atribuible (el compuesto/componente se mueve por
  cualquier prompt y por cualquier otra tarjeta resuelta en la misma
  ventana, no sólo por ésta) y casi nunca pasaría `resolveDelta`/
  `compareRuns` (`.claude/rules/scoring.md`, DELTA-GUARD-1) entre dos runs
  consecutivos reales. La única verificación permitida es fáctica: si la
  mutación concreta que la promesa asumía (`getRecommendationPotentialKind`
  — el MISMO mapa de `lib/scoring/run-scoring.ts` que generó el "hasta +X
  pt", nunca uno independiente) ocurrió de verdad en los prompts que la
  tarjeta citó, en el run que confirmó la brecha resuelta. Ver ADR 0041 para
  el razonamiento completo de por qué.
- **Es observación, no estimación.** Sin banda de confianza, sin suelo de
  muestra — no extrapola a una población, así que una sola fila comprobada
  es una respuesta completa. No reutilices `MIN_RESPONSES_FOR_BAND` ni
  `resolveDelta` aquí: esas capas existen para inferencias, esto no lo es.
- **Nunca una cifra de puntos.** El veredicto es "cumplida en N de M
  consultas", nunca comparado ni presentado junto al "hasta +X pt" del
  contrafactual — son respuestas a preguntas distintas, y ponerlas una al
  lado de la otra es la promesa que ADR 0041 existe para no hacer.
- **`prominence` no exige la posición 1 del contrafactual.** Esa es su techo
  optimista, no un veredicto realista — exigirla haría que la tarjeta
  dijera "no se cumplió" casi siempre que sí ayudó. El check real es: deja
  de estar por detrás del competidor concreto que la propia evidencia de la
  tarjeta nombró (`evidence_json.affected_prompt_details[].competitors`),
  no de cualquier competidor.
- **`affected_prompt_details[].id` no es estable entre runs** — es
  `scan_prompt_results.id`, una fila nueva cada escaneo (RECS-DEDUPE-1).
  Cualquier cruce entre el run que prometió y el run que confirma pasa por
  `project_prompts.id`, con una consulta anclada a `project_id` y al
  `run_id` de la tarjeta — nunca sin ese anclaje. Un prompt borrado desde
  entonces (`prompt_id` a null) falla cerrado hacia "sin veredicto".
- **Sin migración, y a propósito.** La promesa es derivable:
  `computeRecommendationPotentialPoints` es pura y `scan_prompt_results` es
  inmutable tras completar el run. No se congela nada en una columna nueva.
- **El dedupe del historial de "Resueltas" incluye `resolved_in_run_id` en
  su clave**, no sólo el título — de lo contrario una brecha que se
  resolvió, reabrió y se resolvió otra vez se colapsa en una sola tarjeta,
  perdiendo la más antigua. El duplicado de dos motores sobre el mismo
  prompt (la razón original del dedupe por título) sigue colapsando porque
  comparte el mismo `resolved_in_run_id`.
- **Una fila `dismissed` sí tiene veredicto (Fase B, `lib/recommendations/
  dismissal-recurrence.ts`), pero nunca vía `resolved_in_run_id`.**
  `dismissRecommendationCore` no lo escribe — dismissal es un clic manual, no
  algo que el sistema detecte re-escaneando — así que el ancla es el PRIMER
  `scan_runs` completado con `created_at` posterior al `updated_at` de la
  fila descartada (nunca `finished_at`: un run en vuelo en el momento del
  clic no cuenta como observación posterior a él). Fijo una vez, nunca una
  comprobación rodante contra "el run más reciente" — mismo principio que
  Fase A ya fija su propio ancla y no la vuelve a mover.
- **El campo que lleva esa ancla en `prediction-verification.ts` se llama
  `anchorRunId`, no `resolvedInRunId`.** Sirve a los dos llamadores (Fase A:
  el run que confirmó una resolución automática; Fase B: el run ancla de una
  recurrencia) y el nombre viejo mentiría sobre el segundo caso. No renombrar
  de vuelta aunque un solo llamador parezca más simple.
- **Un run ancla sin ninguna fila de `recommendations` → sin veredicto,
  nunca "la brecha se fue".** Indistinguible desde este módulo de un fallo
  del `INSERT` de finalize (RECS-FINALIZE-DURABILITY-1 ya sabe que puede
  ocurrir, registrado, no fatal) — leer un run vacío como "resuelto"
  publicaría una victoria causada por un fallo de persistencia.
- **La reaparición se afirma; la conclusión sobre lo que el usuario hizo o
  dejó de hacer, nunca.** Que la brecha vuelva es evidencia de que sigue ahí
  — no de que el usuario no hiciera el trabajo (publicar algo el día 12
  puede no haber propagado a un motor el día 13, y en un motor no-grounded
  puede no propagar nunca). Ningún umbral de espera artificial ("dale 7
  días") compensa esto: sería una constante fabricada sin dato detrás.
- **El detalle de mutación de Fase A y el veredicto de recurrencia de Fase B
  nunca se muestran juntos para la rama "volvió".** Si la brecha reapareció,
  "la IA te nombró en 1 de 2 consultas" es una respuesta a una pregunta que
  ya no importa — sólo se calcula/enseña el detalle de mutación en la rama
  "no volvió".
- **El copy de una fila `dismissed` nunca dice "en el escaneo que lo
  confirmó"** (esa frase es de Fase A, algo se confirmó de verdad ahí):
  nombra la fecha del propio run ancla ("El escaneo del 25 ago 2026 ya no la
  encontró"), distinta a propósito de `dateLabel` (la fecha del descarte)
  que ya lleva la tarjeta — dos fechas, dos hechos, nunca fundidas.
- **La tarjeta activa que vuelve lleva su propia memoria, con la fecha del
  descarte, no la del run ancla.** `recommendation-history.ts` reinicia
  `consecutive_runs_open` a 1 correctamente cuando una fila `dismissed`
  reaparece (es una racha nueva) — pero sin la insignia "La marcaste como
  hecha el 12 ago 2026" la tarjeta se ve como si fuera nueva de verdad, y el
  usuario pierde el contexto de que ya la marcó una vez. Keyed on
  `dedupe_key`, nunca en el id de la fila descartada (una fila nueva cada
  vez que la brecha reaparece).
- **La asimetría que motivó Fase B, para no reintroducirla:**
  `computeRecommendationTransition`'s `resolvedDedupeKeys` ya excluye
  `status === "dismissed"` (correcto — una fila descartada no es una
  resolución automática), pero eso significa que arreglar una brecha SIN
  pulsar "Marcar como hecho" cuenta como Victoria reciente y arreglar la
  MISMA brecha pulsándolo no cuenta nunca. Cualquier cambio futuro a esa
  exclusión tiene que preservar que el botón nunca deje al usuario peor que
  no haberlo pulsado.

## Honestidad de lo que se genera (RECS-USEFULNESS-1 Fase C, log §128)

- **Nombrar a un competidor sí; decir que somos mejores que él, no.** Se rechaza
  en servidor el texto generado cuya frase nombra a un competidor de la lista
  cerrada y además lleva un juicio de valor comparativo
  (`comparative_claim_against_competitor` → `rewrite-validation.ts`). Motivo, y
  no es de estilo: la comparación contra rivales nombrados sin dato objetivo
  expone al cliente a una reclamación (art. 10 LCD). La comparación **neutra y
  verificable** sigue permitida y es media plataforma — no la rompas al tocar
  el léxico.
- **La comprobación es por frase, y el texto se pasa por piezas.** Título,
  resumen, cada paso y cada ejemplo van por separado a `segments`: unidos, un
  paso sin punto final se pega al siguiente y se inventa una frase que nadie
  escribió, que rechazaría planes buenos.
- **Un adjetivo evaluativo sin respaldo es un valor inventado**, igual que una
  cifra inventada. La regla del prompt vigilaba números y el modelo la rodeó
  escribiendo sin ninguno («precios competitivos», «excelente cobertura»). Si
  añades reglas anti-invención, escríbelas sobre **la afirmación**, no sobre el
  tipo de dato.
- **C2 y C3 son reglas blandas y se declaran como tales.** Viven sólo en el
  prompt porque «juicio de valor» no es un conjunto cerrado y un detector amplio
  rechazaría planes legítimos — y cada rechazo gasta una generación del cupo
  diario del usuario. No las documentes como garantías.
- **Todo artefacto de datos estructurados avisa de que su contenido tiene que
  estar visible en la página.** Marcar un `FAQPage` sobre preguntas que no están
  en la página es marcado de contenido inexistente.
