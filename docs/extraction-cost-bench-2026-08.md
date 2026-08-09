# Banco de pruebas de extracción — EXTRACTION-COST-BENCH-1 (2026-08)

**Estado: herramienta construida, verificada, sin ejecutar contra datos
reales.** Esta fase (ver `docs/brand/design-decisions-log.md` §41) construyó y
validó `scripts/extraction-bench.ts`. La sesión que la construyó no tenía
credenciales de Supabase ni de los proveedores LLM, así que este documento no
contiene resultados — contiene la metodología, cómo ejecutarla, y cómo leer lo
que salga. Rellenar la sección de resultados es la fase siguiente.

## Qué mide y por qué

`lib/scan/extraction.ts` extrae datos estructurados (`brand_mentioned`,
`mentioned_competitors_count`, `sentiment`, citas) de cada respuesta generada
en un escaneo, usando **el mismo proveedor que generó la respuesta**
(Gemini→Gemini, Claude→Claude, OpenAI→OpenAI). No hay ninguna razón técnica
para esa correspondencia — el input de la extracción es
`raw_response_text`, ya persistido en texto plano, así que cualquier
extractor puede parsearlo venga de donde venga.

La extracción es además:
- ~50% de todas las llamadas LLM del pipeline de escaneo (una por cada
  llamada de generación).
- La llamada con más input de todo el pipeline (esquema completo de ~2-2,5k
  caracteres + la respuesta cruda entera).
- **Invisible en coste**: ninguna de las tres funciones de extracción
  (`extractGeminiStructuredData`, `extractClaudeStructuredData`,
  `extractOpenAIStructuredData`) devuelve tokens ni coste.

La pregunta que responde este banco: **¿un modelo barato, usado como
extractor único para las tres procedencias, produce los mismos campos que hoy
se persisten y se usan para puntuar?**

## Qué compara y qué NO compara

| Campo | ¿Se compara? | Por qué |
|---|---|---|
| `brand_mentioned` | Sí | Alimenta directamente el GeoScore |
| `mentioned_competitors_count` | Sí | Alimenta directamente el GeoScore |
| `sentiment` | Sí | Alimenta recomendaciones |
| `citations_count` / `citation_found` | **No** | Se calculan desde `raw_response_json.grounding_chunks`, metadata congelada en el momento de **generación** — ningún modelo de extracción puede cambiarlos. Compararlos mediría ruido, no diferencia entre extractores. |
| Coste por llamada | Estimado | Ninguna función de extracción devuelve `usage` del proveedor; ver limitación abajo. |

## Candidatos

| Candidato | Rol |
|---|---|
| `gemini-2.5-flash-lite` | Candidato barato (Gemini) — $0,10/$0,40 por 1M tokens |
| `gpt-4o-mini` | Candidato barato (OpenAI) — $0,15/$0,60 por 1M tokens |
| `gemini-2.5-flash` | Referencia/control — es el modelo que YA usa producción para extraer filas generadas por Gemini, así que su tasa de acuerdo en esas filas es una prueba de que el banco mismo funciona, no un hallazgo |

Precios públicos recogidos 2026-08 — revisar antes de usarlos para fijar
pricing si ha pasado mucho tiempo.

## Cómo ejecutarlo

```bash
# .env.local necesita: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# GEMINI_API_KEY, OPENAI_API_KEY (no hace falta ANTHROPIC_API_KEY — las filas
# generadas por Claude se usan como ground truth, no se reextraen con Claude)

pnpm bench:extraction --limit 50   # pasada corta primero
pnpm bench:extraction --limit 300  # pasada completa, ~100 filas por proveedor
```

El script es de **solo lectura** — no escribe en `scan_prompt_results` ni en
ninguna otra tabla (`scripts/extraction-bench.test.ts` lo verifica de forma
estática). Cuesta lo que cuestan las llamadas de extracción de prueba: del
orden de $1-2 para una pasada de 300 filas × 3 candidatos.

## Cómo leer el resultado

El script imprime una tabla markdown por candidato: filas procesadas, errores,
% de acuerdo por campo, y coste estimado medio por llamada.

- **`gemini-2.5-flash` (referencia) con acuerdo <95% en filas generadas por
  Gemini** sería una señal de que algo va mal en el propio banco (el
  candidato debería casi reproducir lo que producción ya hizo), no en el
  modelo — revisar antes de confiar en el resto de la tabla.
- **Un candidato barato con acuerdo alto (>90-95%) en los tres campos, en las
  tres procedencias** (Gemini/Claude/OpenAI) es la señal para pasar a una
  fase de implementación que desacople extracción de generación.
- **Un candidato que falla sobre todo en `mentioned_competitors_count`**
  probablemente indica que subestima matices en `display_name_found`/
  `evidence` — mirar filas concretas en desacuerdo antes de descartarlo, el
  fallo puede estar concentrado en un tipo de prompt (p. ej. nombres de marca
  ambiguos) y no ser generalizable.

## Limitación conocida: el coste es estimado, no medido

Ninguna de las tres funciones de extracción de `lib/llm/**` devuelve
`usage`/tokens del proveedor — no era parte de este alcance tocarlas (el Task
Intake aprobado prohíbe editar `lib/llm/**` y `lib/scan/**` en esta fase). El
coste que imprime el script es una **estimación**: caracteres de entrada/salida
÷ 4 como aproximación de tokens, multiplicado por la tarifa pública del
candidato. Sirve para una decisión de "¿merece la pena seguir mirando este
candidato?", no para fijar el ahorro exacto en el pricing. Si el resultado de
acuerdo justifica cambiar el extractor de producción, una fase posterior
debería exponer `usage` real desde las tres funciones antes de comprometer una
cifra de ahorro concreta al pricing.

## Resultados

_Pendiente — ejecutar `pnpm bench:extraction` con credenciales reales y
rellenar esta sección con la tabla que imprime el script, más la
recomendación (qué candidato, con qué degradación medida, y en qué campos
falla si falla)._
