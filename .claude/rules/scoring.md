---
description: Invariantes de la metodología de cálculo del GEO Score y sus métricas.
paths:
  - "lib/scoring/**"
---

# Metodología GEO — invariantes

Aplican automáticamente al tocar el scoring. **Esta es la zona de mayor riesgo
del producto**: cambiar una fórmula mueve todos los números históricos del
usuario sin avisar.

## Regla que gobierna todas las demás

**Ninguna fórmula se toca sin un ADR nuevo.** No "ajustes", no "mejoras
pequeñas", no cambiar un peso o un umbral de paso. Si el cambio parece
justificado, se para y se escribe el ADR primero — es exactamente el proceso
que produjo ADR 0015, 0024 y 0026.

## Composición del score

- Composite v2 según **ADR 0015** (supersede partes de ADR 0008). Los pesos
  **se renormalizan** cuando falta un componente: el peso real de `presence` no
  es 0.40 fijo. Cualquier cálculo derivado debe recomputar, no multiplicar por
  el peso nominal (esta fue la propuesta rechazada en ADR 0017).
- `standing` es **Share of Voice real**, no `100 - competitor_gap_score`. La v1
  daba 100 a una marca invisible en un mercado sin competidores mencionados
  (ADR 0015).
- **La posición mide rango cuando se menciona, no frecuencia** (ADR 0026
  `position-when-mentioned`, supersede parte de ADR 0005).

## Honestidad del dato

- **Una mención sólo cuenta si el nombre aparece literalmente en el texto**
  (ADR 0021). Relevancia temática no es mención. La evidencia persistida debe
  ser una cita textual del propio texto, nunca parafraseada.
- **Capa de fiabilidad obligatoria** (ADR 0024): un score derivado de pocas
  respuestas se presenta con su tamaño de muestra y su margen, nunca como una
  cifra exacta con un delta limpio. El caso que lo motivó: 30 → 74 (+44 pt)
  entre dos escaneos idénticos con n=3.
- La confianza declarada tiene que ser estadísticamente defendible, no una
  etiqueta cosmética (ADR 0015 punto 3).
- **Ninguna superficie publica una comparación entre escaneos sin pasar por
  `resolveDelta`** (`lib/scoring/score-reliability.ts`). No hay excepciones
  para tablas, listas ni tooltips: si una pantalla resta dos scores por su
  cuenta, está afirmando algo que el ADR 0024 ya decidió no afirmar. Lo
  aprendimos caro — ADR 0024 se implementó en la Visión general y el historial
  de Escaneos siguió publicando `+34 pt` sobre 3 respuestas durante meses
  (DELTA-GUARD-1, log §22). Una capa de honestidad que hay que acordarse de
  llamar acaba sin llamarse.

## Tamaño de la muestra (SAMPLING-1, ADR 0030)

- **Un escaneo apunta a un suelo de 50 respuestas** (`MIN_RESPONSES_PER_RUN`,
  `lib/scan/sampling.ts`). Cuando `prompts × motores` no llega, el run repite
  su set de prompts hasta `MAX_PROMPT_SAMPLES`. La regla vive en **un solo
  sitio**, puro y testeado: no se recalcula en ningún otro módulo.
- **Más muestra no sustituye al margen.** El suelo estrecha el intervalo de
  ~±18 pp a ~±13 pp, no lo elimina. Todo lo que ADR 0024 obliga a mostrar
  (tamaño de muestra, margen, guarda de comparabilidad) sigue siendo
  obligatorio — subir el suelo nunca es motivo para retirar la capa de
  fiabilidad.
- **La unidad de trabajo es `(run, prompt, motor, muestra)`.** Cualquier
  comprobación de "esto ya está hecho" tiene que filtrar por `sample_index`.
  Sin ese filtro las repeticiones se saltan sus llamadas en silencio y el
  escaneo reporta éxito con un tercio de las respuestas (ADR 0030).
- **El suelo no puede subir sin mirar la cobertura de extracción.** Si un run
  tiene más filas de las que `runStructuredExtractionForRun` llega a procesar,
  las sobrantes entran al score con su mención ingenua, sin alias y sin
  verificar (ADR 0021/0025): más muestra empeora el número en vez de mejorarlo.
  Hoy no ocurre —ADR 0029 retiró el tope de filas—, pero la regla se queda
  escrita porque el acoplamiento sigue ahí: cualquier futuro límite en la
  extracción vuelve a invertir el signo de esta fase.
- Free queda fuera del suelo por decisión de producto (D1, ADR 0030), no por
  limitación técnica.

## Referencias

`docs/geo-methodology-audit-2026-07.md` (hallazgos abiertos),
`docs/geo-score-variability-2026-08.md` (sensibilidad por plan),
`docs/brand/design-decisions-log.md` §8b (cómo se muestra la incertidumbre).
