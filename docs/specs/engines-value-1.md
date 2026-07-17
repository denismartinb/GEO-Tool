# Task Intake Report — ENGINES-VALUE-1

**Vista comparativa por motor + matriz prompt × motor**

- Estado: ⏳ Pendiente de aprobación del fundador
- Fecha: 2026-07-17
- Autor del intake: Director (sesión multi-search-engine-value)
- Agente implementador previsto: Sonnet 5 (frontend / core-flow)
- Rama de trabajo: `claude/multi-search-engine-value-kk3cns` (esta misma rama)

---

## 1 · Problema y objetivo

El multi-motor (Gemini + Claude hoy; OpenAI en camino vía ENGINES-2) ya se
paga en cada escaneo: cada prompt genera **una fila por motor** en
`scan_prompt_results` (migración 0009), con mención, sentimiento,
competidores y citas por motor. Pero la UI solo explota esto en dos sitios:

- La tarjeta "Distribución por motor de IA" del Overview
  (`app/dashboard/projects/[projectId]/page.tsx:1083`), que muestra **solo
  mention rate** por motor.
- El drawer de Prompts (`components/prompts/prompt-drawer.tsx`), que muestra
  la respuesta de cada motor en el drill-down de un prompt.

**Objetivo:** extraer valor visible del dato multi-motor ya persistido, sin
añadir ni una llamada de proveedor ni una migración:

1. **Overview** — convertir la tarjeta de distribución en una vista
   comparativa real por motor (mención + citación + sentimiento + brecha).
2. **Prompts** — añadir una columna "Motores" (matriz prompt × motor) que
   muestre de un vistazo en qué motores aparece la marca en cada prompt.

Coste de API: **cero**. Todo se computa en tiempo de lectura sobre datos que
las páginas ya consultan.

## 2 · Clasificación

**P2 estructural con valor comercial P1.** El flujo funciona; esto es la capa
de presentación que justifica ante el usuario el coste de escanear varios
motores. No hay ningún P0 bloqueado por esto.

## 3 · Alcance incluido (este PR, y solo esto)

- **A.** Nuevo módulo compartido de metadatos de motor:
  `lib/scan/engine-meta.ts` (client-safe).
- **B.** Nuevo módulo puro de agregación por motor:
  `lib/scan/engine-breakdown.ts` + tests Vitest.
- **C.** Overview: tarjeta "Distribución por motor de IA" ampliada a vista
  comparativa (mención, citación, sentimiento, insight de brecha).
- **D.** Prompts: columna "Motores" con chips por motor en las tablas flat y
  topics de `prompts-client.tsx`.
- **E.** Refactor mínimo del drawer para usar `engine-meta` (hoy tiene
  labels/colores hardcodeados que ignorarían a OpenAI).
- **F.** Actualizar el ledger de `docs/launch-plan.md` (fila nueva
  ENGINES-VALUE-1) y marcar este spec como implementado.

## 4 · Alcance excluido (explícitamente fuera)

- Fuentes citadas por motor ("qué dominios cita cada motor") → futura
  ENGINES-VALUE-2.
- Share of voice de competidores por motor.
- Tendencias históricas y alertas por motor.
- Recomendaciones diferenciadas por tipo de motor.
- **Cualquier cambio en scoring** (`lib/scoring/run-scoring.ts`,
  `run_scores`, `SCORING_VERSION`) — intocable en este PR.
- **Cualquier migración de esquema, RLS, executor, pipeline, billing.**
- Runtime de OpenAI (ENGINES-2, tiene su propio gate). Este PR solo deja la
  UI **forward-compatible** con un tercer motor.

## 5 · Áreas prohibidas — confirmación

Sin migraciones, sin RLS, sin service-role nuevo, sin llamadas a
proveedores, sin tocar el executor ni el scoring. Solo lectura de datos que
las páginas ya traen y presentación. Nada de la Forbidden list de CLAUDE.md.

---

## 6 · Plan de implementación detallado

### Paso A — `lib/scan/engine-meta.ts` (nuevo, client-safe)

**Importante: NO importar `"server-only"`** — este módulo lo consumirá
también el client component `prompts-client.tsx` y el drawer.

```ts
export type EngineMeta = {
  label: string;   // nombre visible
  color: string;   // color de marca del motor en la UI
  short: string;   // inicial para chips compactos
  grounded: boolean; // genera con búsqueda web real (citas posibles) — ADR 0012
};

export const ENGINE_META: Record<string, EngineMeta> = {
  gemini: { label: "Gemini", color: "#4285f4", short: "G", grounded: true },
  claude: { label: "Claude", color: "#d97757", short: "C", grounded: false },
  // Forward-compat: cuando ENGINES-2 active OpenAI, la UI ya lo pinta bien.
  // `grounded` debe revisarse al implementarse su runtime real.
  openai: { label: "ChatGPT", color: "#10a37f", short: "O", grounded: false }
};

// Filas anteriores a la migración 0009 tienen provider null y eran siempre
// Gemini — mismo fallback que ya aplica el Overview (page.tsx:317).
export function normalizeProvider(provider: string | null | undefined): string;
// Devuelve ENGINE_META[normalizeProvider(p)] o un fallback neutro
// { label: provider, color: "#9333a8", short: "?", grounded: false }.
export function getEngineMeta(provider: string | null | undefined): EngineMeta;
```

Notas:

- El color de Claude ya existe en dos valores distintos en el código
  (`#d97757` en page.tsx:27, `#cc785c` en prompt-drawer.tsx:622). Unificar en
  `#d97757`.
- `grounded` duplica deliberadamente la semántica de `GROUNDED_PROVIDERS` de
  `lib/scoring/run-scoring.ts:42` **sin importarla** (ese módulo es de
  scoring y no debe convertirse en dependencia de UI). Añadir un comentario
  cruzado en ambos ficheros: si un motor gana grounding, actualizar los dos.

### Paso B — `lib/scan/engine-breakdown.ts` (nuevo, puro) + tests

**NO importar `"server-only"`** (función pura, testeable). Firma:

```ts
export type EngineBreakdownInputRow = {
  provider: string | null;
  brand_mentioned: boolean | null;
  citation_found: boolean | null;
  sentiment: string | null;
};

export type EngineBreakdownEntry = {
  provider: string;          // ya normalizado
  total: number;             // filas (prompts) de este motor
  mentioned: number;
  mentionRate: number;       // 0–100, redondeado
  citationRate: number | null; // null si el motor NO es grounded (ADR 0012)
  citationCount: number;
  dominantSentiment: "positive" | "neutral" | "mixed" | "negative" | null;
  // Solo sobre filas con brand_mentioned=true, igual que el KPI global de
  // sentimiento del Overview (page.tsx:384). Sin menciones → null.
};

export type EngineGap = {
  leader: string;   // provider con mayor mentionRate
  laggard: string;  // provider con menor mentionRate
  points: number;   // diferencia en puntos porcentuales
} | null;           // null si hay <2 motores con datos

export function computeEngineBreakdown(rows: EngineBreakdownInputRow[]): {
  engines: EngineBreakdownEntry[]; // orden: mentionRate desc
  gap: EngineGap;
};
```

Reglas:

- `provider` se normaliza con `normalizeProvider` (null → "gemini").
- `citationRate` para motores no-grounded es **null, nunca 0**: un 0%
  presentaría como fracaso lo que es una imposibilidad estructural
  (`citation_found` siempre false por construcción en `lib/llm/claude.ts` —
  ADR 0012). La UI lo renderiza como "—" con explicación.
- Input vacío → `{ engines: [], gap: null }`.

**Tests (`lib/scan/engine-breakdown.test.ts`), casos mínimos:**

1. Dos motores con rates distintos → entries correctos, orden desc, gap
   correcto (leader/laggard/points).
2. `provider: null` se agrega bajo "gemini".
3. Motor no-grounded → `citationRate === null` aunque tenga
   `citation_found: false` en todas las filas; grounded → rate numérico.
4. `dominantSentiment` solo cuenta filas con `brand_mentioned: true`; sin
   menciones → null; empate → cualquiera de los empatados (documentar que el
   orden de Map es el de inserción, mismo comportamiento que el KPI global).
5. Un solo motor → `gap: null`.
6. Input vacío → `{ engines: [], gap: null }`.
7. Tres motores (gemini/claude/openai) → forward-compat: tres entries y gap
   entre el mayor y el menor.

### Paso C — Overview: tarjeta comparativa

Fichero: `app/dashboard/projects/[projectId]/page.tsx`.

1. Eliminar el `ENGINE_LABELS` local (líneas 25–28) y el IIFE
   `engineDistribution` (líneas 313–331). Sustituir por:
   ```ts
   const { engines: engineBreakdown, gap: engineGap } =
     computeEngineBreakdown(allPromptResults ?? []);
   ```
   La query de `scan_prompt_results` (línea 249) **ya** selecciona
   `provider, brand_mentioned, citation_found, sentiment` — no tocar la query.
2. Actualizar el uso de línea 1357 (`ENGINE_LABELS[p]?.label`) a
   `getEngineMeta(p).label`.
3. Rediseñar el contenido de la tarjeta (líneas 1089–1108) manteniendo la
   estructura `card / card-head` y el estilo actual (barras `sov-bar`,
   badges existentes). Por cada motor, una fila con:
   - Punto de color + label (como hoy).
   - Barra de mención + "{mentionRate}% mención" (como hoy).
   - Nueva línea secundaria (fontSize 12, `var(--ink-3)`):
     - Citación: `"{citationRate}% citación"` si `citationRate !== null`;
       si null → `"citación n/a"` con `InfoTip`:
       *"Este motor responde sin búsqueda web, así que no puede citar
       fuentes. No es un fallo de tu marca."*
     - Sentimiento: badge pequeño con `dominantSentiment` (mapear con los
       `sentimentLabels` ya existentes en el fichero; null → "—").
4. **Insight de brecha** (pie de tarjeta, solo si `engineGap !== null` y
   `engineGap.points >= 15`):
   > "Brecha de {points} pts: tu marca aparece mucho más en
   > {leader} que en {laggard}. Mejorar tu presencia en las fuentes que usa
   > {laggard} es tu mayor oportunidad multi-motor."
   Usar `getEngineMeta(...).label` para los nombres. Con brecha < 15 pts no
   mostrar nada (no inventar insights). Estilo: bloque con
   `borderTop: 1px solid var(--line-soft)`, padding 12px 18px, fontSize 12.5.
5. Actualizar el `InfoTip` del `card-head` (línea 1087) para describir la
   tarjeta ampliada (mención, citación y sentimiento por motor).
6. Empty state: sin cambios.

### Paso D — Prompts: columna "Motores" (matriz prompt × motor)

Ficheros: `app/dashboard/projects/[projectId]/prompts/prompts-client.tsx`
(cambios principales); `prompts/page.tsx` solo si hiciera falta tipar algo
(la query ya trae `provider`, línea 115, sin filtro de status).

1. Nuevo componente local en `prompts-client.tsx`:
   ```tsx
   function EngineChips({ engines }: { engines: ResultRow[] })
   ```
   Renderiza un chip por **fila existente** de ese prompt (orden alfabético
   por provider normalizado, para que la columna sea estable entre filas):
   - `brand_mentioned === true` → chip sólido con el color del motor,
     letra `short` en blanco. `title`: `"{label}: marca mencionada"`.
   - `brand_mentioned === false` → chip hueco (borde con el color del
     motor, letra en el color, fondo transparente). `title`:
     `"{label}: marca ausente"`.
   - `brand_mentioned === null` (fila fallida / sin extracción) → chip gris
     (`var(--ink-4)` borde y letra). `title`: `"{label}: sin datos en este
     escaneo"`.
   - **Regla de honestidad:** si un motor no tiene fila para ese prompt
     (fallo puntual de ese motor en ese prompt), NO se pinta chip para él.
     Ausencia de fila = "no hay dato", nunca un "ausente" inventado.
   - Tamaño: ~18×18 px, borderRadius 5, fontSize 10, fontWeight 700, gap 4.
2. Tabla flat (líneas 172–238): nueva columna `<th>Motores</th>` entre
   "Marca" y "Competidores"; en cada fila,
   `<td><EngineChips engines={g.engines} /></td>`. `g.engines` ya existe en
   `PromptGroup`.
3. Tabla topics (líneas 264–410): misma columna en el `<thead>`; en las
   filas de prompt (`groupByPrompt(group.results).map(...)`) los chips; en
   la fila de topic, `—` (los agregados por topic y motor quedan fuera de
   alcance).
4. La columna "Marca" existente (Mencionada/Ausente agregada con
   `engines.some(...)`) **se mantiene** — sigue siendo la lectura rápida; los
   chips añaden el desglose.
5. El drawer no cambia de comportamiento: los chips no llevan onClick
   propio; el click de la fila sigue abriendo el drawer (que ya muestra la
   respuesta por motor).

### Paso E — Drawer: usar `engine-meta`

Fichero: `components/prompts/prompt-drawer.tsx`.

- Sustituir `providerLabel()` (línea 43) por `getEngineMeta(...).label` y
  los colores hardcodeados (líneas 622 y 630: `#cc785c`/`#1a73e8` y la
  inicial `"C"/"G"`) por `getEngineMeta(...).color` / `.short`.
- Sin ningún otro cambio en el drawer. Con esto, un tercer motor aparecerá
  correctamente etiquetado en Overview, tabla y drawer con solo añadir su
  entrada a `ENGINE_META`.

### Paso F — Documentación

- Añadir fila ENGINES-VALUE-1 al ledger de estado de `docs/launch-plan.md`
  (misma tabla del principio del fichero), estado según corresponda al
  cerrar el PR.
- Actualizar la cabecera de este spec (`docs/specs/engines-value-1.md`):
  estado → "Implementado (PR #NNN)".

---

## 7 · Datos y esquema

Cero cambios. Ambas páginas ya consultan `scan_prompt_results` con
`provider` incluido y con scoping por `project_id` + RLS (regla
`supabase.md` respetada: no se añade ninguna query nueva).

## 8 · Copy (castellano, sin comportamiento fake)

- Todo el copy visible en castellano (código y comentarios en inglés).
- Nunca presentar la falta de grounding de un motor como un 0% ni como
  fallo de la marca (ADR 0012).
- Nunca pintar un estado para un motor sin fila de datos.
- El insight de brecha solo aparece con ≥2 motores y ≥15 pts de diferencia.

## 9 · Tests y validación

- Nuevos: `lib/scan/engine-breakdown.test.ts` (casos del Paso B) y, si se
  añade lógica no trivial a `engine-meta.ts`, tests de `normalizeProvider` /
  `getEngineMeta` en el mismo fichero de test.
- `pnpm test && pnpm run validate && git diff --check` en verde antes del
  push. `bash scripts/agentic-handoff-check.sh` como preflight.
- QA manual (fundador, preview de Vercel):
  1. Overview de un proyecto con escaneo Gemini+Claude → tarjeta muestra
     dos motores con mención, citación (Gemini numérica, Claude "n/a" con
     tooltip) y sentimiento; insight de brecha si aplica.
  2. Prompts (flat y topics) → columna Motores con chips G/C coherentes
     con el drawer al hacer click.
  3. Proyecto antiguo con runs solo-Gemini (provider null) → todo sigue
     renderizando, un solo motor, sin insight de brecha.
  4. Proyecto sin escaneos → empty states intactos.

## 10 · Riesgos y mitigaciones

- **`page.tsx` del Overview tiene 1.418 líneas** — riesgo de regresión al
  editar JSX. Mitigación: toda la lógica nueva vive en módulos puros
  testeados; el JSX solo consume resultados; cambios acotados a la tarjeta.
- **Empate o muestras pequeñas** (p. ej. 3 prompts) pueden dar brechas
  grandes poco significativas. Aceptado para v1: el umbral de 15 pts filtra
  el ruido más obvio; refinar con confianza estadística queda fuera de
  alcance.
- **Divergencia futura `grounded` vs `GROUNDED_PROVIDERS`**: mitigada con
  comentarios cruzados en ambos ficheros (Paso A).

## 11 · Criterios de aceptación

1. La tarjeta del Overview muestra, por motor activo en el último escaneo:
   mention rate, citation rate (o "n/a" explicado si no-grounded) y
   sentimiento dominante, con los datos reales de ese run.
2. Con ≥2 motores y ≥15 pts de brecha, aparece el insight con los nombres y
   puntos correctos; en caso contrario, no aparece.
3. Las tablas de Prompts (flat y topics) muestran la columna Motores con
   chips por motor: sólido = mencionada, hueco = ausente, gris = sin datos,
   sin chip = ese motor no tiene fila.
4. Runs legacy (provider null) se agregan como Gemini y nada se rompe.
5. Cero queries nuevas, cero llamadas de proveedor nuevas, cero cambios en
   scoring/esquema/executor.
6. `pnpm test && pnpm run validate` en verde; tests nuevos del Paso B pasan.
7. Añadida entrada al ledger de `docs/launch-plan.md` y actualizado el
   estado de este spec.

## 12 · Entrega

- Rama: `claude/multi-search-engine-value-kk3cns` (ya contiene este spec).
- Un único PR sobre `main` con commits sugeridos:
  1. `feat(engines): shared engine metadata + per-engine breakdown helpers`
  2. `feat(overview): comparative per-engine card (mention, citation, sentiment, gap)`
  3. `feat(prompts): per-engine mention chips (prompt × engine matrix)`
  4. `docs: ENGINES-VALUE-1 ledger + spec status`
- PR con la plantilla de `.github/pull_request_template.md` completa,
  handoff agentic y Human Gate manual como siempre. Estimación: ~400–600
  líneas de diff, una sesión de trabajo.

---

> **Do you approve this plan? I will not implement until you confirm.**
