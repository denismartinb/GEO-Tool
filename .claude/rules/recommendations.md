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
  RECS-ACCION-1c, log §132). El contrafactual de los tipos `pursue_*` asume que
  TODAS las fuentes citadas acaban mencionando la marca, así que su cifra es
  generosa por construcción y ordenando sólo por puntos se comía el primer
  puesto. **Es un techo, no un filtro**: sin nada propio que hacer, una externa
  sigue subiendo — esconderla sería la otra forma de mentir. `in_app` cuenta
  como propio; un tipo sin control declarado no se penaliza.
- **Una cifra condicionada se etiqueta como tal.** «+11 pt · si te citan», no
  «potenciales» (`pointsCaption`). El número no cambia — cambia lo que declara,
  porque "que cinco terceros actúen" y "añade un párrafo a tu página" no son la
  misma promesa aunque ADR 0017 las calcule igual (log §132).
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
