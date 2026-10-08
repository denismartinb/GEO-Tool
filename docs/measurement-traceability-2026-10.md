# Trazabilidad de medición y recomendaciones — mapa y discrepancias (2026-10-08)

Fase 1 de P1 («Trazabilidad de medición y recomendaciones»): qué hace hoy el
código frente a lo que prometen la documentación pública y los Términos. Todo
lo de esta tabla está leído del código a fecha de hoy; las rutas son las que lo
prueban. **Estado** dice qué cerró el parche `MEASUREMENT-BASIS-1` (log §236) y
qué queda abierto.

## 1. Qué se registra por respuesta y por escaneo

| Dato pedido | Dónde vive hoy | Estado |
|---|---|---|
| Prompt exacto | `scan_prompt_results.prompt_text_snapshot` | Registrado |
| País / idioma | `country_snapshot`, `language_snapshot` | Registrado. **No entraban** en ninguna comparación; ahora sí |
| Motor | `provider` | Registrado |
| Modelo | `model` (lo que devuelve el proveedor: `modelVersion` en Gemini, `OPENAI_MODEL` en ChatGPT, `data.model` en Claude) | Registrado por fila. **No entraba** en ninguna comparación; ahora sí. No es un identificador versionado garantizado (ADR 0036) |
| Modo de búsqueda / grounding | **No se guarda por fila.** Es una propiedad fija de cada llamada (`lib/llm/*`): Gemini con Google Search, ChatGPT con `web_search` forzado, Claude sin búsqueda; se infiere de `GROUNDED_PROVIDERS` | Ahora se persiste el booleano por motor en `measurement_basis.by_engine[*].grounded`. Sigue sin registrarse el modo por fila |
| Fecha | `created_at` de la fila / `finished_at` del run | Registrado |
| Resultado / error | Fila `completed` o **ninguna fila**: un motor que falla no escribe fila; su causa vive en `job_logs`. `extraction_error` por fila para fallos de extracción | **Abierto**: `expected − valid` dice cuántas faltan, no por qué |
| Fuentes | `raw_response_json.grounding_chunks` + `extracted_json.citations` | Registrado |
| Respuesta original | `raw_response_text` | Registrado |
| Respuestas válidas frente a esperadas | `scan_runs.total_prompts × motores` se conocía, no se guardaba junto al score | **Cerrado**: `measurement_basis.responses.{valid,clean,expected,missing}` |
| Cómo cambia el score si falla un motor | `engine_coverage` decía *cuál* faltaba, no cuánto pesaba | **Cerrado**: `engine_sensitivity` (recálculo sin cada motor) |
| Fórmula / versionado comprobable | `geo_score.composite_version` + `geo_score.formula` (v4) | **Cerrado**: `formulas_used.geo_score` seguía diciendo los pesos de v3; ahora es el mismo texto |
| Razón de la confianza | Sólo la etiqueta; el porqué estaba en un comentario de código | **Cerrado**: `confidence_reason` |
| Preguntas distintas frente a repeticiones | `sample_index` existe (SAMPLING-1); el score cuenta filas | **Cerrado a medias**: `prompts.distinct` / `max_samples` se registran y la razón de la confianza los cita. **Abierto**: la etiqueta de confianza sigue contando repeticiones como respuestas |

## 2. Discrepancias con la promesa pública

1. **«La tendencia nunca mezcla escaneos que no midan lo mismo» / «si cambias
   prompts, motores o plan, el número vuelve a ser el de tu último escaneo»**
   (`/docs/metodologia/geo-score`). `compareRuns` miraba versión, componentes,
   motores y *número* de respuestas; `isWindowEligible` ni los motores. Dos
   escaneos con preguntas distintas y el mismo recuento eran comparables.
   **Cerrado** en este parche (una única definición compartida).
2. **Los Términos** avisan de que las APIs no replican la interfaz de un
   usuario; el dashboard, las respuestas individuales y los informes no lo
   decían. **Cerrado en el dashboard** (nota «Base de esta medición»).
   **Abierto** en el cajón de cada respuesta y en el informe exportable.
3. **«Lo que no se puede medir se excluye y se declara»** — cumplido para los
   componentes (`inputs_used` + `reason`). No existía su equivalente para una
   *respuesta* que falta: se resta del total en silencio. **Cerrado** con
   `expected`/`missing`.
4. **Separar salud técnica, menciones, citas, cuota de voz y resultado
   comercial.** El compuesto los mezcla en un número; el desglose los enseña,
   pero «resultado comercial» no existe en el producto y no se debe sugerir.
   **Abierto** (decisión de producto).

## 3. Recomendaciones

| Requisito | Estado hoy |
|---|---|
| Evidencia concreta del escaneo o la página | Sí: `evidence_json.affected_prompt_details` (prompt, motor, competidores, dominios, snippet). Mejor desde RECS-EVIDENCE-2 |
| Tipo de mejora | Sí: `recommendation_type`, `impact`, `effort` |
| Estimación etiquetada | **Parcial.** «+X pt potenciales» / «si te citan» es un techo contrafactual del *GEO Score* (ADR 0016/0017) y mezcla en el mismo número puntos de medición de IA y de preparación técnica. La etiqueta «potenciales» no dice «techo» ni «hipótesis». La «Confianza» de la tarjeta es la **del run**, no la del efecto de la recomendación |
| Dependencia | **Parcial.** Sólo el control (`own_site`/`third_party`/`in_app`) en `deliverable.ts`; no hay campo «depende de» |
| Criterio para validarla | **No existe como campo.** La verificación posterior (RECS-LOOP-1, ADR 0041) es fáctica y buena, pero se calcula después, no se declara en la tarjeta |
| No inventar precios, condiciones, testimonios, resultados, certificaciones ni datos clínicos | **Sólo regla blanda de prompt** (`recommendation-rewrite-llm.ts`: placeholders `[tu dato aquí]`). El guardián de servidor (`rewrite-validation.ts`) cubre competidores inventados, dominios inventados y juicio comparativo; **no detecta cifras, precios, testimonios, certificaciones ni datos clínicos** |
| Campo pendiente y revisión obligatoria | Hay placeholder y una insignia «N huecos por rellenar»; no hay revisión **exigida** antes de copiar |
| Nada se publica solo | Cumplido: el producto no escribe en webs de clientes |

## 4. Prioridad elegida para el parche y por qué

**Comparabilidad y base de la medición** (este PR). Es la única discrepancia que
afecta a un *número que el cliente ve y compara* sin que nadie lo avise, y la
única donde la documentación pública afirma lo contrario de lo que hace el
código. Es aditiva (jsonb, sin migración), no toca ninguna fórmula y se prueba
sin red.

**Siguiente por orden de riesgo** (cada uno con su Task Intake, ninguno hecho):

1. Guarda de servidor contra cifras/precios/testimonios/certificaciones/datos
   clínicos en artefactos generados. Riesgo: contenido inventado que el cliente
   copia a su web. Hoy sólo lo frena una instrucción de prompt.
2. Tarjeta de recomendación con evidencia, dependencia, criterio de validación y
   estimación rotulada como «techo, no resultado».
3. Límite de APIs, modelo, fecha y fuentes en el cajón de respuesta individual y
   en el informe PDF.
4. Recalibrar la etiqueta de confianza para que repetir una pregunta no cuente
   como evidencia independiente (ADR 0015/0031; bloqueado por datos).
