---
description: Invariantes de la zona de Recomendaciones (generación, puntos potenciales, cobertura de dominio).
paths:
  - "app/dashboard/projects/*/recommendations/**"
  - "lib/recommendations/**"
---

# Recomendaciones — invariantes

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

## Escrituras

- `dismiss`/`rewrite` verifican propiedad en servidor con el cliente de usuario
  antes de cualquier escritura con service-role (patrón data-guardian C5).

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
