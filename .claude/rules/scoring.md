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

## Referencias

`docs/geo-methodology-audit-2026-07.md` (hallazgos abiertos),
`docs/geo-score-variability-2026-08.md` (sensibilidad por plan),
`docs/brand/design-decisions-log.md` §8b (cómo se muestra la incertidumbre).
