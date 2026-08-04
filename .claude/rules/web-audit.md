---
description: Invariantes de la zona de Auditoría web (cobertura, auditoría técnica, plan de acción).
paths:
  - "app/dashboard/projects/*/web-audit/**"
  - "lib/web-audit/**"
---

# Auditoría web — invariantes

Fuente canónica: `docs/specs/web-audit/README.md` ("Shared invariants") y
`docs/specs/web-audit/ROADMAP.md` (**única fuente del orden de fases** — los
identificadores `WEB-AUDIT-*` son nombres estables, no un orden).

## Antes de ampliar

Esta zona es **adyacente a "crawler"**, que está en la lista de prohibido de
`CLAUDE.md`. Cualquier fase nueva que amplíe la superficie de fetch necesita su
propio Task Intake, revisión de data-guardian y aprobación explícita del
fundador. Un fetch acotado a páginas del dominio propio no es un crawler; en
cuanto haya descubrimiento de enlaces o recorrido, sí lo es.

## Invariantes

- **Ningún número de relleno.** Todo se calcula desde datos persistidos, y los
  bloques de fases no implementadas simplemente no se renderizan.
- **Matching de dominio propio fail-closed**: normalizar y comparar por límite
  de etiqueta (`evilacme.com` nunca casa con `acme.com`). Misma semántica que
  `lib/recommendations/domain-coverage.ts` y `lib/scoring/run-scoring.ts`.
- **El texto narrativo de Gemini nunca es hecho verificado** — se muestra con el
  aviso de "interpretación de la IA".
- **Puerta Pro**: leer `profiles.current_plan` en crudo vía `isProOrAbove`
  (`lib/billing.ts`), nunca vía `getPlanForUser`/`resolvePlan`.
- **Los límites son gasto real**: 5/día/proyecto para cobertura, presupuesto
  propio y separado para la auditoría técnica.
- **Presupuesto ADR 0003**: todo corre síncrono bajo `maxDuration = 60`.
  Cualquier función con varias llamadas de red lleva un presupuesto total de
  reloj holgadamente por debajo, y **degrada parcialmente en vez de morir**.
- **Contenido no confiable**: todo HTML traído de la web se sanea con el patrón
  existente (`sanitizeField`) antes de persistir o renderizar. HTML crudo no se
  almacena ni se renderiza jamás.
- **RLS**: lecturas con el cliente de usuario; cualquier escritura con
  service-role prueba propiedad antes con el cliente de usuario.
