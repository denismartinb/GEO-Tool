# Launch Plan — GEO Studio: de beta privada a producto comercial

**Origen:** informe de preparación de lanzamiento (2026-07-09), elaborado a
petición del fundador. Este documento es la **fuente de verdad única** del
camino hasta cobrar el primer euro y las fases inmediatamente posteriores.

**Cómo se usa este documento (protocolo obligatorio):**

1. Toda sesión que trabaje en el lanzamiento **lee este fichero al empezar**
   (igual que `docs/director-strategy.md`).
2. Las fases se ejecutan **en orden**, salvo instrucción explícita del
   fundador. Cada fase indica sus dependencias.
3. Una fase = uno o más PRs pequeños. Cada PR que avance una fase **debe
   actualizar el ledger de estado de abajo en el mismo PR** (estado, PRs
   enlazados, fecha, notas). El historial de git es el registro de avances.
4. Las fases marcadas ⚠️ tocan áreas de la lista *Forbidden* de `CLAUDE.md`
   (billing, motores nuevos, scheduler…) y requieren **Task Intake Report +
   aprobación explícita del fundador** antes de escribir código. Las demás
   siguen el protocolo normal (pequeño y claro → directo; amplio → Task
   Intake).
5. Human Gate manual antes de cada merge, siempre, con URL de preview de
   Vercel y resumen en castellano de qué probar (regla AGENTIC-6).
6. Si durante una fase se descubre trabajo que pertenece a otra fase, se
   anota en la sección de la otra fase — no se expande el PR en curso.
7. Este plan se puede revisar, pero solo el fundador reordena o cancela
   fases. El Director puede proponer cambios actualizando la sección
   "Cambios propuestos al plan" al final.

---

## Ledger de estado

| # | Fase | Estado | PRs | Última actualización | Notas |
|---|------|--------|-----|----------------------|-------|
| 0 | DECISIÓN-MARCA | ✅ Hecho | #174 | 2026-07-09 | **GenScore**: sin colisión en TMview/EUIPO, dominio genscore.es comprado, rebrand de código shipeado (REBRAND-1). Pendiente de fondo (no bloqueante): solicitud EUIPO, dominios adicionales |
| 1 | LEGAL-1 | 🟡 En curso (1a hecho) | — | 2026-07-09 | LEGAL-1a shipeado: `/privacidad`, `/cookies`, `/terminos` (B2C) + footers reales. LEGAL-1b (Aviso Legal LSSI con NIF/domicilio) pendiente del alta del fundador, no bloqueante |
| 2 | PRICING-TRUTH-1 | ✅ Hecho | — | 2026-07-09 | PR a (copy honesto) + PR b (enforcement real: 1 escaneo Free, cadencia cron por plan, motores por plan) shipeados |
| 3 | PLATFORM-COMMERCIAL-1 | 🟡 Bloqueada en Vercel Pro (diferido, decisión fundador) | #181, #183 | 2026-07-10 | Dominio + PostHog + Sentry verificados en vivo y funcionando (bug real de Sentry encontrado y corregido en #183). Solo falta Vercel Pro, diferido a propósito hasta la primera contratación (riesgo aceptado, ver nota abajo) |
| 4 | BILLING-STRIPE-1 ⚠️ | 🟡 PR 1 verificado en prod, PR 2 en curso | #186 | 2026-07-10 | Task Intake aprobado (modo test primero). PR 1 (Checkout+webhooks) mergeado y confirmado end-to-end en producción. PR 2 (Customer Portal) en curso: pago↔pago y cancelación reales vía Stripe, con guard de sobre-cupo de dominios en el webhook (decisión fundador: preguntar siempre, nunca archivar solo) |
| 5 | LAUNCH | 🔲 Pendiente | — | 2026-07-09 | |
| 6 | ALERTS-1 | 🔲 Pendiente | — | 2026-07-09 | |
| 7 | GROWTH-1 | 🔲 Pendiente | — | 2026-07-09 | |
| 8 | ENGINES-2 ⚠️ | 🔲 Pendiente aprobación | — | 2026-07-09 | OpenAI/Perplexity están en Forbidden list |
| 9 | ASYNC-SCAN-1 ⚠️ | 🔲 Pendiente aprobación | — | 2026-07-09 | Ya scoped en director-strategy.md |
| ⏰ | MODEL-PIN (deadline 2026-10-16) | 🔲 Pendiente | — | 2026-07-09 | Cutover anunciado de gemini-2.5-flash |

Estados: 🔲 Pendiente · 🟡 En curso · ✅ Hecho · ⛔ Bloqueada · ❌ Cancelada

---

## Contexto de mercado (resumen del informe, para no re-investigar)

Precios publicados de la competencia (julio 2026): Otterly $29–489/mes,
Peec AI €89+/mes, AthenaHQ $270–2.000/mes, Profound $499+/mes, Semrush AI
Toolkit +$99/mes (addon), Ahrefs Brand Radar $199/plataforma o $699/mes.
La crítica común: entregan reporting y dejan al usuario priorizar y
ejecutar. El diferenciador de GEO Studio es el bucle
dato → evidencia → recomendación → asset copy-paste, más el ángulo de
mercado en castellano (España/LATAM/agencias), casi vacío de competencia
directa.

Conclusiones de pricing del informe: 0/45/179/449 € bien calibrados en la
banda; el problema no es el precio sino que `/pricing` promete producto que
no existe (ver PRICING-TRUTH-1). Estrategia de adquisición recomendada:
free scan permanente como gancho + **reverse trial** (Pro completo 14 días
sin tarjeta al registrarse, downgrade automático a Free).

Cobertura real de motores hoy: 2 (Gemini + Claude), vía `LLM_SCAN_PROVIDERS`
(global, no por plan).

---

## Fase 0 — DECISIÓN-MARCA (fundador, sin código)

**Objetivo:** nombre definitivo y dominio comprado antes de invertir en
marca, legal y growth.

**Contexto:** "Lumira" es marca registrada de SAP SE para software (USPTO
reg. 4937159, muy probablemente también EUIPO). Producto descontinuado pero
marca viva. Variantes a 1 letra (Lumirra/Lumeira/Lumaira) siguen siendo
"confusamente similares" — riesgo solo parcialmente reducido.

**Candidatos investigados (2026-07-09, disponibilidad verificada vía DNS):**

| Nombre | Dominios libres | Colisiones detectadas | Valoración |
|---|---|---|---|
| **Mirantia** | .ai, .es, .io (.com aparcado) | Ninguna | ⭐ Recomendado — limpio total |
| **Miraluz** | .ai, .es | Maderera BR, iluminación, velas (clases lejanas) | Opción con personalidad española |
| **Lumeira** | .ai, .io | Lumeira Ventures (VC, EEUU); similitud con SAP LUMIRA | Solo con clearance profesional previo |
| Lumivista | .ai, .es (.com inactivo desde 2019) | Ninguna activa | Alternativa |
| Mirelia / Lumavia / Lumery / Lumantia / Lumirra | .ai | Varias menores | Reserva |

**DECISIÓN (fundador, 2026-07-09): el nombre elegido es "GenScore"**
(descartada la familia Lumira/Mirantia). Due diligence realizada el mismo
día:

- Colisiones: ninguna empresa ni producto comercial "GenScore" encontrado.
  Único homónimo: un proyecto académico open-source de scoring
  proteína-ligando en GitHub (bioinformática) — clase de producto lejana,
  sin marca comercial aparente. "Genspark" (unicornio AI) es fonéticamente
  distinguible. Riesgo aparente: bajo, pero falta TMview.
- Dominios (verificado vía DNS 2026-07-09):
  **libres → genscore.es, genscore.app, genscore.net, getgenscore.com**;
  registrados pero sin producto activo detectable → genscore.com,
  genscore.ai, genscore.io (probablemente aparcados; valorar compra vía
  broker).

**Tareas restantes (fundador):**
- [x] Elegir nombre → **GenScore**.
- [x] Búsqueda en TMview (EUIPO + OEPM) — **hecha por el fundador
      (2026-07-09): sin resultados para "GenScore"**, clases 42/35 libres de
      colisión registrada. Nota de riesgo residual (no bloqueante): TMview
      cubre marcas registradas, no marcas de uso no registradas (common law)
      ni nombres de empresa societarios — si más adelante hay presupuesto,
      un clearance profesional de pago añade esa capa; no es requisito para
      seguir operando con el nombre.
- [x] Dominio comprado: **genscore.es** (2026-07-09).
- [ ] Opcional, no bloqueante: comprar genscore.app/.net/getgenscore.com
      como defensa, y sondear precio de genscore.com/.ai/.io (aparcados) vía
      broker si se quiere esa extensión más adelante.
- [ ] Solicitud EUIPO (clases 42 + 35, ~850–900 €) — pendiente, recomendable
      antes de invertir en marketing pagado con el nombre, pero no bloquea
      las fases de código.
- [x] Dominio definitivo comunicado al repo → aplicado en REBRAND-1 (abajo).

**Criterio de salida: CUMPLIDO** (nombre decidido + dominio `.es` en
propiedad). No bloquea LEGAL-1 ni PRICING-TRUTH-1. La solicitud EUIPO y los
dominios adicionales quedan como tareas de fondo del fundador, sin bloquear
ninguna fase de código restante (incluida LAUNCH, dado que ya hay un dominio
real en propiedad — actualizar `NEXT_PUBLIC_SITE_URL` a `genscore.es` es
tarea de PLATFORM-COMMERCIAL-1).

**REBRAND-1 — hecho (2026-07-09):** rebranding de código completado tras
Task Intake aprobado. Sustituido "Lumira" → "GenScore" en las 15 superficies
de producto real identificadas (landing, `/pricing` + `plans-data.ts`,
login/signup/forgot-password, sidebar, topbar, `layout.tsx` metadata, copy
de dashboard en Overview/Recomendaciones/Prompts, comentario de
`scan-in-progress.tsx`). `CLAUDE.md` ahora fija "GenScore" como nombre
público oficial en su cabecera y aclara que "GEO Studio" sigue siendo el
nombre interno del proyecto/repo (decisión separada, no tocada). La regla
"Do not rename product to Lumira" de `.claude/agents/ux-alignment.md` se
actualizó a positiva (nombre público = GenScore). `docs/design-reference/**`
se dejó intacto a propósito (material histórico del prototipo, sigue
llamándose "Lumira" ahí). Grep de verificación: cero ocurrencias de
"Lumira" fuera de design-reference y de esta bitácora/CLAUDE.md/agente
(las tres últimas son referencias intencionales al propio rebrand).
Pendiente aparte, no incluido: renombrar `package.json` (`geo-studio`) o el
propio repo — es una decisión distinta con impacto en CI/deploy, no
solicitada.

---

## Fase 1 — LEGAL-1 (P0 de lanzamiento)

**Objetivo:** cumplir los mínimos legales para operar un SaaS de pago desde
España hacia la UE. Hoy no existe **ninguna** página legal; los enlaces
"Privacidad"/"Términos" del footer son `<span>` inertes.

**Decisión de régimen (fundador, 2026-07-09): B2C incluido.** Se venderá
tanto a empresas/profesionales como a particulares → los Términos deben
incluir derecho de desistimiento de 14 días (o consentimiento expreso de
ejecución inmediata del servicio digital, renunciando a ese derecho).

**BLOQUEADA (fundador, 2026-07-09): el fundador aún no está dado de alta
como autónomo.** El Aviso Legal y la Política de Privacidad necesitan un
titular identificado (nombre/razón social, NIF, domicilio fiscal) — no se
redactan con datos inventados ni placeholders. Aclarado con el fundador:
**no hace falta darse de alta para validar demanda** (build, free scan,
reverse trial gratis, y conversaciones de venta manual con las 3–5 agencias
de la Fase 5 no requieren alta ni facturación — el alta solo es obligatoria
cuando hay cobro recurrente real). Recomendación registrada: validar
demanda primero (en paralelo a PRICING-TRUTH-1 / PLATFORM-COMMERCIAL-1, que
no dependen de esto), dar el alta justo antes de activar Stripe
(BILLING-STRIPE-1 → LAUNCH) — es reversible y de coste bajo (tarifa plana),
no la burocracia pesada que se suele temer. Esta fase queda con el
contenido de Aviso Legal/Privacidad **pendiente de esos datos**; el resto
del plan puede avanzar mientras tanto.

**Alcance:**
- Página **Aviso legal** (LSSI-CE: identidad, NIF, domicilio, contacto).
- Página **Política de privacidad** (RGPD/LOPDGDD): base jurídica,
  derechos, encargados de tratamiento (Supabase, Vercel, Google/Gemini,
  Anthropic, Stripe y el proveedor de email/analytics que se elija),
  transferencias internacionales (DPF/SCCs).
- Página **Política de cookies**. Nota: las cookies de sesión de Supabase
  son técnicas/esenciales → **no requieren banner**. Si la analítica elegida
  en PLATFORM-COMMERCIAL-1 es cookieless (Plausible o PostHog en modo
  cookieless), se lanza sin banner, solo con página informativa. Decisión
  recomendada: cookieless, sin banner.
- Página **Términos del servicio**: limitación de responsabilidad (los
  datos provienen de salidas de LLMs de terceros y pueden variar), sin SLA
  en beta, cancelación, uso profesional. Valorar restringir a "uso
  profesional/empresas" para simplificar régimen de consumo; si hay B2C,
  derecho de desistimiento de 14 días o consentimiento expreso de ejecución
  inmediata.
- Footer: convertir los spans en enlaces reales a las 4 páginas (landing,
  /pricing, y layout del dashboard si aplica).
- Firmar los DPA de cada proveedor (tarea del fundador, checklist en el PR).

**Fuera de alcance:** VeriFactu/facturación (va en BILLING-STRIPE-1),
banner de consentimiento (solo si se elige analítica con cookies).

**LEGAL-1a — hecho (2026-07-09):** el RGPD obliga a informar del
tratamiento de datos personales desde que se recogen, no desde que hay
actividad económica registrada — la web ya recoge email/contraseña,
dominio, prompts y competidores sin ninguna política publicada, así que
esta parte no podía esperar al alta. Shipeado sin esperar a LEGAL-1b:
- `/privacidad` — responsable: Denis Martín Barroso, contacto
  soporte@genscore.es (persona física, sin NIF/domicilio — eso es LEGAL-1b).
  Encargados de tratamiento reales y activos hoy: Supabase, Vercel, Google
  (Gemini API), Anthropic (Claude API). Deliberadamente NO menciona Stripe
  ni proveedor de analítica/email — no están activos todavía
  (BILLING-STRIPE-1 / PLATFORM-COMMERCIAL-1); la política se actualizará
  cuando lo estén, para no prometer salvaguardas de un tratamiento que aún
  no existe.
- `/cookies` — cookie técnica de sesión de Supabase únicamente, sin banner
  (no hay analítica con cookies activa hoy).
- `/terminos` — con el régimen **B2C confirmado por el fundador**: incluye
  derecho de desistimiento de 14 días de consumidor. Identificación del
  operador solo por nombre + email (sin NIF/domicilio, igual que
  privacidad). Estado "beta privada", sin SLA, limitación de
  responsabilidad por depender de LLMs de terceros, referencia a
  `/pricing` en vez de duplicar precios.
- Footer de landing y `/pricing` enlazados de verdad a las 3 páginas
  (antes eran `<span>` inertes). Componente compartido:
  `components/legal-page-shell.tsx`.
- `pnpm test` (331/331) y `pnpm run validate` (build+typecheck+lint) en
  verde.

**LEGAL-1b — pendiente, gatillada por el alta del fundador:** Aviso Legal
LSSI completo (NIF, domicilio fiscal) + actualizar `/privacidad` y
`/terminos` con la identidad comercial definitiva. No bloquea nada del
resto del plan.

**Recordatorio (no cambia por lo anterior):** estos textos son un borrador
razonable, no asesoramiento legal — deben pasar revisión de un
gestor/abogado antes de LAUNCH, en particular el capítulo de
desistimiento B2C y las cláusulas de responsabilidad.

**Nota importante:** los textos legales los redacta la sesión como borrador,
pero **deben pasar revisión humana (gestor/abogado) antes de LAUNCH** —
especialmente Términos y el capítulo fiscal. Marcarlo en el PR.

**Agentes:** director + frontend; `data-guardian` revisa el inventario de
encargados/datos personales declarado en la política.

**Criterios de aceptación:** 4 páginas accesibles y enlazadas desde todos
los footers; contenido coherente con los proveedores reales del stack;
`pnpm test && pnpm run validate` en verde.

---

## Fase 2 — PRICING-TRUTH-1 (P0 de lanzamiento)

**Objetivo:** que `/pricing` sea 100% verdad y que los límites de plan se
apliquen de verdad. Regla constitucional: "Do not ship fake product
behavior" — hoy la página de precios la incumple.

**Alcance (trocear en 2–3 PRs):**

*PR a — copy honesto:*
- Motores: la página promete "ChatGPT, AI Overviews, Perplexity, Claude" y
  "4 motores" en Pro. Realidad: Gemini + Claude. Reescribir a 2 motores
  reales + "nuevos motores incluidos según se publiquen" en Pro.
- Plan Agencia: eliminar de las cards/matriz toda feature no construida
  (white-label, workspaces, roles, API, Slack) o convertir el plan entero en
  "Hablar con ventas · bajo demanda" sin lista de features inexistentes.
- Revisar la FAQ ("¿Qué incluye la prueba de Pro?" debe describir el
  reverse trial real cuando exista; hasta BILLING-STRIPE-1, no prometer
  prorrateo automático ni cambio de plan self-service).
- Aplicar el rebranding de Fase 0 si ya está decidido.

*PR b — enforcement de límites:*
- **Free = 1 escaneo puntual**: hoy no hay límite al número de escaneos del
  plan Free. Añadir enforcement en `lib/scan/run-creation.ts` (contar runs
  del proyecto para plan free antes de crear un run nuevo).
- **Frecuencia por plan** (Free puntual / Starter semanal / Pro+ diario): el
  cron (`lib/scan/cron.ts`) debe respetar la cadencia del plan del owner,
  no aplicar diario a todos.
- **Motores por plan**: `caps.engines` existe pero el motor activo es un
  env var global. Gatear el fan-out multi-engine por `caps.engines` del
  plan del owner en el executor.
- Tests Vitest de los tres enforcement (test-architect).

**Dependencias:** ninguna (puede ir en paralelo con LEGAL-1).

**Agentes:** director + geo-strategy (validar claims), frontend (PR a),
gemini-pipeline + reliability (PR b), qa. Añadir al checklist permanente de
`qa`: "¿la página de precios sigue siendo verdad?".

**Criterios de aceptación:** cada celda de la matriz de `/pricing`
corresponde a comportamiento real y gateado; un usuario free no puede
lanzar un segundo escaneo; un starter no recibe scans diarios del cron.

**PR a — copy honesto — hecho (2026-07-09):**
- Motores reales (Gemini + Claude = 2) en landing, `/pricing` (cards,
  matriz, meter explicativo) y plan Agencia; eliminada toda mención a
  ChatGPT/AI Overviews/Perplexity/"4 motores"/"Todos" que no existen hoy.
  Pro añade el highlight "nuevos motores incluidos sin coste extra cuando
  se publiquen" (compromiso honesto, no ficticio).
- Plan Agencia reescrito sin features inexistentes (workspaces, roles,
  white-label, Slack, API/CMS) — eliminado el grupo entero "Agencia y
  plataforma" de la matriz. Highlights ahora solo listan lo real (volumen
  a medida, mismos 2 motores, onboarding acompañado antes de contratar).
  FAQ de white-label reescrita en la misma línea.
- **Hallazgo no previsto en el plan original, corregido en la misma PR:**
  el CTA "Probar Pro · 14 días" y su FAQ prometían una reversión automática
  a Free tras 14 días. Verificado en código
  (`supabase/migrations/0011_signup_plan_from_metadata.sql`,
  `app/signup/actions.ts`): elegir "pro" en el signup fija
  `profiles.current_plan='pro'` **permanentemente**, sin `trial_ends_at` ni
  mecanismo de expiración — no hay ningún límite de 14 días real. Corregido
  a "Probar Pro gratis" sin promesa de plazo, y FAQ reescrita explicando
  que hoy no hay límite de tiempo automático mientras no se lance la
  facturación. **Nota para el fundador:** esto significa que ahora mismo
  cualquiera que elija Pro al registrarse tiene Pro gratis indefinido, sin
  fuerza de conversión a pago — coherente con la estrategia de validar
  demanda sin cobrar (ver nota de LEGAL-1), pero si se quiere acelerar el
  reverse trial real con expiración, es trabajo de BILLING-STRIPE-1 (punto
  3, "Reverse trial"), no de esta fase.
- FAQ de cambio de plan reescrita: ya no promete prorrateo automático ni
  self-service (no existe hasta BILLING-STRIPE-1); ahora describe el
  cambio gestionado a mano por soporte, sin coste ni permanencia.
- `pnpm test` (331/331) y `pnpm run validate` en verde.

**PR b — enforcement de límites — hecho (2026-07-09):**
- **Free = 1 escaneo, de verdad**: `createPendingScanRunCore`
  (`lib/scan/run-creation.ts`) bloquea con `free_plan_scan_limit_reached` en
  cuanto el proyecto tiene ≥1 `scan_runs` con `status='completed'`. Gateado
  sobre *completado*, no sobre "cualquier run", a propósito: no interfiere
  con el auto-retry de SCAN-ROBUST-1 (un primer intento que falla por
  timeout sigue reintentándose y dando al usuario su único escaneo real).
- **Frecuencia de cron por plan**: `lib/scan/cron.ts` calculaba un único
  intervalo de 24h para todos los proyectos; ahora resuelve el plan del
  owner (`resolvePlan`) y aplica Starter → semanal (7 días), Pro/Agencia →
  diario, por proyecto. Un proyecto Free que de algún modo tuviera
  `recurring_scans_enabled=true` se filtra explícitamente
  (`skipped_plan_ineligible`) antes de intentar nada — cinturón y tirantes
  junto al bloqueo anterior.
- **Motores por plan**: `executePendingScan` (`lib/scan/executor.ts`) ahora
  resuelve el plan del owner y recorta `getLLMScanProviders()` a
  `caps.engines`. Hoy es mayormente un no-op (solo existen 2 motores reales
  y todo plan de pago ya tiene `caps.engines=2`), salvo para Free
  (`caps.engines=1`) — pero deja el mecanismo listo para cuando ENGINES-2
  añada un tercer/cuarto motor, sin tener que volver a tocar este gate.
- 10 tests Vitest nuevos cubriendo los tres enforcement (bloqueo Free,
  no-bloqueo del auto-retry, cadencia semanal/diaria por plan, filtro de
  planes no elegibles, recorte de motores por plan) — 341/341 en verde,
  `pnpm run validate` limpio. Un test existente
  (`run-creation.test.ts`, "caps onlyPromptIds…") se cambió de plan Free a
  Starter porque su fixture incluía un run previo completado que ahora
  colisiona con el nuevo límite — su propósito real (probar el tope de
  prompts del plan) es independiente de esa colisión.

**Hallazgo posterior, corregido (2026-07-09):** al empezar PLATFORM-COMMERCIAL-1
se descubrió que el grep de PR a (acotado a "ChatGPT|Perplexity|AI
Overviews|4 motores") no cubrió todas las superficies con reclamos falsos.
Quedaban vivos en `main`: `components/billing/plan-billing-section.tsx` y
`components/billing/billing-content.tsx` (ambos prometían a Agencia
"workspaces multi-cliente" e "informes white-label" inexistentes),
`components/settings/organization-tab.tsx` (el hint del logo de
organización decía "Aparece en los informes white-label"),
`components/onboarding-wizard.tsx` (chips de motor mostrando ChatGPT/Google
AI Overviews/Perplexity/Claude en el wizard de alta de dominio, y el copy
"4 motores de IA"). Además, la propia FAQ reescrita en PR a decía que el
cambio de plan **no** era self-service todavía ("hasta entonces lo
gestionamos a mano") — resultó ser incorrecto: `changePlan`
(`app/dashboard/settings/billing/actions.ts`, vía
`components/billing/plan-billing-section.tsx`) ya es un cambio de plan
self-service real y funcional hoy (sin coste, porque no hay facturación
todavía). Los cinco puntos corregidos en el mismo barrido; grep final de
`white-label|workspaces multi-cliente|todos los motores|4 motores|ChatGPT|
Perplexity|AI Overviews|Slack` sobre `app/`, `components/`, `lib/` limpio
(el único resultado restante, en `lib/llm/gemini.ts`, es un prompt interno
para el LLM generador de preguntas, no una promesa de producto). 341/341
tests y `pnpm run validate` en verde.

---

## Fase 3 — PLATFORM-COMMERCIAL-1

**Objetivo:** infraestructura apta para uso comercial y observabilidad
mínima para operar con clientes.

**Alcance:**
- **Vercel Pro** (⚠️ bloqueante absoluto: el plan Hobby prohíbe uso
  comercial; además sube el techo de `maxDuration`). Config manual del
  fundador + actualizar `docs/environment-contract.md` y ADR-0003 si se
  aprovecha el nuevo techo.
- Dominio productivo conectado (de Fase 0) + `NEXT_PUBLIC_SITE_URL`.
- **Sentry** (error monitoring, server + client).
- **Analítica de producto**: PostHog EU cookieless o Plausible (decisión
  enlazada con LEGAL-1; recomendado cookieless). Instrumentar el funnel
  registro → primer escaneo → (trial) → upgrade.
- Panel de operador mínimo para el fundador (puede ser queries guardadas de
  Supabase + dashboards de PostHog; no construir producto).
- Revisar `docs/environment-contract.md` con todas las vars nuevas.

**Dependencias:** Fase 0 para el dominio (el resto no).

**Agentes:** platform-deploy (lidera), director.

**Criterios de aceptación:** deploy productivo en dominio propio bajo plan
Pro; un error de servidor provocado a propósito aparece en Sentry; los
eventos del funnel se ven en la analítica; environment contract al día.

**Parte de código — hecho (2026-07-09):** decisión de analítica: **PostHog**
(no Plausible) — es el que de verdad ofrece plan gratuito indefinido (1M
eventos/mes, sin tarjeta), frente al trial de 30 días de Plausible.

- **Sentry**: `sentry.server.config.ts`, `sentry.edge.config.ts`,
  `instrumentation.ts` (+ `onRequestError`), `instrumentation-client.ts`, y
  `next.config.ts` envuelto en `withSentryConfig`. Todo condicionado a
  `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` — sin esas vars (hoy, en todos los
  entornos) no se llama a `Sentry.init` en ningún sitio, cero coste/ruido.
  El build funciona igual sin `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`
  (el plugin de subida de sourcemaps simplemente no sube nada).
- **PostHog**: `components/posthog-provider.tsx`, montado en
  `app/layout.tsx`. `persistence: "memory"` (cookieless de verdad — sin
  esto, la promesa de `/cookies` de "no usamos cookies de analítica" dejaría
  de ser cierta en cuanto se active). Host EU
  (`https://eu.i.posthog.com`). Pageviews vía autocapture manual en cada
  cambio de ruta del App Router (no el pageview automático del SDK, que no
  ve las navegaciones SPA). Condicionado a `NEXT_PUBLIC_POSTHOG_KEY` — sin
  esa var, no se llama a `posthog.init` ni se carga el script.
  **Alcance deliberadamente limitado**: esta PR solo deja la
  infraestructura + autocapture de pageviews/clics; instrumentar eventos
  explícitos del funnel (registro completado, primer escaneo, upgrade) es
  un fast-follow pequeño, no incluido aquí para no inflar el PR.
- `docs/environment-contract.md` actualizado con las 5 vars nuevas, todas
  opcionales, con nota explícita de que `/cookies`/`/privacidad` necesitan
  una actualización de LEGAL-1 el día que se active PostHog en producción
  (añadirlo como encargado del tratamiento).
- `pnpm test` (341/341) y `pnpm run validate` en verde.

**Pendiente (fundador, sin código posible):**
- [x] Conectar `genscore.es` en Vercel (2026-07-10), con
      `NEXT_PUBLIC_SITE_URL` fijada.
- [x] Cuenta Sentry creada, `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`
      configuradas en Vercel (2026-07-10).
- [x] Cuenta PostHog creada, `NEXT_PUBLIC_POSTHOG_KEY` configurada en
      Vercel, host EU (2026-07-10).
- [x] PR #181 (código Sentry/PostHog) mergeado con las 5 variables ya
      presentes en Vercel. **Verificado en vivo (2026-07-10):** PostHog
      confirmado funcionando de fábrica (sesión real registrada en
      `https://www.genscore.es/`). Sentry, en cambio, **no recibía ningún
      evento** en la primera prueba — bug real encontrado y corregido en el
      mismo hallazgo: `onRequestError` en `instrumentation.ts` era una
      función fire-and-forget que llamaba a `captureRequestError` dentro de
      un `.then()` sin devolver esa promesa; Next.js resolvía el `await` del
      hook de inmediato (`undefined` implícito), así que en el runtime
      serverless de Vercel la instancia de función podía congelarse antes de
      que el import dinámico + la captura llegaran a ejecutarse — el error
      se perdía en silencio, sin ningún fallo visible. Corregido con una
      `async function` real que espera `captureRequestError` +
      `Sentry.flush(2000)` como red de seguridad adicional (PR #183,
      verificado con una ruta de prueba temporal `/api/debug/sentry-test`
      en el preview, que se lanzó, se confirmó el error en Sentry, y se
      retiró antes de mergear — solo el fix llegó a `main`). Sentry
      confirmado operativo en producción tras el fix.
- [ ] **Subir a Vercel Pro — decisión explícita del fundador (2026-07-10):
      diferido hasta la primera contratación.** Riesgo registrado y
      aceptado conscientemente: a diferencia del alta de autónomo (donde el
      disparador legal es cobrar), los términos de Vercel prohíben el plan
      Hobby para **cualquier** proyecto que sea un negocio/SaaS — "even if
      the traffic is low" — independientemente de si ya se factura.
      `genscore.es` ya tiene página de precios pública y flujo de registro,
      así que ya encaja en esa categoría hoy. Vercel puede suspender el
      proyecto sin aviso previo si lo detecta. Coste de mitigar: ~20 $/mes
      (Vercel Pro). El Director recomendó subir ya; el fundador prefiere
      esperar. Revisar este riesgo antes de cualquier actividad de difusión
      pública (GROWTH-1) o intento de captar la primera agencia (LAUNCH).
- [ ] Panel de operador mínimo (queries guardadas / dashboard de PostHog).

---

## Fase 4 — BILLING-STRIPE-1 ⚠️ (Task Intake aprobado 2026-07-10)

**Objetivo:** cobrar. "billing" está en la Forbidden list de `CLAUDE.md`:
esta fase requería Task Intake Report aprobado antes de código — **aprobado
por el fundador el 2026-07-10**, con una decisión explícita: construir y
probar todo contra **Stripe en modo test** ahora ("dejamos la plataforma
preparada"); VeriFactu se decide más adelante, como condición para pasar a
claves reales, no para empezar a construir. `CLAUDE.md` actualizado en
consecuencia (billing pasa de prohibido a "parcialmente aprobado, solo modo
test").

**Alcance (trocear en 3–4 PRs):**
1. **Stripe Checkout + webhooks**: suscripciones Starter/Pro, webhook
   `checkout.session.completed` / `customer.subscription.*` →
   `profiles.current_plan`. Los precios viven en Stripe; mapping por
   `price_id` → plan id. **Stripe Tax activado desde el día 1** (IVA
   UE/OSS B2C, inversión del sujeto pasivo B2B).
2. **Customer Portal** de Stripe para cambio de plan/cancelación/facturas
   (sustituye los botones inertes de `/dashboard/billing` y el
   `change-plan-modal`). El guard de "tienes más proyectos de los que
   permite el plan destino" (`app/dashboard/settings/billing/actions.ts`)
   debe seguir aplicándose en el downgrade vía webhook.
3. **Reverse trial**: al registrarse, `current_plan='pro'` con
   `trial_ends_at` a 14 días; job/check de expiración → downgrade a free
   conservando datos (la tendencia se muestra bloqueada/borrosa con CTA de
   upgrade, no se borra). Requiere columna nueva en `profiles` → migración
   de esquema: ⚠️ aprobación data-guardian + fundador.
4. **Emails transaccionales (Resend)**: bienvenida, "tu trial acaba en 3
   días", "trial terminado", pago fallido. Plantillas en castellano.

**Facturación española — VeriFactu:** Stripe solo no emite factura española
compliant. Decisión del fundador con su gestor ANTES de la primera venta:
software de facturación VeriFactu conectado a Stripe, o merchant of record
(Paddle/Lemon Squeezy) que sustituiría a Stripe entero. El Task Intake de
esta fase debe recoger la decisión.

**Dependencias:** PRICING-TRUTH-1 (no cobrar por promesas falsas),
PLATFORM-COMMERCIAL-1 (Vercel Pro, dominio, Sentry).

**Agentes:** director + task-intake (report previo), data-guardian
(migración, webhooks = superficie de seguridad), platform-deploy (env
vars, webhook endpoint), frontend, test-architect, qa.

**Criterios de aceptación:** compra real en modo test end-to-end (checkout
→ webhook → plan actualizado → límites nuevos aplicados); cancelación y
downgrade correctos; trial expira y degrada solo; emails llegan; ninguna
clave en cliente; `qa` ACCEPT.

**PR 1 (Stripe Checkout + webhooks) — hecho (2026-07-10):**

- Migración `0015_stripe_billing.sql`: `profiles.stripe_customer_id` (único),
  `profiles.stripe_subscription_id`. Sin cambios de RLS (misma política
  `profiles_update_own`, ambas columnas solo las escribe el webhook vía
  service role). **Pendiente: aplicar manualmente en Supabase SQL editor**
  (mismo procedimiento que todas las migraciones anteriores de este repo).
- `lib/stripe.ts`: cliente Stripe perezoso + mapping `price_id` ↔ plan,
  ambos condicionados a variables de entorno — sin `STRIPE_SECRET_KEY`,
  `getStripeClient()` devuelve `null` y cada llamador responde con un error
  seguro en vez de romper (mismo patrón que Sentry/PostHog).
- `createCheckoutSession` (`app/dashboard/settings/billing/actions.ts`):
  Stripe Checkout real, modo suscripción, `automatic_tax` activado,
  metadata de usuario/plan para que el webhook pueda sincronizar sin
  ambigüedad. Bloquea explícitamente crear un segundo Checkout si la cuenta
  ya tiene un plan de pago (evitar doble suscripción) — cambiar entre
  planes de pago (Starter↔Pro) queda para el Customer Portal (PR 2), que
  gestiona el prorrateo de una suscripción existente correctamente; aquí se
  desactiva en la UI con aviso honesto en vez de simularlo.
- `changePlan`: ahora cancela de verdad la suscripción de Stripe al bajar a
  Free (antes solo cambiaba una columna, dejando la suscripción cobrando
  igualmente).
- Webhook `app/api/webhooks/stripe/route.ts` +
  `lib/billing/stripe-webhook.ts` (lógica separada y testeada aparte):
  verifica firma, gestiona `checkout.session.completed`,
  `customer.subscription.updated` (incluye downgrade automático a Free si
  el estado pasa a `canceled`/`unpaid`/`incomplete_expired`/`paused`) y
  `customer.subscription.deleted`. Escrituras idempotentes por diseño (sin
  tabla de eventos procesados); responde 500 si falla de verdad, para que
  Stripe reintente solo.

**Hallazgos serios encontrados y corregidos en el mismo PR (no estaban en el
alcance original, pero eran precisamente lo que esta fase debía arreglar):**

- `components/billing/change-plan-modal.tsx` **simulaba un cobro real**: el
  paso de confirmación de una subida de plan mostraba un prorrateo
  inventado y, al confirmar, un mensaje final literal *"Hemos cobrado
  179,00 € a tu Visa ····4242"* — sin que ocurriera ningún cobro real
  (`changePlan` solo escribía una columna). Sustituido por el flujo real de
  Stripe Checkout; el paso de confirmación ya no inventa importes ni
  tarjetas.
- `components/billing/billing-content.tsx` mostraba **método de pago y
  facturas completamente ficticios** (`FAKE_PAYMENT_METHOD` con tarjeta,
  email de facturación, razón social y CIF inventados; `FAKE_INVOICES` con
  3 facturas "Pagada" inventadas) a cualquier usuario real de la app. El
  comentario del código decía que era "referencia visual" aprobada por el
  fundador para revisar el layout — pero seguía viva en producción.
  Sustituido por un estado honesto ("todavía no tienes ningún plan de pago
  activo" / aviso de que la gestión llegará con el Customer Portal).
- 22 tests Vitest nuevos (`lib/billing/stripe-webhook.test.ts`,
  `app/dashboard/settings/billing/actions.test.ts`) cubriendo los tres
  eventos del webhook, el bloqueo de doble-checkout, la cancelación real en
  el downgrade, y los casos de fallo. 392/392 tests totales, `pnpm run
  validate` limpio.

**Pendiente (fundador) — hecho en su mayoría (2026-07-10):**
- [x] Migración `0015_stripe_billing.sql` aplicada en Supabase.
- [x] Cuenta Stripe en modo test creada, productos/precios de Starter y Pro
      creados, IDs pasados (`STRIPE_PRICE_ID_STARTER` /
      `STRIPE_PRICE_ID_PRO`), webhook configurado
      (`STRIPE_WEBHOOK_SECRET`), `STRIPE_SECRET_KEY` puesta.

**Verificación en vivo (2026-07-10) — dos problemas reales encontrados y
corregidos durante la propia prueba, ambos configuración/código, no del
alcance original:**

1. **Stripe exigía código fiscal**: `automatic_tax` (activado desde PR 1)
   falló con *"You must specify a tax code..."* hasta que el fundador
   configuró un código fiscal por defecto en Stripe (Configuración →
   Impuestos → código SaaS). Sin código, no es un bug de este repo —
   documentado aquí para que quede constancia de que es un paso de cuenta
   de Stripe, no solo de variables de entorno.
2. **Bug real corregido (1ª vuelta)**: tras completar el pago de prueba,
   Stripe redirigía a `genscore.es` (producción) en vez de al preview donde
   se estaba probando, aterrizando en el login (dominios distintos, sin
   sesión). Causa: `createCheckoutSession` construía `success_url`/
   `cancel_url` con `NEXT_PUBLIC_SITE_URL` (fijada a producción, correcto
   para uso real, pero incorrecta al probar en preview). Corregido para
   derivar el dominio de la propia petición entrante (`next/headers`).
3. **Bug real corregido (2ª vuelta, encontrado al reprobar el fix
   anterior)**: la sesión de Checkout seguía apuntando a `genscore.es` (con
   doble barra: `NEXT_PUBLIC_SITE_URL` mal configurada con `/` final) pese
   al fix. Causa: el dominio de alias de rama de Vercel
   (`geo-tool-git-...vercel.app`) reescribe internamente la cabecera `host`
   a un valor interno de despliegue y expone el dominio público real solo en
   `x-forwarded-host`. Corregido para preferir `x-forwarded-host` sobre
   `host`, y para recortar barras finales al construir la URL (protege
   también contra el propio `NEXT_PUBLIC_SITE_URL` mal configurado). Este
   segundo fallo se detectó porque la sesión de Stripe (pegada por el
   fundador) mostraba `status: "open"` / `payment_status: "unpaid"` — el
   pago de prueba nunca llegó a completarse, así que el plan tampoco se
   activó; no llegó a ser un fallo de webhook.
- Tests de regresión añadidos para ambos casos. 393/393 tests en verde,
  `pnpm run validate` limpio tras el segundo fix.
4. **Tercer hallazgo, no es un bug de código**: con el redirect ya
   corregido, el pago se completó de verdad en Stripe (`status: "complete"`,
   `payment_status: "paid"`), pero el plan seguía sin activarse. Causa:
   **Vercel Deployment Protection** exige autenticación de Vercel para
   cualquier request a un preview, incluidas rutas de API — Stripe recibía
   `401 Protected deployment` al intentar entregar el webhook, así que
   nuestro código nunca llegó a ejecutarse. Esto solo afecta a los
   previews (protegidos por defecto); producción no tiene esta protección.
   Decisión del fundador: mergear el PR 1 ya (checkout real y redirect
   quedaron confirmados end-to-end en preview) y verificar el webhook en
   producción, en vez de configurar un bypass de protección en el preview.

**PR 1 mergeado y verificado end-to-end en producción (2026-07-10, #186 →
`main`).** El fundador cambió la URL del webhook a
`https://www.genscore.es/api/webhooks/stripe` e hizo una compra de prueba
real de Starter en `genscore.es`: pago → webhook → plan activado a Starter,
funcionando de principio a fin. Confirmado también que el cambio entre dos
planes de pago (Starter↔Pro) muestra el mensaje honesto "disponible muy
pronto" en vez de fingir el cambio — comportamiento esperado, alcance del
PR 2.

**PR 2 (Customer Portal) — en curso (2026-07-10):**

- `createPortalSession` (`app/dashboard/settings/billing/actions.ts`): abre
  una sesión real del Customer Portal de Stripe para el `stripe_customer_id`
  de la cuenta — método de pago, facturas, cancelación y (si el fundador lo
  activa en Stripe) cambio de plan Starter↔Pro. Reutiliza `STRIPE_SECRET_KEY`,
  sin variables nuevas.
- **Decisión de producto explícita del fundador**: si un cambio o
  cancelación hecho en el Portal (fuera de la app) deja la cuenta con más
  dominios activos de los que permite el plan nuevo, el sistema **nunca
  archiva automáticamente** — siempre se le pregunta al dueño de la cuenta
  qué dominios quiere mantener. `PlanBillingSection` detecta ese sobre-cupo
  comparando los dominios activos reales contra el cupo del plan actual y
  muestra un aviso persistente con un selector (reutiliza el picker de
  archivado ya existente del downgrade manual, en un nuevo modo
  `overageOnly` de `ChangePlanModal`).
- Cambio entre planes de pago (Starter↔Pro) ya no está bloqueado con el
  aviso "muy pronto": redirige al Customer Portal real.
- Botón "Cancelar suscripción" (antes inerte, sin `onClick`) ahora abre el
  Portal real.
- Placeholder falso de "Pago y facturas" (`billing-content.tsx`) sustituido
  por un botón real "Gestionar facturación" hacia el Portal, visible incluso
  si la cuenta ha vuelto a Free tras cancelar (se guarda que tuvo alguna vez
  un `stripe_customer_id`, para no perder acceso a las facturas pasadas).
- **Pendiente del fundador**: configurar en Stripe Dashboard (Settings →
  Billing → Customer portal, en modo test) "Customers can switch plans"
  (Starter/Pro) y "Customers can cancel subscriptions" — sin esto el Portal
  abre pero no ofrece esas acciones.

**Verificación en vivo (2026-07-10) — un hallazgo de UX, corregido en el
mismo PR:** una vez el fundador activó el Portal en Stripe, el flujo
funcionaba pero aterrizaba en la home del Portal ("Suscripción actual" +
botón "Actualiza la suscripción"), obligando a un clic extra antes de ver
el precio del plan destino — se sentía a medio construir. Corregido con
`flow_data` de Stripe (Portal deep links): `createPortalSession` acepta
ahora un `intent` opcional (`{ type: "update", planId }` o
`{ type: "cancel" }`) que salta directo a la pantalla de confirmación del
plan elegido (con su precio ya calculado) o a la de cancelación,
respectivamente. Si la búsqueda de la suscripción/ítem necesaria para el
deep link falla por lo que sea, cae de vuelta a la home del Portal en vez
de bloquear la acción. Cambiar a Agencia sigue mostrando "disponible muy
pronto" (no tiene precio propio en Stripe, sigue siendo "hablar con
ventas").

18 tests nuevos en `actions.test.ts` (`createPortalSession`, incluyendo los
dos deep links y su fallback). 414/414 tests totales, `pnpm run validate`
limpio.

**PR 2 verificado end-to-end en vivo (2026-07-10):** el fundador probó
Starter→Pro real vía el deep link del Portal. El cambio de precio se
aplicó correctamente en Stripe al primer intento (confirmado indirectamente:
un segundo intento devolvió *"no hay ningún cambio que confirmar"*, prueba
de que ya estaba en Pro), y tras refrescar la página de Facturación el plan
se mostró correctamente actualizado a Pro — el webhook sí sincronizó
`current_plan`, solo necesitaba ese refresco. Sin nuevos hallazgos de
código.

**Siguiente:** mergear PR 2 → PR 3 (reverse trial con `trial_ends_at`,
requiere su propia aprobación de migración) → PR 4 (emails Resend).

---

## Fase 5 — LAUNCH

**Objetivo:** primeros clientes de pago.

**Alcance:**
- Smoke completo del checklist de `docs/environment-contract.md` +
  recorrido de compra en producción (modo live, importe real, refund).
- Revisión humana final de textos legales (pendiente de LEGAL-1).
- Onboarding manual de 3–5 agencias españolas (ICP primario del PRD) antes
  de cualquier difusión pública. Feedback directo → backlog.
- Anuncio público solo cuando las 3–5 primeras cuentas usen el producto sin
  fricción.

**Dependencias:** Fases 0–4 completas.

**Criterio de salida:** ≥1 cliente pagando con factura correcta emitida.

---

## Fase 6 — ALERTS-1 (retención)

**Objetivo:** informe semanal + alertas de cambio por email. Es la feature
de retención nº 1 de la categoría (toda la competencia la tiene) y hoy no
existe: el score cambia mientras el usuario no mira.

**Alcance:** email semanal por proyecto (GEO Score, delta, top movimientos
de competidores, recomendación destacada) vía Resend; alerta puntual si el
score cae más de un umbral; preferencias en `/dashboard/settings/notifications`
(la página ya existe como shell). Probable migración pequeña (preferencias)
→ aprobación data-guardian.

**Dependencias:** BILLING-STRIPE-1 (Resend ya integrado). Nota: si
ASYNC-SCAN-1 se aprueba antes, diseñar las notificaciones una sola vez
(server-side) como ya recomienda director-strategy.md.

**Agentes:** director + geo-strategy (qué contar en el email), reliability
(triggers), frontend.

---

## Fase 7 — GROWTH-1 (continua)

**Objetivo:** motor de adquisición orgánica. Dogfooding: una herramienta
GEO debe aparecer ella misma en respuestas de IA sobre "herramientas GEO".

**Alcance:**
- Blog MDX estático dentro del propio Next.js (sin CMS), con schema
  `Article`/`FAQPage`, sitemap y `llms.txt` — aplicando las propias
  recomendaciones del producto.
- 4–6 artículos fundacionales en castellano: qué es GEO, metodología del
  GEO Score (ADR-0008 es medio artículo), comparativas honestas vs
  Otterly/Peec/Athena, casos del catálogo de 10 gaps.
- Free scan como CTA final de cada pieza. Valorar GEO Score compartible
  (imagen) para viralidad.
- Canales del fundador: LinkedIn build-in-public en castellano; contacto
  directo con agencias.

**Dependencias:** Fase 0 (nombre) y LAUNCH para difusión; la sección de
blog puede construirse antes. Sembrar contenido cuanto antes: los motores
tardan semanas en recogerlo.

**Agentes:** nuevo agente `growth-content` (ver "Cambios en la estructura
de agentes" abajo) + frontend para la sección MDX.

---

## Fase 8 — ENGINES-2 ⚠️ (requiere aprobación explícita)

**Objetivo:** ChatGPT (OpenAI) y Perplexity como motores 3 y 4. Es la
inversión de producto con mejor ratio esfuerzo/valor comercial: el mercado
compra cobertura de ChatGPT, y la arquitectura multi-proveedor (migración
0009, `LLM_SCAN_PROVIDERS`, executor con fan-out) ya existe — el coste
marginal por motor es bajo.

**Nota:** "OpenAI runtime" y "Perplexity runtime" están en la Forbidden
list → Task Intake + aprobación. Al completarse: subir precio de Pro con
grandfathering de clientes existentes, y actualizar `/pricing` (que por
PRICING-TRUTH-1 solo puede anunciar motores ya reales).

**Dependencias:** LAUNCH (no bloquea cobrar con 2 motores honestos).
Presupuestar coste por escaneo antes (geo-strategy + platform-deploy).

---

## Fase 9 — ASYNC-SCAN-1 ⚠️ (prerrequisito de escala, ya scoped)

Ya documentada en `docs/director-strategy.md` (planned, not approved).
Contexto nuevo desde el informe: con el pipeline actual (scan síncrono 60s,
batching auto-encadenado, cron que procesa `MAX_PROJECTS_PER_CRON_RUN=5`
proyectos una vez al día), **30 clientes Pro con refresco diario y 100
prompts × 2 motores no caben**. No bloquea LAUNCH; bloquea el primer mes
con tracción. Elevar prioridad en cuanto haya >10 clientes con recurring
scans. Reabre ADR-0003; schema + RLS + scheduler → aprobación explícita.

---

## ⏰ MODEL-PIN — deadline duro 2026-10-16

`gemini-2.5-flash` (ADR-0009) tiene cutover anunciado el **2026-10-16**. Si
llega la fecha con clientes de pago y el modelo se apaga, todos los
escaneos fallan (ya ocurrió con `gemini-2.0-flash-001` el 2026-06-01).
Programar la migración de pin (nuevo ADR + smoke) como muy tarde **la
semana del 2026-10-01**, en cualquier punto del plan en que se esté.

---

## Cambios en la estructura de agentes (hacer junto a las fases que los usan)

1. **`growth-content` (nuevo)** — posicionamiento, copy marketing, blog,
   emails de ciclo de vida. Crear en Fase 7 (o antes si se adelanta el blog).
2. **`billing-compliance` (nuevo, o extensión de `platform-deploy`)** —
   Stripe, webhooks, enforcement de planes, facturación, checklist legal.
   Crear en el Task Intake de la Fase 4. Plan-mode para todo lo que toque
   dinero (análogo a data-guardian).
3. **CLAUDE.md** — al aprobar la Fase 4, redefinir "billing" en la Forbidden
   list; al cerrar la Fase 0, resolver la contradicción GEO Studio/Lumira
   (la web pública ya dice Lumira mientras CLAUDE.md lo prohíbe).
4. **`qa`** — añadir al checklist permanente: "¿`/pricing` sigue siendo
   verdad respecto al producto real?" (Fase 2).

---

## Cambios propuestos al plan

*(El Director anota aquí propuestas de reorden/alcance; solo el fundador
aprueba. Vacío a 2026-07-09.)*
