# Task Intake Report — DOMAINS-REDESIGN-1

**Fecha:** 2026-08-05 · **Tipo:** Intake Full (12 puntos) · **Estado:** pendiente
de aprobación del fundador.

---

## 1. Interpretación de la petición

Escaneos (`/dashboard/projects/[projectId]/runs`) mezcla hoy tres cosas de tres
dueños distintos: una rejilla de dominios (del cliente), un historial de
escaneos con lanzamientos, duraciones, auditoría, deltas y errores (nuestro), y
un interruptor de escaneo diario (nuestro, mientras contenemos coste de Gemini
antes de producción).

El encargo es separarlas en dos pantallas:

- **`/dashboard/domains` — «Dominios».** Pantalla de cliente con un solo
  trabajo: elegir qué dominio se está viendo en toda la consola. Diseño
  aprobado: opción B, «Escenario» — portada del dominio activo (icono grande,
  identidad, puntuación GEO, frescura de escaneo y auditoría, botón «Visión
  general») y raíl inferior para cambiar, que pasa a rejilla a partir de cuatro
  dominios. Sin un solo control de escaneo o auditoría: que se escanee y se
  audite cada día se cuenta con una línea informativa y con la frescura, no con
  interruptores.
- **`/dashboard/projects/[projectId]/debug`.** Pantalla interna con todo lo
  demás, ampliada de lo que hay hoy a siete bloques: motores, salud de
  extracción por categoría, alertas al operador, cola de trabajos, controles,
  historial de escaneos y respuestas con coste/latencia/error.

Diseño aprobado y commiteado en esta misma carpeta
(`pantalla-dominios.html`, `pantalla-debug.html`).

## 2. Evaluación de riesgo y alcance

**Tres riesgos reales, en orden.**

1. **P0 — el driver del primer escaneo.** `AutoExecuteScan` es el componente de
   cliente que **ejecuta de verdad** los lotes de un escaneo pendiente, y está
   montado en **un único sitio del producto**:
   `app/dashboard/projects/[projectId]/runs/page.tsx:510`. `createProject`
   redirige justo ahí tras el onboarding
   (`app/dashboard/projects/actions.ts:351`). Vaciar esa pantalla sin mover el
   driver deja el primer escaneo de cada cliente nuevo en `pending` hasta que lo
   rescate el cron. **No es opcional ni posterior: va en la misma fase.**
2. **P0 latente — `maxDuration` al mover el driver.** `autoExecutePendingScan`
   es una Server Action, y las Server Actions heredan el `maxDuration` de la
   página desde la que se invocan (ADR 0003; comentario en `runs/page.tsx:32`).
   `runs/page.tsx` exporta `maxDuration = 60`; **`app/dashboard/projects/
   [projectId]/page.tsx` (Visión general) no exporta ninguno**. Moverlo sin
   añadir ese `export` haría que cada ventana de lotes muriese al límite por
   defecto de Vercel, en silencio y sólo en producción.
3. **P1 — acceso a `/debug`.** Enciende el escaneo diario, que cuesta dinero, y
   muestra coste en dólares, cola de trabajos y errores del proveedor. No
   enlazarla desde el menú es ocultarla, no protegerla: cualquier cliente que
   escriba la URL entra.

**Riesgo de alcance.** El encargo, entero, es grande: pantalla nueva + siete
bloques + navegación + P0 de pipeline. La propuesta de fases del punto 10 lo
parte por la única línea que no deja nada a medias.

**Deriva de alcance vigilada.** Tres cosas que aparecerán como tentación y que
**no** entran sin decisión aparte: añadir una segunda métrica a la portada
(menciones, cuota de voz — el día que dos pantallas calculen lo mismo por
caminos distintos se contradicen); repintar Visión general «ya que estamos»; y
convertir el interruptor de auditoría en columna de esquema.

## 3. Clasificación

**P0.** Contiene dos bloqueadores del flujo objetivo (driver y `maxDuration`)
dentro de un cambio que por sí solo sería P1 (reordenación estructural de
navegación) más P2 (repintado). El P0 manda: si el rediseño se aprueba pero el
driver no se mueve en el mismo PR, el resultado es peor que no hacer nada.

## 4. Nombre de fase

`DOMAINS-REDESIGN-1`, en dos fases:

- **Fase A** — pantalla nueva, `/debug` con lo que ya existe, estado en
  cabecera, y el P0 del driver.
- **Fase B** — los bloques de `/debug` que necesitan consultas nuevas
  (1 motores, 2 salud de extracción, 3 alertas, 4 cola de trabajos,
  7 respuestas) y la configuración vigente.

## 5. Rama

`claude/redesign-scans-page-6tkano` (la rama designada para este trabajo). Fase
B iría sobre una rama propia partiendo de `main` una vez mergeada la A.

## 6. Ficheros permitidos

**Fase A**

| Fichero | Qué |
|---|---|
| `app/dashboard/domains/page.tsx` | *(nuevo)* la pantalla de cliente |
| `app/dashboard/domains/domains-client.tsx` | *(nuevo, si hace falta cliente)* |
| `app/dashboard/projects/[projectId]/debug/page.tsx` | *(nuevo)* mueve aquí el contenido de `runs/page.tsx` |
| `app/dashboard/projects/[projectId]/runs/page.tsx` | pasa a redirigir a `/debug` |
| `app/dashboard/projects/[projectId]/runs/delete-domain-button.tsx` | se mueve a `debug/` |
| `app/dashboard/projects/[projectId]/page.tsx` | monta `AutoExecuteScan` + **`export const maxDuration = 60`** |
| `app/dashboard/projects/actions.ts` | redirect de `createProject` → Visión general |
| `app/dashboard/projects/[projectId]/actions.ts` | `revalidatePath` de las rutas nuevas |
| `components/sidebar.tsx` | entrada «Dominios»; el bloque de proyecto deja de apuntar a `/runs` |
| `components/scan-state-pill.tsx` | cuarto estado `Auditando` + variante agregada de cuenta |
| `app/dashboard/projects/[projectId]/web-audit/page.tsx` | sustituye su chip `.scan-status` por la pastilla compartida |
| `lib/project-workspace.ts` | frescura con hora, última auditoría por proyecto, delta por `resolveDelta` |
| `lib/domains/account-scan-state.ts` | *(nuevo)* función pura del agregado de cabecera |
| `lib/ops/access.ts` | *(nuevo)* comprobación `OPS_USER_EMAILS` |
| `app/globals.css` | `.dm2-*` y el ancho de columna de la pantalla nueva |
| tests: `lib/domains/account-scan-state.test.ts`, `components/scan-state-pill` (ampliar), `lib/ops/access.test.ts` | |
| `docs/environment-contract.md` | documenta `OPS_USER_EMAILS` |
| `docs/brand/design-decisions-log.md` | entrada de cierre de fase |
| `CLAUDE.md` | fila de la zona en el mapa |

**Fase B**: `app/dashboard/projects/[projectId]/debug/**`, `lib/ops/**` y sus
tests.

## 7. Ficheros prohibidos

- `supabase/migrations/**` — **ninguna migración**. Todo lo que muestran las dos
  pantallas sale de tablas existentes. El interruptor de auditoría por dominio
  es lo único que la necesitaría, y por eso queda fuera.
- Cualquier política RLS, y cualquier uso nuevo de `createServiceClient()` que
  no sea el que `runs/page.tsx` ya hace para la reconciliación.
- `lib/scan/executor.ts`, `lib/scan/extraction.ts`, `lib/scoring/**` — esta fase
  **lee** el pipeline, no lo toca.
- `lib/billing/**`, Stripe, emails.
- `Documentacion/`.

## 8. Criterios de aceptación

**Flujo (P0)**

1. Crear un dominio nuevo aterriza en **Visión general** y el escaneo llega a
   `completed` sin intervención — el driver se ejecuta desde ahí.
2. `app/dashboard/projects/[projectId]/page.tsx` exporta `maxDuration = 60`.
   Sin esto el punto 1 pasa en local y falla en Vercel.
3. Un escaneo multi-lote (>10 prompts) termina entero: el driver sigue montado
   mientras el run está `pending` **o** `running`.
4. `/runs` y `/runs/[runId]` siguen resolviendo (redirect a `/debug`; el detalle
   de escaneo no se rompe).

**Pantalla Dominios**

5. Renderiza a 375 / 768 / 1280 px sin scroll horizontal del body.
6. Cero controles de escaneo o auditoría. Ni «Repetir escaneo», ni
   interruptores.
7. Con 1 dominio: portada + caja «Añadir dominio», sin raíl y sin huecos.
8. Con ≥4 dominios: el raíl es rejilla y ninguna tarjeta queda fuera del
   viewport.
9. En móvil la caja «Añadir dominio» es visible sin scroll horizontal, a ancho
   completo y fuera del raíl.
10. El delta de la portada sale de `resolveDelta`; un dominio con dos escaneos
    no comparables muestra «—», no un número.
11. La cabecera es `.ov-sticky-header`: *kicker* + línea de 15 px + pastilla.
    Sin título grande propio.

**Estado en cabecera**

12. Un dominio activo → «Escaneando <dominio>» / «Analizando <dominio>» /
    «Auditando <dominio>»; dos o más → «N dominios en curso»; escaneo gana a
    auditoría; en reposo, sin pastilla.
13. La pastilla es visible **en móvil** (es todo el punto de §26).
14. Auditoría web sigue mostrando su estado tras sustituir `.scan-status` por la
    pastilla compartida — y ahora también en móvil.

**/debug**

15. No aparece en la barra lateral.
16. Una cuenta fuera de `OPS_USER_EMAILS` recibe **404**.
17. Conserva sin pérdida todo lo que hoy vive en Escaneos: historial completo,
    lanzamientos con repeticiones, columna de auditoría, GEO Score, Δ con su
    nota de DELTA-GUARD-1, sub-fila de error e interruptor de escaneo diario.
18. Las tablas anchas hacen scroll en su propio contenedor.

**Fidelidad**

19. Las dos pantallas coinciden con `pantalla-dominios.html` y
    `pantalla-debug.html` en estructura, jerarquía y espaciado. Cualquier
    elemento añadido, quitado o renombrado respecto a esas referencias es
    `PILOT FAIL` aunque no rompa nada.

**Cierre de fase**

20. Entrada en `docs/brand/design-decisions-log.md`, fila de zona en `CLAUDE.md`
    y `OPS_USER_EMAILS` en `docs/environment-contract.md`, **en este mismo PR**.

## 9. Validación

```bash
pnpm test
pnpm run validate
git diff --check
bash scripts/agentic-handoff-check.sh
```

Más, obligatorio antes del Human Gate:

```bash
pnpm pilot --url https://<preview>.vercel.app
```

El piloto tiene que recorrer Dominios y Visión general a 375/768/1280 con la
cuenta piloto, y las journeys deben declarar su `ContentExpectation` — una
pantalla que carga con estado vacío **no cuenta como vista** (el incidente del
2026-08-02). `/debug` quedará **INCONCLUSIVE** para el piloto: la cuenta piloto
no estará en `OPS_USER_EMAILS`, así que verá el 404. Eso es el criterio 16
funcionando, no un fallo — pero significa que `/debug` necesita smoke manual
del fundador, y hay que decirlo en el Human Gate en vez de presentarla como
verificada.

## 10. Acción recomendada

**Implementar la Fase A.** Y aquí corrijo la recomendación del artefacto, que
decía «todo en un PR»: al escribir el intake, la línea A/B resulta ser la única
que no deja nada a medias. La Fase A es un cambio de navegación completo y
coherente —el cliente nunca ve una pantalla intermedia—, y la Fase B sólo
profundiza una pantalla interna de la que no depende ningún flujo. Partir por
ahí reduce el PR sin el problema que yo mismo señalé.

Lo que **no** se puede partir es la Fase A por dentro: pantalla nueva sin mover
el driver es un P0 introducido a mano.

**Tres decisiones que necesito de ti antes de arrancar** (el resto las he
cerrado yo en este documento):

1. **Interruptor de auditoría por dominio** — mi propuesta es dejarlo global y
   de sólo lectura, para no gastar una migración en un control que el cliente
   nunca verá. Si lo quieres por dominio, es Task Intake propio.
2. **`OPS_USER_EMAILS` + 404** como protección de `/debug` — ¿te vale, o
   prefieres otro mecanismo?
3. **Ruta y nombre**: `/dashboard/domains`, «Dominios» en el menú, `/runs`
   redirigiendo a `/debug`. Y qué hacemos con `/dashboard/projects` (la pantalla
   legacy de archivar/restaurar, sin repintar): mi propuesta es que Dominios
   absorba los archivados y esa desaparezca en la Fase A.

## 11. Prompt de ejecución optimizado

> Implementa **DOMAINS-REDESIGN-1 Fase A** en la rama
> `claude/redesign-scans-page-6tkano`, contra las referencias
> `docs/design-reference/domains-redesign-1/pantalla-dominios.html` y
> `pantalla-debug.html` (léelas antes de escribir CSS; su README lista los
> invariantes y las tres desviaciones declaradas).
>
> Orden obligatorio, porque el P0 va primero:
>
> 1. Monta `AutoExecuteScan` en `app/dashboard/projects/[projectId]/page.tsx`
>    con la misma condición que hoy (`pending` **o** `running`) y **añade
>    `export const maxDuration = 60`** a esa página. Cambia el redirect de
>    `createProject` a Visión general. Verifica un escaneo multi-lote de punta a
>    punta antes de tocar nada visual.
> 2. Mueve `runs/page.tsx` íntegro a
>    `app/dashboard/projects/[projectId]/debug/page.tsx` sin perder ninguna
>    columna ni el interruptor de escaneo diario; deja `/runs` como redirect.
>    Añade la comprobación `OPS_USER_EMAILS` con 404.
> 3. Crea `app/dashboard/domains/page.tsx` según la referencia. Extiende
>    `getWorkspaceCounters` con hora de último escaneo, última auditoría por
>    proyecto (`web_audit_snapshots`) y delta vía `resolveDelta`.
> 4. Añade `Auditando` a `ScanStatePill` y sustituye el chip `.scan-status` de
>    Auditoría web por la pastilla compartida. Escribe el agregado de cuenta
>    como función pura en `lib/domains/account-scan-state.ts`, con test, igual
>    que `scanStatePillLabel`.
> 5. Barra lateral: entrada «Dominios»; el bloque de proyecto deja de apuntar a
>    `/runs`.
> 6. Cierre de fase en el mismo PR: histórico, mapa de zonas y contrato de
>    entorno.
>
> Prohibido: cualquier migración, cualquier cambio de RLS, tocar el ejecutor o
> el scoring, y añadir a la portada cualquier métrica que no sea la puntuación
> GEO y su delta.
>
> Al terminar: `pnpm test && pnpm run validate`, push, PR, y pasada del
> `ux-pilot` contra el preview declarando `/debug` como INCONCLUSIVE por diseño.

## 12. Puerta de aprobación

> **Do you approve this plan? I will not implement until you confirm.**
