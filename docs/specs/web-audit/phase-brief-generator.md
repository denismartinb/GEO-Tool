# WEB-AUDIT-BRIEF — Generador de briefs de contenido con IA

**Gate:** el más alto de la iniciativa. Introduce **Gemini runtime nuevo** y una
**migración** (nuevo `generation_type`). "fake recommendations" está en la lista
prohibida de `CLAUDE.md`, así que un brief debe anclarse a evidencia real y
sanearse, nunca inventar datos de páginas. Requiere **aprobación explícita +
Task Intake + data-guardian** antes de implementar. Depende de WEB-AUDIT-DQ (no
tiene sentido generar briefs para huecos que son falsos negativos).

## Objetivo

Convertir la herramienta de diagnóstica en **generativa**: para un tema en
`content_gap` u `open_opportunity`, generar un brief de contenido accionable que
responda a "crea esta página". Es el diferenciador de mercado — ningún competidor
(Profound, Peec, Otterly) entrega el brief accionable junto al diagnóstico.

## Qué genera (estructura fija, saneada)

Un brief por tema, con:
- **H1 sugerido** (title answer-first).
- **Esquema de H2/H3** (las sub-preguntas que la IA espera ver respondidas).
- **Entidades/subtemas** a cubrir (para relevancia semántica).
- **Intención de búsqueda** objetivo (informacional / comparativa / transaccional).
- **Borrador de intro answer-first** (2-3 frases que respondan directamente, el
  formato que los motores de IA citan).

Todo el output es **contenido no confiable**: se sanea (control-char + tag-strip,
caps de longitud por campo) antes de persistir y de renderizar. Se muestra con el
disclaimer de "borrador generado por IA, revísalo antes de publicar".

## Backend

- **Gemini**: nueva función `generateContentBrief` en `lib/llm/gemini.ts`, salida
  **JSON estructurado** (no grounding — es generación, no verificación), temperatura
  baja, con timeout y presupuesto propios. Anclada a evidencia real del tema: se le
  pasa el prompt/tema, la marca, el idioma y (si existe) el/los competidor(es) que
  la IA cita en ese tema, para que el brief sea específico y no genérico.
- **Persistencia**: reutiliza `generated_solutions` (ya tiene saneo, rate limit,
  RLS, gate de completado). Migración `0016_content_brief.sql`:
  - añadir `'content_brief'` al `gensol_generation_type_chk`;
  - extender el `gensol_recommendation_nullability_chk` para permitir
    `recommendation_id NULL` también con `content_brief` (es tema-nivel, como
    `domain_coverage`), manteniendo NOT NULL para los tipos por-recomendación.
  Revisión data-guardian obligatoria (misma clase de cambio que 0013).
- **Rate limit**: presupuesto propio (`generationType: 'content_brief'`, p.ej.
  10/día/proyecto), contado desde el índice existente — mismo patrón que cobertura.
- **Gate Pro** en crudo de `profiles.current_plan`.
- **Idempotencia/caché**: un brief por (proyecto, promptId, scanId); reusar si ya
  existe para el tema y escaneo actuales, como la caché de cobertura.

## Server action + core

`lib/web-audit/brief-generator.ts` (server-only) `generateBriefCore`: ownership
con cliente de usuario → gate Pro → rate limit → validar que el tema es
`content_gap`/`open_opportunity` de la última cobertura (server-derived, nunca del
cliente) → Gemini → sanear → persistir → devolver. Fail-soft con mensaje
sanitizado. `generateBriefAction` en el `actions.ts` del proyecto, zod-validado
`{ projectId, promptId }`, revalida `/web-audit`.

## UI

- Botón "Generar brief" en las filas `content_gap`/`open_opportunity` del detalle
  por tema (patrón cliente `useTransition` como `run-audit-button.tsx`).
- El brief se muestra expandible bajo la fila, con el disclaimer de IA y un botón
  de copiar. Nunca se renderiza `raw_content`, solo `sanitized_content`.

## Tests

- `brief-generator` core: gate Pro (fail-closed), rate limit, rechazo de un
  promptId que no es un hueco en la cobertura actual, caché por (promptId, scanId),
  persistencia con `generation_type='content_brief'` y `recommendation_id` NULL,
  saneo del output (un brief con `<script>`/control chars queda limpio), fail-soft
  ante error de Gemini.
- Migración: el CHECK de nullability permite `content_brief` con rec NULL y sigue
  bloqueando un tipo por-recomendación con rec NULL.

## Criterios de aceptación

1. Migración revisada por data-guardian y aplicada manualmente antes de exponer la
   función; el PR indica el estado de aplicación.
2. Generar un brief para un hueco real persiste una fila y muestra el brief
   saneado con disclaimer; recargar lo conserva; regenerar sirve de caché.
3. Nunca se renderiza output sin sanear; el brief se ancla al tema/competidor
   reales, no inventa datos de páginas del dominio.
4. Rate limit y gate Pro devuelven sus mensajes en castellano.
5. `pnpm test && pnpm run validate` en verde.
