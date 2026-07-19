# Task Intake Report — ENGINES-VALUE-3

**Cuota de voz por motor** ("¿el competidor domina en todos los motores o solo en uno?")

- Estado: ⏳ Pendiente de aprobación del fundador
- Fecha: 2026-07-19
- Autor del intake: Director (misma sesión que ENGINES-VALUE-1/2)
- Agente implementador previsto: Sonnet 5 (frontend / core-flow)
- Rama de trabajo: `claude/multi-search-engine-value-kk3cns` (reiniciada desde `main` tras el merge de #240)
- Predecesoras: `docs/specs/engines-value-1.md` (✅ #228), `docs/specs/engines-value-2.md` (✅ #240)

---

## 1 · Problema y objetivo

Overview ya compara motores (mención/citación/sentimiento) y Citations ya
atribuye cada fuente citada a su motor. La pieza que falta del ítem 4 de la
propuesta original del fundador es **competidores por motor**: la cuota de
voz de un competidor puede estar concentrada en un solo motor, y eso es
información de producto real — "TuCompetidor domina en ChatGPT pero apenas
aparece en Gemini" orienta dónde defender la marca primero.

La página **Competidores**
(`app/dashboard/projects/[projectId]/competitors/page.tsx`) calcula hoy
mención/citación/SoV de marca y cada competidor **agregando todos los
escaneos completados** (no solo el último — a diferencia de Overview,
Prompts y Citations). La query de `scan_prompt_results` (línea 119) ni
siquiera trae `provider`.

**Objetivo:** añadir mención por motor (y por tanto SoV por motor, misma
fórmula que hoy) para la marca y cada competidor activo, manteniendo el
mismo alcance temporal (todos los escaneos completados) para no introducir
una inconsistencia con el resto de la página. Coste de API cero, cero
esquema.

## 2 · Clasificación

P2 con valor comercial P1. Ningún P0 bloqueado.

## 3 · Alcance incluido

- **A.** Añadir `provider` al select de `scan_prompt_results`
  (`page.tsx:119`).
- **B.** Nuevo módulo puro `lib/competitors/engine-share.ts` +
  test Vitest, que agrega mención por (entidad, motor) sobre el conjunto de
  filas ya traído por la página:
  ```ts
  export type EntityEngineInputRow = {
    provider: string | null;
    extracted_json: unknown; // misma forma que ExtractedJson en page.tsx
  };

  export type EntityEngineBreakdown = {
    provider: string;       // normalizado (null → "gemini")
    mentions: number;
    mentionRate: number;    // sobre el total de filas DE ESE MOTOR, no del total global
  };

  // brandMentioned / competitor keys ya vienen calculados por el caller
  // (page.tsx ya tiene toda la lógica de parseExt/normKey); esta función
  // solo añade la dimensión motor sobre la misma agregación.
  export function computeEntityEngineBreakdown(input: {
    rows: EntityEngineInputRow[];
    isEntityMentioned: (ext: ExtractedJsonLike) => boolean; // brand o competidor concreto
  }): EntityEngineBreakdown[]; // orden: grounded primero, luego mentionRate desc
  ```
  Se llama una vez para la marca y una vez por competidor activo (reutiliza
  la misma función con distinto predicado `isEntityMentioned`).
- **C.** UI: bajo la barra de SoV de cada fila (marca y competidores), una
  línea compacta de mini-chips **solo si hay ≥ 2 motores con datos en el
  histórico** (igual que el gap insight de Overview no aparece con un solo
  motor): `Gemini 65% · ChatGPT 40%` usando `getEngineMeta` para
  label/color, mismo lenguaje visual que las fases anteriores (pill
  compacto, no barra completa — esto es un detalle secundario bajo la fila
  principal, no una segunda comparación a la misma altura).
- **D.** Insight de brecha **solo para el competidor con mayor SoV global**
  (`topCompetitor`, ya calculado en `page.tsx:247`): si su mención por motor
  difiere en ≥ 20 puntos entre el motor más fuerte y el más débil, una
  frase bajo la tabla: *"{Competidor} concentra su presencia en {motor
  fuerte} ({x}%) mucho más que en {motor débil} ({y}%) — ahí es donde
  compite menos y es tu mejor oportunidad de defensa."* Umbral más alto que
  Overview (20 vs 15 pts) porque el dataset aquí es acumulado
  histórico y más ruidoso.
- **E.** Tests Vitest (`lib/competitors/engine-share.test.ts`, ver §7).
- **F.** Docs: fila 8d en el ledger de `docs/launch-plan.md` (añadida en
  este commit) + estado de este spec al cerrar el PR.

## 4 · Alcance excluido

- Filtro por motor en la página Competidores.
- Cambiar el alcance temporal de la página (sigue siendo "todos los
  escaneos completados", no solo el último) — cualquier cambio a ese
  comportamiento es una decisión de producto aparte, no de esta fase.
- Citation rate por motor para competidores (ENGINES-VALUE-2 ya cubre
  citas por motor a nivel de dominio en la página Citations; duplicarlo
  aquí por competidor es una ampliación futura, no esta fase).
- Cualquier cambio de scoring, esquema, RLS, executor, pipeline,
  `lib/llm/**`, billing.

## 5 · Áreas prohibidas — confirmación

Cero migraciones, cero queries nuevas (solo añadir `provider` al select
existente), cero llamadas a proveedores, cero cambios de scoring/executor.

---

## 6 · Plan de implementación detallado

### Paso A — `page.tsx`

- Línea 119: `.select("extracted_json, run_id, provider")`.
- Tras construir `competitorRows` (línea 240), para la marca y cada
  competidor activo, llamar a `computeEntityEngineBreakdown` con el
  predicado correspondiente:
  - Marca: `(ext) => Boolean(ext.brand?.mentioned)`.
  - Competidor `c`: `(ext) => (ext.competitors ?? []).some(x => x.mentioned && x.name && normKey(x.name) === normKey(c.name))`.
- Pasar el resultado (`EntityEngineBreakdown[]`) a `CompetitorRowData` (nuevo
  campo `engineBreakdown`) y como prop suelta para la fila de marca.
- Calcular el insight de brecha del Paso D usando el breakdown del
  `topCompetitor` ya identificado.

### Paso B — `lib/competitors/engine-share.ts` (nuevo, puro)

Firma exacta arriba (§3.B). Reglas:

- `provider` se normaliza con `normalizeProvider` de `lib/scan/engine-meta.ts`
  (null → "gemini", mismo criterio que toda la app).
- `mentionRate` de cada motor es sobre el **total de filas de ese motor**,
  no sobre el total global de filas (un competidor puede tener muchas menos
  filas de ChatGPT que de Gemini si ChatGPT se activó más tarde — dividir
  por el total global infravaloraría su presencia real en ese motor).
- Motor con 0 filas → no aparece en el array (nunca `mentionRate: 0`
  inventado, mismo principio de honestidad que ENGINES-VALUE-1/2).
- Orden: grounded primero (Gemini/ChatGPT), luego por `mentionRate` desc —
  mismo criterio que `lib/scan/engine-breakdown.ts`.

**Tests (`lib/competitors/engine-share.test.ts`):**

1. Dos motores con distinta tasa de mención para la misma entidad → array
   con 2 entradas, rates correctos (cada uno sobre su propio total, no el
   global).
2. Motor sin ninguna fila para esa entidad → no aparece en el resultado.
3. `provider: null` se agrega bajo "gemini".
4. Orden grounded-primero cuando hay 3 motores (gemini/openai/claude).
5. Input vacío → `[]`.
6. Un único motor con filas → array de 1 entrada (sin comparación posible,
   consistente con que la UI no muestre nada por debajo del umbral).

### Paso C — UI de fila (marca + `competitor-row.tsx`)

- Bajo la barra de SoV existente (misma celda, no una columna nueva —
  evita romper el `colSpan`/anchos de la tabla), un `div` con
  `fontSize: 11, color: var(--ink-4), marginTop: 4` mostrando los pills:
  `{meta.label} {rate}%` separados por `·`, solo si
  `engineBreakdown.length >= 2`.
- `CompetitorRowData` gana `engineBreakdown: EntityEngineBreakdown[]`; la
  fila de marca en `page.tsx` usa su propio breakdown calculado inline
  (mismo patrón que ya usa `brandSov`/`brandMentionRate` sueltos en esa
  página en vez de un objeto compartido con `CompetitorRowData`).

### Paso D — Insight de brecha

Bajo el footnote existente de la tabla (`page.tsx:397`), un bloque
condicional (mismo estilo que el gap insight de Overview: borde superior,
padding, fontSize 12.5) que solo aparece si `topCompetitor` existe, su
`sov > brandSov` (ya es información "amenaza" existente en el resumen de
texto de la página) y su breakdown por motor tiene ≥ 2 motores con
diferencia ≥ 20 puntos.

### Paso E — Docs

Ledger `docs/launch-plan.md` fila 8d; estado del spec al cerrar el PR.

---

## 7 · Riesgos y mitigaciones

- **Dataset acumulado histórico, no del último escaneo**: un motor añadido
  a mitad de la vida del proyecto (p. ej. ChatGPT vía ENGINES-2a) tendrá
  menos filas totales que Gemini — por eso `mentionRate` se calcula sobre
  el total de CADA motor, no el global (Paso B), evitando que un motor
  reciente parezca artificialmente débil solo por tener menos historial.
- **Ruido en muestras pequeñas**: mismo motivo por el que el umbral de
  brecha aquí es 20 pts (vs 15 en Overview) — el dataset es más grande pero
  también más heterogéneo en el tiempo.
- Sin riesgo de pipeline/datos: display-only, misma disciplina que las dos
  fases anteriores.

## 8 · Criterios de aceptación

1. La fila de marca y cada fila de competidor activo muestran, cuando hay
   ≥ 2 motores con datos, un desglose compacto de mención por motor bajo su
   barra de SoV.
2. El insight de brecha aparece solo cuando el competidor líder tiene ≥ 20
   pts de diferencia entre su motor más fuerte y más débil, y no aparece en
   caso contrario.
3. Cero queries nuevas, cero cambios de scoring/esquema/executor.
4. `pnpm test && pnpm run validate` en verde; los 6 casos del Paso B pasan.

## 9 · Entrega

Rama `claude/multi-search-engine-value-kk3cns`, un único PR, commits:

1. `feat(competitors): per-engine mention breakdown helper`
2. `feat(competitors): per-engine mini-chips + top-competitor gap insight`
3. `docs: ENGINES-VALUE-3 ledger + spec status`

Estimación: ~250–350 líneas de diff, una sesión.

---

> **Do you approve this plan? I will not implement until you confirm.**
