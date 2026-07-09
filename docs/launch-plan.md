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
| 0 | DECISIÓN-MARCA | 🔲 Pendiente (fundador) | — | 2026-07-09 | Candidatos investigados: ver fase |
| 1 | LEGAL-1 | 🔲 Pendiente | — | 2026-07-09 | |
| 2 | PRICING-TRUTH-1 | 🔲 Pendiente | — | 2026-07-09 | |
| 3 | PLATFORM-COMMERCIAL-1 | 🔲 Pendiente | — | 2026-07-09 | Parte es config manual en Vercel |
| 4 | BILLING-STRIPE-1 ⚠️ | 🔲 Pendiente aprobación | — | 2026-07-09 | Forbidden list: requiere aprobación explícita |
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

**Tareas (fundador):**
- [ ] Elegir 2 finalistas.
- [ ] Búsqueda en TMview (EUIPO + OEPM); si limpio, clearance profesional
      (~200–400 €).
- [ ] Comprar dominios el mismo día de la decisión (.ai + .es mínimo).
- [ ] Solicitud EUIPO (clases 42 + 35, ~850–900 €).
- [ ] Comunicar el nombre al repo: se actualizará `CLAUDE.md` (regla
      "Do not rename GEO Studio to Lumira" queda obsoleta) y el branding de
      las páginas de marketing dentro de PRICING-TRUTH-1.

**Criterio de salida:** nombre decidido + dominio en propiedad.
No bloquea LEGAL-1 ni PRICING-TRUTH-1 (pueden arrancar con placeholder de
marca), pero sí bloquea LAUNCH y GROWTH-1.

---

## Fase 1 — LEGAL-1 (P0 de lanzamiento)

**Objetivo:** cumplir los mínimos legales para operar un SaaS de pago desde
España hacia la UE. Hoy no existe **ninguna** página legal; los enlaces
"Privacidad"/"Términos" del footer son `<span>` inertes.

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

---

## Fase 4 — BILLING-STRIPE-1 ⚠️ (requiere aprobación explícita del fundador)

**Objetivo:** cobrar. "billing" está en la Forbidden list de `CLAUDE.md`:
esta fase requiere Task Intake Report aprobado antes de código, y al
aprobarse debe **actualizarse CLAUDE.md** redefiniendo el límite (p. ej.
"Stripe sí; cambios de precios en producción solo con aprobación").

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
