# Auditoría UX + QA pre-agencias — julio 2026

**Origen:** petición del fundador (2026-07-12): auditoría `ux-alignment`
completa contra el design reference (`docs/design-reference/geo-suite-2/`,
sin auditoría completa desde 2026-06-13) + walkthrough adversarial con ojos
de la primera agencia + pasada de QA, **antes del onboarding manual de las
3–5 agencias de la Fase 5 del launch plan**. ENGINES-2 aplazado por decisión
del fundador.

**Método:** comparación estructural de cada pantalla del producto contra su
JSX de referencia, más recorrido código-nivel de todas las superficies de
Ajustes, notificaciones y flujos con estado (este entorno no tiene
credenciales de Supabase, así que el recorrido es sobre código; la
verificación visual final es del fundador en producción). QA: suite completa
+ validate + checklist de honestidad de `/pricing`.

**Este documento es solo análisis** — cada hallazgo accionable irá en su
propio PR tras aprobación.

---

## Resumen ejecutivo

Desde la última auditoría (13 de junio) el producto ha mejorado mucho:
topics de Prompts renderizan agrupados (cierra el P2 pendiente de junio),
la navegación coincide con el reference, el wizard es honesto ("varios
motores", no los "4 motores" del prototipo), billing es 100% real tras
BILLING-STRIPE-1, y Overview acaba de pasar las fases A–D de la auditoría
de metodología.

Pero el walkthrough adversarial encontró **un P0 de honestidad grave** que
desmonta la demo ante cualquier agencia en el minuto uno de explorar
Ajustes, y un grupo de P1/P2 del mismo patrón (controles que fingen hacer
cosas). Todos son de arreglo barato.

| # | Hallazgo | Superficie | Prioridad |
|---|---|---|---|
| 1 | **Equipo con miembros inventados e invitaciones fingidas** | `/dashboard/settings/team` | **P0** |
| 2 | 4 toggles de notificaciones que no controlan nada (solo estado de cliente) | `/dashboard/settings/notifications` | **P1** |
| 3 | Toggle "Resumen semanal" persiste la preferencia de un email que aún no existe (Fase 6b) | `/dashboard/settings/notifications` | **P1** |
| 4 | Botón "Cambiar logo" inerte que promete "futuros informes exportables" | `/dashboard/settings/organization` | P2 |
| 5 | Páginas citadas sin la capa de oportunidades del design (3 cards de acción) | `/citations` vs `citations.jsx` | P2 |
| 6 | Falta el filtro "Filtrar por topic…" del reference en Prompts | `/prompts` vs `prompts.jsx` | P3 |
| 7 | Reference pide "Sentimiento medio" por competidor — no computable hoy (divergencia documentada, NO fabricar) | `/competitors` vs `competitors.jsx` | P3 |
| 8 | Campana de notificaciones: estado leído en localStorage, no cross-device | `notification-bell.tsx` | P3 (ya trackeado en ASYNC-SCAN-1) |

## 1 · P0 — Equipo: usuarios falsos e invitaciones que no se envían

`components/settings/team-tab.tsx` (`seedTeam`): la página de Equipo
muestra a **todo usuario real** un equipo inventado — "Lucía Ferrer"
(`lucia@agenciaacme.com`), "Marc Oliva" y una invitación pendiente de
"nuria@agenciaacme.com" — junto a su propio usuario. El banner afirma
"Tu plan incluye **usuarios ilimitados** — invita a todo tu equipo sin
coste adicional", y el formulario "Enviar invitación" **añade una fila de
cliente y no envía absolutamente nada** (no hay backend: teams/RBAC están
en la Forbidden list, sin construir). Los cambios de rol y el borrado
también son `useState` puro: al recargar, el equipo fantasma vuelve.

Es exactamente el patrón de `FAKE_INVOICES`/`FAKE_PAYMENT_METHOD` que
BILLING-STRIPE-1 purgó de facturación, pero vivo en producción. El caso
de daño es literal para la Fase 5: el dueño de una agencia (nuestro ICP,
que trabaja en equipo) entra en Ajustes → Equipo, ve nombres que no conoce
en su cuenta recién creada (¿brecha de datos? ¿cuenta compartida?), invita
a un compañero, la invitación jamás llega, y la confianza en TODO lo demás
(scores incluidos) muere ahí.

**Fix propuesto (PR pequeño):** sustituir el contenido por el estado
honesto — solo el usuario real como admin, sin seeds; formulario de
invitación fuera o deshabilitado con "El modo multiusuario llegará más
adelante" (sin prometer fecha ni "usuarios ilimitados"). Alternativa más
quirúrgica: retirar la entrada "Equipo" de Ajustes hasta que exista la
feature. Recomendación: la primera (la pestaña comunica roadmap sin
fingir), decisión de producto del fundador.

## 2 · P1 — Toggles de notificaciones sin efecto

`components/settings/notifications-tab.tsx`: de los 6 toggles, solo 2
persisten de verdad (caída de score y resumen semanal, ALERTS-1 6a). Los
otros 4 — "Movimientos de competidores", "Nuevas recomendaciones",
"Escaneos completados", "Novedades de producto" — son estado de cliente:
el usuario los apaga/enciende y no controlan ningún email (esos emails ni
siquiera existen). El propio código lo reconoce ("client-only placeholders
until their own phase"), pero la UI no lo dice.

**Fix propuesto:** deshabilitarlos con etiqueta "Próximamente" (patrón ya
usado en el producto) o retirarlos. Nada de fingir que guardan.

## 3 · P1 — "Resumen semanal": preferencia real de un email inexistente

El toggle "Resumen semanal — un email cada lunes con la evolución de la
semana" **sí persiste** (`notify_weekly_digest`), pero el email semanal es
la **Fase 6b, sin construir** (bloqueada por el límite de crons de Vercel
Hobby). Un usuario que lo deje activado esperará un email el lunes que no
llegará jamás.

**Fix propuesto (elegir uno):** (a) etiquetar "Próximamente" y no mostrar
el toggle como operativo hasta 6b; o (b) priorizar la Fase 6b ya (tiene
además sinergia con la decisión Vercel Pro pendiente, que eliminaría el
bloqueo del cron). Recomendación: (a) ahora — 1 línea de UI — y (b) cuando
toque su fase.

## 4 · P2 — "Cambiar logo" inerte

`components/settings/organization-tab.tsx`: el botón "Cambiar logo" no
tiene handler (no sube nada) y su hint promete que el logo "se mostrará en
tu cuenta y en futuros informes exportables" — los informes exportables no
existen. Retirar botón + hint, o deshabilitar con "Próximamente".

## 5 · P2 — Páginas citadas sin capa de acción

El reference (`citations.jsx`) remata la pantalla con 3 cards de
oportunidad ("Consigue menciones donde ya citan a tus rivales", "Crea
contenido para los prompts que no cubres", "Refuerza tus propias páginas
citadas"). La página real es la lista/agregación de citas sin capa de
"qué hacer". La lógica ya existe en el motor de recomendaciones
(`pursue_citation_sources`, comparativas, etc.) — opción barata: una
franja que enlace a las recomendaciones de tipo autoridad del último run;
opción completa: renderizar las 3 cards con datos reales. Ambas sin motor
nuevo.

## 6–8 · P3

- **Filtro por topic en Prompts:** el grouping por topics ya renderiza
  (cierra el pendiente P2 de junio a nivel estructural; el pixel-check
  final es visual, del fundador), pero falta el "Filtrar por topic…" del
  reference. Nice-to-have con >3 topics.
- **"Sentimiento medio" por competidor** (reference de Competidores): la
  extracción actual solo captura sentimiento sobre la marca propia, no por
  competidor. Implementarlo requiere extracción nueva (fase de backend) —
  **no fabricar mientras tanto**. Divergencia consciente y documentada.
- **Campana de notificaciones:** estado de leído en localStorage (no
  cross-device) y derivada de eventos del cliente. Correcta para hoy; su
  versión server-side ya está scoped dentro de ASYNC-SCAN-1.

## Verificado y en verde (sin acción)

- **Navegación** = reference (Visión general, Prompts, Competidores,
  Páginas citadas, Escaneos, Recomendaciones). ✓
- **Wizard de onboarding** honesto: "varios motores de IA" (el prototipo
  decía "4 motores" — recordatorio de que el reference NO es fuente de
  claims de producto). ✓
- **Prompts** agrupa por topics con expandir/plegar y sentimiento por
  prompt. ✓
- **Competidores** tiene panorámica de cuota de voz + evolución de
  posición media con estado vacío honesto. ✓
- **Billing/planes**: todo real tras BILLING-STRIPE-1 (checkout, portal,
  trial, cancelación); el único "muy pronto" restante es el plan Agencia
  (decisión consciente: "hablar con ventas"). ✓
- **`/dashboard/billing`** redirige a Ajustes → Facturación (no hay página
  duplicada). ✓
- **Web-audit** es una feature real (cobertura Gemini + auditoría técnica),
  no un placeholder. ✓
- **Borrado de cuenta y de dominios** reales con confirmación + email. ✓

## Pasada de QA

- `pnpm test`: **573/573** en verde sobre `main` (post fases A–E).
- `pnpm run validate`: build + typecheck + lint limpios.
- Checklist "¿`/pricing` sigue siendo verdad?": motores anunciados = 2
  reales (Gemini + Claude) ✓; sin menciones a white-label/workspaces/API ✓;
  límites Free/cadencias aplicados por código (PRICING-TRUTH-1 PR b) ✓.
  **Matiz conocido y aceptado** (decisión de marketing registrada en el
  ledger de BILLING PR 3): las cards de `/pricing` mantienen CTAs por plan
  ("Empezar con Starter"…) aunque todo registro entra al mismo trial de
  Pro 7 días. No es un claim falso (nadie paga sin Checkout), pero es
  fricción de expectativas — revisar copy antes de LAUNCH.
- Áreas Forbidden: sin tocar. Sin migraciones pendientes de aplicar.

## Plan de fases propuesto (pendiente de aprobación)

| Fase | Contenido | Riesgo |
|---|---|---|
| F1 | **P0 Equipo honesto** (quitar seeds + invitación fingida) | Bajo, 1 PR pequeño |
| F2 | Toggles de notificaciones honestos (hallazgos 2+3, opción "Próximamente") + "Cambiar logo" (4) | Bajo, 1 PR pequeño |
| F3 | Capa de acción en Páginas citadas (5, opción barata: enlace a recomendaciones de autoridad) | Bajo-medio |
| — | Copy de CTAs de `/pricing` (matiz de QA) | Decisión de marketing del fundador, no la implemento sin ella |

F1 es la única que considero bloqueante antes de sentar a la primera
agencia delante del producto.

---

**Estado (2026-07-12):** plan aprobado por el fundador ("Sí, haz F1 a F3 en
loop, todo junto") — implementadas las tres en el mismo PR (#219), a
petición explícita de combinarlas:

- **F1:** `components/settings/team-tab.tsx` reescrito — sin equipo
  fabricado ni invitación fingida; muestra solo el usuario real y un
  aviso honesto de que el modo multiusuario llega más adelante. Sin
  claim de "usuarios ilimitados".
- **F2:** `components/settings/notifications-tab.tsx` — de los 6 toggles,
  solo "Cambios de visibilidad" queda activo (es el único que envía un
  email real hoy); los otros 5, incluido "Resumen semanal" (persiste una
  preferencia real pero de un email aún no construido, Fase 6b),
  aparecen deshabilitados con badge "Próximamente". `organization-tab.tsx`
  — botón "Cambiar logo" deshabilitado, hint ya no promete "informes
  exportables" inexistentes.
- **F3:** `citations-client.tsx` — la guía de tácticas ya existente (que
  la auditoría había etiquetado por error como ausente; en realidad
  estaba colapsada tras "Cómo usar esto") gana un enlace real "Ver el
  plan de acción para estas fuentes" hacia Recomendaciones, cerrando el
  hueco entre el consejo genérico y las recomendaciones reales
  (`pursue_citation_sources`, `add_citation_block`) que el motor ya
  genera para exactamente este gap.

`pnpm test` 573/573, `pnpm run validate` limpio. Sin schema/RLS/pipeline.
