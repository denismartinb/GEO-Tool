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
  deliverable.ts`, RECS-ACCION-1a, log §125). El CTA nombra el artefacto que su
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
- **El hueco de fuentes se divide por familia** (`pursue_comparator_sources`,
  `pursue_community_sources`, `pursue_media_sources`), reutilizando el
  clasificador de Páginas citadas. Las fuentes enciclopédicas quedan **fuera a
  propósito**: no se puede pedir a un usuario que entre en Wikipedia. Los tres
  tipos comparten la misma mutación contrafactual `authority` que el tipo
  original — sin lógica de scoring nueva.
- **"Alta prioridad" es un único criterio absoluto** (impacto × confianza),
  compartido entre la badge de la tarjeta y el filtro. No debe volver a existir
  un segundo criterio posicional (`priority_rank <= N`) conviviendo con él en
  la misma pantalla.
- **`activeRun` nunca oculta recomendaciones ya existentes.** El overlay a
  pantalla completa (`FirstScanTakeover`) sólo sustituye la pantalla cuando NO
  hay un `latestCompletedRun` — con datos, un escaneo en curso se refleja en la
  `ScanStatePill` del sticky-header, nunca tapando el backlog.
