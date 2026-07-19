# Task Intake Report — ENGINES-VALUE-2

**Fuentes citadas por motor** ("qué dominios usa cada motor → dónde conseguir presencia")

- Estado: Implementado en PR #240 — pendiente Human Gate
- Fecha: 2026-07-19
- Autor del intake: Director (misma sesión que ENGINES-VALUE-1)
- Agente implementador previsto: Sonnet 5 (frontend / core-flow)
- Rama de trabajo: `claude/multi-search-engine-value-kk3cns` (reiniciada desde `main` tras el merge de #228)
- Predecesora: `docs/specs/engines-value-1.md` (✅ mergeada, PR #228)

---

## 1 · Problema y objetivo

Con ENGINES-VALUE-1 el usuario ya ve **cuánto** aparece su marca en cada
motor. La pregunta accionable siguiente es **por qué y dónde actuar**: cada
motor grounded (Gemini vía Google Search, ChatGPT vía `web_search`) cita
dominios concretos al responder, y esos dominios son los objetivos de
outreach/contenido reales de la marca.

La página **Citations** (`app/dashboard/projects/[projectId]/citations/`)
ya agrega los dominios citados del último escaneo con categoría
(marca/competidor/tercero), conteo de citas y "oportunidades" (dominios de
terceros donde la marca no aparece). Pero **ignora por completo qué motor
citó cada dominio** — la query ni siquiera selecciona `provider`
(`page.tsx:113`).

**Objetivo:** atribuir cada cita a su motor y explotarlo donde ya vive el
dato: chips de motor por dominio citado, y priorización de oportunidades por
número de motores que usan esa fuente ("Reddit lo citan Gemini **y**
ChatGPT" > "lo cita solo uno"). Coste de API cero, cero esquema — misma
filosofía que ENGINES-VALUE-1.

## 2 · Clasificación

P2 con valor comercial P1 (profundiza el diferenciador multi-motor ya
shipeado). Ningún P0 bloqueado.

## 3 · Alcance incluido

- **A.** Extraer la agregación de citas de `citations/page.tsx` (líneas
  ~130–275: los bucles sobre `results` que construyen `agg` y
  `promptGroupsAgg`) a un módulo puro testeable
  `lib/citations/aggregate-citations.ts`, sin cambiar su comportamiento
  actual, y añadirle la dimensión motor.
- **B.** Atribución por motor: cada `scan_prompt_results` row tiene
  `provider`; toda cita extraída de esa fila se atribuye a ese motor
  (normalizado con `normalizeProvider` de `lib/scan/engine-meta.ts` —
  null → "gemini", igual que en toda la app).
- **C.** UI en Citations:
  - En cada fila de dominio citado (`CitationRow`): chips compactos de motor
    (reutilizar `getEngineMeta` — mismo lenguaje visual que la columna
    "Motores" de Prompts), con `title` "Citado por {Gemini}: N veces".
  - En el detalle por prompt (`PromptCitation`): mismo chip por cita.
  - KPI de cabecera: junto a los totales existentes, el desglose "X fuentes
    citadas por Gemini · Y por ChatGPT" (solo motores grounded presentes).
- **D.** Priorización de oportunidades: las `opportunityRows` se ordenan
  primero por número de motores distintos que citan el dominio (desc), luego
  por `cited` (desc) como hasta ahora. Copy en la tarjeta de oportunidades:
  "Citado por {n} motores" cuando n ≥ 2.
- **E.** Tests Vitest del nuevo módulo `aggregate-citations` (ver §7).
- **F.** Docs: fila 8c en el ledger de `docs/launch-plan.md` ya creada por
  este intake; actualizar su estado al cerrar el PR + estado de este spec.

## 4 · Alcance excluido

- **Filtro por motor** en la página Citations (segmented control) — Fase 2b
  posterior, si el fundador la quiere tras ver la Fase 1 en uso.
- Chips de motor en la tarjeta "fuentes citadas" del Overview (limitar el
  radio de cambio; el Overview ya tuvo su fase).
- Tendencias de fuentes entre escaneos, comparación de solapamiento entre
  motores (índice tipo Jaccard), y cualquier cambio de scoring.
- Esquema, RLS, executor, pipeline, `lib/llm/**`, billing.

## 5 · Áreas prohibidas — confirmación

Cero migraciones, cero queries nuevas (solo se añade `provider` al select
existente de `scan_prompt_results` en `citations/page.tsx:113`, misma tabla,
mismo scoping RLS por `project_id`), cero llamadas a proveedores, cero
cambios de scoring. Nada de la Forbidden list.

## 6 · Plan de implementación detallado

### Paso A — `lib/citations/aggregate-citations.ts` (nuevo, puro)

Mover tal cual desde `citations/page.tsx`: `normalizeDomain`,
`isSameOrSubdomain`, `resolveCitation` (con su comentario ADR-0006) y los
bucles de agregación, parametrizados:

```ts
export type CitationInputRow = {
  prompt_id: string | null;
  prompt_text_snapshot: string | null;
  brand_mentioned: boolean | null;
  extracted_json: unknown;
  provider: string | null; // NEW
};

export function aggregateCitations(input: {
  rows: CitationInputRow[];
  projectDomain: string;          // raw, se normaliza dentro
  competitorDomains: Array<{ name: string; domain: string }>;
  promptCategoryMap: Map<string, string | null>;
}): {
  citationRows: CitationRow[];     // los tipos viven hoy en citations-client
  promptGroups: PromptGroup[];
  hasStructuredCitations: boolean;
  engineTotals: Array<{ provider: string; domains: number; cites: number }>;
};
```

Cambios respecto al comportamiento actual (todo lo demás idéntico):

1. `CitationRow` gana `engines: Array<{ provider: string; cited: number }>`
   (orden: grounded primero, luego cites desc — consistente con el orden de
   motores de ENGINES-VALUE-1).
2. `PromptCitation` gana el mismo campo `engines`.
3. `opportunityRows` (se calcula en `page.tsx`, puede quedarse allí): nuevo
   orden `engines.length desc, cited desc`.
4. `engineTotals`: por motor grounded presente, nº de dominios distintos y
   nº total de citas.

Los tipos `CitationRow`/`PromptGroup`/`PromptCitation` se mueven a este
módulo y `citations-client.tsx` los re-exporta o importa de aquí (evitar
import circular: el client importa del lib, no al revés).

### Paso B — `citations/page.tsx`

- Añadir `provider` al select de `scan_prompt_results` (línea 113).
- Sustituir el bloque de agregación inline por la llamada a
  `aggregateCitations(...)`. La página queda en fetching + composición.
- Pasar `engineTotals` a `CitationsClient`.

### Paso C — `citations-client.tsx`

- Chips de motor en cada fila de dominio y en el detalle por prompt:
  componente pequeño local (estilo idéntico a los `EngineChips` de
  `prompts-client.tsx`: 18×18, borderRadius 5, `getEngineMeta().short` y
  `.color`, siempre sólidos aquí — una cita existe o no existe, no hay
  estado "ausente"), con `title="Citado por {label}: {n} veces"`.
- KPI de cabecera: línea "X fuentes · Gemini N · ChatGPT M" (solo motores
  presentes en `engineTotals`; si solo hay uno, se muestra uno).
- Tarjeta de oportunidades: badge "Citado por {n} motores" cuando n ≥ 2.
- Regla de honestidad: los chips muestran **solo** motores que realmente
  citaron ese dominio. Claude no aparecerá nunca (no tiene búsqueda web) y
  no se le inventa presencia ni ausencia.

### Paso D — Docs

Ledger `docs/launch-plan.md` fila 8c → estado implementado/pendiente Human
Gate al abrir el PR; este spec → "Implementado en PR #NNN".

## 7 · Tests (`lib/citations/aggregate-citations.test.ts`)

1. **Regresión de paridad:** con filas sin dimensión motor relevante, los
   `citationRows`/`promptGroups` producen los mismos agregados que la
   lógica actual (dedup por dominio grounding, inline por URL, categorías
   brand/competitor/third_party, `brandMentioned` yes/no/na).
2. Mismo dominio citado por Gemini y ChatGPT → una sola fila con
   `engines` de 2 entradas y conteos por motor correctos.
3. `provider: null` se atribuye a "gemini".
4. Cita grounding sin dominio resuelto → sigue agrupando por
   `unresolved:{title}` y el motor se atribuye igualmente.
5. `engineTotals` cuenta dominios distintos y citas por motor.
6. Orden de oportunidades: dominio citado por 2 motores por delante de uno
   con más citas de un solo motor.
7. Fila de Claude sin citas → no aparece en `engines` ni en `engineTotals`.

## 8 · Riesgos y mitigaciones

- **Mover ~150 líneas de agregación a lib**: riesgo de regresión sutil en
  dedup/categorías. Mitigación: test de paridad (caso 1) escrito ANTES de
  mover el código, y el diff de `page.tsx` debe ser solo borrado + llamada.
- **Página Citations con datos legacy solo-Gemini**: chips de un solo motor,
  KPI con un motor — sin caso especial, cae solo.
- Sin riesgo de pipeline/datos: display-only.

## 9 · Criterios de aceptación

1. Cada dominio citado muestra qué motores lo citaron y cuántas veces.
2. Las oportunidades priorizan dominios citados por más motores.
3. KPI de cabecera con desglose por motor grounded presente.
4. Paridad exacta de los agregados existentes (test 1) y suite completa en
   verde (`pnpm test && pnpm run validate`).
5. Cero queries nuevas (solo `provider` añadido al select existente), cero
   esquema, cero cambios de scoring.

## 10 · Entrega

Rama `claude/multi-search-engine-value-kk3cns` (esta), un único PR, commits
sugeridos:

1. `refactor(citations): extract aggregation into lib/citations (parity tests)`
2. `feat(citations): per-engine attribution — chips, engine totals, opportunity ranking`
3. `docs: ENGINES-VALUE-2 ledger + spec status`

Estimación: ~350–500 líneas de diff netas, una sesión. QA + Human Gate como
siempre (preview de Vercel + "qué probar" en castellano).

---

> **Do you approve this plan? I will not implement until you confirm.**
