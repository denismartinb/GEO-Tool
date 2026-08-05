# ADR 0031 — Recalibrar pesos y bandas del GEO Score: propuesta, no cambio

- **Estado:** **propuesta — NO implementada, no aprobada**
- **Fecha:** 2026-08-05
- **Fase:** GEO-SCORE-CALIBRATION-1 (Fase 1b de `docs/geo-score-variability-2026-08.md`)
- **Decide:** nada todavía. Define **qué hay que medir**, **con qué datos**, y
  **desde cuándo existen esos datos**, para que la recalibración se decida con
  evidencia en vez de con intuición.

> `.claude/rules/scoring.md`: *"Ninguna fórmula se toca sin un ADR nuevo. No
> 'ajustes', no 'mejoras pequeñas', no cambiar un peso o un umbral de paso."*
> Este documento es ese ADR **en su fase de propuesta**. Ni un peso, ni una
> banda, ni un umbral cambian en el PR que lo introduce.

## Contexto

El GEO Score compone cuatro componentes con pesos base **presence .40 /
prominence .25 / standing .20 / authority .15**, renormalizados cuando falta
alguno (`lib/scoring/run-scoring.ts`, ADR 0015 + ADR 0026). Las bandas
cualitativas cortan en **70 / 40**.

Ninguno de esos seis números se ha validado nunca contra la distribución real
de proyectos. Se eligieron a priori, razonadamente, pero a priori. El informe
de variabilidad los dejó anotados como Fase 1b con una condición explícita:
*"necesita datos que aún no existen"*.

## El hallazgo que motiva medir ahora

`docs/geo-score-variability-2026-08.md` §1 midió un **ratio de transferencia de
0,71×**: la tasa de mención subía 66,67 pp y el GEO Score 47,15 pt. La causa
diagnosticada fue que tres de los cuatro componentes se movían juntos —
`prominence` penalizaba con posición N+1 cada prompt sin mención, y el
numerador de `standing` es el recuento de menciones. Es decir, `presence`
estaba contada aproximadamente **tres veces**.

**ADR 0026 arregló una de esas tres.** `prominence` pasó a medir rango
*condicionado a mención* (`avg_position_when_mentioned`), así que dejó de
re-codificar la tasa de mención.

**Nadie ha vuelto a medir el ratio de transferencia desde entonces.** Y esa
medición es exactamente la que decide si `prominence` merece seguir pesando
0,25: el 0,25 se fijó cuando el componente duplicaba a `presence`. Si ya no lo
hace, el peso puede estar mal por defecto o por exceso, pero está mal por un
motivo distinto al que se razonó.

## Por qué los datos no existían, y desde cuándo existen

Dos fases de agosto cambian qué runs son utilizables para calibrar:

1. **EXTRACTION-RELIABILITY-1 (ADR 0029, mergeado 2026-08-04).** Antes,
   `runStructuredExtractionForRun` truncaba cada escaneo a **20 filas**. Todo
   run anterior calculó `prominence` y `standing` sobre una fracción de sus
   propias respuestas — en Pro, sobre el 6,7 %. **Sus valores de componente no
   son observaciones válidas de nada.**
2. **SAMPLING-1 (ADR 0030, mergeado 2026-08-04).** Los proyectos pequeños
   pasan a tener ≥50 respuestas, así que sus componentes dejan de moverse
   ±24 pt por una sola respuesta.

**Consecuencia dura: el conjunto de calibración sólo puede contener runs
completados a partir del 2026-08-05.** Usar el histórico anterior no es
"aprovechar datos", es calibrar contra ruido con estructura conocida.

A la fecha de este ADR ese conjunto tiene **del orden de un puñado de runs**.
Recalibrar con eso repetiría el error original —fijar seis números sin base—
con la agravante de haberlo llamado "basado en datos".

## Qué medir, exactamente

Cinco preguntas, cada una con la decisión que desbloquea:

| # | Pregunta | Decide |
|---|---|---|
| 1 | ¿Cuál es el ratio de transferencia **después** de ADR 0026? | Si `prominence` sigue duplicando a `presence`, y por tanto si 0,25 es defendible |
| 2 | ¿Cómo se distribuyen los cuatro componentes entre proyectos reales? | Si alguno está saturado (todos ~100 o todos ~0) y por tanto no aporta señal por mucho peso que lleve |
| 3 | ¿Cómo se distribuyen los GEO Score finales? | Si los cortes 70/40 parten la población en algo informativo o dejan al 90 % en una sola banda |
| 4 | ¿Con qué frecuencia se cae cada componente (renormalización)? | Si el score que ve la mayoría es de verdad el de cuatro componentes o el de dos |
| 5 | ¿Cuánta correlación hay entre componentes? | Un par muy correlacionado es un doble conteo, se llame como se llame |

## Las consultas

Ejecutar en el editor SQL de Supabase. **Ninguna escribe.** El filtro por fecha
no es cosmético: es la frontera de validez explicada arriba.

```sql
-- 0 · Tamaño del conjunto utilizable. Si esto no llega a ~30 runs sobre >=8
--     proyectos distintos, PARAR: no hay con qué calibrar.
select count(*) as runs, count(distinct project_id) as proyectos
from public.run_scores rs
join public.scan_runs sr on sr.id = rs.run_id
where sr.status = 'completed' and sr.finished_at >= '2026-08-05';
```

```sql
-- 2 y 4 · Distribución de cada componente y frecuencia de caída.
select
  count(*)                                                           as runs,
  round(avg((details_json->'geo_score'->'presence'->>'value')::numeric), 1)   as presence_media,
  round(avg((details_json->'geo_score'->'prominence'->>'value')::numeric), 1) as prominence_media,
  round(avg((details_json->'geo_score'->'standing'->>'value')::numeric), 1)   as standing_media,
  round(avg((details_json->'geo_score'->'authority'->>'value')::numeric), 1)  as authority_media,
  count(*) filter (where not (details_json->'geo_score'->'inputs_used') ? 'prominence') as sin_prominence,
  count(*) filter (where not (details_json->'geo_score'->'inputs_used') ? 'standing')   as sin_standing,
  count(*) filter (where not (details_json->'geo_score'->'inputs_used') ? 'authority')  as sin_authority
from public.run_scores rs
join public.scan_runs sr on sr.id = rs.run_id
where sr.status = 'completed' and sr.finished_at >= '2026-08-05';
```

```sql
-- 3 · Distribución del score final contra los cortes actuales.
select
  count(*) filter (where (details_json->'geo_score'->>'score')::numeric >= 70) as banda_alta,
  count(*) filter (where (details_json->'geo_score'->>'score')::numeric >= 40
                     and (details_json->'geo_score'->>'score')::numeric < 70)  as banda_media,
  count(*) filter (where (details_json->'geo_score'->>'score')::numeric < 40)  as banda_baja,
  round(percentile_cont(0.25) within group (order by (details_json->'geo_score'->>'score')::numeric)::numeric, 1) as p25,
  round(percentile_cont(0.50) within group (order by (details_json->'geo_score'->>'score')::numeric)::numeric, 1) as mediana,
  round(percentile_cont(0.75) within group (order by (details_json->'geo_score'->>'score')::numeric)::numeric, 1) as p75
from public.run_scores rs
join public.scan_runs sr on sr.id = rs.run_id
where sr.status = 'completed' and sr.finished_at >= '2026-08-05';
```

```sql
-- 1 y 5 · Materia prima para el ratio de transferencia y las correlaciones:
--         una fila por run, para calcular fuera.
select sr.project_id, sr.finished_at,
       (details_json->>'total_results')::int                              as respuestas,
       (details_json->'geo_score'->>'score')::numeric                     as geo,
       rs.visibility_score                                                as presence,
       (details_json->'geo_score'->'prominence'->>'value')::numeric       as prominence,
       (details_json->'geo_score'->'standing'->>'value')::numeric         as standing,
       (details_json->'geo_score'->'authority'->>'value')::numeric        as authority
from public.run_scores rs
join public.scan_runs sr on sr.id = rs.run_id
where sr.status = 'completed' and sr.finished_at >= '2026-08-05'
order by sr.project_id, sr.finished_at;
```

## Criterios de parada, escritos antes de ver los números

Fijados de antemano a propósito: elegir el umbral después de mirar los datos es
cómo se justifica cualquier cosa.

- **Menos de 30 runs o menos de 8 proyectos distintos → no se recalibra.** Se
  espera y se vuelve a medir.
- **Un componente que cae en más del 30 % de los runs** no es un componente con
  un peso mal puesto: es un componente que la mayoría de usuarios no tiene. Eso
  se arregla en la recogida del dato, no en el peso.
- **Correlación > 0,8 entre dos componentes** es doble conteo. Se trata como
  hallazgo de metodología (como el hallazgo 4 de julio), no ajustando pesos.
- **Cambiar medición y pesos a la vez está prohibido.** Es la razón declarada en
  ADR 0026 para no tocar los pesos allí: si se mueven las dos cosas, ningún
  efecto es atribuible.

## Lo que este ADR NO hace

- **No cambia ningún peso, banda ni umbral.** El PR que lo introduce toca
  únicamente `docs/`.
- **No propone valores nuevos.** Proponerlos sin los datos sería exactamente el
  error que documenta.
- **No toca la capa de fiabilidad.** ADR 0024 y su margen siguen siendo
  obligatorios pase lo que pase con los pesos.

## Cuando haya datos

Este ADR pasa de `propuesta` a `aceptado` sólo con: los resultados de las cinco
consultas pegados en una sección nueva, la propuesta concreta de pesos y bandas
derivada de ellos, el efecto simulado sobre los proyectos reales (cuántos
cambian de banda y en qué dirección), y la aprobación explícita del fundador.
Hasta entonces, **los seis números actuales se quedan como están**.

Nota sobre el histórico: un cambio de pesos o bandas mueve todos los números
pasados del usuario. `compareRuns` (ADR 0024) ya lo cubre vía
`composite_version` — la recalibración tendrá que bumpear esa versión, y eso
significa que **ningún delta cruzará la frontera del cambio**. Es correcto y es
un coste real que hay que decidir con los ojos abiertos.

## Referencias

`docs/geo-score-variability-2026-08.md` (Fase 1b) ·
`docs/geo-methodology-audit-2026-07.md` (hallazgo 4, el doble conteo) ·
ADR 0015 (composite v2) · ADR 0024 (fiabilidad) · ADR 0026 (posición
condicionada) · ADR 0029 (cobertura de extracción) · ADR 0030 (suelo de
respuestas).
