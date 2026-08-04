---
description: Invariantes de la zona de Recomendaciones (generación, puntos potenciales, cobertura de dominio).
paths:
  - "app/dashboard/projects/*/recommendations/**"
  - "lib/recommendations/**"
---

# Recomendaciones — invariantes

## Puntos potenciales

- **Se calculan por recomputación contrafactual del score real**, nunca por el
  atajo `porcentaje × peso del componente` (**ADR 0017**, que rechazó
  explícitamente esa fórmula por dos motivos: ignora la renormalización de
  pesos de ADR 0015, y atribuye mal qué componente mueve cada tipo de
  recomendación — `increase_brand_prominence` no toca `presence` en absoluto).
- El contrafactual parte de `affected_prompt_ids` **reales y persistidos**. Sin
  ellos no hay cifra: se omite el número, no se estima.

## Honestidad

- **Nada de recomendaciones falsas** (lista de prohibido de `CLAUDE.md`). Una
  recomendación existe porque hay evidencia persistida que la respalda.
- **El texto narrativo de Gemini nunca es hecho verificado.** Se renderiza con
  el aviso de "interpretación de la IA" ya existente.
- Si una recomendación no puede calcular su impacto, se muestra sin impacto —
  nunca con un valor de relleno.

## Cobertura de dominio

- **Matching de dominio propio fail-closed**: normalizar (quitar esquema, `www.`,
  ruta) y comparar por límite de etiqueta, de forma que `evilacme.com` nunca
  case con `acme.com`. Misma semántica que `lib/scoring/run-scoring.ts` y
  `lib/web-audit/**` — si cambia en un sitio, cambia en los tres (ADR 0019).
- Los límites de generación son **contadores de gasto real**, no decoración:
  respetar el presupuesto por proyecto y día con su `generation_type` propio.

## Escrituras

- `dismiss`/`rewrite` verifican propiedad en servidor con el cliente de usuario
  antes de cualquier escritura con service-role (patrón data-guardian C5).
