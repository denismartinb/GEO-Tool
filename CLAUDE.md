# CLAUDE.md — GEO Studio Constitution

GEO Studio is a private-beta SaaS that helps brands understand and improve how
they appear in AI-generated answers.

**Public product name: GenScore** (decided 2026-07-09, see
`docs/launch-plan.md` Fase 0). "GEO Studio" remains the internal/repo project
name (this file's title, `package.json`); "GenScore" is the brand shown to
users across marketing pages and the dashboard. "Lumira" is retired — do not
reintroduce it in user-facing copy.

**Talk to the Director for every request.** The Director is the primary agent:
it evaluates critically, consults specialists, orchestrates implementation, and
owns the quality of every deliverable. Start sessions with `--agent director`.

> Architecture context: `.claude/agents/*.md` holds all specialist agents.
> `.claude/rules/*.md` holds path-scoped invariants. `docs/` holds the
> long-term roadmap, environment contract, scan lifecycle, and ADRs.

---

## Idioma

Responde siempre al fundador en castellano (español de España). Código,
nombres de variables, commits y comentarios en inglés como hasta ahora; solo
la comunicación con el fundador es en castellano.

---

## Core Target Flow (H1 — must work before anything else)

```
Registro/Login
→ Nuevo dominio
→ Competitors suggested by system (Gemini)
→ Prompts suggested by system (Gemini)
→ Primer escaneo Gemini
→ Scan exits pending → done
→ Overview renders real scan data
→ Prompts / Competitors / Recommendations / Escaneos
```

**Do not ship fake product behavior.**

---

## Task Intake Protocol

Before implementing any non-trivial request, the Director decides:

- **Small, clear, low-risk** → execute directly.
- **Broad, ambiguous, or risky** → produce a Task Intake Report first and wait
  for explicit approval.

Task Intake is **mandatory** when the request:

- says "implementa este diseño" / "implement this design";
- says "arregla el flujo" / "compara las pantallas";
- says "Sí" or "go ahead" without a specific approved Task Intake Report on record;
- touches multiple screens, UX/UI alignment, scanning state, onboarding flow,
  prompts or competitors flow;
- touches Gemini, Supabase, auth, schema, RLS, pipeline, or server actions;
- asks for broad UX alignment, continuation without a precise issue, or mixes
  product/backend/design concerns;
- could produce a large PR.

Additional enforced rules:

- Never ask "Which gap should I implement?" after a broad audit — produce a
  full report and recommend the first safe phase explicitly.
- Never interpret a broad "Sí" as blanket approval for all gaps simultaneously.
- Never collapse multiple concerns into one PR without explicit approval.
- Always bias toward P0 functional blockers before P1/P2 visual polish; say so
  explicitly when both exist.
- Separate audit → planning → implementation → QA → Human Gate as distinct
  steps.

When in doubt, prefer Task Intake. **Interpreting and scoping first is always
cheaper than building the wrong thing.**

The Task Intake Report must end with:
> "Do you approve this plan? I will not implement until you confirm."

---

## Retroactive Regularization Protocol

If the Director implements before approval:

1. Stop immediately. Do not add more commits, do not continue, do not merge.
2. Report: branch, commit hash, PR URL if any, files changed, exact summary,
   validation result, whether any forbidden areas were touched.
3. Convert the work into a retroactive Task Intake Report.
4. Mark PR as Draft if already opened.
5. Wait for founder decision: approve, reject, or split.

---

## Agentic Operating Model

All non-trivial work follows this flow:

1. Start from updated `main`.
2. Create a dedicated branch.
3. Implement the smallest safe slice.
4. Run `pnpm test && pnpm run validate`.
5. Push branch.
6. Open PR.
7. Post or rely on AGENTIC handoff.
8. Let automated Claude QA run.
9. **Run the agentic user pilot** (`ux-pilot`) against the Vercel preview.
10. Wait for Human Gate before merge.

**Never commit directly to `main`. Never force-push without approval. Never
auto-merge. Human Gate is always manual.**

---

## Presupuesto de builds (BUILD-BUDGET-1, 2026-08-04)

Cada push a cualquier rama es un deploy de Vercel. El 2026-08-03 se gastaron 50
y el 04-08 iban 40 a las 17:52, con el 48% concentrado en tres ramas de PRs
largos (15, 14 y 14 builds cada una) — el tope de 100/día del plan Hobby
congeló producción seis horas esa tarde. **La cuenta pasó a Vercel Pro el
2026-08-04 y ese tope ya no existe**, pero las reglas siguen: cada deploy de
preview arrastra una pasada de `ux-pilot` (~350-380 min/día de GitHub Actions
el 03 y 04-08), y el cuello nunca fue el número de PRs sino que **el build se
estaba usando como bucle de feedback**. Reglas, en orden de importancia:

1. **Un push por iteración pilotable, no por commit.** `pnpm run validate` ya
   ejecuta `next build` en local: el preview no sirve para saber si compila,
   sólo para que el piloto lo mire. Commitea lo que haga falta; empuja una vez,
   cuando el slice esté listo para que alguien lo juzgue.
2. **Prohibidos los commits de "retrigger".** Un commit vacío para forzar un
   deploy gasta build y no cambia nada (`chore: retrigger Vercel deploy`,
   2026-08-03, dos veces). Si de verdad hace falta reconstruir, se hace
   *Redeploy* desde Vercel.
3. **No mergees `main` en tu rama** salvo conflicto real o justo antes del
   Human Gate. Cada sincronización es un build más y una pasada más del piloto.
4. **Máximo 3 PRs abiertos a la vez.** El 04-08 había 10. Un PR abierto envejece,
   se resincroniza y vuelve a construir; el paralelismo alto es cola, no
   velocidad. Antes de abrir el cuarto, cierra o mergea uno.

Lo que **no** cambia: el piloto sigue corriendo en cada deploy de preview y
sigue siendo obligatorio antes del Human Gate. Esta fase reduce el número de
deploys, no las garantías.

`scripts/vercel-should-build.sh` (enganchado como `ignoreCommand` en
`vercel.json`) salta el build cuando el push sólo toca `docs/`, `.claude/`,
`.github/`, `tests/`, `agents/` o prosa de raíz (`*.md`). **Excepción:
`tests/pilot/**` sí construye** — el piloto sólo corre contra un preview
(`ux-pilot.yml` se dispara con `deployment_status` y nada más), así que saltar
el build de un cambio en el propio piloto lo deja imposible de ejercitar
(pasó el 2026-08-05: un arreglo del barrido se desplegó «Ignored» y ningún
piloto lo probó). Mismo argumento que ya protegía a `scripts/`, y **desde el
2026-08-11 también `.github/workflows/ux-pilot.yml`**, que el `.github/*`
genérico se tragaba: el commit que subía su `timeout-minutes` no construyó, así
que el arreglo del timeout no se pudo ejercitar — el mismo bucle un escalón más
allá (log §55). Sólo ese workflow; los demás corren por `push`/`pull_request` y
no necesitan preview. Compara contra el
último deploy con éxito de la rama, no contra `HEAD^`, y **nunca salta
producción**. Ahorra minutos de build y pasadas de piloto, no deployments: el
tope diario se aplica al crear el deployment, aguas arriba del build (medido en
PR #323). Es **fail-open a propósito**: en
cualquier duda construye. Un build saltado de más dejaría el preview apuntando a
código viejo y el piloto juzgaría una pantalla que no es la del commit — justo
el fallo que el piloto existe para impedir. Si tocas ese script, mantén sus
tests (`scripts/vercel-should-build.test.ts`) verdes en ambas direcciones.

---

## Agentic User Pilot (mandatory before Human Gate)

Before the founder is asked to look at anything, the `ux-pilot` agent must open
the PR's Vercel preview, log in with the pilot account, walk the affected
screens at 375 / 768 / 1280 px, **interact with them**, **look at the
screenshots**, and judge them. See `docs/agentic-user-pilot.md`.

- `PILOT PASS` → the PR may go to the Human Gate.
- `PILOT FAIL` → the Director iterates. The founder is not involved.
- `PILOT INCONCLUSIVE` → the PR **may not** be presented as verified. Say
  exactly which criteria are unverified and why.

It judges against four things, not one:

1. the PR's acceptance criteria;
2. the **approved design** — anything added, removed or renamed without
   approval is `PILOT FAIL`, even if nothing is broken;
3. an **interaction checklist** — the harness sweeps every safe in-page control
   and captures the result, so a dead control, a reveal that renders clipped or
   off-viewport, or an interaction that breaks the layout is a finding;
4. a **UX quality bar** — is this actually good, not just correct.

**Every pilot report ends with concrete proposed improvements, minimum three,
even on a PASS.** The Director folds in the cheap ones (copy/CSS) before the
Human Gate and surfaces the rest with a recommendation. An empty proposals
section means the pilot ran checklists without judgement — it goes back.

**Never report a pass for something the pilot did not see.** An unreachable
preview, a failed login, or a blocked egress policy is INCONCLUSIVE, never PASS.
Interaction-gated behaviour no assertion covered is "unverified", not "verified".
**A screen that loads cleanly but renders an empty state has not been seen
either** — journeys declare what real content proves the screen rendered
(`ContentExpectation`), and a placeholder fails the run. This is not a
hypothetical: on 2026-08-02 a full redesign of Auditoría web shipped with a
green pilot and ✅ on three viewports because the pilot account had no audit
data, so every capture showed "Todavía no has auditado tu web".

**Two mandatory inputs before a pilot run can mean anything** (both were
missing in that incident, which is why it produced a meaningless pass):

1. **The approved design must live in the repo**, at
   `docs/design-reference/<FASE>/`. A chat-artifact URL is not an input: CI
   runners and future agent sessions cannot open it, so the design-fidelity
   half of the pilot silently never runs. **When the founder approves a design
   by artifact, that HTML is committed in the same PR that implements it.**
2. **The pilot account must hold real data.** See the seeding rules below.

### Pilot write scope (expanded 2026-08-02, founder-approved)

The always-on pilot (every preview deploy) stays strictly **read-only**: no
scan launches, no project creation, no writing forms, no billing — enforced in
code by an allow-list, not by convention.

Write journeys live in `tests/pilot/journeys/write/`, run **only** under
`--journeys write` (never on a deploy), and are approved to do whatever the
pilot genuinely needs to have real data to test against — create the dedicated
write-project, scan it, audit it. Their guard is not a shorter list of allowed
actions but **three structural rules**, and any new write journey must keep all
three:

- **Dedicated target.** Only the reserved `PILOT_WRITE_DOMAIN` project
  (`mozilla.org`), matched by exact domain. Never auto-discovery, never a real
  customer domain.
- **Bounded cost.** The write-project is created trimmed to one prompt, so a
  scan or an audit there is ~1 LLM call, not ~30. Anything that would scale
  with a real project's prompt count needs its cost cap stated in the journey.
- **Idempotent and self-healing.** Seeding skips itself when the data already
  exists (the product's real 5/day rate limits are the binding constraint, not
  money), and anything created that consumes a plan cap is cleaned up.

Still out of scope without their own Task Intake: billing/Stripe flows,
deleting projects, and anything touching a project other than the reserved
write-project.

**Reading more than one project is approved and shipped** (UX-PILOT-1d,
2026-08-03, `tests/pilot/journeys/second-project.spec.ts`). One project only
ever exercises one shape of data, so whole branches of a screen are
unreachable from it — a brand the AI never named, a project with too few
qualifying scans, a ranking where most entities have no rank. The pilot now
walks the Overview and Competitors screens on up to two further projects on
the same account, skips loudly when there is only one, and annotates the run
when more projects existed than the cap allowed. This needs no exception:
switching project is navigation, and every journey it runs is read-only.

**Second approved exception: UX-PILOT-3** (Task Intake approved 2026-08-03) —
the pilot may launch real scans on a pinned project when a state is
unreachable without one, because after a scoring change no run anywhere carries
the new shape of data and no amount of looking harder fixes that. Three
locks, none of them a convention: `workflow_dispatch` only (no deploy can
trigger it), `--journeys scan` (the per-deploy read set cannot reach the files,
asserted by the self-check every run), and a required `project_id` input with
no default (the code refuses without it, and refuses above the hard cap of 2
rather than clamping). **No secret gates it** — founder, 2026-08-03: *"tiene
que dar al botón como si le diera yo, sin claves ni secretos"*; anyone able to
set a secret could already dispatch the workflow, so it bought no access
control. What that trades away, stated rather than glossed: nothing in code
distinguishes a human pressing the button from an agent dispatching it. It presses the project's own scan button and
nothing else. Its output is captures, not a verdict — the `ux-pilot` agent
still has to judge them. Anything wider still needs its own Task Intake.

**Reading more than one project is approved and shipped** (UX-PILOT-1d,
2026-08-03, `tests/pilot/journeys/second-project.spec.ts`). One project only
ever exercises one shape of data, so whole branches of a screen are
unreachable from it — a brand the AI never named, a project with too few
qualifying scans, a ranking where most entities have no rank. The pilot now
walks the Overview and Competitors screens on up to two further projects on
the same account, skips loudly when there is only one, and annotates the run
when more projects existed than the cap allowed. This needs no exception:
switching project is navigation, and every journey it runs is read-only.

**Second approved exception: UX-PILOT-3** (Task Intake approved 2026-08-03) —
the pilot may launch real scans on a pinned project when a state is
unreachable without one, because after a scoring change no run anywhere carries
the new shape of data and no amount of looking harder fixes that. Three
locks, none of them a convention: `workflow_dispatch` only (no deploy can
trigger it), `--journeys scan` (the per-deploy read set cannot reach the files,
asserted by the self-check every run), and a required `project_id` input with
no default (the code refuses without it, and refuses above the hard cap of 2
rather than clamping). **No secret gates it** — founder, 2026-08-03: *"tiene
que dar al botón como si le diera yo, sin claves ni secretos"*; anyone able to
set a secret could already dispatch the workflow, so it bought no access
control. What that trades away, stated rather than glossed: nothing in code
distinguishes a human pressing the button from an agent dispatching it. It presses the project's own scan button and
nothing else. Its output is captures, not a verdict — the `ux-pilot` agent
still has to judge them. Anything wider still needs its own Task Intake.

---

## Human Gate

Human Gate is always manual. It asks:

1. Is the problem real and important?
2. Was the implemented scope correct?
3. Did validation pass? Did tests pass?
4. Did Claude QA accept?
5. **Did the agentic user pilot pass, and what did it leave unverified?**
   **¿Cuántas capturas se abrieron y cuáles?** El ✅ del workflow no es el
   veredicto: sólo dice que las aserciones que existen no saltaron. El
   2026-08-11 se reportó «piloto pasado» leyendo esa tabla, y el fundador
   encontró a ojo un CTA duplicado en el hero —cuya captura existía y lo
   enseñaba— y un CTA gris sobre azul en el cajón móvil, que ninguna de las 560
   capturas tenía abierto (log §55). Sin la lista de ficheros abiertos, el
   veredicto es INCONCLUSIVE.
6. **What did the pilot propose improving, and what was folded in already?**
7. Are there product risks?
8. **¿Se cerró la fase documentalmente en este mismo PR?** — histórico, regla
   de ruta si cambió un invariante, y celda del mapa de zonas (ver "Cierre de
   fase"). Si falta, el PR no está terminado.
9. Should this merge now?

Only after Human Gate may a PR be merged.

**Every time a PR is opened or updated and ready for the founder to review,**
the message to the founder must always include, in castellano:

1. **La URL de Vercel del preview** para probar el cambio.
2. **Un resumen en castellano de qué probar** — qué cambió y qué comportamiento
   concreto debe verificar el fundador (no un resumen técnico del diff).

This applies before every Human Gate request, not only the first time a PR is
opened — repeat the preview URL and a fresh "qué probar" summary whenever a new
commit lands on the PR and the preview redeploys.

---

## Task Classification

- **P0** — Core flow blocker: scan stuck, Gemini failing, Overview no data,
  auth broken, project creation broken.
- **P1** — Structural UX mismatch: wrong flow order, missing step, confusing nav.
- **P2** — UI/copy inconsistency: cards, badges, spacing, copy differ from
  design but flow works.
- **P3** — Polish: animation, microcopy, minor visual refinements.

**P0 must be fixed before visual polish.**

---

## Forbidden Without Explicit Approval

Do not implement without explicit founder approval:

- schema migrations;
- RLS changes;
- service-role shortcuts;
- OpenAI runtime;
- Perplexity runtime;
- crawler;
- background scheduler;
- billing — **partially approved**: BILLING-STRIPE-1 (Task Intake approved
  2026-07-10, see `docs/launch-plan.md` Fase 4) covers Stripe Checkout +
  webhooks + reverse trial + Customer Portal + PR 4 transactional emails via
  Resend (welcome, plan confirmed, payment failed, trial ended — the
  "3 days before trial ends" reminder is separate, still needs its own
  schema/cron approval), built and tested against Stripe **test mode**
  only. Switching to live charges requires the go-live checklist in that
  same section (Vercel Pro, alta autónomo, VeriFactu decision) — still
  gated on founder sign-off, not automatic. Any billing work beyond that
  approved scope (new pricing mechanics, additional payment providers,
  invoicing changes) needs its own approval — one such approval already
  granted: BILLING-INVOICE-FIELDS-1 (Task Intake approved 2026-08-25, see
  `docs/brand/design-decisions-log.md` §166), razón social/NIF synced to the
  Stripe customer's `invoice_settings.custom_fields`, still test mode only;
- teams / RBAC;
- auto-merge;
- automatic destructive cleanup;
- hard delete of projects (already shipped in DATA-MGMT-1);
- fake suggestions;
- fake recommendations;
- fake scans;
- fake monitoring;
- fake metrics.

---

## Mapa de zonas del producto

Índice de estado por zona. **Es un índice, no un registro**: una fila por zona,
y crece sólo cuando nace una zona nueva. El detalle largo vive en el histórico;
los invariantes duros viven en la regla de ruta, que se inyecta **sola** al
tocar esos ficheros.

Antes de trabajar en una zona: leer su regla de ruta y las secciones de
histórico que aparecen aquí. Al cerrar una fase: actualizar la celda "Última
fase" (ver "Cierre de fase" más abajo).

| Zona | Regla de ruta (automática) | Última fase cerrada | Histórico |
|---|---|---|---|
| Competidores | `competitors.md` | **TRUST-METRICS-1: '45 prompts' pasa a '45 respuestas · 15 prompts en 3 motores', y un motor con 0 menciones vuelve a la tabla en vez de desaparecer (2026-08-27, log §183)** · **MEAN-RANK-READS-TRUE-1: «Puesto» pasa a «Puesto medio», con la frase que lo explica pegada a la cifra, y el gráfico se ordena por la tabla que tiene debajo (2026-08-27, log §177)** · SAMPLE-FLOOR-1: una media sobre pocas respuestas deja de adelantar a una sobre muchas (2026-08-27, log §175) · ANIMATION-PARITY-1: la misión del primer escaneo se ve y termina igual en las 6 secciones (2026-08-26, log §168) · SCAN-FULLSCREEN-HEADER-1: la cabecera fija se oculta mientras dura la misión del primer escaneo (2026-08-25, log §160) · ONBOARDING-COMPETITORS-CAP-1 (2026-08-20, log §123) · PANORAMA-EMPTY-1 (2026-08-07) | log §10, §11, §15, §36, §123, §160, §168, §175, §177, §183 · ADR 0011/0018/0020/0022 · `docs/external-audit-2026-08.md` |
| Recomendaciones | `recommendations.md` | **RECS-LOOP-1 Fase A: la pestaña "Resueltas" verifica si la predicción se cumplió, nunca un delta de score (2026-08-27, ADR 0041, log §181)** · AUDIT-RECS-JOIN-1 Fase B (2026-08-27, log §172) · ANIMATION-PARITY-1: la misión del primer escaneo se ve y termina igual en las 6 secciones (2026-08-26, log §168) · AUDIT-RECS-JOIN-1 Fase A (2026-08-22, log §167) · SCAN-FULLSCREEN-HEADER-1: la cabecera fija se oculta mientras dura la misión del primer escaneo (2026-08-25, log §160) · RECS-ACCION-1c (2026-08-21, log §140) · REWRITE-DOMAIN-ANCHOR-1 (2026-08-20/21, log §137, §133 y §134) · RECS-USEFULNESS-1 Fase C: honestidad de lo generado (2026-08-21, log §128) · RECS-ACCION-1a (2026-08-20, log §127) · RECS-USEFULNESS-1 Fase A: integridad del artefacto pegable (2026-08-20, log §126) · RECS-REDESIGN-1 fase 1 (2026-08-17, log §115) · RECS-POTENTIAL-1 (2026-07-23) | log §115, §126, §127, §128, §133, §134, §137, §140, §160, §167, §168, §172, §181 · ADR 0017/0019/0041 · `docs/specs/recommendations/quality-audit-2026-08.md` |
| Auditoría web | `web-audit.md` | **WEB-AUDIT-WIDTH-1: la columna sube los cuatro peldaños de la escalera de anchos, no sólo el primero (2026-08-27, log §178)** · ANIMATION-PARITY-1: la misión del primer escaneo se ve y termina igual en las 6 secciones (2026-08-26, log §168) · Retirado el pie "Dominios/Recomendaciones", redundante con la navegación lateral (2026-08-25, log §164) · SCAN-FULLSCREEN-HEADER-1: la cabecera fija se oculta mientras dura la misión del primer escaneo (2026-08-25, log §160) · AUDIT-SNIPPET-1 (2026-08-21, log §131) · AUDIT-GROUNDED-PARITY-1 (2026-08-21, log §130) · El beat de ascenso llega a esta pantalla (2026-08-20, log §132) · PRELAUNCH-HARDENING-1 Fase R7-b (2026-08-16, log §106) · Fase R8 (2026-08-15, log §102) · tests de render (2026-08-14, log §87) · Fase R7 (2026-08-14, log §83) · SCAN-STATES-3 (2026-08-11, log §57) · WEB-AUDIT-AUTO-SPLIT-1 (2026-08-09) · WEB-AUDIT-DRIVE-1 (2026-08-07, ADR 0038) · WEB-AUDIT-TECH-ALL-PLANS-1 (2026-08-05, ADR 0035) | log §17, §18, §22, §25, §27, §30, §52, §57, §83, §87, §102, §106, §130, §131, §132, §160, §164, §168, §178 · ADR 0027/0035/0038 · `docs/specs/web-audit/ROADMAP.md` |
| Metodología GEO (scoring) | `scoring.md` | **TRUST-METRICS-1: una sola Puntuación GEO en todo el producto — `lib/metrics/run-metrics.ts` es su único dueño, consumiendo SCORE-WINDOW-1 sin tocarlo (2026-08-27, log §183, ADR 0036 adenda)** · SCORE-WINDOW-1 (2026-08-05, ADR 0036) · GEO-SCORE-V4 (ADR 0033) · GEO-SCORE-CALIBRATION-1 sigue propuesta y bloqueada por datos (ADR 0031) | ADR 0008/0015/0021/0024/0026/0030/0031/0032/0033/0036 · log §8b, §20, §23, §29, §31, §183 · `docs/external-audit-2026-08.md` |
| Blog y contenido | `growth-content.md` | **TRUST-PROMISES-1: las tres comparativas dejan de citar el precio de Pro/Starter a mano, leen `plans-data.ts` (2026-08-27, log §182)** · BLOG-INDEX-CARDS-2026-08 Fase 1: el índice de `/blog` deja las portadas por tarjetas de color por clúster, Comparativas pasa a carril de primer nivel (2026-08-25, log §169) — Fase 2 (mega menú "Recursos" en la cabecera pública) pendiente, PR aparte** · GEO-VS-AEO-VS-SEO (2026-08-23, log §145) — artículo de nomenclatura + la zona segura de una portada son dos recortes, no uno · BLOG-COVERS-2026-08 (2026-08-20, log §125) · SEO-POS-1 Fase A: material listo (2026-08-16, log §107) · Fase E CERRADA: E3+E4 (2026-08-15, log §100) · E2 (2026-08-15, log §94–§96) · E1 (2026-08-13) · SEO-POS-1 Fase C, S8 (2026-08-14) · S6 (2026-08-13) · COMPARATIVAS-DESIGN-1 (2026-08-11) · SEO-POS-1 Fase T-b (2026-08-09) | log §12, §13, §14, §19, §46, §47, §58–§61, §66–§70, §73–§77, §85, §86, §91, §94–§96, §100, §107, §125, §145, §169, §182 · `content-strategy.md` · `off-site-authority-kit.md` · `seo-positioning-plan.md` · `agentic-weekly-post.md` · `docs/external-audit-2026-08.md` |
| Comprobador gratuito (Fase P) | — *(sin regla propia todavía)* | **CHECKER-COPY-1: el aviso de variabilidad deja de contradecir a un resultado positivo (2026-08-27, log §174)** · FREE-CHECKER-1 Fase D1 (2026-08-17, log §113) — fuentes reales (`groundingChunks`) en el resultado, coste cero. Fase C: comprobación real anónima contra ChatGPT, con techo diario y motor de reserva para la extracción. Fase D2/D3 (posiciones reales, categoría, logos) propuestas y sin aprobar: tocan el esquema de extracción compartido con el escaneo | log §113, §174 · `seo-positioning-plan.md` Fase P · `docs/external-audit-2026-08.md` Fase 6 |
| Escaneo (pipeline) | `scan.md` · `mission-rocket.md` | **CITATION-REDIRECT-SSRF-1: `resolveGroundingRedirect` verifica cada salto de redirección antes de seguirlo, guardián importado de `fetch-page.ts` (2026-08-27, log §185)** · PROJECT-DEFAULTS-BY-ACCOUNT-1: `recurring_scans_enabled` se activa solo tras el primer escaneo completado de una cuenta no excluida (2026-08-25, log §173) · PRELAUNCH-HARDENING-1 Fase Q3: tests de ruta del cron (2026-08-15, log §90) · Fase R6 (2026-08-14, log §81/§82) · ENGINE-DEBUG-TOGGLE-1 (2026-08-10) · SAMPLING-DEBUG-TOGGLE-1 (2026-08-09) · SCAN-DRIVE-1 (2026-08-07, ADR 0037) · EXTRACTION-RELIABILITY-1 Fase C (2026-08-05) | log §53, §54, §81, §82, §90, §173, §185 · `docs/scan-lifecycle.md` · ADR 0003/0006/0014/0016/0029/0037 |
| Dominios y depuración  | — *(sin regla propia todavía)*  | **TRUST-METRICS-1: la puntuación pasa a leer la ventana (antes visibilidad cruda), su delta pasa a ventana-sobre-ventana, y `/runs/[runId]` sale de la consola — sólo accesible desde `/debug` (2026-08-27, log §183)** · **MATURITY-BANNER-HIDE-ALL-1: el switch de `/debug` silencia todos los avisos informativos —la puerta enumera excepciones, no cubiertos— y el aviso del plan Free nunca se calla (2026-08-27, log §179)** · PROJECT-DEFAULTS-BY-ACCOUNT-1: sampling, auditoría por IA y los avisos de historial en construcción nacen en ON/ocultos para cuentas reales, salvo un allow-list de cuentas internas de prueba (2026-08-25/27, log §173) · DOMAINS-OVERAGE-GATE-1: gate bloqueante en toda la consola cuando la cuenta tiene más dominios activos de los que permite el plan — retirar (borrado duro) o subir de plan (2026-08-25, log §171) · Retirado el enlace "Volver a competidores" del paso de prompts, redundante con el botón "Atrás" del propio formulario (2026-08-25, log §164) · DEBUG-HIDE-NO-TRACKING-1: switch local en `/debug` para silenciar el aviso de seguimiento diario (2026-08-25, log §161) · ONBOARDING-DOMAIN-REDESIGN-1: rediseño del asistente de alta de dominio a la dirección "Consola" (2026-08-20, log §162) · DOMAINS-LIVE-SELECT-1 (2026-08-20, log §122) · DOMAINS-ARCHIVE-RETIRE-1 (2026-08-15, log §104) · PRELAUNCH-HARDENING-1 Fase Q1: `createProjectCore` + tests (2026-08-15, log §89) · DOMAINS-CLIENT-DELETE-1 (2026-08-09) · DOMAINS-ACTIVE-COOKIE-1 (2026-08-07) · FAVICON-QUALITY-1 Fases 1 y 3a (2026-08-06) · DEBUG-ACTIVE-PROJECT-1 (2026-08-06) · DOMAINS-REDESIGN-1 Fase A (2026-08-05) | log §32, §33 (DEBUG), §36, §39, §41, §89, §104, §122, §161, §162, §164, §171, §173, §179, §183 · `docs/design-reference/domains-redesign-1/` · `docs/design-reference/onboarding-domain-redesign-1/` · `docs/external-audit-2026-08.md` |
| Visión general   | — *(sin regla propia todavía)*   | **TRUST-METRICS-1: la frase del resumen deja de enseñar una segunda 'puntuación GEO' distinta de la del medidor (2026-08-27, log §183)** · **MEAN-RANK-READS-TRUE-1: «Puesto» pasa a «Puesto medio», con la frase que lo explica pegada a la cifra, y el gráfico se ordena por la tabla que tiene debajo (2026-08-27, log §177)** · SAMPLE-FLOOR-1: una media sobre pocas respuestas deja de adelantar a una sobre muchas (2026-08-27, log §175) · ANIMATION-PARITY-1: la misión del primer escaneo se ve y termina igual en las 6 secciones (2026-08-26, log §168) · SCAN-FULLSCREEN-HEADER-1: la cabecera fija se oculta mientras dura la misión del primer escaneo (2026-08-25, log §160) · HEADER-FULL-WIDTH-1: la cabecera de página ya no se recorta en ventanas anchas (2026-08-21, log §150) · OV-DESKTOP-2: cabecera alineada, desglose 2/3 + motores, filas con icono/medidor (2026-08-20, log §119) · Retirada la banda «Revisando tu web» (2026-08-16, log §111) · Corrección del banner `scan_started` stale (2026-08-16, log §112) · PRELAUNCH-HARDENING-1 Fase R7 2/2 (2026-08-14, log §84) · SCAN-STATES-2 (2026-08-10) · ONBOARDING-ROCKET-1 Fase 1 (2026-08-08) | log §4, §6, §8b, §55, §56, §84, §112, §111, §119, §150, §160, §168, §175, §177, §183 · `docs/external-audit-2026-08.md` |
| Prompts | — *(sin regla propia todavía)* | **ANIMATION-PARITY-1: la misión del primer escaneo se ve y termina igual en las 6 secciones (2026-08-26, log §168)** · SCAN-FULLSCREEN-HEADER-1: la cabecera fija se oculta mientras dura la misión del primer escaneo (2026-08-25, log §160) · PROMPT-DRAWER-TRUTH-1 (2026-08-23, log §147) · SAMPLING-SURFACE-1 (2026-08-05) | log §5, §24, §147, §160, §168 · ADR 0021/0030 |
| Páginas citadas | `citations.md` | **CITATIONS-HONESTY-1: "cita a un rival" pasa a "citada en una respuesta donde también apareció X", el filtro de outreach deja de exigir competidor co-citado y las fuentes alcanzables se agrupan por dominio (2026-08-27, Fase 8 de la auditoría externa, log §186)** · ANIMATION-PARITY-1: la misión del primer escaneo se ve y termina igual en las 6 secciones (2026-08-26, log §168)** · SCAN-FULLSCREEN-HEADER-1: la cabecera fija se oculta mientras dura la misión del primer escaneo (2026-08-25, log §160) · HEADER-FULL-WIDTH-1: la cabecera adopta el patrón compartido de las otras 6 pantallas (2026-08-25, log §151) · Fix: tarjeta de Impacto recortada sin donut (2026-08-17, log §114) · CITATIONS-REDESIGN-1 (2026-08-01) | log §8, §114, §151, §160, §168, §186 · ADR 0010/0012/0013/0023 · `docs/external-audit-2026-08.md` Fase 8 |
| Notificaciones | — *(sin regla propia todavía)* | **TRUST-METRICS-1: el aviso de fin de escaneo pasa de "Visibilidad N (+delta)" a "Escaneo actualizado: Puntuación GEO N" — la misma ventana que el resto del producto, nunca visibilidad cruda (2026-08-27, log §183)** · NOTIF-AUTOREAD-1 (2026-08-05) | log §28, §183 · `docs/specs/notifications/notifications-v1.md` · `docs/external-audit-2026-08.md` |
| Correos transaccionales | — *(sin regla propia todavía)* | **TRUST-METRICS-1: la alerta de caída y el resumen semanal dejan de llamar "GEO Score" a un compuesto por-run que no es la ventana — sólo copy, el cálculo de ninguno de los dos se toca (2026-08-27, log §183)** · WELCOME-EMAIL-FRESHNESS-FIX-1 (2026-08-20, ADR 0040) · PRELAUNCH-HARDENING-1 Fase Q2: primeros tests (2026-08-15, log §93) | ADR 0040 · log §93, §183 · `lib/email/transactional.ts` · `docs/external-audit-2026-08.md` |
| Onboarding (tour) | `onboarding.md` | **ONBOARDING-TOUR-PERSIST-1 (2026-08-25, log §153)** — la marca de «ya visto» pasa de `localStorage` a `profiles.onboarding_tour_seen_at` · El tour sale de la portada y se queda en el popup de la consola (2026-08-23, log §157) · ONBOARDING-TOUR-1 Fase A (2026-08-08) | log §40, §153, §157 · `docs/design-reference/onboarding-tour-1/` |
| Ajustes de cuenta | — *(sin regla propia todavía)* | **PROMO-CONSOLE-PARITY-1: la consola cotiza el precio de lanzamiento a quien todavía no ha contratado (2026-08-27, log §170)** · BILLING-INVOICE-FIELDS-1: razón social/NIF sincronizan con Stripe al guardar (2026-08-25, log §166) · "Datos de empresa" oculto en Cuenta: no tenía consumidor ni plan (2026-08-25, log §165) · PRELAUNCH-HARDENING-1 Fase R8-a (2026-08-15, log §102) · CONSOLE-REDESIGN-1 Fase A (2026-08-06) | log §38, §102, §165, §166, §170 · `docs/design-reference/console-redesign-1/` |
| Precios y facturación | `styles.md` | **TRUST-PROMISES-1: los precios citados fuera de la consola (hero, metadescripción de /precios, comparativas) leen `plans-data.ts` en vez de repetir el número a mano (2026-08-27, log §182)** · PRICING-PAY-BADGES-CENTER-1: las insignias de pago se centran también cuando envuelven en móvil, no sólo en una línea (2026-08-27, log §180) · PROMO-CONSOLE-PARITY-1: la consola cotiza el precio de lanzamiento a quien todavía no ha contratado (2026-08-27, log §170) · DOMAINS-OVERAGE-GATE-1: al exceder el cupo de dominios del plan, la salida a "subir de plan" reutiliza el checkout/portal de Stripe ya existente desde dentro del gate bloqueante (2026-08-25, log §171) · BILLING-INVOICE-FIELDS-1: razón social/NIF de "Datos de facturación" llegan a la factura vía `invoice_settings.custom_fields` de Stripe (2026-08-25, log §166) · PRICING-PROMO-1 Fase C: cupón real de Stripe, con fecha de caducidad real leída de la propia suscripción — no un número de pantalla (2026-08-25, log §152) · Fase A+B: copy de "paga por valor", medios de pago (2026-08-24, log §148, §149) | log §148, §149, §152, §166, §170, §171, §180, §182 · `docs/launch-plan.md` Fase 4 (BILLING-STRIPE-1) · `docs/external-audit-2026-08.md` |
| Portada (hero y home) | `styles.md` | **TRUST-PROMISES-1: la tira de promoción del hero deja de citar precios y fecha de corte a mano — lee `plans-data.ts` (2026-08-27, log §182)** · HOME-SEO-AUDIT-1: la FAQ deja de prometer un comprobador al que el hero ya no lleva, y el comprobador gana sus primeros enlaces internos (2026-08-25, log §163) · El titular sube a 84px, el CTA del hero vuelve a llevar al registro y la demo crece en escritorio (2026-08-24, log §159) · La pastilla de «Cinco pantallas» deja de pelearse con su scroll, y la barra de la demo del hero pasa a cinco pastillas (2026-08-24, log §159) · HOME-2026-08 Fase A2, segunda pasada: el marco de la demo deja de estar medido para su peor escena, y una barra anuncia el cambio (2026-08-23, log §158) · Fase A2: la demo de cinco escenas del hero, y el tour deja la portada (2026-08-23, log §157) · la solución se genera, la tira del blog y la tabla «Qué cambia» (2026-08-23, log §156) · Fase B2, segunda pasada: pastilla en vez de flechas y el recorte silencioso de 561-720px (2026-08-23, log §155) · Fase B2: las cinco pantallas del producto (2026-08-22, log §154) · Fase C: testimonio real, FAQ y cierre (2026-08-22, log §146) · Fase B1, segunda pasada: fidelidad medida contra el artboard (2026-08-22, log §144) · Fase B1: «El cambio de reglas» y la sección oscura (2026-08-22, log §143) · Fase A: el hero y su CTA al comprobador (2026-08-22, log §142) · HERO-GRADIENT-1: el fondo (2026-08-22, log §141) | log §141, §142, §143, §144, §146, §154, §155, §156, §157, §158, §159, §163, §182 · `docs/design-reference/home-2026-08/` · `docs/external-audit-2026-08.md` |
| Navegación pública (pie) | `styles.md` | **FOOTER-PAYMENT-TRUST-1: la fila de pagos seguros llega al pie de las siete pantallas de marketing, compartida con `/precios` en vez de duplicada (2026-08-27, log §184)** | log §46, §184 |
| Navegación pública (cabecera) | — *(sin regla propia todavía)* | **Skeleton de pre-hidratación cierra el flicker residual (2026-08-20, log §118)** · Badge Pro alineado junto al email + flicker de sesión sólo en la primera recarga por pestaña (2026-08-17, log §117) · HEADER-FLAT-1 (2026-08-15) · HEADER-CONSISTENCY-1 (2026-08-15) · GENSCORE-HEADER-2 (2026-08-12) · GENSCORE-HEADER-1 (2026-08-11) | log §1, §63, §65, §101, §109, §117, §118 |
| Fiabilidad LLM (reintentos y alertas) | `gemini.md` · `scan.md` | **PRELAUNCH-HARDENING-1 Fase R5 (2026-08-14, log §78/§79/§80)** · LLM-RESILIENCE-1 Fases A+B (2026-08-09) | log §45, §78–§80 · ADR 0029 |
| Rendimiento (velocidad de carga) | `styles.md` | **PUBLIC-SCROLL-CLIP-1: la zona pública era imposible de scrollear en Chrome (2026-08-20, log §124)** · A11Y-PSI-1: landmark, contraste y área táctil del sitio público (2026-08-20, log §116) · PRELAUNCH-HARDENING-1 Fase V: V4+V5 (2026-08-10) · V0a/V1/V2/V3/V6/V7/V8 (2026-08-09) | log §54, §116, §124 · `docs/prelaunch-hardening-plan.md` §Fase V |
| Proceso agéntico (builds/CI) | — *(sin regla propia todavía)* | **PILOT-DRAWER-VIEWPORT-1: el cajón móvil de la consola estaba cerrado y `toBeVisible()` no sabía verlo (2026-08-27, log §176)** · PRELAUNCH-HARDENING-1 Fase P3: matriz de definición ↔ pantalla (2026-08-21, log §139) · PILOT-PROJECT-PICK-2: el piloto exigía contenido real al proyecto que saliera primero (2026-08-21, log §135) · PILOT-HYDRATION-CLICK-1: el cajón móvil se pulsaba antes de hidratar (2026-08-20, log §136) · PRELAUNCH-HARDENING-1 Fase P2: el piloto abre `/signup` y `/forgot-password` (2026-08-20, log §129) · PILOT-PROJECT-PICK-1: el piloto elegía proyecto por un enlace retirado (2026-08-20, log §138) · PILOT-PR-LOOKUP-1: el piloto se saltaba a sí mismo y publicaba verde (2026-08-20, log §120) · LOG-NUMBERING-AUTOFIX-1 (2026-08-16, log §110) · CI-REDUNDANCY-1 (2026-08-16, log §108) · CODEX-BUILD-FIX-1 (2026-08-16, log §105) · PRELAUNCH-HARDENING-1 Fase Q5 (2026-08-15, log §97) · Fase Q5b (2026-08-11) · Fase 0 (2026-08-09) · PILOT-EVIDENCE-IGNORE-1 (2026-08-07) · BUILD-BUDGET-1 Fase 1 (2026-08-04) | log §21, §37, §42, §49, §55, §65, §97, §105, §108, §110, §120, §129, §135, §136, §138, §139, §176 · "Presupuesto de builds" arriba · `docs/prelaunch-hardening-plan.md` · `docs/agentic-user-pilot.md` |
| Autenticación (login/registro/recuperación) | — *(sin regla propia todavía)* | **WELCOME-EMAIL-FRESHNESS-FIX-1: `isFreshSignup` ya no depende de la velocidad de clic del usuario (2026-08-20, ADR 0040)** · AUTH-ERRORS-ES-1 (2026-08-12) | ADR 0039/0040 |
| Metadata y títulos de pantalla | `growth-content.md` | **ROOT-METADATA-1 (2026-08-15, log §103)** | log §46, §47, §103 · `lib/seo/metadata.ts` · `lib/seo/console-metadata.ts` |
| Consola de operador | `admin.md` | **ADMIN-CONSOLE-UX-1 (2026-08-15)** · ADMIN-CONSOLE-2b (2026-08-13) · ADMIN-CONSOLE-2a (2026-08-12) · corrección del arranque de MFA (2026-08-13, §72) · ADMIN-CONSOLE-1 Fase 1 (2026-08-11) | log §64, §71, §72, §98, §99 · `docs/design-reference/admin-console-1/` |

`log §N` = `docs/brand/design-decisions-log.md`. Las zonas sin regla propia se
irán cubriendo; mientras tanto, su histórico sigue siendo de lectura
obligatoria antes de tocarlas.

---

## Implementation Rules

Before editing: check current branch, git status, recent commits, handoff check.

During: keep changes small; prefer one concern per PR; avoid speculative
rewrites; document tradeoffs; stop if scope expands.

After: `pnpm test && pnpm run validate`; open PR; apply labels; rely on Claude
QA; report exact changed files and results.

Never delete source files casually. Never touch `Documentacion/` unless
explicitly instructed.

### Cierre de fase (obligatorio, en el mismo PR)

Una fase no está terminada hasta que la siguiente sesión pueda retomarla sin
preguntar nada. En el **mismo PR** que implementa el cambio, y nunca en uno
posterior:

1. **Histórico** — entrada en `docs/brand/design-decisions-log.md` (o ADR nuevo
   si es una decisión técnica): qué se decidió, por qué, y qué queda pendiente
   o roto conocido. Lo superado se marca `superseded por §X`, no se borra.
2. **Regla de ruta** — si la fase estableció o cambió un invariante de la zona,
   actualizar su `.claude/rules/*.md`. Cada invariante debe ser **trazable** a
   una sección del histórico o a un ADR: una regla que nadie puede justificar
   es peor que ninguna, porque una sesión futura la obedecerá igual.
3. **Mapa de zonas** — actualizar la celda "Última fase cerrada" de la zona en
   la tabla de arriba. Si la zona no existía, añadir su fila.

**El número de sección del histórico es un identificador, no un contador.**
Antes de mergear, comprueba que el tuyo no lo haya reclamado otra rama
mientras tanto: varias sesiones calculan `max + 1` sobre bases que envejecen, y
**git no lo para** —dos apéndices al final del mismo fichero se mezclan sin un
solo marcador de conflicto—, así que el resultado tiene dos §NN en silencio.
Había siete colisiones así antes de que nadie lo mirara (log §85). Lo vigila
`tests/log-numbering.test.ts`; si salta, renumera la sección que **no** esté en
`main` y con ella **todas** sus referencias (`grep -rn "§NN"`), que es la mitad
que se olvida.

Lo hace **el agente**, no el fundador. Documentación que depende de que un
humano se acuerde es documentación que se pudre.

---

## Standard Commands

```bash
# Preflight
git switch main && git pull origin main
git status --short && git log --oneline -8
bash scripts/agentic-handoff-check.sh

# Validation
pnpm test
pnpm run validate
git diff --check
bash scripts/agentic-handoff-check.sh

# Agentic user pilot (against the PR's Vercel preview)
pnpm pilot --url https://<preview>.vercel.app
pnpm pilot:selfcheck    # proves the pilot harness can still pass AND fail
```

---

## Design Reference

`GEO Suite-2.zip` is the UX/UI source of truth (`docs/design-reference/`),
including its "Lumira"-named prototype files — those are historical design
assets and are not renamed. Do not blindly paste prototype code. Do not
introduce prototype-only state as real product behavior. The public product
name is GenScore, not the prototype's "Lumira" naming (see top of this file).

**Brand identity history.** `docs/brand/brand-guidelines.md` is the identity
system (logo, palette, typography, usage rules). `docs/brand/
design-decisions-log.md` is the running, per-zone historical log of layout/UX
decisions already implemented and approved (landing, consola general,
cabeceras/menú, Overview, and future zones/screens). Before proposing or
implementing anything that touches brand/layout/navigation, check that log
first — do not reopen or silently contradict a decision already recorded
there. When a design/brand phase ships, add an entry to that log in the same
PR (what was decided, why, what's still pending or known-broken) — mark
superseded decisions as such rather than deleting them, mirroring how
`docs/adr/` handles technical decisions.

---

## GitHub / Agentic Reporting

Every PR must contain or trigger:

- linked issue; summary; validation; scope guard;
- `<!-- agentic:claude-qa-handoff -->` comment;
- `<!-- agentic:claude-qa-result -->` comment;
- clear Human Gate status.

**QA execution model:** Claude QA is run by the `qa` specialist subagent
(`.claude/agents/qa.md`) invoked by the Director. It does NOT use GitHub
Actions or the Anthropic API key. `.github/workflows/claude-qa.yml` and
`scripts/run-claude-qa.py` **fueron borrados** en PRELAUNCH-HARDENING-1 Fase 0
(2026-08-09): llevaban meses declarados superseded aquí mismo y seguían
armados con `pull_request_target` y una ruta que consumía `ANTHROPIC_API_KEY`.
El *handoff* sí sigue vivo y sigue siendo obligatorio
(`claude-qa-handoff.yml` + `scripts/{generate,post}-claude-qa-handoff.sh`):
es lo que publica el comentario de las dos líneas de arriba.

**CI (desde 2026-08-09):** `.github/workflows/ci.yml` ejecuta `pnpm test`,
`pnpm run typecheck` y `pnpm run lint` en cada PR. No ejecuta `next build`
a propósito — lo hace Vercel en cada preview y duplicarlo sólo dobla el paso
más lento. El self-check del piloto **no** está en ese workflow: excedió 25
minutos dos veces, así que vive en `.github/workflows/pilot-selfcheck.yml` con
`workflow_dispatch` + `schedule` semanal (log §42). **Su primera pasada real
(2026-08-09) tardó 14 min y FALLÓ**, y sigue rojo: no es una garantía activa
todavía. Detalle y diagnóstico en log §44.

---

## Index of Agent and Documentation Files

### Agents (`.claude/agents/`)

| File | Role |
|---|---|
| `director.md` | **Primary interface** — strategy, criticism, orchestration, quality |
| `task-intake.md` | Prompt optimizer, Task Intake Reports |
| `geo-strategy.md` | GEO methodology, metrics, recommendations |
| `core-flow.md` | End-to-end user journey |
| `gemini-pipeline.md` | Gemini execution and scan persistence |
| `data-guardian.md` | Schema, RLS, auth, data integrity (plan mode) |
| `ux-alignment.md` | Design reference comparison, gap lists (plan mode) |
| `frontend.md` | Next.js UI implementation |
| `qa.md` | Static regression gate before Human Gate |
| `ux-pilot.md` | **Agentic user test** — drives the real preview as a user before Human Gate |
| `test-architect.md` | Test strategy and Vitest coverage |
| `reliability.md` | Scan lifecycle, stuck scans, timeouts, cancellation |
| `platform-deploy.md` | Vercel config, env vars, model pinning |
| `release.md` | GitHub workflow, PRs, merge safety |
| `growth-content.md` | Organic-acquisition content: blog, docs/comparativas/glosario (GROWTH-2), marketing copy, lifecycle emails |
| `seo-geo-research.md` | SEO/GEO market research — what to write next, prioritized briefs (plan mode) |

### Path-scoped rules (`.claude/rules/`)

| File | Paths |
|---|---|
| `supabase.md` | `supabase/**`, `lib/supabase/**` |
| `gemini.md` | `lib/llm/**` |
| `server-actions.md` | `app/**/actions.ts` |
| `competitors.md` | `app/dashboard/projects/*/competitors/**`, `lib/competitors/**` |
| `recommendations.md` | `app/dashboard/projects/*/recommendations/**`, `lib/recommendations/**` |
| `web-audit.md` | `app/dashboard/projects/*/web-audit/**`, `lib/web-audit/**` |
| `citations.md` | `app/dashboard/projects/*/citations/**`, `lib/citations/**` |
| `scan.md` | `lib/scan/**` |
| `scoring.md` | `lib/scoring/**` |
| `growth-content.md` | `app/{blog,comparativas,docs,glosario}/**`, `lib/{blog,comparativas,docs,glosario}/**` |
| `onboarding.md` | `components/product-tour.tsx`, `components/tour-provider.tsx`, `lib/onboarding/**` |
| `mission-rocket.md` | `components/scan-mission-rocket.tsx`, `components/not-found-mission.tsx`, `lib/scan/mission-beats.ts` |
| `styles.md` | `app/globals.css`, `app/console.css` |
| `admin.md` | `app/admin/**`, `app/mfa/**`, `lib/admin/**` |

### Documentation (`docs/`)

| File | Purpose |
|---|---|
| `director-strategy.md` | Long-term roadmap (H1/H2/H3), active work, completed phases |
| `launch-plan.md` | **Commercial launch roadmap** — ordered phases + status ledger. Any session doing launch work MUST read it first and update its ledger in the same PR |
| `content-strategy.md` | GROWTH-2 organic content architecture (5 layers), SEO+GEO writing rules, cadence |
| `content-calendar.md` | GROWTH-2 content ledger — one row per piece, updated in the same PR that ships it |
| `environment-contract.md` | All env vars, Vercel config, smoke checklist |
| `scan-lifecycle.md` | Scan state machine and invariants |
| `llm-cost-analysis-2026-08.md` | **Coste real de LLM por motor y por escaneo** — medido, con las queries. Decisiones tomadas sobre reparto de muestras y por qué OpenAI no se recorta. Leer antes de tocar pricing, `sampling.ts` o el conjunto de motores |
| `adr/0001-record-architecture-decisions.md` | ADR process |
| `adr/0002-gemini-model-pinning.md` | Gemini model pinned to versioned id |
| `adr/0003-sync-scan-execution-and-maxduration.md` | Sync scans + maxDuration=60 |
| `agentic-user-pilot.md` | **Agentic user test** — how the pilot runs, verdicts, scope guard, limits |
| `agentic-*.md` | Existing agentic pipeline docs (handoff, QA, delivery) |

---

## Final Instruction

Move fast, but never fake progress.

If the product is broken, say exactly where and why.

If the design cannot be matched safely in one PR, split the work.

If a change requires backend/schema work, stop and ask for an explicit backend
phase.

The goal is not to produce lots of PRs. The goal is to make GEO Studio actually
work and look like the intended product.
