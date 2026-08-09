# PRELAUNCH-HARDENING-1 — Plan de refactorización, revisión de arquitectura y verificación E2E

**Estado: APROBADO por el fundador (2026-08-09).** Se ejecuta fase a fase, cada
una con su Human Gate. Progreso: **Fase 0 ✅ hecha** (log §41) · Fases R/Q/P/A
pendientes. La Fase P1 (UX-PILOT-4) sigue necesitando su aprobación propia de
excepción de escritura del piloto, como UX-PILOT-2/3.

**Origen:** petición del fundador (2026-08-09): antes de lanzar GenScore al
mercado, plantear (1) un plan de refactorización y revisión de arquitectura
que garantice que lo construido PR a PR es robusto y escala, y (2) una batería
de pruebas — QA técnico y pilotos de usuario extremo a extremo, incluida el
alta de un dominio nuevo y el recorrido de todas las pantallas.

**Método:** tres barridos de solo-lectura sobre el repo (2026-08-09):
inventario de arquitectura y acoplamiento, mapa de cobertura de tests
(Vitest + piloto), e inventario de deuda documentada (ADRs 0014–0038,
`design-decisions-log.md`, `launch-plan.md`, specs). Cada afirmación de este
plan es trazable a código o a un documento del repo.

---

## 1 · Diagnóstico

### Lo que está bien (y el plan debe preservar, no reescribir)

- **Server actions finas con patrón `*Core` + `*InputSchema`** en 8 módulos;
  zod en todas las fronteras de confianza (rutas API, acciones).
- **Tipado disciplinado**: 5 `any` en todo el código no-test, 1
  `@ts-expect-error`, 1 `eslint-disable`.
- **~1.750 casos de Vitest en 130 ficheros**, con buena cobertura del
  pipeline de escaneo, scoring, web-audit y billing (lógica).
- **Piloto agéntico con self-check** que demuestra que puede fallar
  (overflow, empty-state, shell-clip), allow-list de journeys por
  configuración y guardas estructurales de escritura.
- **Deuda inline casi nula**: 1 solo `TODO` real en el código; toda la deuda
  vive documentada en `docs/`, que es exactamente donde debe vivir.

**Conclusión de arquitectura: no hace falta (ni conviene) una reescritura.**
Lo que hace falta es una serie de extracciones mecánicas que reduzcan los
puntos únicos de fallo, más una red de seguridad de CI que hoy no existe.

### Los riesgos reales, por orden de gravedad

| # | Riesgo | Evidencia |
|---|--------|-----------|
| 1 | **Ningún test corre en CI.** No hay workflow que ejecute `pnpm test` ni `pnpm run validate` en PRs: los 1.750 tests son consultivos — un PR que los rompa todos mergea en verde. La única señal automática por PR es el piloto (navegador) y el build de Vercel | `.github/workflows/**` (0 menciones a vitest/test/lint/typecheck) |
| 2 | **Un workflow superseded sigue armado.** `claude-qa.yml` dispara con `pull_request_target` (permisos de escritura) e invoca `scripts/run-claude-qa.py`, que CLAUDE.md declara "superseded, should not be used". Superficie de ataque viva sin función | CLAUDE.md §QA execution model |
| 3 | **El flujo de alta (registro → nuevo dominio → primer escaneo → Overview con datos) no lo recorre ningún test automatizado de principio a fin.** El bootstrap del piloto de escritura solo lo ejerce en cuenta fría (nunca, en la práctica: `PILOT_WRITE_PROJECT_ID` está pineado en el workflow) y no espera a que el primer escaneo termine. `/signup`, `/signup/confirm`, `/forgot-password`, `/pricing` y `/dashboard/billing` no tienen journey ninguno | informe de cobertura §2–3 |
| 4 | **Dos god-files concentran el producto**: `lib/scan/executor.ts` (1.471 líneas, 21 imports externos, es el hub de todo) y `lib/llm/gemini.ts` (1.228 líneas: un cliente de proveedor que además contiene 8 features de producto). En `app/`, `web-audit/page.tsx` tiene 1.896 líneas con ~24 componentes inline | inventario de arquitectura §1 |
| 5 | **Helpers de seguridad duplicados a mano**: `sanitizeField` copiado byte a byte en 3 ficheros; el andamiaje HTTP de los 3 proveedores LLM triplicado (difieren en 1 línea); la comprobación `Bearer ${SECRET}` re-implementada en 5 rutas (comparación no constant-time); el scoping `owner_user_id` repetido en 57 sitios de 22 ficheros sin helper | inventario §3 |
| 6 | **Sin tipos generados de Supabase**: 47 call-sites de `.from()` tipados a mano; los 14 `as unknown as` se concentran justo donde se leen columnas JSONB. `lib/types.ts` (29 líneas) tiene cero importadores | inventario §4 |
| 7 | **Entorno sin validar**: 55 variables leídas en 35 ficheros, sin `lib/env.ts` ni validación de arranque. Una `CRON_SECRET` ausente degrada a un bucle de 401 silencioso, no a un error de deploy | inventario §6; `docs/environment-contract.md` |
| 8 | **Email, auth y creación de proyecto sin tests**: `lib/email/transactional.ts` (631 líneas, todos los emails), `lib/auth.ts`, `middleware.ts`, y `createProject` (~210 líneas dentro de la action, sin `*Core` extraído — deuda ya anotada en ADR 0022) | informe de cobertura §1 |
| 9 | **El piloto depende de un solo proyecto auto-descubierto** (el primero de la cuenta, que además es el que muta el seed de auditoría), y `second-project.spec.ts` no declara `ContentExpectation` — puede pasar en verde sobre dos proyectos vacíos, el mismo fallo del 2026-08-02 que motivó `ContentExpectation` | informe de cobertura §2, punto 7–8 |
| 10 | **Acoplamiento en estrella sobre `lib/scan`**: 6 dependencias mutuas entre módulos porque el vocabulario compartido (`scan/types.ts`, `scan/constants.ts`) vive en un directorio de feature; 2 ciclos reales (solo-tipo) dentro de `lib/web-audit` | inventario §2 |

Además, deuda ya documentada que este plan **no re-descubre sino que
secuencia** (fuentes: ADRs y log): dispatch de auditoría sin comprobar
`response.ok` (ADR 0037, propuesto no arreglado), fuga del rate-limit de
auditoría R3a (ADR 0035, "queda anotado, no arreglado"), tarjetas de dominio
y digest publicando score de último run en vez de la mediana K=3 (ADR 0036,
"hueco declarado"), `/debug` sin gate de operador (log §32, diferido por el
fundador "hasta publicar la web" — **lanzar ES publicar la web**), y el
deadline duro **MODEL-PIN 2026-10-16** (cutover de gemini-2.5-flash).

---

## 2 · El plan, por fases

Reglas de ejecución que aplican a todo el plan:

- **Una fase = uno o más PRs pequeños**, cada uno con `pnpm test && pnpm run
  validate` en verde, piloto en su preview cuando toque UI, y Human Gate
  manual. Máximo 3 PRs abiertos (BUILD-BUDGET-1).
- **Refactor = comportamiento idéntico.** Cada slice de la Fase R se hace con
  los tests existentes como red; si un slice necesita cambiar un test, es que
  no era un refactor y se para.
- **Nada de la lista Forbidden** sin su propia aprobación: aquí no hay
  migraciones de esquema, ni cambios de RLS, ni billing, ni motores nuevos.

### Fase 0 — RED DE SEGURIDAD (P0 — antes que cualquier refactor)

Refactorizar sin CI de tests es conducir sin frenos. Esta fase es barata,
no toca producto, y multiplica la seguridad de todo lo demás.

- **0a · Workflow de CI `ci.yml`**: en cada PR, `pnpm test` + `pnpm run
  typecheck` + `pnpm run lint` (el `next build` ya lo hace Vercel; no
  duplicarlo en Actions ahorra los minutos que preocupan a BUILD-BUDGET-1).
  Check obligatorio antes del Human Gate.
- **0b · Retirar el QA superseded**: borrar `.github/workflows/claude-qa.yml` y
  `scripts/run-claude-qa.py`. CLAUDE.md ya los declara muertos y seguían
  armados con permisos de escritura y una ruta que consumía
  `ANTHROPIC_API_KEY`.

  > **Corrección al escribir esto (2026-08-09), ya aplicada.** La versión
  > original de este punto añadía `claude-qa-handoff.yml` y los dos
  > `*-claude-qa-handoff.sh`. Era un error: CLAUDE.md sólo declara superseded
  > el workflow de ejecución y el script de Python, y el comentario
  > `<!-- agentic:claude-qa-handoff -->` sigue siendo obligatorio en todo PR —
  > lo publican exactamente esos scripts. Borrarlos habría roto un requisito
  > vigente. También estaba sobredimensionada la razón ("supply-chain viva"):
  > ambos workflows hacen checkout de la base de confianza y nunca ejecutan
  > código del head.
- **0c · `pnpm pilot:selfcheck` en CI** (corre contra fixtures locales, no
  gasta preview): hoy no corre en ningún sitio, así que una regresión del
  arnés del piloto solo se descubriría cuando un PASS deje de ser creíble.
  Implementado **con condición de rutas** (`tests/pilot/**`, `scripts/pilot*`,
  `playwright.config.ts`, dependencias y el propio `ci.yml`): descarga
  Chromium, y correrlo en cada PR gastaría minutos de Actions —
  BUILD-BUDGET-1— para reprobar algo que sólo cambia cuando cambia el arnés.

*Criterio de salida: un PR con un test roto no puede llegar al Human Gate en
verde.*

### Fase R — REFACTOR SEGURO (slices ordenados por riesgo × coste)

Cada slice es un PR independiente y mecánico. Orden propuesto:

- **R1 · Helpers de seguridad únicos** (1 PR): `sanitizeField` →
  `lib/text/sanitize.ts` (borrar las 3 copias); `withCronAuth()` /
  `withInternalSecret()` con comparación constant-time para las 5 rutas
  internas; `delay`/`fetchWithTimeout` únicos.
- **R2 · `lib/llm/http.ts`** (1 PR): transporte común de los 3 proveedores
  (timeout, retry, headers, clases de error). `openai.ts` y `claude.ts`
  difieren hoy en una línea; cada motor nuevo (Perplexity está en el
  roadmap) hoy triplicaría la copia.
- **R3 · Tipos generados de Supabase** (1 PR): `supabase gen types` +
  adopción en los 47 call-sites de `.from()`. Es la palanca de tipado más
  rentable del repo y es codegen, no reescritura. Borra `lib/types.ts`
  (muerto) y debería eliminar la mayoría de los 14 `as unknown as`.
- **R4 · `lib/env.ts` validado con zod** (1 PR): las 55 vars, con
  `docs/environment-contract.md` como spec (ya describe cada una). Falla en
  arranque/build con mensaje claro en vez de degradar en silencio.
- **R5 · Trocear `lib/llm/gemini.ts`** (1–2 PRs): `gemini-client.ts`
  (transporte, sobre R2) + los 8 usos de producto repartidos a sus módulos
  dueños (`suggestCompetitors` → `lib/competitors/`, `suggestPrompts` →
  `lib/projects/`, `rewriteRecommendation` → `lib/recommendations/`, etc.).
- **R6 · Descargar `lib/scan/executor.ts`** (1–2 PRs): extraer
  `processPromptJob` (L91–418) a `lib/scan/prompt-job.ts`; mover
  `scan/types.ts` + `scan/constants.ts` a `lib/domain/` (rompe las 6
  dependencias mutuas sobre `lib/scan`); `web-audit/types.ts` para los 2
  ciclos solo-tipo. La regla de ruta `scan.md` aplica entera: son mudanzas,
  no cambios de lógica.
- **R7 · Páginas** (2 PRs): extraer los ~24 componentes inline de
  `web-audit/page.tsx` a `web-audit/_components/`; Overview pasa a usar
  `requireActiveProject` como todas las demás páginas (hoy es la única con
  ownership check artesanal junto a un `createServiceClient()`); arreglar el
  import de `getLLMScanProviders` desde `executor` cuando existe
  `providers.ts` justo para eso; unificar `setRecurringScans`/`setAutoWebAudit`.
- **R8 · Limpieza de muertos** (1 PR pequeño): `lib/supabase/client.ts` (0
  importadores — confirmar que es intencional que no haya cliente browser),
  `lib/web-audit/action-plan.ts` (huérfano shipped: decidir re-conectar o
  retirar con nota en el ROADMAP), `updateProfileName` huérfano (log §38).

*Explícitamente fuera de la Fase R:* consolidar los 3 workflows
`ux-pilot*.yml` (672 líneas casi duplicadas) — deseable, pero tocar el
arnés del piloto a la vez que se refactoriza el producto mezcla dos riesgos;
que sea un PR propio tras la Fase P.

*Criterio de salida por slice: diff de comportamiento nulo (tests intactos en
verde, piloto PASS en las pantallas afectadas), tamaño del hub reducido de
forma medible.*

### Fase Q — QA TÉCNICO (huecos de test, por riesgo de lanzamiento)

- **Q1 · `createProject` → `createProjectCore` + tests**: es EL flujo de
  lanzamiento (alta de dominio) y son ~210 líneas sin ningún test (deuda
  anotada en ADR 0022). La extracción sigue el patrón `*Core` ya establecido.
- **Q2 · Emails transaccionales**: tests de `lib/email/transactional.ts` y
  `resend.ts` (render de los 8+ emails, destinatarios, la regla "alertas de
  operador nunca al cliente" de `scan.md`).
- **Q3 · Rutas cron y de continuación**: tests a nivel de ruta (auth, kill
  switch, límites de chainIndex) para `weekly-scans`, `weekly-digest`,
  `sweep-continue`, `scan/continue` — la lógica interna ya está testeada; lo
  que no hay es detector de una regresión de cableado que apagaría todo el
  escaneo recurrente tras el lanzamiento.
- **Q4 · Frontera auth/tenancy**: tests de `middleware.ts`, `lib/auth.ts`,
  `lib/account-role.ts` y de los 7 sitios de `app/` que usan
  `createServiceClient()` (que el ownership manual que RLS no cubre esté
  efectivamente comprobado en cada uno).
- **Q5 · Arreglos del arnés del piloto** (baratos, de alto retorno):
  `ContentExpectation` en `second-project.spec.ts` (hoy pasa sobre proyectos
  vacíos); el input `pr_number` de `ux-pilot-write.yml` tipado como string
  (bug de coerción 289→"289.0"); y **la sesión compartida que no sobrevive a
  las tres anchuras** — hallazgo real del 2026-08-09 (log §41): las tres
  anchuras comparten un `storageState` capturado una sola vez y corren en
  secuencia, y en la última (desktop) toda pantalla autenticada rebota a
  `/login`. Un gate que cae por su propio arnés enseña a ignorar los rojos,
  que es exactamente lo que la Fase 0 intenta evitar. Requiere reproducir
  antes de arreglar: la hipótesis (rotación del refresh token de Supabase
  entre contextos) no está probada.

### Fase P — PILOTO E2E EXTREMO A EXTREMO (lo que pediste, con nombre y guardas)

Lo que pides — "crear un dominio nuevo, recorrer todas las páginas y
verificar contra la definición" — hoy está **fuera del alcance aprobado del
piloto** (el write-scope solo permite el proyecto reservado `mozilla.org`, y
el bootstrap ni espera al primer escaneo). Propongo formalizarlo como
**UX-PILOT-4 (journey cold-start)**, tercera excepción de escritura, con las
mismas guardas estructurales que las dos ya aprobadas:

- **P1 · UX-PILOT-4 — journey de alta completa** (`--journeys coldstart`,
  `workflow_dispatch` only, jamás por deploy):
  1. Crea un proyecto nuevo sobre un **segundo dominio reservado**
     (`PILOT_COLDSTART_DOMAIN`, dominio público estable tipo `wikipedia.org`,
     match exacto, nunca auto-descubrimiento) recorriendo el wizard real:
     dominio → competidores sugeridos (asserts: llegan sugerencias, son
     editables) → prompts sugeridos (recortados a 1 — coste acotado: ~1
     llamada LLM por escaneo, igual que el write-project).
  2. **Espera a que el primer escaneo termine de verdad** (pending → done,
     con el timeout del set `scan`) — hoy nadie asserta esto.
  3. Verifica Overview **con datos reales del escaneo recién hecho**
     (`ContentExpectation`, no pantalla vacía).
  4. Recorre las 8 pantallas del proyecto recién nacido (Overview, Prompts,
     Competidores, Recomendaciones, Citas, Auditoría, Escaneos, Ajustes) en
     los 3 anchos — el estado "proyecto de 1 escaneo" es una forma de datos
     que el proyecto veterano del piloto ya no puede producir.
  5. **Se limpia**: archiva/elimina el proyecto al final (idempotente: si un
     run anterior murió a medias, el siguiente barre antes de crear).
     Nota: el hard-delete de proyectos ya está shipeado (DATA-MGMT-1), pero
     darle ese poder al piloto es nuevo — si prefieres, la v1 archiva en vez
     de borrar y el borrado queda manual.
- **P2 · Journeys de lectura nuevos** (van al set por-deploy, son navegación
  pura): `/pricing` (que la promesa siga siendo verdad es un check permanente
  de QA), `/signup` + `/forgot-password` (render + overflow en 3 anchos; el
  loop real de email de confirmación sigue siendo smoke manual — no hay
  buzón), `/dashboard/settings` → sección Plan/billing en estado Free y de
  pago.
- **P3 · Matriz de definición ↔ pantalla**: tabla en
  `docs/agentic-user-pilot.md` que mapee cada pantalla a su fuente de verdad
  (regla de ruta, §log, ADR) y a su journey — para que "verificar contra la
  documentación" sea un checklist ejecutable del `ux-pilot` y no una frase.
- **P4 · Ronda de ejecución**: con P1–P3 mergeados, una pasada completa:
  `coldstart` + `read` + `write` + `scan` (2 escaneos máx sobre el proyecto
  pineado, UX-PILOT-3) + veredicto del agente `ux-pilot` con sus mínimo 3
  propuestas. Lo que salga alimenta la lista de flecos pre-lanzamiento.

*Restricción conocida: el runner remoto de Claude no llega a `*.vercel.app`
(log §7), así que P4 corre desde GitHub Actions (como hoy el piloto) o desde
tu sesión local.*

### Fase A — REVISIÓN DE ARQUITECTURA: decisiones que son tuyas, no mías

No son refactor; son huecos ya documentados que el lanzamiento reprioriza.
Los listo con recomendación para que decidas cuáles entran:

1. **`/debug` con gate de operador** (`OPS_USER_EMAILS` + 404): lo diferiste
   "hasta publicar la web" — lanzar es publicar. Recomiendo: entra. (log §32)
2. **`triggerWebAuditRun` sin comprobar `response.ok`**: el mismo agujero que
   ADR 0037 cerró para escaneos, ya propuesto. Recomiendo: entra (es
   pequeño y es la regla "a dispatch is delivered only if the response says
   so"). (ADR 0037)
3. **Fuga R3a del rate-limit de auditoría** (discriminador `source`
   `'manual'|'cron'`): toca datos → necesita su propio mini-Task Intake.
   Recomiendo: entra antes del lanzamiento — un "límite alcanzado" fantasma
   es exactamente lo que un cliente nuevo reporta como bug. (ADR 0035)
4. **ADR 0036 — tarjetas de dominio y digest con score de último run** que
   puede contradecir la mediana del Overview: decisión de producto pendiente.
   Recomiendo: unificar a la mediana K=3 antes de tener clientes que lo vean.
5. **MODEL-PIN (deadline 2026-10-16)**: no es de esta fase, pero el plan lo
   agenda: PR de migración de modelo la semana del 2026-10-01 como tarde.
6. **Techo de escala de ASYNC-SCAN-1** (30 clientes Pro × diario no cabe en
   el pipeline actual): no bloquea lanzar; bloquea el primer mes con
   tracción. Recomiendo: dejarlo explícitamente fuera de este plan y
   re-evaluar con datos reales de D1 (las 3–5 agencias).
7. **Alias de marca sin UI (Fase −1c de ADR 0032)**: la mayor fuente restante
   de "número equivocado publicado con confianza". Es feature, no refactor —
   fuera de este plan, pero es mi candidato #1 para justo después.

### Qué NO incluye este plan (para que nadie lo estire)

Sin su propia aprobación explícita, aquí no entra: migraciones de esquema ni
RLS (salvo el mini-intake del punto A3 si lo apruebas), billing/Stripe,
motores nuevos, scheduler, teams/RBAC, recalibración de scoring (ADR 0031
sigue bloqueada por datos), backfills históricos (ADR 0018/0029), ni ningún
ítem de los Bloques A/B/C/D del launch plan que es tuyo (alta, VeriFactu,
claves live, revisión legal, sourcemaps de Sentry, funnel de PostHog).

---

## 3 · Orden recomendado y tamaño

```
Fase 0 (1 PR)  ──►  Fase R: R1+R2 (1 PR) → R3 (1 PR) → R4 (1 PR)
                         → R5 (1–2) → R6 (1–2) → R7 (2) → R8 (1)
Fase Q (2–3 PRs, puede solaparse con R desde R3)
Fase P (2 PRs de código + 1 ronda de ejecución; P1 necesita su Task
        Intake de excepción de escritura — puede aprobarse con este plan)
Fase A (los puntos que apruebes, 1 PR pequeño cada uno)
```

Total estimado: **13–17 PRs pequeños**, ninguno mezclando concerns,
respetando el tope de 3 abiertos a la vez y un push por iteración pilotable.
Fase 0 es la única con urgencia absoluta: cada PR que mergea sin CI de tests
es una tirada de dados que ya no hace falta tirar.

## 4 · Criterios de aceptación globales

1. CI ejecuta tests+typecheck+lint en cada PR y es check obligatorio.
2. Ningún fichero no-test de `lib/` supera ~700 líneas; `executor.ts` y
   `gemini.ts` quedan por debajo de la mitad de su tamaño actual.
3. Cero copias de `sanitizeField`; una sola implementación de auth de rutas
   internas; tipos de BD generados en uso; `lib/env.ts` validando arranque.
4. El flujo alta → primer escaneo → Overview con datos tiene un journey
   automatizado que lo recorre y lo asserta de principio a fin.
5. Todas las pantallas públicas y de consola tienen journey con
   `ContentExpectation` (o su exclusión documentada con motivo).
6. `pnpm test && pnpm run validate` en verde en cada PR; piloto PASS (o
   INCONCLUSIVE justificado pantalla a pantalla) antes de cada Human Gate.
7. Cierre documental en cada PR que toque un invariante (histórico, regla de
   ruta, mapa de zonas), como manda CLAUDE.md.

---

> **Do you approve this plan? I will not implement until you confirm.**
> La aprobación puede ser por fases (p. ej. "Fase 0 sí, ya" y el resto
> tras discutir la Fase A). La Fase P1 (UX-PILOT-4) incluye una excepción
> nueva de escritura del piloto y requiere tu aprobación explícita aparte,
> igual que UX-PILOT-2/3.
