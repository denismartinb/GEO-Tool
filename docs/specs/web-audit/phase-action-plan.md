# WEB-AUDIT-ACTION — Plan de acción + huecos con competidor

**Gate:** Human Gate normal. No toca schema, ni Gemini, ni fetch, ni ninguna
zona de la lista prohibida — lee **solo datos ya persistidos**. Un PR.

## Objetivo

Cerrar el "¿y ahora qué hago?" que hoy queda abierto tras ver la matriz, y hacer
accionables los huecos de contenido:

1. **Tarjeta "Plan de acción"** — lista priorizada de las N acciones de mayor
   palanca derivadas de la matriz, cada una enlazada a Recomendaciones. Es la
   zona 6 del mockup original, aplazada en la Fase 1.
2. **Huecos con competidor** — en cada tema "Hueco de contenido" (y en el
   cuadrante correspondiente), mostrar **qué competidor cita/menciona la IA** para
   ese prompt. Convierte "no tienes página" en "no tienes página y te está
   ganando X".

## Datos (todos ya cargados o triviales de cargar)

- **Menciones de competidor**: `scan_prompt_results.extracted_json.competitors[]`
  (`name`, `mentioned`) + `mentioned_competitors_count`. La página ya carga las
  filas de resultados del escaneo (`resultsByScanId`). Para el promptId de un
  tema, leer los competidores con `mentioned === true` y quedarse con sus nombres
  (saneados con el patrón habitual, cap de longitud, dedupe).
- **Enlace a recomendación**: las recomendaciones `add_citation_block` anclan su
  evidencia a un `scan_prompt_results.id`, cuyo `prompt_id` ya se resuelve en
  `lib/recommendations/coverage-overlay.ts`. Reutilizar ese mapeo para
  **deep-link** de un tema a su recomendación concreta cuando exista; si no,
  enlazar a `/recommendations` genérico.

## Módulo puro nuevo: `lib/web-audit/action-plan.ts`

```ts
export type ActionItemKind = "optimize" | "create_competing" | "create_open" | "capture";

export type ActionItem = {
  kind: ActionItemKind;
  promptId: string;
  topic: string;
  rationale: string;          // p.ej. "Tienes página pero la IA no la cita"
  competitors: string[];      // nombres mencionados por la IA (vacío si no aplica)
  recommendationId: string | null; // deep-link si lo hay
};

export function buildActionPlan(input: {
  summary: WebAuditSummary;                 // de opportunity-matrix
  competitorsByPromptId: Map<string, string[]>;
  recommendationIdByPromptId: Map<string, string>;
  limit?: number;                            // por defecto 5
}): ActionItem[];
```

**Prioridad (orden de palanca):**
1. `invisible` → `optimize` (la palanca más rápida: la página existe, solo hay que
   hacerla citable).
2. `content_gap` → `create_competing` (hueco donde un rival ya gana; urgencia
   competitiva). Ordenar por `mentioned_competitors_count` desc dentro del grupo.
3. `open_opportunity` → `create_open` (hueco sin rival aún; oportunidad limpia).
4. `unverified_cited` → `capture` (te citan por otra vía; formaliza la página).

`performing` e `inconclusive` no generan acciones. Cortar a `limit`.

Módulo puro (sin `server-only`), testeable en Vitest.

## Cambios de UI (`web-audit/page.tsx`)

1. **Tarjeta "Plan de acción"** tras la fila de KPIs (antes de la matriz, para que
   sea lo primero accionable, o justo después de la matriz — decisión de layout a
   validar en el Human Gate). Cada item: índice de prioridad, título
   (`{kind}` → copy en castellano), rationale, chips de competidor si los hay, y un
   enlace "Ver recomendación →" (o "Cómo optimizar →") al deep-link.
2. **Chips de competidor** en las filas `content_gap` del detalle por tema y en el
   cuadrante "Sin contenido propio": `La IA cita a: {nombres}`. Reutilizar el
   `chipStyle` con truncado ya existente.
3. Si el plan sale vacío (todo `performing`/`inconclusive`), mostrar un estado
   positivo: "Tu contenido propio está rindiendo — nada urgente que crear ahora."

## Tests (`lib/web-audit/action-plan.test.ts`)

- Orden de prioridad exacto entre los cuatro `kind`.
- Dentro de `content_gap`, orden por nº de competidores desc.
- `competitors` se rellena solo desde menciones `mentioned:true`, deduplicadas.
- `recommendationId` se rellena cuando hay match y queda `null` cuando no.
- `performing`/`inconclusive` nunca producen items; respeta `limit`.

## Criterios de aceptación

1. Con un escaneo real, la tarjeta "Plan de acción" lista acciones ordenadas por
   palanca, cada una enlazando a Recomendaciones (deep-link cuando existe).
2. Los temas "Hueco de contenido" muestran los competidores que la IA cita para
   ese prompt; si no hay ninguno mencionado, no se muestran chips (nunca inventa).
3. Sin cambios de schema, sin llamadas nuevas a Gemini, sin tocar zona prohibida.
4. `pnpm test && pnpm run validate` en verde.
