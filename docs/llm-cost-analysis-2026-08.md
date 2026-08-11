# Análisis de coste LLM del producto — 2026-08

Primer desglose real de a dónde va el gasto de LLM de GenScore, con datos de
producción. Nace de la pregunta del fundador para ajustar el pricing: *"cuánto
coste se va en cada motor, en escaneo, en auditoría web, en grounding"*.

**Qué es y qué no es.** Todo lo marcado como *medido* sale de consultas SQL
sobre datos reales (las consultas están abajo, para poder repetirlas). Todo lo
marcado como *estimado* sale de multiplicar tamaños por tarifas públicas y
**no** es una medición — el producto no registra tokens ni coste de la mayoría
de sus llamadas, y ese hueco es en sí mismo uno de los hallazgos.

---

## Resumen ejecutivo

1. **El coste no es hoy un problema de pricing**: ~$15/mes en total, ~1-3% de
   COGS sobre el precio de los planes.
2. **A tope de plan sí lo sería**: ~31% de COGS en Pro, ~37% en Agencia.
3. **OpenAI es ~70% del coste medido de generación**, y el 86% de eso es el
   fee de `web_search` ($10/1.000 llamadas, sin tramo gratuito), no el modelo.
4. **OpenAI no es redundante**: aporta cobertura de fuentes real y no
   solapada con Gemini. Recortarlo cuesta producto, no solo coste.
5. **La extracción es ~50% de las llamadas LLM del pipeline y no registra
   coste en ningún sitio.** Es el mayor tramo no medido.
6. **Cerrado con cuatro interruptores por proyecto en `/debug`** (motores,
   muestreo, y las dos mitades de auditoría) — ver §7 para la tabla
   consolidada y qué columna controla cada línea de coste.

---

## Método y ventanas de datos

| Bloque | Ventana | Alcance |
|---|---|---|
| Coste de generación | Últimos 30 días | Plan Agencia (95 escaneos) y Pro (2 escaneos) |
| Solape entre motores | Todo el histórico | 762 pares (mismo `run_id` + `prompt_id`) |
| Solape intra-motor (control) | Todo el histórico | 43 pares (dos muestras del mismo prompt en la misma ejecución) |
| Muestreo | Todo el histórico | 214 escaneos completados |

Las ventanas **no son homogéneas** entre bloques: los porcentajes de solape son
sólidos, pero no deben cruzarse aritméticamente con las cifras de coste de 30
días.

**Aviso importante sobre la ventana de coste:** los 30 días son en su mayoría
**anteriores a SAMPLING-1** (cerrado el 2026-08-05). Para los proyectos que hoy
sí muestrean, el coste real actual es hasta 3× el medido aquí.

---

## 1. Coste de generación, medido

Datos de `scan_prompt_results.tokens_in/tokens_out` (las únicas columnas de
coste que el producto rellena), plan Agencia, 30 días:

| Motor | Llamadas | Coste tokens | Fee búsqueda | **Total** | **$/llamada** |
|---|---|---|---|---|---|
| Claude Haiku 4.5 | 788 | $1,70 | — | **$1,70** | $0,0022 |
| Gemini 2.5 Flash | 788 | $1,58 | $0 (tramo gratuito) | **$1,58** | $0,0020 |
| gpt-4o-mini | 666 | $1,11 | **$6,66** | **$7,77** | **$0,0117** |
| | | | | **$11,05** | |

**OpenAI cuesta ~5,5× por llamada que los otros dos, y el 86% de esa diferencia
es el fee de búsqueda, no el modelo.** `lib/llm/openai.ts:196,204` fuerza
`tool_choice: { type: "web_search" }` en cada llamada de generación, y la
tarifa de OpenAI es $10 por 1.000 llamadas **más ~8.000 tokens de entrada
facturados por búsqueda** — lo que explica el `avg_tokens_in` de 8.659 de
OpenAI frente a ~140 de los otros dos.

**Gemini no paga grounding hoy**: el tramo gratuito de Gemini 2.5 es de 1.500
peticiones/día y el volumen actual está muy por debajo. OpenAI **no tiene
tramo gratuito**.

### Por escaneo y por plan

- **23,6 respuestas por escaneo** de media en Agencia (~8 prompts × 3 motores).
- **Generación: ~$0,12 por escaneo** (medido).
- **Extracción: ~$0,04 por escaneo** (*estimado*, ver §3).
- **Total: ~$0,16 por escaneo** → ~$4,70/mes por proyecto a cadencia diaria.

### Proyección a tope de plan

Misma tarifa por llamada, `samples: 1`, cadencia diaria. **Proyección, no
medición**:

| Escenario | Coste/mes por proyecto | COGS aprox. |
|---|---|---|
| Hoy (~8 prompts) | ~$4,70 | 1-3% |
| Pro a su tope (100 prompts) | ~$61 | **~31%** |
| Agencia a su tope (300 prompts) | ~$184 | **~37%** |

Esto, y no la factura actual, es lo que debería informar el precio de los
planes o la altura de sus topes.

---

## 2. ¿Es redundante OpenAI? No.

La pregunta que decide si el fee está justificado. Dos medidas.

### Como detector: OpenAI aporta poco

Sobre 762 pares (mismo prompt, mismo escaneo, ambos motores con fila
completada):

| | Gemini | OpenAI |
|---|---|---|
| Pares donde cita | 660 (86,6%) | 420 (55,1%) |
| Pares donde menciona la marca | 399 (52,4%) | 332 (43,6%) |

**Solo en 20 de 762 pares (2,6%) OpenAI encuentra una cita que Gemini no ve.**
En menciones sí aporta más: 76 casos (10%) donde solo OpenAI ve la marca.

### Como fuente: OpenAI aporta mucho

| Comparación | Pares | Dominios A | Dominios B | Solape medio |
|---|---|---|---|---|
| Gemini vs **OpenAI** | 308 | 11,10 | 5,33 | **5,3%** |
| Gemini vs **Gemini** (control) | 43 | 11,33 | 12,16 | **58,5%** |

**El control es lo que cierra la pregunta.** Un solape del 5,3% podía
significar dos cosas incompatibles: diversidad real de fuentes, o ruido de un
sensor inestable. Comparando Gemini consigo mismo —mismo prompt, misma
ejecución, dos muestras— el solape sube a 58,5%. Es un factor de 11 de
diferencia: **los dos motores miran universos de fuentes genuinamente
distintos.**

El tamaño desigual no lo explica: si los ~5,3 dominios de OpenAI salieran del
mismo repertorio del que Gemini saca sus ~11, se esperarían varios
compartidos, no 0,77.

**Conclusión: OpenAI aporta ~4,6 dominios exclusivos por respuesta, ~29% de la
unión total de fuentes citadas.** Quitarlo o recortarlo agresivamente pierde
cobertura real.

---

## 3. La extracción: el mayor tramo no medido

`lib/scan/extraction.ts` extrae datos estructurados de cada respuesta usando
**el mismo proveedor que la generó**, sin ninguna razón técnica — el input es
`raw_response_text`, ya persistido en texto plano.

- Es **1:1 en llamadas con la generación** (~50% de todas las llamadas LLM del
  pipeline).
- Es la llamada con **más input** del pipeline (esquema completo ~2-2,5k
  caracteres + la respuesta cruda entera).
- **No registra tokens ni coste en ninguna parte.**

Estimación (*no medición*), por escaneo de Agencia:

| Extractor actual | $/llamada est. | Por escaneo |
|---|---|---|
| Claude Haiku 4.5 | ~$0,0027 | ~$0,022 |
| Gemini 2.5 Flash | ~$0,0014 | ~$0,012 |
| gpt-4o-mini | ~$0,00036 | ~$0,003 |
| **Total** | | **~$0,037** |

Ironía útil: Claude Haiku, el modelo más caro por token de los tres, es hoy el
extractor más caro — para una tarea mecánica donde su capacidad extra no
aporta nada. Unificar la extracción en un modelo barato ahorraría ~76% de ese
tramo (~$0,028/escaneo).

**Sin verificar todavía.** `scripts/extraction-bench.ts`
(EXTRACTION-COST-BENCH-1) existe para medirlo sobre filas históricas sin
ejecutar ningún escaneo — ver `docs/extraction-cost-bench-2026-08.md`.

---

## 4. El suelo de ruido del grounding

Hallazgo secundario del control, y nadie lo había medido: **el mismo motor, el
mismo prompt, la misma ejecución, discrepa en ~41% de las fuentes que cita**
(58,5% de solape).

Esto confirma con número dos decisiones de diseño que ya estaban tomadas por
intuición:

- El suavizado por mayoría de `performing`/`invisible` sobre
  `CITATION_WINDOW_SIZE` ejecuciones (`lib/web-audit/opportunity-matrix.ts`).
- La regla de que un aviso de regresión es una **transición**, nunca un estado
  (`.claude/rules/web-audit.md`).

Corolario para cualquier fase futura: no añadir una segunda capa de suavizado
encima de la existente, y no tratar la aparición/desaparición de una fuente
concreta entre dos escaneos como señal.

---

## 5. Palancas

### Decididas

| Palanca | Decisión | Estado |
|---|---|---|
| **Reparto asimétrico de muestras** (menos muestras de OpenAI) | **3/3/2**, no 3/3/1 | Sin implementar. Aplica solo a proyectos con muestreo: **6 de 214 escaneos**. Ahorra céntimos/mes hoy; vale cuando el muestreo sea común |
| **Alcance de la asimetría** | Solo repeticiones, **nunca cobertura de prompts** (fundador, 2026-08-09) | Invariante: *todo prompt activo se pregunta a todos los motores del plan al menos una vez; solo varían las repeticiones*. Recortar cobertura dejaría prompts sin dato de un motor — un hueco visible para el cliente |

El límite de 3/3/2 no es estético: con 1 muestra OpenAI se queda en 8
respuestas, por debajo de `MIN_RESPONSES_FOR_BAND` (10). Dado que §2 demuestra
que lo que aporta es señal real, dejarlo bajo el listón de confianza del propio
producto es mal negocio.

### Operativas — disponibles sin tocar código

Al volumen actual valen **más que todas las optimizaciones de código juntas**:

- **Apagar escaneo recurrente** en dominios que nadie está mirando
  (`projects.recurring_scans_enabled`, interruptor en `/debug`). El cron
  escanea a diario en free/pro/agency.
- **Apagar la auditoría automática** en esos mismos dominios
  (`projects.auto_web_audit_enabled`). Se dispara tras cada escaneo en Pro+ y
  **no** pasa por el límite de 5/día que sí protege el botón manual
  (`lib/recommendations/domain-coverage.ts:509`).

Nota: un apagado masivo por SQL no cambia el `default true` de
`auto_web_audit_enabled`, así que los proyectos nuevos siguen naciendo con la
auditoría encendida.

### Descartadas, con motivo

| Opción | Por qué no |
|---|---|
| **OpenAI a `tool_choice: auto`** | Ya se probó (2026-07-18, 10 prompts): respondió de memoria el 100% de las veces — cero búsquedas, cero citas. Además diluiría el denominador de `citation_score`, con `openai` declarado en `GROUNDED_PROVIDERS`. Documentado en `lib/llm/openai.ts:197-203` |
| **Modelo de generación más barato** | El fee es el 86% del coste de OpenAI, no el modelo: el ahorro máximo es ~15%. Y el modelo de generación **es el instrumento de medida** — abaratarlo cambia lo que se mide, no lo que cuesta medirlo |
| **Quitar OpenAI del escaneo** | §2: aporta ~29% de la unión de fuentes. Además rompería la comparabilidad histórica — `run_scores.details_json` lleva el *engine set* en su huella (DELTA-GUARD-1) |

---

## 6. Lo que sigue sin medirse

- **Tokens y coste de extracción** — `extractGeminiStructuredData` /
  `extractClaudeStructuredData` / `extractOpenAIStructuredData` no devuelven
  `usage`. Toda la §3 es estimación.
- **Coste de la cobertura de dominio** (auditoría web automática) — llamadas
  Gemini grounded por escaneo en Pro+, sin registro de tokens.
- **Coste de onboarding** — 4-8 llamadas Gemini por proyecto creado
  (perfil de negocio, sugerir competidores, sugerir prompts, alias de marca),
  una de ellas grounded.
- **`cost_usd` nunca se ha calculado**, en ninguna tabla, para ningún
  proveedor. La columna existe desde la migración 0001 y se persiste como
  `null` (`lib/scan/executor.ts:330`).

---

## 7. Resumen consolidado, por etapa y motor (cierre, 2026-08-10)

Todo lo anterior, en una tabla — por escaneo, salvo donde se indique.

| Etapa | Gemini | Claude | OpenAI | Total | Estado |
|---|---|---|---|---|---|
| **Generación** ($/llamada) | $0,0020 | $0,0022 | $0,0117 (86% fee búsqueda) | — | Medido |
| **Generación** ($/escaneo, ~8 llamadas) | $0,016 | $0,018 | $0,094 | **$0,128** | Medido |
| **Extracción** ($/llamada est.) | $0,0014 | $0,0027 | $0,00036 | — | Estimado |
| **Extracción** ($/escaneo) | $0,012 | $0,022 | $0,003 | **$0,037** | Estimado |
| **Auditoría — cobertura IA** ($/auditoría, peor caso, ~8 prompts) | $0,28 | n/a | n/a | **$0,28** | No medido |
| **Auditoría — técnica** ($/auditoría) | $0 | $0 | $0 | **$0** | Cero por diseño |

**Por proyecto:** ~$0,16/escaneo (generación + extracción) → ~$4,70/mes a
cadencia diaria → ~$61/mes al tope de Pro (100 prompts, ~31% de COGS) →
~$184/mes al tope de Agencia (300 prompts, ~37% de COGS). El muestreo
(SAMPLING-1) puede multiplicar todo esto hasta ×5 en un proyecto con pocos
prompts activos.

### Qué interruptor controla cada línea

Las cuatro fases que salieron directamente de este análisis, todas en
`/debug`, por proyecto:

| Línea que afecta | Columna | Fase | Por defecto |
|---|---|---|---|
| Cuántos motores generan | `engine_{gemini,claude,openai}_enabled` | ENGINE-DEBUG-TOGGLE-1 (log §54) | Los tres `true` |
| Cuántas repeticiones (muestreo) | `sampling_enabled` | SAMPLING-DEBUG-TOGGLE-1 (log §53) | `false` |
| Si el escaneo se repite a diario | `recurring_scans_enabled` | (previo a esta serie) | `false` |
| Auditoría — cobertura por IA | `auto_coverage_audit_enabled` | WEB-AUDIT-AUTO-SPLIT-1 (log §52) | `false` |
| Auditoría — técnica | `auto_technical_audit_enabled` | WEB-AUDIT-AUTO-SPLIT-1 (log §52) | `false` |

Versión visual de esta tabla (libro de coste con badges medido/estimado/no
medido/cero y las cuatro cifras consolidadas como stat tiles): artefacto
generado en la sesión del 2026-08-10 — no persistente entre sesiones: si se
necesita de nuevo, regenerar desde esta tabla en vez de buscar el enlace.

---

## Consultas usadas

### Coste de generación por plan y motor

```sql
select pr.current_plan, spr.provider,
       count(*) as llamadas_generacion,
       count(distinct spr.run_id) as escaneos,
       sum(spr.tokens_in) as tokens_in_total,
       sum(spr.tokens_out) as tokens_out_total
from public.scan_prompt_results spr
join public.projects p  on p.id = spr.project_id
join public.profiles pr on pr.id = p.owner_user_id
where spr.created_at >= now() - interval '30 days'
group by pr.current_plan, spr.provider
order by pr.current_plan, spr.provider;
```

### Matriz de acuerdo entre motores

```sql
with g as (
  select run_id, prompt_id, brand_mentioned as g_m, citation_found as g_c
  from public.scan_prompt_results
  where provider = 'gemini' and status = 'completed'
),
o as (
  select run_id, prompt_id, brand_mentioned as o_m, citation_found as o_c
  from public.scan_prompt_results
  where provider = 'openai' and status = 'completed'
)
select count(*) as total_pares,
       count(*) filter (where g_c and o_c)         as ambos_citan,
       count(*) filter (where g_c and not o_c)     as solo_gemini_cita,
       count(*) filter (where o_c and not g_c)     as solo_openai_cita,
       count(*) filter (where not g_c and not o_c) as ninguno_cita
from g join o using (run_id, prompt_id);
```

### Solape de dominios citados (motor A vs motor B)

Sustituir los `provider` de los dos CTE.

```sql
with a as (
  select run_id, prompt_id,
         array_agg(distinct lower(c->>'domain'))
           filter (where c->>'domain' is not null) as domains
  from public.scan_prompt_results spr,
       jsonb_array_elements(coalesce(spr.extracted_json->'citations','[]'::jsonb)) c
  where spr.provider = 'gemini' and spr.status = 'completed'
  group by run_id, prompt_id
),
b as (
  select run_id, prompt_id,
         array_agg(distinct lower(c->>'domain'))
           filter (where c->>'domain' is not null) as domains
  from public.scan_prompt_results spr,
       jsonb_array_elements(coalesce(spr.extracted_json->'citations','[]'::jsonb)) c
  where spr.provider = 'openai' and spr.status = 'completed'
  group by run_id, prompt_id
)
select count(*) as pares,
       round(avg(cardinality(a.domains)), 2) as avg_dom_a,
       round(avg(cardinality(b.domains)), 2) as avg_dom_b,
       round(100.0 * avg(
         cardinality(array(select unnest(a.domains) intersect select unnest(b.domains)))::numeric
         / greatest(cardinality(array(select unnest(a.domains) union select unnest(b.domains))), 1)
       ), 1) as pct_solape_medio
from a join b using (run_id, prompt_id);
```

### Control intra-motor (Gemini vs Gemini, misma ejecución)

El que distingue diversidad real de ruido del sensor. Requiere ejecuciones con
`sample_count > 1` — comprobarlo antes con
`select count(*) filter (where sample_count > 1) from public.scan_runs where status = 'completed';`

```sql
with g as (
  select run_id, prompt_id, id,
         row_number() over (partition by run_id, prompt_id order by created_at, id) as rn
  from public.scan_prompt_results
  where provider = 'gemini' and status = 'completed' and prompt_id is not null
),
pares as (
  select a.id as id_a, b.id as id_b
  from g a join g b
    on a.run_id = b.run_id and a.prompt_id = b.prompt_id and a.rn = 1 and b.rn = 2
),
doms as (
  select spr.id,
         array_agg(distinct lower(c->>'domain'))
           filter (where c->>'domain' is not null) as domains
  from public.scan_prompt_results spr,
       jsonb_array_elements(coalesce(spr.extracted_json->'citations','[]'::jsonb)) c
  group by spr.id
)
select count(*) as pares_gemini_vs_gemini,
       round(avg(cardinality(da.domains)), 2) as avg_dom_muestra_a,
       round(avg(cardinality(db.domains)), 2) as avg_dom_muestra_b,
       round(100.0 * avg(
         cardinality(array(select unnest(da.domains) intersect select unnest(db.domains)))::numeric
         / greatest(cardinality(array(select unnest(da.domains) union select unnest(db.domains))), 1)
       ), 1) as pct_solape_medio
from pares
join doms da on da.id = pares.id_a
join doms db on db.id = pares.id_b;
```

---

## Tarifas usadas (públicas, recogidas 2026-08)

| Modelo / servicio | Entrada | Salida |
|---|---|---|
| Gemini 2.5 Flash | $0,30 / 1M | $2,50 / 1M |
| Gemini 2.5 Flash-Lite | $0,10 / 1M | $0,40 / 1M |
| Claude Haiku 4.5 | $1,00 / 1M | $5,00 / 1M |
| gpt-4o-mini | $0,15 / 1M | $0,60 / 1M |
| OpenAI `web_search` | $10 / 1.000 llamadas + ~8.000 tokens entrada por búsqueda | — |
| Gemini grounding (2.5) | 1.500/día gratis, luego $35 / 1.000 | — |

**Revisar antes de reutilizarlas** si ha pasado tiempo: las tarifas cambian
(Gemini subió precios el 2026-07-02) y todo el análisis depende de ellas.
