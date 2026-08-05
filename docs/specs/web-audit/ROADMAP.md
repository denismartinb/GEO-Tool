# Web Audit — Roadmap por fases

Orden de ejecución recomendado para la iniciativa "Auditoría web". Cada fila es
un PR independiente con su propio Human Gate. Este documento es la **única fuente
de la ordenación**; los identificadores `WEB-AUDIT-*` son nombres estables, no un
orden — el orden lo fija la columna `#`.

| # | Fase | Identificador | Spec | Estado | Backend / riesgo | Gate |
|---|---|---|---|---|---|---|
| 1 | Sección + matriz de oportunidad + tendencia | WEB-AUDIT-1 | `phase-1-section-and-matrix.md` | ✅ Implementada (PR #170) + fixes de móvil | Ninguno (solo datos ya persistidos) | Human Gate |
| 2 | Calidad de detección de cobertura | WEB-AUDIT-DQ | `phase-dq-coverage-quality.md` | ✅ Implementada (query por palabras clave en vez de pregunta literal) | Core de DOMAIN-COVERAGE-1; sin schema | Human Gate |
| 2.5 | Auditoría encadenada por lotes | WEB-AUDIT-CHAIN | `phase-chain-batched-audits.md` | ✅ Implementada (cubre todos los prompts activos, no solo 6) | Modelo de persistencia (running→completed); sin schema nuevo | Human Gate |
| 3 | Plan de acción + huecos con competidor | WEB-AUDIT-ACTION | `phase-action-plan.md` | ✅ Implementada | Ninguno (solo datos ya persistidos) | Human Gate |
| 4 | Auditoría técnica (páginas + bots IA) | WEB-AUDIT-2 | `phase-2-technical-audit.md` | ✅ Implementada (PR #197) — migración 0018 aplicada manualmente | Fetch acotado (adyacente a "crawler") + migración 0018 | Human Gate |
| 5 | Generador de briefs de contenido con IA | WEB-AUDIT-BRIEF | `phase-brief-generator.md` | Propuesta | Gemini runtime + migración (generation_type) | **Aprobación explícita + Task Intake + data-guardian** |
| 6 | Auditoría diaria + alertas de regresión | WEB-AUDIT-3 | `phase-3-daily-audit.md` | ⚠️ Parcial — ver fila 6a | Cron adicional (background scheduler) | **Aprobación explícita + reliability** |
| 6a | Auditoría automática tras cada escaneo | AUDIT-AFTER-SCAN-1 | ADR 0027 · log §18 | ✅ Implementada (PR #322) — migración 0027 aplicada 2026-08-04 | Cron adicional + rol de servicio en ambos núcleos | Aprobada por el fundador 2026-08-04 |

| 6b | La auditoría, visible en Escaneos | AUDIT-IN-RUNS-1 | log §19 | ✅ Implementada (2026-08-05) | Ninguno (sólo datos ya persistidos) | Human Gate |

### Fila 6 — qué se implementó y qué no (2026-08-04)

`phase-3-daily-audit.md` juntaba dos cosas que resultaron ser separables:
refrescar la auditoría sin intervención humana, y **avisar de regresiones**
cuando el refresco muestra una caída. AUDIT-AFTER-SCAN-1 (fila 6a) implementó
la primera y **no** la segunda.

También cambió el mecanismo respecto a lo diseñado, y conviene no leer la
spec antigua como si describiera el código: en vez de un barrido diario que
busca proyectos candidatos (`recurring_scans_enabled`, orden por antigüedad,
`MAX_PROJECTS_PER_RUN`), la auditoría es **una fila en `jobs` encolada por el
propio escaneo al completarse**, con reintentos con backoff heredados de esa
tabla. El cron diario sigue existiendo, pero como red de seguridad de la cola,
no como el disparador. Motivo: el disparo por evento audita el escaneo que
acaba de terminar, y una cola durable convierte un despacho perdido en un
retraso en vez de en una auditoría que nunca ocurre.

**Sigue pendiente de fila 6:** los avisos derivados de regresión en la
campana de notificaciones (cobertura o *surfacing* que bajan, un bot de IA que
pasa a bloqueado, `llms.txt` que desaparece). Nada de eso existe hoy — ahora
que los datos se refrescan solos, es cuando esa mitad empieza a tener sentido.

## Cabos sueltos post-ACTION (no numerados, siguen el mismo Human Gate)

Tras fusionar la fase 3 (ACTION) y la explicación mención-vs-cita, quedaron dos
huecos señalados en producción, tratados como fases separadas:

- **Fase A — ✅ Implementada.** `content_gap`/`open_opportunity`/`unverified_cited`
  no tienen ningún tipo de recomendación en el motor (`recommendation-engine.ts`
  genera recomendaciones al terminar el escaneo, antes de que exista ninguna
  auditoría de dominio — ver cabecera de `coverage-overlay.ts`). Se sintetiza el
  texto de "qué hacer" directamente en `lib/web-audit/action-plan.ts`
  (`synthesizedGuidance`) a partir de datos ya cargados, marcado visualmente
  como "Sugerencia" — nunca como una recomendación real/trackeable — para no
  fingir progreso.
- **Fase B — pendiente, requiere geo-strategy.** Que la propia clasificación
  "Hueco de contenido" tenga en cuenta `brand_mentioned` cambia la taxonomía de
  la matriz (KPIs, cuadrantes, tendencia, plan de acción a la vez) — no es un
  cambio de copy. Aparcada hasta que se plantee como Task Intake propio.

## Por qué este orden

1. **DQ antes que nada nuevo.** El caso Ryanair (0/6 temas, todo "Hueco de
   contenido") apunta a un falso negativo de la detección: una marca enorme no
   puede no tener contenido propio sobre su propio equipaje. Toda la sección —
   matriz, KPIs, plan de acción, briefs — hereda la fiabilidad de la detección de
   cobertura. Construir encima de datos que muestran huecos inexistentes es, de
   facto, comportamiento de producto falso (`CLAUDE.md`: "never fake progress").
   Se arregla primero.
2. **ACTION antes que backend.** El plan de acción y los huecos con competidor no
   necesitan schema, ni Gemini, ni fetch — solo cruzan datos ya persistidos.
   Cierran el "¿y ahora qué hago?" que hoy queda abierto tras ver la matriz. Es el
   mayor valor por el menor riesgo, así que va antes que las fases con gate duro.
3. **Técnica (WEB-AUDIT-2) antes que briefs.** Añade la dimensión de "salud
   técnica" (schema, formato, frescura, bots). Su migración y su fetch acotado son
   el primer gate duro; conviene resolverlos antes de sumar generación con IA.
4. **BRIEF como diferenciador.** El generador de briefs convierte la herramienta
   de diagnóstica en generativa. Es el mayor valor de mercado, pero también el
   mayor riesgo (Gemini runtime, migración, sanitización). Va después de que la
   detección sea fiable (DQ) y de que exista el gancho de acción (ACTION).
5. **DAILY al final.** La automatización solo tiene sentido cuando las auditorías
   ya son fiables y valiosas. Reutiliza el cron ya existente.

## Grafo de dependencias

```
WEB-AUDIT-1 ✅
   ├── WEB-AUDIT-DQ ........ (recomendada antes de 3/5; el resto funciona sin ella pero con datos menos fiables)
   ├── WEB-AUDIT-ACTION .... depende de datos de 1; valor real depende de DQ
   ├── WEB-AUDIT-2 ......... independiente (nueva dimensión técnica)
   ├── WEB-AUDIT-BRIEF ..... depende de DQ (no generar briefs para huecos falsos)
   └── WEB-AUDIT-3 ......... depende de 1 (+2 si se quiere auditar técnica a diario); idealmente tras DQ
```

## Reglas transversales (aplican a todas las fases)

Las heredan del `README.md` de este directorio, sin excepción: sin comportamiento
simulado, coincidencia de dominio fail-closed con límite de etiqueta, notas de
Gemini siempre marcadas como interpretación de IA, gate Pro leído en crudo de
`profiles.current_plan`, límites de tasa como contadores de gasto real,
presupuesto bajo `maxDuration=60` (ADR-0003), copy en castellano / código en
inglés, RLS con cliente de usuario antes de cualquier escritura service-role, y
saneado de todo contenido no confiable (HTML o salida de Gemini) antes de
persistir o renderizar.

## Estado de gates (Forbidden list de CLAUDE.md)

- **WEB-AUDIT-1, ACTION**: no tocan nada de la lista prohibida → Human Gate normal.
- **WEB-AUDIT-DQ**: toca el core de Gemini de cobertura; no es fake ni schema, pero
  cambia comportamiento de detección → revisión de metodología (geo-strategy) y de
  las invariantes de citación (data-guardian) antes de mergear.
- **WEB-AUDIT-2**: adyacente a "crawler" + migración → aprobación explícita.
- **WEB-AUDIT-BRIEF**: "fake recommendations" está prohibido; un brief es contenido
  generado y debe anclarse a evidencia real y saneo, nunca inventar datos de
  páginas → aprobación explícita + Task Intake + data-guardian.
- **WEB-AUDIT-3**: "background scheduler" está prohibido sin aprobación → aprobación
  explícita + reliability.
