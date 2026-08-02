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
| 3 | PLATFORM-COMMERCIAL-1 | 🟡 Bloqueada en Vercel Pro (diferido, decisión fundador) | #181, #183, #223 | 2026-07-17 | Dominio + PostHog + Sentry verificados en vivo y funcionando (dos bugs reales de instrumentación de Sentry encontrados y corregidos: `onRequestError` en #183, boundary `error.tsx` en #223). Pendiente: Vercel Pro (diferido a propósito, riesgo aceptado), sourcemaps de Sentry (`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`), eventos de funnel en PostHog, panel de operador |
| 4 | BILLING-STRIPE-1 ⚠️ | ✅ Hecho (alcance aprobado) | #186, #189, #191, #192, #196, #200, #202, #205, #207 | 2026-07-11 | Checkout, webhook, Customer Portal, protección RLS, reverse trial (7 días) y los 5 emails transaccionales (bienvenida, plan confirmado, pago fallido, trial terminado, cancelación programada) verificados end-to-end en producción, incluida la cancelación real (fecha guardada, UI con estado "Cancelada — activa hasta…" + botón reactivar, email recibido). Bug real encontrado y corregido en vivo: el código exigía `cancel_at_period_end` además de `cancel_at`, pero el Customer Portal solo fija `cancel_at`. Pendiente, deliberadamente fuera de este alcance: PR B (aviso 3 días antes de expirar el trial, necesita su propia aprobación de migración/cron) y el go-live checklist (Vercel Pro, alta autónomo, VeriFactu, claves live) antes de cobros reales |
| 5 | LAUNCH | 🔲 Pendiente — es el camino crítico actual | — | 2026-07-17 | Todo el código de las fases 0–4 está shipeado y verificado en producción (modo test). Lo que queda es casi todo del fundador: Vercel Pro, alta autónomo, VeriFactu, claves live de Stripe, revisión legal humana. Checklist detallado y ordenado en la sección de Fase 5 |
| 6 | ALERTS-1 | ✅ Hecho | — | 2026-07-12 | Fase 6a: alerta de caída de GEO Score (≥10 puntos) + preferencias reales en `/dashboard/settings/notifications`. Fase 6b: resumen semanal por email (cron nuevo, deshabilitado por defecto vía `CRON_DIGEST_ENABLED`) — Vercel levantó el límite de cron jobs en enero 2026 (100/proyecto en todos los planes, incl. Hobby), así que no dependía de Vercel Pro como se pensaba |
| 7 | GROWTH-1 | 🟡 5 artículos publicados; catálogo abierto | — | 2026-07-17 | Fase 7a: blog MDX, sitemap, robots.txt, llms.txt, agente `growth-content`. Fase 7b: 4 artículos más (contenido del fundador vía ChatGPT, revisado) + portadas con imágenes reales generadas por el fundador + ilustraciones de contenido (tablas GFM, flujo de proceso). Pendiente: el 5º post del prompt original del fundador (cuando lo aporte) + resto del catálogo en PRs pequeños |
| 7b | GROWTH-2 | 🟡 En curso (2.1 ✅ #286; 2.2 ✅ #290; 2.3 ✅ #291; 2.4 ✅ #292; 2.5 en PR) | #286, #290, #291, #292 | 2026-08-02 | Motor de posicionamiento orgánico SEO+GEO, continuación de GROWTH-1. Task Intake aprobado 2026-08-02 ("modo YOLO" con Human Gate manual en cada PR, verificación con `ux-pilot` antes de pasar de fase, 2.6 requiere su propia aprobación, 2.7 es trabajo del fundador). **2.1 BASE-TECNICA ✅** (PR #286): Search Console, canonicals, sitemap real, RSS, JSON-LD; journey de pilot encontró un `PILOT FAIL` real (overflow 3px en `/blog` mobile) — arreglado. **2.2 ESTRATEGIA-AGENTES ✅** (PR #290): `docs/content-strategy.md`, `docs/content-calendar.md`, agente `seo-geo-research`, `growth-content` ampliado. **2.3 DOCS-PUBLICOS ✅** (PR #291): `/docs`, 5 páginas trazadas a ADR-0015; QA corrigió etiquetas de franja de madurez inventadas. **2.4 GLOSARIO+COMPARATIVAS ✅** (PR #292): `/glosario` (15 términos, `DefinedTermSet`) y `/comparativas/genscore-vs-otterly` (honesto, 3 filas donde gana el competidor); QA encontró y corrigió una clase CSS heredada de otra rama sin mergear que dejaba la tabla sin estilo. **2.5 BLOG-HUBS** (este PR, slice B1a del ledger de `docs/content-calendar.md`): taxonomía de 4 clusters en `lib/blog/posts.ts` (`fundamentos`/`medicion`/`playbooks`/`sectores`), índice de `/blog` reagrupado por cluster (con estado "Próximamente" honesto para los dos clusters aún vacíos, en vez de ocultarlos), y enlazado interno real — cada post enlaza a sus hermanos de cluster (`components/blog/related-posts.tsx`), cumpliendo la regla de mínimo 3 enlaces internos de `content-strategy.md` §4.3. **No incluye** páginas pilar dedicadas por cluster ni los 2 artículos nuevos del cluster playbooks (`como-conseguir-que-chatgpt-te-cite`, `llms-txt-guia-practica`) — quedan como B1b/B2/B3 en el calendario, PRs separadas. Siguiente: resto de 2.5 → 2.6 ⚠️ (Observatorio, aprobación propia) → 2.7 (off-site, fundador) |
| 8 | ENGINES-2 ⚠️ | 🟡 OpenAI hecho (2a); Perplexity fuera de alcance | #226, #236 | 2026-07-18 | ChatGPT (gpt-4o-mini + búsqueda web forzada) activo como motor 3 en los 3 planes de pago, validado en vivo: citas reales (6/10 prompts), el motor más rápido (4,4s media), coste despreciable (~$0,01-0,02/escaneo). Free sigue con 1 motor. Perplexity sin fecha, requeriría su propia aprobación |
| 8b | ENGINES-VALUE-1 | ✅ Hecho | #228 | 2026-07-19 | Explotar el dato multi-motor ya persistido (migración 0009): tarjeta comparativa por motor en Overview (mención, citación con honestidad ADR 0012, sentimiento, brecha; grounded primero, Claude al final) + matriz prompt × motor en Prompts con scroll móvil. Cero llamadas nuevas, cero esquema. Mergeada tras Human Gate del fundador con sus 4 cambios de revisión aplicados. Spec: `docs/specs/engines-value-1.md` |
| 8c | ENGINES-VALUE-2 | ✅ Hecho | #240 | 2026-07-19 | Fuentes citadas por motor en la página Citations: atribución de cada cita a su motor (Gemini/ChatGPT), chips por dominio con nombre completo, desglose KPI, priorización de oportunidades por nº de motores, y varios fixes de revisión del fundador (labels "Motores"/"Citado por" en móvil, exclusión de citas ruido de Google Maps/Search, overflow móvil). Spec: `docs/specs/engines-value-2.md` |
| 8d | ENGINES-VALUE-3 | 🟡 Implementado, pendiente Human Gate | #244 | 2026-07-19 | Cuota de voz por motor en la página Competidores: mención por (marca/competidor, motor) sobre el histórico acumulado de escaneos, chips compactos bajo la barra de SoV, e insight de brecha para el competidor líder cuando su presencia se concentra en un motor. Cero llamadas nuevas, cero esquema. Spec: `docs/specs/engines-value-3.md` |
| 9 | ASYNC-SCAN-1 ⚠️ | 🟡 En curso (1c hecho, 1a en PR, 1b hecho, en PR) | #231, #232, #263, #264, #266 | 2026-07-30 | Task Intake de la Fase 9 aprobado 2026-07-17, dividida en tres: **1a CRON-SCALE** (sweep diario auto-encadenado, ADR-0016, sin schema) en PR #231 pendiente de Human Gate; **1c ASYNC-LAUNCH** (lanzamiento manual no bloqueante + mensaje honesto de escaneo activo, addendum ADR-0003) ✅ hecho, PR #232 mergeada 2026-07-18 tras smoke real del fundador; **1b NOTIF-SERVER** (notificaciones server-side, schema+RLS): diseño técnico ✅ mergeado (PR #263), **fase 1a (schema+emisión) ✅ mergeada** (PR #264) y verificada en producción con datos reales — más el fix RECS-DEDUPE-1 (PR #266, ver hallazgo P0 más abajo) que la propia verificación en vivo destapó. **Fase 1b (lectura + UI) implementada, en PR**, Task Intake aprobado 2026-07-30: `lib/project-workspace.ts` ya no deriva de `scan_runs`/`project_prompts` — lee la tabla `notifications` real (15 filas para la campana, 50 para la página, sin segunda consulta para el contador de no leídas); `lib/notifications/render.ts` traduce cada fila a copy en castellano para los 8 tipos del contrato (solo 4 tienen datos reales hoy); panel de la campana repintado a tokens `--brand-*` con pestañas Todas/No leídas y agrupación por día; página nueva `/dashboard/notifications`; 4 iconos nuevos (`trendDown`, `flag`, `hourglass`, `robot`); `prompts_added` retirado del todo. 790/790 tests, build/typecheck/lint limpios. **Sin smoke visual local** (sin credenciales de Supabase en el entorno de ejecución) — pendiente de verificación del fundador en el preview antes del Human Gate |
| 10 | AUTH-EMAIL-VERIFY-1 | 🟡 Código en PR, falta activar el toggle | #237 | 2026-07-18 | Task Intake aprobado 2026-07-18. Signup con email/contraseña exige confirmación por enlace antes de dar acceso: `app/signup/actions.ts` detecta la ausencia de sesión de `signUp()` y manda a `/signup/confirm` en vez de `/dashboard`; `app/auth/callback/route.ts` envía el email de bienvenida al confirmar (reusa la detección de "cuenta recién creada" ya existente para OAuth); login con cuenta no confirmada da mensaje seguro en castellano (`error.code === "email_not_confirmed"`). Sin cambios de schema/RLS. **Bug real encontrado en vivo (2026-07-18):** el fundador activó el toggle directamente en Supabase antes del merge — el código de producción sin este fix no comprueba la sesión y deja al usuario sin acceso silenciosamente; además, probarlo repetidas veces sin SMTP propio dispara el rate limit del mailer por defecto de Supabase (`over_email_send_rate_limit`), ahora mapeado a mensaje seguro. Toggle desactivado de nuevo por el fundador hasta mergear. **Pendiente antes de reactivar en producción:** configurar SMTP propio (Resend) en Supabase — ver `docs/environment-contract.md` — y mergear este PR |
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

**LEGAL-1 al día (2026-07-11):** con Sentry/PostHog (Fase 3) y Stripe
(Fase 4) ya confirmados operativos en producción, `/privacidad` se
actualizó para añadirlos a la lista de encargados del tratamiento —
cerraba el hallazgo señalado (sin corregir) en los PRs #196/#200/#202 de
BILLING-STRIPE-1. `/cookies` no cambia: PostHog corre en modo cookieless
(`persistence: "memory"`) y Sentry no fija cookies de seguimiento, así que
la promesa de "sin cookies de analítica" se mantiene cierta.

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

**Segundo hallazgo de Sentry, en vivo (2026-07-12):** el fundador reportó
un error real ("Algo ha ido mal") en `/dashboard/projects/[id]/web-audit`
tras lanzar un escaneo + una auditoría técnica, pero Sentry no tenía
ningún registro de ese momento — solo un error antiguo. Causa: a
diferencia de `instrumentation.ts`'s `onRequestError` (ya corregido
arriba), el único error boundary de la app
(`app/dashboard/error.tsx`, cubre toda la sección `/dashboard`, incluida
Auditoría web) solo hacía `console.error` en el navegador — Sentry
**no instrumenta automáticamente** los boundaries `error.tsx` de Next.js,
hace falta una llamada explícita a `Sentry.captureException`. El fallo
de hoy se perdió sin remedio (solo estaba en la consola del móvil del
fundador). Corregido: `Sentry.captureException(error)` añadido al mismo
`useEffect`. **Resuelto en producción (confirmado por el fundador,
2026-07-17):** el fallo dejó de reproducirse tras la reestructuración
completa de la página de Auditoría web (PRs #222/#224/#225 — hero score,
tabs, checks técnicos ampliados, pulido visual), que reescribió el árbol
de render donde ocurría. La causa raíz exacta del `TypeError ... 'noindex'`
original nunca llegó a identificarse con certeza: el stack de Sentry era
código minificado sin resolver porque **los sourcemaps de producción no se
suben** — `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` nunca se han
configurado en Vercel (ver checklist de Fase 5). El fix del boundary
(#223) queda en su sitio: si el error reapareciera, esta vez sí quedaría
capturado.
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

**PR 2 mergeado (2026-07-10, #189 → `main`).**

**Fix de seguridad RLS (2026-07-10, founder-approved antes de PR 3):**
al preparar el reverse trial se detectó que `profiles_update_own`
(`0002_v0_rls.sql`) solo comprueba propiedad de la fila (`id = auth.uid()`),
sin restringir columnas — cualquier usuario autenticado podía llamar a la
API de Supabase directamente (sin exploit, solo su propia sesión) y
autoasignarse `current_plan`/`stripe_customer_id`/`stripe_subscription_id`,
sin pasar por Stripe ni por `changePlan`. Existía desde `0010`/`0015`;
añadir `trial_ends_at` sin arreglarlo habría extendido el mismo agujero al
trial.

- Migración `0016_protect_billing_columns.sql`: trigger `BEFORE UPDATE` en
  `profiles` que rechaza cambios a esas tres columnas salvo que vengan del
  rol de servicio. No RLS policy nueva — el trigger vive por debajo de RLS.
- `changePlan` (`app/dashboard/settings/billing/actions.ts`): toda la
  validación (archivado, recomprobación de cupo, cancelación real en
  Stripe) sigue bajo la sesión propia del usuario; solo la escritura final
  en `profiles` pasa a usar `createServiceClient()` (`lib/supabase/service.ts`,
  ya usado por el webhook). Fallback seguro si la clave de servicio no está
  configurada, en vez de reventar la request.
- El webhook no cambia (ya escribía por rol de servicio).
- 4 tests actualizados/nuevos en `actions.test.ts` (incluye el caso de
  cliente de servicio no disponible). 415/415 tests totales, `pnpm run
  validate` limpio.
- **Pendiente del fundador:** aplicar `0016_protect_billing_columns.sql`
  manualmente en el editor SQL de Supabase (mismo procedimiento de siempre),
  después de `0015`.

**Fix de seguridad RLS mergeado (2026-07-10, #191 → `main`).** Pendiente:
fundador aplica `0016_protect_billing_columns.sql` en Supabase.

**PR 3 — reverse trial, 7 días (2026-07-10, en curso):** decisión del
fundador — sustituye por completo el mecanismo anterior de "elige un plan
gratis para siempre según el CTA de precios" (`0011_signup_plan_from_metadata.sql`,
ya sin sentido con Stripe real): **todo registro nuevo empieza en Pro con
7 días de prueba**, sin tarjeta, sin importar qué botón de `/pricing`
pulsó.

- Migración `0017_reverse_trial.sql`: añade `profiles.trial_ends_at`;
  amplía el trigger de `0016` para proteger también esta columna (solo el
  rol de servicio puede escribirla); reemplaza `handle_new_user()` para que
  todo alta inserte `current_plan='pro'` + `trial_ends_at = now() + 7 días`,
  ignorando el metadata de plan del signup.
- `app/signup/actions.ts` y `app/signup/page.tsx`: eliminada la selección de
  plan en el registro (el chip "Plan elegido: X" y el campo oculto) —
  habría sido directamente falso mostrarlo cuando todos reciben Pro. Copy
  actualizado a "7 días de prueba gratis de Pro, sin tarjeta".
- `lib/billing.ts`: `getPlanForUser` y `getUsageSummary` comprueban de forma
  perezosa (sin cron nuevo, al leer el plan) si `trial_ends_at` ya pasó; si
  es así y **no hay** `stripe_subscription_id` real, degradan a Free y
  limpian `trial_ends_at` vía `createServiceClient()` — nunca toca una
  cuenta que ya contrató de verdad durante el trial. Falla seguro (mantiene
  el plan anterior) si la escritura de degradación falla.
- `UsageSummary.trialEndsAt` nuevo; `BillingContent` muestra un aviso con
  los días restantes de prueba.
- **Alcance deliberadamente no cubierto en este PR**: la comprobación de
  expiración vive en `getPlanForUser`/`getUsageSummary` (cubre creación de
  proyectos/prompts y la página de facturación), no en las lecturas
  directas de `resolvePlan(profile.current_plan)` dentro de
  `lib/scan/run-creation.ts`, `cron.ts` y `executor.ts` — un scan ya
  encolado podría ejecutarse con la cadencia/motores de Pro hasta el
  siguiente punto de contacto interactivo tras la expiración. Ventana de
  desfase aceptada, no un agujero de seguridad (no permite upgrade gratis
  permanente).
- Página de precios (`/pricing`): las tarjetas por plan siguen mostrando
  CTAs distintos ("Empezar con Starter", "Probar Pro gratis"...) aunque
  todos llevan al mismo resultado (Pro 7 días). Copy sin retocar en este
  PR — es una decisión de marketing/conversión aparte, no de este alcance.
- 8 tests nuevos en `lib/billing.test.ts`. 423/423 tests totales, `pnpm run
  validate` limpio.
- **Pendiente del fundador:** aplicar `0017_reverse_trial.sql` en Supabase,
  después de `0016`.

**Migraciones `0016`/`0017` aplicadas por el fundador (2026-07-10).**
Verificado en vivo: alta nueva en el preview → dashboard directo, sin
pantalla de elegir plan → Ajustes → Facturación muestra Pro con el aviso
de días de prueba.

**Dos hallazgos de UX en la misma verificación, corregidos en el mismo PR:**

1. **Aviso de trial poco visible**: el aviso "Estás probando Pro..." era un
   texto plano sin urgencia ni acción. Movido de `billing-content.tsx` a
   `PlanBillingSection` (para poder abrir el modal) y rediseñado con el
   mismo estilo de aviso ámbar que el de sobre-cupo (icono de reloj, texto
   en negrita, "te quedan X días" destacado) + botón **"Contratar ahora"**
   que abre "Cambiar de plan" directamente en Pro.
2. **Bug real: no se podía contratar Pro estando en el trial**. El modal de
   "Cambiar de plan" decidía el flujo (Checkout / Portal / bloqueado) solo
   mirando `currentId` — como una cuenta en trial ya tiene
   `current_plan='pro'`, seleccionar Pro se trataba como "ya estás en este
   plan" (deshabilitado), y elegir Starter/Agencia se enrutaba al Customer
   Portal, que no tiene nada que gestionar todavía (sin `stripe_customer_id`
   real). Corregido: `ChangePlanModal` recibe ahora `hasRealSubscription`
   (de `usage.hasStripeSubscription`, nuevo en `UsageSummary`) en vez de
   inferir "tiene suscripción real" a partir de `currentId !== "free"`.
   Mientras haya trial sin conversión, cualquier plan de pago (incluido el
   mismo que ya se está probando) pasa por Checkout real; solo una cuenta
   con suscripción real de Stripe usa el Portal. El botón "Cancelar
   suscripción" también se ocultaba tras esta misma corrección, ya que
   durante el trial no hay nada que cancelar en el Portal (ahora se guarda
   en `usage.hasStripeSubscription`, antes se guiaba solo por
   `planId !== "free"`).
- Sin tests de componente nuevos (este repo no usa React Testing Library
  para UI; la lógica subyacente del trial —`getPlanForUser`/
  `getUsageSummary`— ya está cubierta en `lib/billing.test.ts`). 423/423
  tests totales, `pnpm run validate` limpio.

**Tercer hallazgo, en vivo, mismo bug pero en el servidor:** el fix
anterior corrigió el modal (cliente), pero `createCheckoutSession`
bloqueaba igualmente el pago con *"Ya tienes un plan de pago activo"*,
comprobando `current_plan !== "free"` en vez de si existía una suscripción
real. Corregido para comprobar `stripe_subscription_id` en su lugar — solo
bloquea un segundo Checkout cuando ya hay una suscripción real detrás, no
cuando `current_plan` es "pro" solo por estar en el trial. 2 tests
actualizados/nuevos. 424/424 tests totales, `pnpm run validate` limpio.

Además, el fundador pidió quitar la tarjeta de "Ver todos los planes" /
"Has usado X de Y prompts" de la página de facturación (redundante junto
al nuevo aviso de trial) — eliminada de `billing-content.tsx`.

**Cuarto hallazgo, en vivo:** pago completado de verdad (conversión de
trial a Pro real, confirmado en Stripe), pero el aviso de trial seguía
mostrándose tras el redirect — el webhook de Stripe tarda unos segundos en
llegar, y mientras tanto la página ya se había cargado con el estado
anterior. Dos causas, ambas corregidas:

1. `checkout.session.completed` y `customer.subscription.updated`
   (`lib/billing/stripe-webhook.ts`) no limpiaban `trial_ends_at` al
   confirmar una suscripción real — aunque el webhook llegara, el aviso de
   trial habría seguido ahí indefinidamente. Ahora ambos lo ponen a `null`.
2. **Refresco casi instantáneo**: nuevo `CheckoutSuccessPoller` (componente
   cliente) que, mientras `checkout=success` está en la URL y
   `usage.hasStripeSubscription` sigue siendo falso, llama a
   `router.refresh()` cada 2s (para en cuanto el dato ya refleja el pago,
   o a los 20s como límite). Antes había que recargar la página a mano.

2 tests de webhook actualizados. 424/424 tests totales, `pnpm run
validate` limpio.

**PR 3 mergeado y verificado end-to-end en producción (2026-07-10, #192 →
`main`).** El fundador confirmó en `genscore.es`: cuenta en trial → botón
"Contratar ahora" → pago real completado en Stripe → el aviso de trial
desapareció solo (sin recargar a mano), plan mostrado como Pro real con
"Cancelar suscripción" disponible. BILLING-STRIPE-1 PR 1-3 + el fix de
seguridad RLS quedan cerrados y verificados en vivo.

**Siguiente:** PR 4 (emails transaccionales Resend). A diferencia de PR 1-3,
esto **no está recogido explícitamente** en la nota de `CLAUDE.md` sobre
el alcance ya aprobado de BILLING-STRIPE-1 ("Stripe Checkout + webhooks +
reverse trial + Customer Portal") — introduce un proveedor externo nuevo
(Resend), variables de entorno nuevas, y contenido de comunicación real a
usuarios. Antes de implementar, confirmar alcance con el fundador
(Task Intake corto): qué emails exactamente, dominio de envío/verificación
DNS, y si requiere revisión de `/privacidad` (nuevo processor de datos).

**Fundador confirmó (2026-07-10):** los 4 emails originales + confirmación
de plan contratado (5 en total); todavía no tiene cuenta de Resend; sí,
actualizar `/privacidad`. Repartido en dos PRs — PR A ahora (sin migración
ni cron), PR B más adelante (aviso "3 días antes de expirar" — necesita
columna nueva + cron, su propia aprobación de esquema).

**PR A (Resend, sin migración) — hecho (2026-07-10):**

- `lib/email/resend.ts`: cliente perezoso, mismo patrón inerte que
  Stripe/Sentry/PostHog — sin `RESEND_API_KEY`, no envía nada, no rompe
  nada. `RESEND_FROM_EMAIL` opcional (usa el remitente de pruebas propio de
  Resend hasta que el fundador verifique un dominio).
- `lib/email/transactional.ts`: 4 funciones (`sendWelcomeEmail`,
  `sendPlanConfirmedEmail`, `sendPaymentFailedEmail`, `sendTrialEndedEmail`),
  todas silenciosas ante fallo (nunca deben romper el signup/checkout/
  degradación de trial a los que van enganchadas).
- Puntos de disparo: `app/signup/actions.ts` (bienvenida, tras un alta
  real); `lib/billing/stripe-webhook.ts` en `checkout.session.completed`
  (confirmación de plan, usando `session.customer_details.email`) y en el
  nuevo caso `invoice.payment_failed` (pago fallido, sin escritura en BD,
  solo aviso); `lib/billing.ts`'s `applyTrialExpiry` (trial terminado, en
  el momento exacto de la degradación perezosa).
- **Pendiente del fundador**: crear cuenta de Resend, verificar dominio de
  envío (SPF/DKIM), y suscribir el endpoint del webhook de Stripe al
  evento `invoice.payment_failed` (Dashboard → Developers → Webhooks →
  editar endpoint → añadir evento) — sin esto Stripe nunca envía ese
  evento y el email de pago fallido no se dispara nunca, aunque el código
  ya lo soporte.
- `/privacidad` actualizado: Resend añadido a la lista de encargados del
  tratamiento.
- **Hallazgo aparte, no corregido en este PR** (fuera del alcance pedido):
  Stripe, PostHog y Sentry procesan datos reales (facturación, analítica,
  errores) pero **no están listados** en `/privacidad` ni `/cookies` —
  gap legal preexistente de PLATFORM-COMMERCIAL-1/BILLING-STRIPE-1, no
  introducido aquí. Señalado para que el fundador decida si se corrige
  aparte.
- 5 tests nuevos (`stripe-webhook.test.ts` x4, `app/signup/actions.test.ts`
  x2, `lib/billing.test.ts` x1). 433/433 tests totales, `pnpm run
  validate` limpio.

**PR A mergeado (2026-07-11, #196 → `main`).** Verificado en producción:
email de bienvenida y de confirmación de plan (Free→Starter, y conversión
de trial a Pro real) llegaron correctamente tras un despliegue fresco
(mismo gotcha de siempre: variables de entorno nuevas requieren un
redeploy — resuelto con un commit vacío).

**Quinto hallazgo, en vivo:** al cambiar de plan (Starter↔Pro) o cancelar
la suscripción **desde el Customer Portal**, no llegaba ningún email — el
alcance original de PR A solo enganchaba los emails a
`checkout.session.completed` (primera contratación), no a
`customer.subscription.updated` (cambios posteriores vía Portal).
Corregido en el mismo PR:

- `customer.subscription.updated` ahora lee el plan anterior antes de
  escribir el nuevo, y si de verdad cambió, envía el mismo email de
  "tu plan X ya está activo" (cubre el cambio de plan vía Portal). No hay
  riesgo de duplicado con el email de `checkout.session.completed`: ese
  evento solo se dispara para una suscripción que ya existía antes
  (una recién creada por Checkout emite `customer.subscription.created`,
  que este webhook no escucha).
- Nueva función `sendCancellationScheduledEmail`: cuando
  `subscription.cancel_at_period_end` es true, envía un aviso con la
  fecha exacta (`subscription.cancel_at`) hasta la que el plan sigue
  activo — igual que la propia pantalla de Stripe se lo muestra al
  usuario, pero por email.
- 4 tests nuevos en `stripe-webhook.test.ts`. 525/525 tests totales
  (incluye trabajo de otras ramas ya mergeadas), `pnpm run validate`
  limpio.

**Sexto hallazgo, en vivo (tras #200):** el fundador probó de nuevo en
producción — el email de cambio de plan ya llega, pero el de cancelación
seguía sin llegar, y además un bug real de UI: tras cancelar en el Portal,
la pantalla de facturación seguía mostrando "Activo" y los botones
normales de "Cambiar de plan"/"Cancelar suscripción", sin ningún indicio
de que la baja ya estaba programada ni hasta qué fecha seguía activo el
plan.

**Decisión (Task Intake, aprobada — "Apruebo opción a"):** en vez de
consultar Stripe en cada carga de la página (opción B, sin migración), se
guarda `cancel_at` en `profiles` (opción A) para que la propia pantalla de
facturación lo lea sin llamada externa. Implementado:

- `supabase/migrations/0019_subscription_cancel_at.sql` — añade
  `profiles.cancel_at` (timestamptz) y extiende el trigger
  `protect_billing_columns()` para protegerla igual que `current_plan`,
  `trial_ends_at`, etc. (**pendiente de aplicar manualmente en Supabase**,
  igual que las migraciones anteriores de esta fase).
- `customer.subscription.updated` ahora calcula `cancel_at` a partir de
  `subscription.cancel_at_period_end`/`subscription.cancel_at` de Stripe y
  lo persiste (null si el owner reactiva la suscripción); reutiliza ese
  mismo valor para decidir si envía el email de cancelación programada.
  `customer.subscription.deleted` y el resto de estados terminales
  también limpian `cancel_at` a null.
- `lib/billing.ts` (`getUsageSummary`) expone el nuevo campo `cancelAt`.
- `components/billing/plan-billing-section.tsx`: cuando `cancelAt` está
  presente, el badge pasa de "Activo" a "Cancelada — activa hasta el
  {fecha}", y los dos botones ("Cambiar de plan"/"Cancelar suscripción")
  se sustituyen por uno solo ("Gestionar en el portal de Stripe") que
  abre el Customer Portal para reactivar si el fundador cambia de idea.
- 8 tests nuevos (`stripe-webhook.test.ts` x6, `lib/billing.test.ts` x2).
  529/529 tests totales, `pnpm run validate` limpio.

**Nota sobre el email de cancelación:** no se obtuvo evidencia directa
(el fundador pegó un objeto `billing_portal.session`, no el evento
`customer.subscription.updated`) de por qué falló específicamente ese
envío. Con `cancel_at` ahora persistido en base de datos, la próxima
prueba en producción da una señal independiente del email: si la columna
se rellena correctamente, el pipeline del evento funciona y el email
perdido fue probablemente un caso aislado.

**Siguiente:** el fundador aplica la migración 0019, prueba de nuevo la
cancelación en producción y confirma (a) que `cancel_at` se guarda, (b)
que la pantalla de facturación ahora refleja la cancelación programada, y
(c) si el email de cancelación llega esta vez → PR B (aviso 3 días antes
de expirar el trial, con su propia aprobación de migración) cuando el
fundador lo pida.

**Séptimo hallazgo, causa raíz encontrada (mismo día):** tras aplicar la
migración 0019 y mergear el PR anterior, el fundador probó la cancelación
tanto en una cuenta con historial de cambios de plan como en una cuenta
registrada desde cero — en ambas, ni llegaba el email ni la pantalla
reflejaba la cancelación. Se descartó primero una confusión de eventos
antiguos/clientes de Stripe equivocados (reenviar eventos históricos no
sirve: repiten el dato congelado de aquel momento, no el estado actual).
Con la cuenta nueva se obtuvo el payload JSON real del evento
`customer.subscription.updated` disparado por el propio Portal al
cancelar:

```
"cancel_at": 1786469448,
"cancel_at_period_end": false
```

**Causa raíz:** el código de este PR exigía `cancel_at_period_end &&
cancel_at` para considerar que había una cancelación programada. El flujo
de cancelación del Customer Portal en realidad programa la baja fijando
`cancel_at` directamente, sin activar nunca `cancel_at_period_end` — la
condición estaba mal planteada y descartaba silenciosamente **todas**
las cancelaciones reales, sin lanzar ningún error (de ahí el 200 OK en
Stripe y en los logs de Vercel, pero sin llamada a Resend ni escritura
real de `cancel_at`).

**Corregido** en `lib/billing/stripe-webhook.ts`: `cancelAt` ahora
depende solo de `subscription.cancel_at` (si Stripe lo ha puesto, hay
cancelación programada, sin más condiciones). 1 test nuevo que reproduce
exactamente el caso real (`cancel_at_period_end: false` + `cancel_at`
puesto) más el renombrado de 2 tests existentes para reflejar la
condición correcta. 530/530 tests, `pnpm run validate` limpio.

**Siguiente:** el fundador vuelve a probar cancelar una suscripción real
en producción tras este fix y confirma las tres cosas de siempre: fecha
guardada, pantalla actualizada, email recibido.

**Sexto email, fuera del alcance original de PR 4 (fundador pidió
explícitamente, 2026-07-11, junto con el merge de ACCOUNT-DELETE-1):**
`sendAccountDeletedEmail` — confirma por email que la cuenta y todos sus
datos se han eliminado. Se dispara desde `deleteAccount`
(`app/dashboard/settings/profile/actions.ts`) tras borrar el `auth.user`,
usando el email capturado antes del borrado (fire-and-forget, mismo patrón
que el resto de `lib/email/transactional.ts` — nunca bloquea la respuesta).
No estaba entre "los 4 emails originales + confirmación de plan" aprobados
el 2026-07-10; se implementa directamente por ser una petición explícita,
pequeña y de bajo riesgo que replica un patrón ya aprobado, sin tocar
schema/RLS/webhook.

---

## Fase 5 — LAUNCH

**Objetivo:** primeros clientes de pago.

**Criterio de salida:** ≥1 cliente pagando con factura correcta emitida.

**Dependencias:** Fases 0–4 completas — **cumplido a nivel de código**
(2026-07-17): checkout, webhooks, Customer Portal, reverse trial, emails
transaccionales, enforcement de planes, legal mínimo, alertas y digest
están shipeados y verificados en producción (Stripe en modo test). Lo que
queda es configuración, trámites y decisiones del fundador, más un puñado
de verificaciones. Desglose completo y ordenado:

### Bloque A — Trámites y decisiones del fundador (sin código)

- [ ] **A1 · Vercel Pro (~20 $/mes)** — diferido conscientemente el
      2026-07-10, pero es el primer paso del camino crítico: los términos
      de Vercel prohíben el plan Hobby para cualquier SaaS comercial
      ("even if the traffic is low") y `genscore.es` ya tiene pricing
      público y registro. Debe resolverse **antes** de cualquier difusión
      pública o de captar la primera agencia — una suspensión sin aviso en
      plena venta sería mucho más cara que la cuota.
- [ ] **A2 · Alta de autónomo** — el disparador legal es el primer cobro
      real. Reversible, tarifa plana. Hacerlo justo antes del Bloque B.
- [ ] **A3 · Decisión VeriFactu con el gestor** — Stripe solo no emite
      factura española compliant. Opciones: software de facturación
      VeriFactu conectado a Stripe, o merchant of record (Paddle/Lemon
      Squeezy, sustituiría a Stripe entero — coste de re-integración alto,
      solo si el gestor lo exige). Condición para la primera venta real,
      no para nada anterior.
- [ ] **A4 · Revisión legal humana** (gestor/abogado) de `/privacidad`,
      `/cookies` y `/terminos` — en particular el desistimiento B2C de 14
      días y las cláusulas de limitación de responsabilidad. Los textos
      actuales son borradores redactados por la sesión.
- [ ] **A5 · LEGAL-1b** — con los datos del alta (NIF, domicilio fiscal):
      publicar la página de Aviso Legal LSSI y actualizar
      `/privacidad`/`/terminos` con la identidad definitiva. PR pequeño de
      código, gatillado por A2.
- [ ] **A6 · Solicitud EUIPO** (clases 42+35, ~850–900 €) — recomendable
      antes de invertir en marketing pagado con el nombre; no bloquea el
      lanzamiento.
- [ ] **A7 · (Opcional)** dominios defensivos genscore.app/.net/
      getgenscore.com; sondear genscore.com/.ai/.io vía broker.

### Bloque B — Go-live de Stripe (test → live)

Todo el flujo está verificado end-to-end en modo test; pasar a live es
repetir la configuración de cuenta en el entorno live de Stripe:

- [ ] **B1** · Crear productos/precios live de Starter y Pro; poner las
      claves live en Vercel (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_STARTER`,
      `STRIPE_PRICE_ID_PRO`) + redeploy (las env vars nuevas no aplican
      sin redeploy — gotcha ya documentado).
- [ ] **B2** · Webhook live apuntando a
      `https://www.genscore.es/api/webhooks/stripe`, suscrito a los mismos
      eventos que en test **incluido `invoice.payment_failed`** (en test
      hubo que añadirlo a mano; sin él, el email de pago fallido no se
      dispara nunca). `STRIPE_WEBHOOK_SECRET` live en Vercel.
- [ ] **B3** · Stripe Tax en live: código fiscal SaaS por defecto
      (Configuración → Impuestos) — en test el checkout falló hasta
      configurarlo; en live pasará exactamente lo mismo si se omite.
- [ ] **B4** · Customer Portal en live: activar "switch plans"
      (Starter/Pro) y "cancel subscriptions" — misma configuración manual
      que se hizo en test.
- [ ] **B5** · Compra real de verificación con tarjeta propia (importe
      real) + refund desde Stripe: pago → webhook → plan activado →
      emails → cancelación programada reflejada en la UI. Es el mismo
      recorrido ya validado en test, ahora con dinero de verdad.
- [ ] **B6** · A3 (VeriFactu) resuelto antes de la primera venta a
      terceros.

### Bloque C — Verificaciones y flecos de producto (código ya shipeado)

- [ ] **C1** · Resumen semanal: `CRON_DIGEST_ENABLED=true` ya puesto
      (2026-07-12). Verificar el primer envío real el próximo lunes
      (`0 8 * * 1` UTC) — o antes, llamando manualmente al endpoint con
      `CRON_SECRET`.
- [ ] **C2** · Alerta de caída de score: provocar/esperar una caída ≥10
      puntos y confirmar que llega el email y que los toggles de
      `/dashboard/settings/notifications` persisten.
- [ ] **C3** · Resend con dominio propio verificado (SPF/DKIM) y
      `RESEND_FROM_EMAIL` fijado — los emails ya llegan, pero salir desde
      `genscore.es` en vez del remitente de pruebas de Resend mejora
      entregabilidad y confianza antes de tener clientes reales.
- [ ] **C4** · Sourcemaps de Sentry: `SENTRY_ORG`/`SENTRY_PROJECT`/
      `SENTRY_AUTH_TOKEN` en Vercel (build-time) + redeploy. Sin ellos,
      cualquier error de producción llega minificado e ilegible — el
      crash de Auditoría web (2026-07-12→17) costó días de diagnóstico
      exactamente por esto. Barato, alto retorno operativo.
- [ ] **C5** · Eventos explícitos de funnel en PostHog (registro
      completado → primer escaneo → upgrade) — fast-follow pendiente de
      Fase 3; hoy solo hay autocapture. Necesario para medir conversión
      del reverse trial con los primeros usuarios reales.
- [ ] **C6** · Panel de operador mínimo (queries guardadas de Supabase +
      dashboard de PostHog; no construir producto).
- [ ] **C7** · Smoke completo del checklist de
      `docs/environment-contract.md` en producción, como cierre previo al
      onboarding de agencias.

### Bloque D — Primeros clientes (el lanzamiento en sí)

- [ ] **D1** · Onboarding manual de 3–5 agencias españolas (ICP primario
      del PRD) antes de cualquier difusión pública. Feedback directo →
      backlog. Requiere A1 hecho (riesgo Hobby) y C1–C4 verificados; NO
      requiere B (pueden probar con el reverse trial gratuito).
- [ ] **D2** · Primera venta real (requiere Bloque B completo + A2/A3).
- [ ] **D3** · Anuncio público (LinkedIn build-in-public, difusión del
      blog) solo cuando las 3–5 primeras cuentas usen el producto sin
      fricción.

### Orden recomendado

**A1 → C1–C7 (en paralelo, esta semana) → D1 (agencias con trial) →
A2+A3 (cuando una agencia quiera pagar) → B (go-live Stripe) → D2 → A4/A5
→ D3.** La lógica: validar con agencias reales usando el trial no
requiere ni alta ni Stripe live — solo Vercel Pro y el producto
verificado; los trámites con coste (alta, VeriFactu, EUIPO) se disparan
cuando hay demanda confirmada, no antes.

### Fuera del camino crítico (post-launch, ya planificado)

- **PR B de BILLING-STRIPE-1** — email "tu trial acaba en 3 días"
  (necesita columna + cron → su propia aprobación de esquema).
- **ENGINES-2** ⚠️ (Fase 8) — ChatGPT/Perplexity; Task Intake +
  aprobación. La mejora comercial nº 1 tras lanzar.
- **ASYNC-SCAN-1** ⚠️ (Fase 9) — elevar prioridad con >10 clientes con
  recurring scans.
- **GROWTH-1 continuo** — 5º artículo del prompt original (cuando el
  fundador lo aporte) + resto del catálogo.
- **⏰ MODEL-PIN** — deadline duro 2026-10-16; programar la migración la
  semana del 2026-10-01 como muy tarde, pase lo que pase con el resto.

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

**Fase 6a — hecha (2026-07-11):** Task Intake aprobado por el fundador
("Si") para la porción de menor riesgo: alerta de caída puntual +
preferencias reales, sin cron nuevo (el resumen semanal queda como Fase 6b,
pendiente de resolver antes el límite de cron jobs de Vercel Hobby con
`platform-deploy`).

- Migración `0020_notification_preferences.sql`: dos columnas nuevas en
  `profiles` (`notify_score_drop_alert`, `notify_weekly_digest`, boolean,
  default `true`). A diferencia de las columnas de billing (0016/0017/0019),
  estas NO se protegen con `protect_billing_columns()` — son preferencias
  normales que el propio usuario debe poder cambiar desde su sesión; la
  política RLS `profiles_update_own` ya lo permite correctamente.
- `lib/scoring/run-scoring.ts`: nueva función `getEffectiveGeoScore()` —
  extrae el mismo GEO Score que ya mostraba el gauge de Overview
  (`geo_score.score` con fallback a `visibility_score`), ahora reutilizable
  fuera de la página del proyecto.
- `lib/scan/score-alert.ts`: tras persistir el score de cada escaneo
  (`lib/scan/executor.ts`), compara con el run anterior del mismo proyecto;
  si la caída es ≥10 puntos (umbral de primera pasada, pendiente de afinar
  con datos reales de uso) y el dueño no lo ha desactivado, envía
  `sendScoreDropAlertEmail` (nuevo email en `lib/email/transactional.ts`).
  Fail-soft, igual que la generación de recomendaciones en la misma función:
  un fallo del email nunca debe tumbar un escaneo que sí funcionó.
- `/dashboard/settings/notifications`: los toggles "Cambios de visibilidad"
  y "Resumen semanal" ahora leen/escriben de verdad
  (`app/dashboard/settings/notifications/actions.ts`); los otros 4 toggles
  (competidores, recomendaciones, escaneos, producto) siguen siendo solo de
  cliente — deuda conocida, fuera de esta PR.
- 13 tests nuevos (`score-alert.test.ts` x7, `run-scoring.test.ts` x4,
  `notifications/actions.test.ts` x2). 565/565 tests totales, `pnpm run
  validate` limpio.

**Siguiente:** el fundador aplica la migración 0020, prueba en producción
provocando una caída real de score y confirma que llega el email y que los
dos toggles persisten. Fase 6b (resumen semanal) queda pendiente hasta
resolver la pregunta de cron con `platform-deploy`.

**Fase 6b — hecha (2026-07-12):** resuelta la pregunta de cron pendiente:
Vercel levantó el límite de cron jobs en enero 2026 (100 por proyecto en
todos los planes, incluido Hobby; la única restricción real es la
frecuencia mínima de una vez al día) — un cron semanal encaja de sobra,
sin necesidad de Vercel Pro.

- Nuevo cron `app/api/cron/weekly-digest/route.ts`, mismo patrón que
  `weekly-scans` (secreto `CRON_SECRET` compartido, inyectado
  automáticamente por Vercel; interruptor `CRON_DIGEST_ENABLED`,
  deshabilitado por defecto). Programado los lunes (`0 8 * * 1` en
  `vercel.json`).
- `lib/scan/weekly-digest.ts`: por cada proyecto activo cuyo dueño no haya
  desactivado el resumen, compara el GEO Score del último run con el
  anterior, calcula el mayor movimiento de competidor por variación de
  menciones (dato real ya persistido en `details_json.brand_position`,
  ADR-0005 — no inventado), y adjunta la recomendación activa de mayor
  prioridad. Solo se envía si el proyecto tiene **al menos 2** runs con
  score — con uno solo no hay evolución real que contar.
- `sendWeeklyDigestEmail` en `lib/email/transactional.ts`, mismo patrón
  fail-soft que el resto de emails.
- 6 tests nuevos (`weekly-digest.test.ts`). 571/571 tests totales,
  `pnpm run validate` limpio.
- `docs/environment-contract.md` actualizado con las 2 vars nuevas
  (`CRON_DIGEST_ENABLED`, `MAX_PROJECTS_PER_DIGEST_RUN`) y la nota sobre
  el límite de cron de Vercel ya no siendo un bloqueante.

**Siguiente:** el fundador aplica la migración si falta alguna
(ninguna nueva en esta PR), y cuando quiera activar el resumen semanal en
producción, pone `CRON_DIGEST_ENABLED=true` en Vercel (con un redeploy
después, como siempre) y espera al primer lunes para verlo en acción — o
lo prueba antes llamando manualmente al endpoint con el secreto correcto.

**Reconciliación con el audit de UX/QA concurrente:** una auditoría
paralela (docs/ux-qa-audit-2026-07.md) había marcado el toggle "Resumen
semanal" de `/dashboard/settings/notifications` como "Próximamente"
porque, en ese momento, la Fase 6b todavía no existía — dejarlo activable
habría prometido un email de los lunes que nunca llegaba. Con la Fase 6b
ya mergeada, se reactivó ese toggle (founder: "Sí, reactivar ya") — el
usuario ya puede activarlo/desactivarlo de verdad; el email en sí sigue
sin salir hasta que el fundador active `CRON_DIGEST_ENABLED`.

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

**Fase 7a — hecha (2026-07-11):** Task Intake aprobado por el fundador
("Si") para la porción de infraestructura + 1 artículo de prueba,
dejando el resto del contenido para PRs pequeños posteriores.

- `.claude/agents/growth-content.md` creado (posicionamiento, blog,
  emails de ciclo de vida — regla dura: todo dato de metodología debe
  trazarse a un ADR/código real, nunca reconstruirse de memoria).
- Blog MDX nativo de Next.js (`@next/mdx`, sin CMS): `next.config.ts` +
  `mdx-components.tsx`; cada post es un archivo `.mdx` bajo
  `app/blog/<slug>/`. `lib/blog/posts.ts` es la única fuente de verdad de
  metadatos (slug/título/descripción/fecha), usada por el índice, el
  sitemap y el propio post (evita duplicar la descripción en dos sitios).
- `components/blog/blog-page-shell.tsx` (mismo patrón de nav/footer que
  `legal-page-shell.tsx`) y `components/blog/article-schema.tsx`
  (JSON-LD `Article` por post).
- `app/sitemap.ts` y `app/robots.ts` (convención nativa de Next.js —
  antes no existía ninguno) + `public/llms.txt`.
- Enlace "Blog" añadido a los footers de `/` y `/pricing`.
- 1 artículo de prueba end-to-end: "Qué es el GEO Score y cómo se
  calcula", contenido derivado literalmente de
  `docs/adr/0008-composite-geo-score.md` (pesos y fórmulas reales, no
  inventados).
- Verificado el HTML estático generado en el build (`/blog`, el artículo,
  `sitemap.xml`, `robots.txt`) — no se pudo levantar el dev server en este
  entorno por falta de credenciales reales de Supabase (afecta a
  cualquier ruta vía middleware, no es un bug de esta PR).
- `pnpm test` (565/565) y `pnpm run validate` en verde.

**Siguiente:** el fundador revisa el artículo en el preview; los próximos
3–5 artículos fundacionales del catálogo llegan en PRs pequeños
separados (una o dos piezas por vez), no de golpe.

**Feedback del fundador sobre el preview (mismo día):** "Blog" debía estar
en el menú principal (no solo en el footer), pidió una plantilla más
llamativa con imagen principal, y una ilustración en el artículo — más 3
correcciones encontradas en vivo:

- "Blog" añadido al nav principal de `/` y `/pricing` (antes solo footer).
- Portadas con degradado abstracto (reutilizando `.onb-aurora` del hero)
  + icono, para no depender de fotos de stock.
- Ilustración de contenido en el artículo del GEO Score: desglose visual
  con barras de los 4 componentes y sus pesos reales (mismos datos que la
  tabla, no decorativo).
- **Bug real encontrado por el fundador** (captura de pantalla): la tabla
  Markdown salía como texto plano con `|` en vez de tabla HTML —
  `@next/mdx` no incluye GFM (tablas) por defecto. Corregido con
  `remark-gfm` (pasado como string, no función importada — Turbopack
  necesita serializar las opciones del loader) + estilos de tabla.

**Fase 7b — 4 artículos más (2026-07-11):** el fundador generó el
contenido de 4 artículos con ChatGPT (usando un prompt que el Director le
proporcionó, diseñado para un handoff estructurado: slug/title/
description/coverIcon/contentIllustration + cuerpo en Markdown) y generó
también 4 imágenes de portada llamativas (degradados 3D, mismo estilo
visual entre sí). El Director no tiene herramienta de generación de
imágenes — las portadas son las que aportó el fundador, guardadas en
`public/blog/<slug>/cover.png`, servidas vía `next/image` (responsive,
optimizadas automáticamente).

- `BlogCover` ahora acepta una imagen real (`coverImage`) o cae al
  degradado+icono anterior si no hay imagen (el primer artículo, "Qué es
  el GEO Score", se queda con el degradado — no se le generó imagen).
- `ArticleSchema` incluye la imagen en el JSON-LD cuando existe.
- Nuevo componente `ProcessFlow` (reutilizable) para las ilustraciones de
  flujo de 2 de los 4 artículos (categorización de prompts; dato →
  evidencia → recomendación → acción) — secuencia horizontal, no circular:
  más legible en móvil, que es donde el fundador prueba todo.
- Los otros 2 artículos usan tablas GFM reales (tipos de competidor,
  tipos de intención de prompt) — mismo dato que ya estaba en el texto
  del fundador, sin inventar una matriz 2×2 que el contenido no
  desarrollaba.
- Contenido verificado contra el catálogo de competidores real
  (Otterly, Peec AI, Athena, Semrush AI Toolkit, Ahrefs Brand Radar) del
  informe de mercado — sin cifras ni testimonios inventados.
- `pnpm test` (565/565) y `pnpm run validate` en verde.

**Siguiente:** el fundador revisa los 4 artículos nuevos en el preview.

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

**ENGINES-2a — OpenAI únicamente, con búsqueda web (2026-07-17, en curso):**
Task Intake conversacional con el fundador — decisión explícita: solo
OpenAI por ahora (Perplexity queda fuera, sin fecha), y **con búsqueda web
activada** (Responses API, tool `web_search`), no solo texto — es la
oportunidad de tener un segundo motor con grounding real (citas
verificables), no solo un tercer motor "ciego" como Claude hoy.

Antes de comprometer precio/gating de plan, primer paso aprobado: medir
coste real por llamada (no estimarlo). Hecho en este PR:

- `lib/llm/openai.ts`: `generateOpenAIVisibilityAnswer` (Responses API +
  `web_search`, mismo prompt neutral brand-blind que Gemini/Claude —
  ADR-0007) y `extractOpenAIStructuredData` (mismo patrón que
  `extractClaudeStructuredData`). Devuelve la misma forma
  `GeminiVisibilityResponse`, incluido `groundingChunks` desde las
  anotaciones `url_citation` reales de OpenAI.
- **Deliberadamente NO activo todavía**: no está en
  `VALID_LLM_SCAN_PROVIDERS` (`lib/scan/executor.ts`), ni en el dispatch de
  `lib/scan/extraction.ts`, ni en `caps.engines`/`/pricing`. Ningún cliente
  real lo recibe con este PR.
- **Sin modelo por defecto**: a diferencia de Gemini/Claude, `OPENAI_MODEL`
  no tiene fallback hardcodeado — este módulo se escribió contra
  documentación de terceros (la web oficial de pricing/docs de OpenAI
  devolvió 403 desde este entorno), así que adivinar un id de modelo actual
  repetiría el mismo gap de pinning que causó el 404 de
  `gemini-2.0-flash` (ADR-0002). Hay que confirmarlo en vivo antes de usarlo.
- **Hallazgo arquitectónico importante para el PR que lo active de
  verdad**: las citas `url_citation` de OpenAI ya son la URL real de
  destino (a diferencia del wrapper de redirección de Google que sí
  necesita `resolveGroundingRedirects`, ADR-0006) — enchufar este proveedor
  en `extraction.ts` sin más haría una petición HTTP innecesaria a cada URL
  citada. Necesitará una rama por proveedor en `buildGroundedCitations`,
  documentado en el propio código (`lib/llm/openai.ts`).
- 16 tests nuevos (`lib/llm/openai.test.ts`), mismo patrón que
  `claude.test.ts`. `pnpm test` y `pnpm run validate` en verde.

**ENGINES-2a — OpenAI cableado en el pipeline, dormido (2026-07-17):** el
fundador pidió "avanza el desarrollo", así que se integró OpenAI como motor
real en todo el pipeline, pero **sin activarlo para ningún cliente**. La
garantía de dormancia es doble y está testeada: (1) `openai` no está en
`LLM_SCAN_PROVIDERS` en ningún entorno, y (2) aunque se añadiera, los planes
siguen con `caps.engines=2`, y `getLLMScanProviders().slice(0, caps.engines)`
lo recortaría. Ningún cliente recibe OpenAI hasta que se suba el cap del
plan Y se ponga la variable — eso es un PR aparte que depende de la decisión
de coste/precio.

Cambios de este PR:
- `lib/scan/executor.ts`: `openai` añadido a `VALID_LLM_SCAN_PROVIDERS`,
  `callProvider` y el catch de config-error. La lógica de recorte por
  `caps.engines` ya existía (PRICING-TRUTH-1 PR b) y ahora es load-bearing.
- `lib/scan/extraction.ts`: dispatch a `extractOpenAIStructuredData` +
  `.in("provider", [...])` ampliado. **Detalle clave**: `buildGroundedCitations`
  ahora es provider-aware — las citas `url_citation` de OpenAI ya son URLs
  finales, así que se saltan `resolveGroundingRedirects` (evita una petición
  HTTP innecesaria por cita, a diferencia de los wrappers de redirección de
  Google que sí necesita Gemini).
- `lib/scoring/run-scoring.ts`: `openai` añadido a `GROUNDED_PROVIDERS` —
  tiene grounding real (web_search), así que sus filas cuentan para
  `citation_score` y el componente de autoridad del GEO Score.
- UI: etiqueta/badge de motor (`components/prompts/prompt-drawer.tsx`,
  `ENGINE_LABELS` en la página del proyecto) ahora contemplan "ChatGPT" —
  se renderiza solo si aparecen filas reales de OpenAI (dormido = nunca).
- **Copy de marketing/pricing/legal NO tocado a propósito**: landing,
  `/pricing`, `/privacidad`, `/terminos`, chips del onboarding siguen
  diciendo "Gemini y Claude" — es verdad hoy (OpenAI dormido). Cambiarlos
  sería prometer un motor no activo (viola PRICING-TRUTH-1).
- +3 tests de cableado (dormancia en executor, citas finales en extraction,
  grounded en scoring), además de los 16 unitarios del módulo. 623/623 y
  `pnpm run validate` en verde.

**Primera medición real, hallazgo de latencia (2026-07-17):** el fundador
probó un prompt real en el Playground (modo Responses + `web_search`) desde
un ordenador. Resultado: **6 citas reales** (`url_citation`, dominios de
verdad — de hecho, competidores reales de GenScore para ese prompt),
confirmando que el formato implementado en `lib/llm/openai.ts` es correcto.
Pero la latencia de esa llamada fue **1m1s (61 segundos)** — muy por encima
de:
- `OPENAI_CALL_TIMEOUT_MS` (20s) en `lib/llm/openai.ts` — esa llamada
  habría abortado por timeout en producción.
- El presupuesto **completo** del escaneo síncrono (`maxDuration=60`,
  ADR-0003) — una sola llamada de 61s ya excede el presupuesto entero, no
  solo el de esa llamada.

Investigado (WebSearch, foro de desarrolladores de OpenAI): **latencias de
~1 minuto con la Responses API son un patrón ya reportado por otros
desarrolladores específicamente con modelos de la familia gpt-5** ("gpt-5
with the Responses API takes around 1 minute for even a basic query") — no
parece un caso aislado, sino característico de ese modelo si es el que se
usó (no se confirmó qué modelo eligió el Playground por defecto). Modelos
más ligeros (gpt-4o-mini y similares) se reportan sensiblemente más rápidos
en esos mismos hilos, aunque sin cifra exacta fiable todavía.

**Implicación importante — esto es un problema de arquitectura, no solo de
precio.** Si la latencia real con búsqueda web ronda el minuto
independientemente del modelo, la integración síncrona actual (dentro del
mismo escaneo de 60s) no es viable — necesitaría desacoplar OpenAI a
ejecución asíncrona, fuera del ciclo síncrono del escaneo (repropone
ASYNC-SCAN-1, todavía no aprobado, ver Fase 9). Si un modelo más ligero
resuelve la latencia, la integración síncrona actual podría servir tal cual.

**Segunda medición real (2026-07-18):** el fundador probó de nuevo en el
Playground — el selector de modelo de su cuenta solo ofrece la familia
`gpt-5.x` (`gpt-5.4-mini` como opción más ligera visible, sin `gpt-4o-mini`
ni similares más antiguos/ligeros disponibles). Con `gpt-5.4-mini` +
`web_search`, **una sola llamada costó $0,20**.

Cálculo real de impacto por plan (con los caps de `plans-data.ts`):

| Plan | Prompts | Cadencia | Llamadas OpenAI/mes | Coste OpenAI/mes (a $0,20) | Precio del plan |
|---|---|---|---|---|---|
| Starter | 25 | Semanal | ~100 | ~$20 | 45 € |
| Pro | 100 | Diario | ~3.000 | ~$600 | 179 € |
| Agencia | 300 | Diario | ~9.000 | ~$1.800 | 449 € |

**Hallazgo importante — invierte la recomendación original de gating:** a
$0,20/llamada, Pro y Agencia (cadencia diaria) no son viables en absoluto
(el coste de un solo motor superaría 3-4× el precio del plan entero).
Starter (cadencia semanal) es la única que absorbe ese coste con margen —
justo al revés de lo que planteaba el Task Intake inicial (que proponía
Pro+Agencia, no Starter).

**Decisión del fundador (2026-07-18): "Impleméntalo con el gpt 4o mini y lo
probamos en real. Si al final no es rentable lo desactivamos. Pero lo
dejamos desarrollado."** Implementado con el máximo cuidado de no exponer a
clientes reales mientras se valida:

- `app/pricing/plans-data.ts`: `caps.engines` de **Starter** subido a 3
  (única cadencia económicamente viable, ver tabla arriba). `meter.engines`
  (el número que ve el público en `/pricing`) se deja deliberadamente en 2
  — PRICING-TRUTH-1 prohíbe anunciar un motor no confirmado para clientes
  reales. Pro/Agencia quedan sin tocar.
- **Este cambio vive solo en esta rama/PR, sin mergear a `main` todavía.**
  Las variables (`OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o-mini`,
  `LLM_SCAN_PROVIDERS=gemini,claude,openai`) deben ponerse en Vercel
  **escopadas solo al entorno Preview** (desmarcar Production al añadirlas)
  — así la prueba usa el pipeline real (coste y latencia reales) sin que
  ningún cliente de Producción la reciba mientras no esté validada.
- 1 test nuevo (`executor.test.ts`) que confirma que un proyecto Starter
  recoge `openai` en cuanto `LLM_SCAN_PROVIDERS` lo incluye. 624/624 tests,
  `pnpm run validate` limpio.

**Validación en vivo completada (2026-07-18), con tres hallazgos por el
camino que costaron varias horas de diagnóstico:**

1. **Checkout de Stripe roto (P0, sin relación con ENGINES-2a)**: al
   intentar contratar Starter para la prueba apareció un
   `stripe_customer_id` obsoleto — documentado y corregido en la sección
   propia de abajo (PR #226).
2. **La clave de OpenAI no llegaba al runtime**: una tarde entera de 401s
   que resultaron ser una carrera de tiempos (cada escaneo corría contra un
   deployment anterior a la corrección de la clave), diagnosticada
   definitivamente con un endpoint temporal (`/api/debug/openai-check`,
   gateado por sesión, retirado antes del merge — mismo ciclo de vida que
   el `sentry-test` de #183). Lección operativa real: las variables
   Sensitive de Vercel no se pueden releer, y un secreto pegado con el
   prefijo "Bearer" o sin redeploy posterior produce el mismo síntoma que
   una clave inválida — el endpoint de diagnóstico resolvió en una pasada
   lo que a ciegas no salía.
3. **`tool_choice: "auto"` no busca**: el primer escaneo real completó
   10/10 prompts pero con **cero** búsquedas web — gpt-4o-mini decidió
   responder de memoria siempre, dejando al motor sin citas (como Claude) y
   además diluyendo el denominador del citation_score (techo estructural de
   ADR-0012 reintroducido por la puerta de atrás, al estar `openai` en
   `GROUNDED_PROVIDERS`). Corregido forzando la herramienta:
   `tool_choice: { type: "web_search" }`.

**Resultados finales del escaneo de validación (10 prompts, Starter,
vivagym.com):**

| Motor | Con citas | Citas | Latencia media | Máx |
|---|---|---|---|---|
| Gemini | 7/10 | 99 | 6,0s | 7,5s |
| **ChatGPT** | **6/10** | **35** | **4,4s** | **5,2s** |
| Claude | 0/10 (sin búsqueda, esperado) | 0 | 4,8s | 5,7s |

Coste real: **~$0,01-0,02 por escaneo completo** (el $0,20/llamada que
asustaba era específico de gpt-5.4-mini; gpt-4o-mini es dos órdenes de
magnitud más barato). Latencia: ChatGPT es el motor más rápido incluso
buscando. El miedo de arquitectura (61s en el Playground) era del modelo,
no de la búsqueda.

**Decisión del fundador (2026-07-18): "que en los 3 planes de pago de
momento se ofrezcan los 3 motores".** Aplicado en el PR de cierre (#236):
`caps.engines: 3` y `meter.engines: 3` en Starter/Pro/Agencia (Free sigue
en 1); copy actualizado a "Gemini, Claude y ChatGPT" en landing, `/pricing`
(cards, matriz, meter) y chips del onboarding; **`/privacidad` añade OpenAI
como encargado del tratamiento y `/terminos` lo añade a la lista de
modelos de terceros** (obligatorio: procesa prompts de usuarios reales
desde hoy); endpoint de diagnóstico retirado; variables activas en
Producción (`OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o-mini`,
`LLM_SCAN_PROVIDERS=gemini,claude,openai`), verificado por el fundador en
producción ("Funciona bien en pro").

**Nota de coste registrada:** con cadencia diaria (Pro/Agencia), el coste
de OpenAI es ~$0,60/mes por proyecto a precios actuales de gpt-4o-mini —
asumible. Vigilar el dashboard de OpenAI las primeras semanas por si las
tarifas de la herramienta de búsqueda aparecen con retraso.

---

## Hallazgo P0 no planeado — checkout de Stripe roto en Producción (2026-07-18)

Al intentar contratar Starter para la prueba de ENGINES-2a, el fundador
encontró el checkout roto **tanto en el preview como en Producción**
("Tampoco funciona en producción"). Confirmado por git log que no era una
regresión de esta rama (sin commits en `lib/stripe.ts` ni
`app/dashboard/settings/billing/` desde BILLING-STRIPE-1 PR 3, #192).

**Causa raíz (log real del servidor):**
```
[geo:billing] failed to create Stripe checkout session {
  userId: '9733f169-506e-4f20-9bde-443f73973024',
  planId: 'starter',
  message: "No such customer: 'cus_Urlxn9bbBOzGmh'"
}
```
`profiles.stripe_customer_id` guardaba un customer id que ya no existe en
Stripe (borrado/reseteado en el lado de Stripe, independientemente de
nuestro código) — `createCheckoutSession` lo reutilizaba sin comprobar que
siguiera existiendo, y Stripe rechazaba la sesión entera sin recuperación
posible para esa cuenta.

**Corregido** en `app/dashboard/settings/billing/actions.ts`: si Stripe
responde `code: "resource_missing"` / `param: "customer"`, se reintenta
una vez la creación de la sesión sin ese `customer` (cae a
`customer_email`, dejando que Stripe cree uno nuevo) — mismo patrón de
"un reintento acotado a un fallo concreto" que ya usan
`lib/llm/gemini.ts`/`claude.ts`/`openai.ts` para 429. El webhook
`checkout.session.completed` ya sobreescribe `stripe_customer_id`
incondicionalmente al completar el pago, así que el valor obsoleto se
autocura solo, sin necesidad de una escritura aparte. Cualquier otro error
de Stripe sigue fallando igual que antes (sin reintento ciego).

- 2 tests nuevos (`actions.test.ts`): reproduce exactamente el incidente
  real (reintento exitoso) y confirma que un error de Stripe no relacionado
  (p. ej. clave de API inválida) no dispara ningún reintento. 626/626 tests
  totales, `pnpm run validate` limpio.

**Siguiente:** el fundador vuelve a intentar contratar Starter (en
Producción y/o en el preview de este PR) una vez desplegado el fix, y
confirma que el checkout se completa. Sigue pendiente, aparte, entender
**por qué** ese customer dejó de existir en Stripe (¿reseteo de datos de
test manual? ¿rotación de clave a otra cuenta/modo?) — el fix es
resiliente ante esto, pero no explica la causa original; si vuelve a pasar
con más cuentas, revisar la configuración de la cuenta de Stripe.

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

## Hallazgo P0 no planeado — recomendaciones por-prompt marcadas "resueltas" sin motivo (RECS-DEDUPE-1, 2026-07-30)

Encontrado por el fundador al probar en vivo la fase 1a de NOTIF-SERVER: un
único escaneo generó una notificación `gap_resolved` con `count: 20` — 20
"brechas cerradas" de golpe, todas del tipo `increase_brand_visibility`
("Consigue aparecer en..."). No se había arreglado nada.

**Causa raíz:** las dos reglas de recomendación por-prompt
(`increase_brand_visibility`, `add_citation_block` en
`lib/recommendations/recommendation-engine.ts`) construían su `dedupe_key`
con el id de la fila de `scan_prompt_results`, que es un UUID nuevo **en
cada escaneo** (cada run inserta filas nuevas). RECS-3 (migración
`0010_recommendations_history.sql`) interpreta un `dedupe_key` que no
recurre como "la brecha se resolvió" — así que cada escaneo marcaba como
resueltas *todas* las brechas por-prompt del escaneo anterior, sin
importar si el problema seguía ahí. Bug preexistente a NOTIF-SERVER (ya
afectaba en silencio a "recent wins" en la página de Recomendaciones); la
notificación nueva solo le puso megáfono.

**Corregido:** las dos reglas ahora usan `project_prompts.id` (columna
`prompt_id`, ya disponible en la misma query, estable entre escaneos —
`row.prompt_id` en `lib/scan/executor.ts`), con fallback al id de fila
solo si el prompt fue borrado de la lista de seguimiento después. 2 tests
nuevos en `recommendation-engine.test.ts` (misma `prompt_id` → mismo
`dedupe_key` entre dos llamadas simulando dos escaneos; fallback correcto
cuando `promptId` es `null`). 739/739 tests, `pnpm run validate` limpio.

**Transición de una sola vez esperada:** el primer escaneo tras mergear
esto mostrará una ola de "resueltas" (las del formato de clave antiguo,
que ya no coinciden con nada) y "nuevas" (las del formato nuevo, a
`consecutive_runs_open = 1`) — es el efecto del cambio de formato de
clave, no un bug nuevo. A partir del segundo escaneo, el conteo debería
reflejar la realidad.

**Sin migración ni cambio de schema/RLS** — lógica de aplicación pura.
`lib/notifications/emit.ts` (PR #264, NOTIF-SERVER-1a) no necesita ningún
cambio: en cuanto esto se mergee, `gap_resolved`/`gap_pending` empiezan a
ser veraces solas.

**Siguiente:** el fundador confirma con dos escaneos reales seguidos sobre
el mismo proyecto (sin cambiar nada) que las brechas por-prompt que siguen
abiertas ya NO aparecen como "resueltas" la segunda vez.

---

## ⏰ MODEL-PIN — deadline duro 2026-10-16

`gemini-2.5-flash` (ADR-0009) tiene cutover anunciado el **2026-10-16**. Si
llega la fecha con clientes de pago y el modelo se apaga, todos los
escaneos fallan (ya ocurrió con `gemini-2.0-flash-001` el 2026-06-01).
Programar la migración de pin (nuevo ADR + smoke) como muy tarde **la
semana del 2026-10-01**, en cualquier punto del plan en que se esté.

---

## Cambios en la estructura de agentes (hacer junto a las fases que los usan)

1. **`growth-content`** — posicionamiento, copy marketing, blog, emails de
   ciclo de vida. **Creado en Fase 7a (2026-07-11)**, `.claude/agents/growth-content.md`.
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
