# ACTIONS-OBSERVABLE-1 — slices 4b, 4c y 4d

Plan de ejecución de lo que queda de la **Fase 4** del plan de la auditoría
externa (`docs/external-audit-2026-08.md`, P0-04: "ninguna acción silenciosa").
El Task Intake de la fase entera lo aprobó el fundador el 2026-09-06 con el
reparto en cuatro slices; **4a está mergeada** (2026-09-07, log §203).

Este documento existe porque el reparto de 4c y 4d **no quedó escrito en ningún
sitio del repositorio**. El log §203 dice "cuatro slices (4a-4d)" y sólo detalla
4a y 4b: si aquella conversación decidió qué eran 4c y 4d, se perdió. Lo que
sigue reconstruye los dos a partir de los entregables que la Fase 4 sí tiene
escritos, y lo dice en vez de presentarlo como transcripción.

> **Nota de procedencia.** `docs/external-audit-2026-08.md` y
> `docs/agentic-blind-spots-2026-08.md` viven **sólo** en la rama
> `claude/chatgpt-audit-ux-issues-q8x37s` (PR #483, sin mergear desde el
> 2026-08-27). Una sesión que arranque desde `main` no puede leerlos. Por eso
> este fichero cita literalmente lo que necesita en vez de remitir a ellos.

---

## Estado de partida (verificado en `main`, 2026-09-08)

La Fase 0 (`AUDIT-REPRO-1`, log §187) clasificó las **seis** acciones de
Recomendaciones. Estado real hoy:

| # | Acción | Clasificación Fase 0 | Slice | Estado |
|---|---|---|---|---|
| 1 | Generar FAQ | `invisible` | 4a | ✅ mergeada |
| 2 | Generar brief | `invisible` | 4a | ✅ mergeada |
| 3 | Generar comparativa | `invisible` | 4a | ✅ mergeada |
| 4 | Marcar como hecho | `real`, sin deshacer | 4a | ✅ mergeada |
| 5 | **Exportar plan** | `real` | **4b** | ❌ pendiente |
| 6 | **Activar seguimiento recurrente** | `invisible` | **4b** | ❌ pendiente |

Las tres primeras son **un solo botón** cuyo texto cambia por tipo de
recomendación (`lib/recommendations/deliverable.ts`), así que 4a las cerró de
una vez a través de `handleRewrite`.

**Lo que 4a dejó construido y hay que reutilizar, no reinventar:**

- `lib/ui/action-feedback.ts` — reducer puro `idle | pending | success | error`.
  Sin DOM, testeable.
- `components/ui/action-feedback.tsx` — el hook `useActionFeedback` (envuelve el
  reducer con `useTransition`) y `ActionAnnouncement` (pinta el acuse con
  `role="status"` + `aria-live="polite"`).
- La regla de ruta ya escrita: `.claude/rules/recommendations.md`, sección
  "Contrato de acción" — *"Cualquier acción nueva en esta pantalla usa el mismo
  hook en vez de un `useState`+`useTransition` propio."*

---

## Slice 4b — las dos acciones que faltan

### 4b.1 · "Exportar plan"

**Dónde.** `app/dashboard/projects/[projectId]/recommendations/recommendations-client.tsx`:
`handleExport` (líneas ~1397-1432) y su botón (~1519-1528).

**Qué hace hoy, leído del código.** Construye el markdown en un array de
líneas, crea un `Blob`, un `<a download>`, lo pulsa y lo retira. Es
**totalmente cliente**: no hay server action, no hay `await`, no hay rama de
error, y no pasa por `useActionFeedback`. Si la descarga se bloquea —política
del navegador, un visor incrustado, un sandbox— **no ocurre nada visible**, que
es exactamente el síntoma que P0-04 describe: un bloqueo silencioso es
indistinguible de un botón muerto.

**Entregables.**

1. **Extraer el constructor de markdown a un módulo puro** —
   `lib/recommendations/export-plan.ts`, con su test. Hoy es un closure dentro
   del componente y no se puede probar sin navegador. Misma disciplina que
   `lib/ui/action-feedback.ts` frente a su hook, y que
   `lib/onboarding/tour-steps.ts` frente al suyo.
2. **Salida alternativa: modal con el markdown y "Copiar al portapapeles"**,
   como pide el entregable de la Fase 4 literalmente. La descarga se mantiene;
   el modal es la salida que sobrevive a un entorno que la bloquea.
3. **Pasar la acción por el contrato.** Aquí hay **una decisión de diseño real**
   que quien ejecute tiene que tomar conscientemente: `useActionFeedback.run`
   espera `() => Promise<ActionResult>`, y ésta es la **primera acción
   puramente de cliente** que entra al contrato — todas las de 4a eran server
   actions. Dos salidas posibles:
   - envolver `handleExport` en un `async` que devuelva `{ success: true }` y
     capture el fallo en `{ success: false, error }`; o
   - ampliar el contrato con un camino síncrono.
   **Recomendación: la primera**, sin tocar `lib/ui/action-feedback.ts`.
   Ampliar el contrato en su segundo consumidor es demasiado pronto para saber
   qué forma quiere, y el reducer es hoy la pieza más limpia de 4a.
4. **El acuse dice cuál de las dos salidas ocurrió.** "Plan descargado" y
   "Plan copiado al portapapeles" son hechos distintos; un acuse único mentiría
   sobre uno de los dos.

**Criterio de aceptación.** Con la descarga funcionando, el usuario recibe el
fichero **y** un acuse. Con la descarga bloqueada, recibe el modal y puede
copiar el plan entero. En ningún camino el botón termina en nada.

### 4b.2 · "Activar seguimiento diario"

**Dónde.** `components/data-maturity-banner.tsx` (~líneas 147-153), rama
`state.kind === "no_tracking"`. El banner se monta en
`app/dashboard/layout.tsx:123`, es decir **en las seis pantallas de la
consola** — por eso 4a lo dejó fuera a propósito.

**Qué hace hoy, leído del código.** Un `<form action={setRecurringScans}>` con
un `<button type="submit">` pelado. Sin estado de carga, sin acuse, sin rama de
error.

**Hallazgo que hay que verificar antes de diseñar el arreglo.**
`setRecurringScans` (`app/dashboard/projects/[projectId]/actions.ts:321-356`)
**termina en `redirect()` en todas sus ramas**, y tres de ellas apuntan a
`/dashboard/projects/{id}/debug`:

| Rama | Destino |
|---|---|
| precondición no cumplida | `/dashboard/projects/{id}/debug?error={reason}` |
| fallo de escritura | `/dashboard/projects/{id}/debug?error=recurring_update_failed` |
| **éxito** | `/dashboard/projects/{id}/debug?success=recurring_enabled` |

Es decir: según el código, pulsar "Activar seguimiento diario" desde el banner
de Visión general **lleva al usuario a la pantalla de depuración**. Eso no es
"invisible", es peor. Los destinos son correctos para el otro llamador del
mismo action (el switch de `/debug`, `debug/page.tsx:600`) y equivocados para
éste.

**No lo des por reproducido sin comprobarlo**: `PROJECT-DEFAULTS-BY-ACCOUNT-1`
(log §173) activa `recurring_scans_enabled` sola tras el primer escaneo
completado de una cuenta no excluida, así que la rama `no_tracking` puede ser
hoy inalcanzable para una cuenta real. **Primer paso del slice: determinar si
un usuario real puede llegar a ese banner.** Si no puede, el arreglo sigue
mereciendo la pena (el camino existe y se despertará el día que §173 cambie)
pero su prioridad y su verificación cambian, y eso se escribe en el histórico.

**Entregables.**

1. **Extraer `setRecurringScansCore`** que devuelva un resultado discriminado,
   dejando el action como tabla de traducción. **No es opcional ni es estilo**:
   `.claude/rules/server-actions.md` lo exige literalmente — *"El desenlace se
   DEVUELVE, no se decide con `redirect()`. Una action que ramifica con
   `redirect` no es testeable."* Hoy no hay ni un test que afirme qué decide
   esta action.
2. **El banner usa `useActionFeedback` y se queda donde está.** El acuse
   aparece en el propio banner; nada de navegar a `/debug`.
3. **El switch de `/debug` conserva su comportamiento actual** — su redirección
   a `/debug` sí es correcta, porque ya se está ahí. La traducción a redirect
   vive en el action, el core es compartido.
4. **Tests del core**: precondición no cumplida, fallo de escritura, éxito
   activando, éxito desactivando. Es lo que hoy no existe.

**Criterio de aceptación.** Desde el banner, activar el seguimiento deja al
usuario en la misma pantalla con un acuse; un fallo deja un mensaje propio y
categorizado, nunca un error crudo de Supabase
(`.claude/rules/server-actions.md`). Desde `/debug`, nada cambia.

### Alcance y riesgos de 4b

- **Toca `app/dashboard/layout.tsx` indirectamente** (el banner que monta). Es
  la razón por la que 4a lo evitó: cualquier regresión aquí se ve en las seis
  pantallas. Merece pasada de piloto.
- `DataMaturityBanner` es cliente y `setRecurringScans` es un server action
  importado directamente: comprobar que la extracción del core no rompe esa
  frontera.
- **Sin migración. Sin cambio de esquema. Sin tocar el pipeline.**

---

## Slice 4c — Corrección H: la cobertura no vista, como salida del arnés

**Texto literal de la corrección** (`docs/agentic-blind-spots-2026-08.md`):

> **Corrección H — La cobertura no vista es una salida del piloto, no una
> promesa.** Cada pasada emite la lista de controles que existían en la página
> y **no** ha ejercitado, y de pantallas alcanzables que no ha visitado. Un
> `PILOT PASS` con esa lista vacía es raro y sospechoso; con la lista llena es
> honesto y accionable.

**Por qué sigue pendiente aunque parezca hecha.** La regla **ya está escrita en
`CLAUDE.md`** (sección "Agentic User Pilot", párrafo "La cobertura no vista es
una salida del piloto, no una promesa"). Pero el arnés no emite nada: verificado
el 2026-09-08, no hay ninguna lista de controles no ejercitados ni de pantallas
no visitadas en `.pilot/summary.md` ni en `.pilot/report.json`. Es exactamente
lo que la propia corrección denuncia — *"existe hoy como prosa en el Human Gate,
no como salida del arnés"*. Una regla que sólo un humano puede cumplir se
incumple en silencio.

**Entregables.**

1. **Controles presentes y no ejercitados.** El barrido de interacciones ya
   escribe `.pilot/interactions.jsonl`; el inventario de controles de la página
   es el otro lado del diff. Emitir la diferencia, por pantalla.
2. **Pantallas alcanzables y no visitadas.** Mismo principio sobre el grafo de
   navegación que el piloto ya recorre.
3. **Las dos listas van en `summary.md`** — el comentario que `ux-pilot.yml`
   publica en el PR — no sólo en el JSON. Si no se ve donde se lee el veredicto,
   no cambia ninguna decisión.
4. **No convierte una lista llena en fallo.** El veredicto no cambia; lo que
   cambia es que el Human Gate pueda verla. Convertirla en `PILOT FAIL`
   automático haría que la primera pasada honesta bloqueara todo.

**Por qué recomiendo hacerla antes que 4d.** Es la más barata de las dos
(sólo arnés, cero riesgo de producto, cero coste de infraestructura) y es la
que hace honesto **todo veredicto de piloto posterior**, incluido el de 4b.

**Criterio de aceptación.** Una pasada cualquiera termina con las dos listas
en su comentario de PR. Una pasada con las dos vacías es sospechosa y el
informe lo dice.

---

## Slice 4d — Corrección C: `--journeys full` semanal

**Texto literal de la corrección** (`docs/agentic-blind-spots-2026-08.md`):

> **Corrección C — Pasada de cliente nuevo, semanal, sobre producción.** Un
> `--journeys full` que recorre el producto entero de un tirón, con las
> aserciones cruzadas de la Corrección B, en `schedule` semanal + antes de cada
> fase de lanzamiento. No sustituye al piloto por PR: mide otra cosa.

**Estado verificado.** `--journeys full` **no existe**. Los conjuntos de hoy son
`read` (por defecto), `write`, `scan` y `actions` (`scripts/pilot.mjs`).
Workflows existentes: `ux-pilot.yml`, `ux-pilot-write.yml`, `ux-pilot-scan.yml`,
`ux-pilot-actions.yml`, `pilot-selfcheck.yml`.

**Este slice NO se puede ejecutar sin dos decisiones del fundador, y por eso va
el último.**

1. **¿Contra producción o contra un preview?** La corrección dice
   literalmente *"sobre producción"*. Pero los conjuntos `write`, `scan` y
   `actions` **escriben** —crean proyectos, lanzan escaneos reales, descartan
   recomendaciones de forma no idempotente (log §187)— y nada de eso está
   aprobado contra producción. `CLAUDE.md` ("Pilot write scope") acota esos
   permisos al proyecto reservado `PILOT_WRITE_DOMAIN`, no a un entorno.
   **Recomendación: `full` = todos los conjuntos de LECTURA de un tirón, contra
   un preview**, y si el fundador quiere producción, que sea sólo lectura y con
   su propia entrada en el histórico.
2. **¿Cuánto cuesta y se acepta?** Una pasada normal son ~6.750 peticiones
   contra el objetivo. `VERCEL-COST-1` Fase 5 (log §199) mató el piloto
   por-deploy precisamente por eso: $18,09 de Observability Events y $24,02 de
   Build CPU en agosto, el 79% de la factura, gasto del bucle agéntico y no de
   clientes. Una pasada semanal es **mucho** más barata que la de por-deploy que
   se retiró, pero la cifra tiene que estar escrita antes de encenderla, no
   después.

**Entregables (una vez decidido lo anterior).**

1. El conjunto `full` en `scripts/pilot.mjs`, con su entrada en el self-check
   —igual que `checkActionsLockout` asegura hoy que `actions` no es alcanzable
   desde el conjunto por defecto.
2. Un workflow con `schedule` semanal **y** `workflow_dispatch`.
3. Su coste medido y escrito en el histórico, no estimado.

**Criterio de aceptación.** Una pasada semanal recorre el producto entero de un
tirón y su coste real está anotado.

---

## Orden recomendado y por qué

**4b → 4c → 4d.**

1. **4b primero** porque es lo único que cierra P0-04 de verdad: es la mitad de
   producto que queda, y las dos acciones son las últimas dos de seis. Además
   es la única que ya está aprobada y acotada sin decisiones nuevas.
2. **4c después** porque es barata, no toca producto, y hace honesto el
   veredicto del piloto de 4b y de todo lo que venga detrás.
3. **4d la última** porque necesita dos decisiones del fundador (entorno y
   coste) y porque, sin 4c, una pasada semanal produciría el mismo `PASS` sin
   cobertura declarada que el plan lleva cinco incidentes intentando evitar.

**Un PR por slice.** `CLAUDE.md` prohíbe juntar concerns, y 4b ya es de por sí
dos superficies (Recomendaciones y el banner de las seis pantallas). Si 4b se
hace grande, se parte en 4b.1 y 4b.2 — están descritas arriba como piezas
independientes precisamente para que se pueda.

## Cierre de fase, para cada slice

Lo que `CLAUDE.md` exige **en el mismo PR** (no en uno posterior):

1. Entrada en `docs/brand/design-decisions-log.md`. **Comprueba el número
   contra `main` justo antes de mergear**: git auto-mergea dos apéndices al
   final del mismo fichero sin un solo marcador de conflicto, y esta semana ha
   pasado tres veces (§85, y de nuevo el 07 y el 08-09).
2. Regla de ruta si el slice establece un invariante:
   `.claude/rules/recommendations.md` para 4b.1,
   `.claude/rules/server-actions.md` para 4b.2, y `docs/agentic-user-pilot.md`
   para 4c/4d.
3. Celda "Última fase cerrada" del mapa de zonas de `CLAUDE.md` — zona
   "Recomendaciones" para 4b, "Proceso agéntico (builds/CI)" para 4c y 4d.
4. Regla de premisa **sólo si el slice retira un camino de recuperación**.
   Ninguno de los tres debería hacerlo; si 4b acaba retirando la redirección a
   `/debug` como salida de error, eso **sí** es un camino que se retira y lleva
   su premisa escrita.

## Actualización pendiente del plan de origen

`docs/external-audit-2026-08.md` (PR #483) tiene una inconsistencia que
conviene resolver cuando esa rama se retome: su tabla resumen de correcciones
asigna **C y H a la "Fase 3"**, mientras que el cuerpo de la **Fase 4** las
reclama como entregables suyos. Este plan las trata como Fase 4 (slices 4c y
4d), que es lo que dice el cuerpo y lo que encaja: los dos entregables que
quedan de la Fase 3 (calendario visible y alertas con umbral) no tienen nada
que ver con el arnés del piloto.
