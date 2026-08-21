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

## Reescritura con IA ("Generar propuesta con IA")

- **El conjunto de dominios admitidos se DERIVA del prompt, no se recompone.**
  `buildRecommendationRewritePrompt` construye el texto y `domainsShownInPrompt`
  extrae de él lo que el guardián admite. Recomponerlo campo a campo falló tres
  veces por tres piezas distintas —páginas citadas (§126), competidores con
  dominio propio (§128) y el título de una página citada, que suele ser otro
  dominio (§129)—, y cada vez el modelo fue rechazado por repetir algo que tenía
  delante. Si añades un dato al prompt, ya queda anclado; si lo anclas sin
  enseñarlo, sobra.
- **El vocabulario de dominios vive en `anchored-domains.ts`; el guardián lo
  importa.** La primitiva es «qué es un dominio», el juicio es «esto está
  fabricado». Con la dependencia invertida, mockear el guardián en un test deja
  al conjunto sin extractor y el fallo se lee en pantalla como «el motor de IA
  falló» (§129).
- **El prompt y el guardián leen el MISMO conjunto de dominios anclados.**
  `collectAnchoredDomains` (`lib/recommendations/anchored-domains.ts`) es la
  única fuente: unión de `citation_domains`, `source_domains` y los dominios y
  hosts de `citation_pages`. Pasarle al guardián algo más estrecho que lo que
  el prompt ofreció es rechazar al modelo por obedecer — pasó con las páginas
  citadas, que el prompt pide nombrar y el guardián no admitía, y la tarjeta
  quedó imposible de generar (log §126).
- **Lo mismo vale para los competidores.** Un competidor de la lista del
  proyecto se admite —en el prompt y en el guardián a la vez— sólo si su propio
  dominio está en el conjunto anclado (`competitorsAnchoredByDomain`). El
  playbook pide clasificar cada dominio citado y marcar los que son
  competidores, cosa imposible sin nombrarlos, y el guardián los rechazaba por
  ello (log §128). El emparejado es por igualdad exacta de etiqueta de marca:
  `evilacme.com` no habilita «Acme» (ADR 0019).
- **Un rechazo del guardián dice QUÉ término lo disparó, también en pantalla.**
  Diagnosticar «mencionaba datos que no están en la evidencia» exigía acceso a
  los logs de producción; costó dos vueltas enteras (log §126, §128). El
  término va saneado y recortado como cualquier salida del modelo.
- **Nada entra en ese conjunto que no venga de la evidencia persistida de esa
  tarjeta.** Ampliarlo con dominios "razonables" (redes sociales, plantillas,
  el dominio de un competidor) convierte el guardián en decoración: existe
  porque una instrucción en el prompt no es una frontera de seguridad.
- **Ese conjunto no lleva tope propio.** Está acotado por construcción y un
  recorte es exactamente lo que produjo el desajuste de §126 —
  `citation_domains` ya venía recortado a 8 desde el motor.
- **Cada rama de fallo dice algo distinto, y el guardián registra qué término
  lo disparó.** Cinco caminos compartiendo una frase hacen que un motor caído y
  una propuesta descartada sean indistinguibles desde el producto, que es lo
  que convirtió un fallo determinista en una investigación (log §126). El
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
