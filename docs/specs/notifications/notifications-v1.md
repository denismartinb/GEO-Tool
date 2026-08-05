# NOTIF-SERVER — Notificaciones reales (diseño técnico)

Corresponde a **ASYNC-SCAN-1 fase 1b** del plan de lanzamiento
(`docs/launch-plan.md`, fila 9), registrada allí como "notificaciones
server-side, schema+RLS, pendiente de su propio Task Intake, a diseñar junto a
Fase 6". Este documento es ese diseño.

Relación con **ALERTS-1 / Fase 6** (ya hecha): aquella entregó las
notificaciones **por email** (alerta de caída de score, resumen semanal) y las
preferencias de `/dashboard/settings/notifications`. Esta entrega las
notificaciones **in-app**. Comparten catálogo conceptual y, en la fase 3,
compartirán también los toggles de preferencias — que es justo lo que pedía la
nota de Fase 6 sobre "diseñar las notificaciones una sola vez".

Estado: **diseño aprobado por el fundador 2026-07-25** (las tres decisiones de
arquitectura). La implementación va por fases; cada fase necesita su propio
Task Intake antes de tocar código.

Este documento es la fuente de verdad para implementar. Está escrito para que
un agente lo ejecute sin volver a derivar las decisiones.

---

## 0. Qué problema resuelve

Hoy las notificaciones se **derivan al vuelo** en `getWorkspaceCounters()`
(`lib/project-workspace.ts`), que corre en **cada carga del dashboard**
(`app/dashboard/layout.tsx`). Eso trae tres problemas:

1. **Solo existen dos tipos** (`scan_completed`, `prompts_added`) porque son los
   únicos derivables de una consulta barata de "filas recientes". Todo lo
   valioso (un escaneo que falla, una brecha que se cierra, un bot de IA
   bloqueado) es invisible.
2. **El estado de leído es un único timestamp en `localStorage`**
   (`geo-studio:notifications:last_seen_at`, `components/notification-bell.tsx`):
   se pierde al cambiar de dispositivo y no permite descartar avisos sueltos.
3. **No escala en latencia**: cada tipo nuevo son consultas nuevas en el camino
   crítico de render. Con 8 tipos serían 4-5 consultas más por carga.

La decisión aprobada es invertir el modelo: **escribir la notificación cuando
ocurre el evento**, y que el render sea una única consulta indexada.

---

## 1. Decisiones de arquitectura (aprobadas)

| # | Decisión | Motivo |
|---|---|---|
| D1 | Tabla `notifications` propia, no columna en `profiles` | Permite estado de leído por notificación y descarte individual, no solo un "visto hasta aquí" |
| D2 | Escritura en el evento (`write-on-event`), no derivación en lectura | Saca el coste del camino crítico de render |
| D3 | `owner_user_id` denormalizado en la fila | La consulta de lectura es una sola tabla, sin join ni `is_project_owner()` por fila |
| D4 | `payload_json` estructurado, **no** título/cuerpo renderizados en BD | El copy se puede corregir sin migrar datos ya escritos |
| D5 | `dedupe_key` con índice único | La emisión es idempotente por construcción — el ejecutor de escaneos se auto-encadena y se reintenta |
| D6 | Política RLS solo de `SELECT`; marcar leído va por server action con service-role | Mismo patrón ya decidido en `0010_recommendations_history.sql` y `0018_web_audit_snapshots.sql` |

### Ganancia de latencia (D2/D3)

El intercambio en `getWorkspaceCounters()` es:

- **Se eliminan 2 consultas**: `recentRuns` (`scan_runs` limit 5) y
  `recentPromptRows` (`project_prompts` limit 50).
- **Se añade 1 consulta**: `notifications` por `owner_user_id`, limit 15.

**Neto: una consulta menos por carga del dashboard**, y la que queda es una
lectura de tabla única sobre un índice compuesto, sin la función
`is_project_owner()` que las políticas actuales evalúan por fila.

---

## 2. Esquema (migración `0021_notifications.sql`)

```sql
-- 0021_notifications.sql
--
-- Phase: NOTIF-1 (founder-approved 2026-07-25)
--
-- Apply manually in the Supabase SQL editor, after 0020.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete cascade,
  type text not null,
  severity text not null default 'info',
  payload_json jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint notif_type_chk check (type in (
    'scan_completed',
    'scan_failed',
    'gap_resolved',
    'gap_pending',
    'emerging_competitor',
    'ai_bot_blocked',
    'audit_completed',
    'trial_ending'
  )),
  constraint notif_severity_chk check (severity in ('success','info','warning','critical')),
  constraint notif_dedupe_len_chk check (char_length(dedupe_key) between 1 and 200)
);

create index notifications_owner_created_idx
  on public.notifications (owner_user_id, created_at desc);

create index notifications_owner_unread_idx
  on public.notifications (owner_user_id, created_at desc)
  where read_at is null;

create unique index notifications_owner_dedupe_uniq
  on public.notifications (owner_user_id, dedupe_key);

alter table public.notifications enable row level security;

create policy notifications_select_owner
on public.notifications
for select
to authenticated
using (owner_user_id = auth.uid());

-- Sin políticas de INSERT/UPDATE/DELETE para `authenticated`: toda escritura
-- (emisión y marcar-como-leído) pasa por código servidor de confianza con el
-- cliente service-role, que reverifica la propiedad en el WHERE. Mismo
-- criterio que generated_solutions (0005) y web_audit_snapshots (0018).
```

### Notas sobre el esquema

- **`project_id` nullable**: `trial_ending` no pertenece a ningún proyecto.
- **`on delete cascade` en `project_id`**: si el proyecto se borra (hard delete
  ya existe, DATA-MGMT-1), sus notificaciones se van con él. Correcto — una
  notificación sobre un proyecto inexistente no se puede renderizar.
- **`notif_type_chk` incluye los 8 tipos desde la migración inicial** aunque las
  fases posteriores aún no los emitan: evita una segunda migración solo para
  ampliar el CHECK.
- **`gap_pending`** es el nombre interno de "Brecha pendiente de resolver".
- **No hay `updated_at` ni trigger `set_updated_at`**: una notificación es
  inmutable salvo por `read_at`. Añadir el trigger sería ruido.

### Riesgo conocido de la denormalización (D3)

`owner_user_id` se copia en la fila. Hoy es seguro: `projects.owner_user_id`
nunca cambia (no hay transferencia de proyectos ni equipos). **Si algún día
entra teams/RBAC** — área prohibida sin aprobación explícita — esta
denormalización hay que revisarla antes.

---

## 3. Módulo `lib/notifications/`

### 3.1 `types.ts` — contrato de payload por tipo

Un tipo discriminado por `type`. El payload guarda **hechos**, nunca frases
renderizadas (D4).

```ts
export type NotificationSeverity = "success" | "info" | "warning" | "critical";

export type NotificationPayloadByType = {
  scan_completed: {
    runId: string;
    promptsProcessed: number;
    providers: string[];
    visibilityScore: number | null;
    visibilityDelta: number | null;
    newRecommendations: number;
    resolvedGaps: number;
  };
  scan_failed: {
    runId: string;
    /** Ya saneado por getSanitizedScanError — nunca contiene secretos. */
    errorSummary: string;
  };
  gap_resolved: {
    runId: string;
    count: number;
    /** Títulos de las brechas cerradas, máximo 3, para el cuerpo. */
    sampleTitles: string[];
  };
  gap_pending: {
    recommendationTitle: string;
    consecutiveRuns: number;
    impact: "low" | "medium" | "high";
  };
  emerging_competitor: {
    competitor: string;
    promptCount: number;
  };
  ai_bot_blocked: {
    agent: string;
    snapshotId: string;
  };
  audit_completed: {
    snapshotId: string;
    readinessScore: number | null;
    pagesAnalyzed: number;
  };
  trial_ending: {
    daysLeft: number;
    trialEndsAt: string;
  };
};

export type NotificationType = keyof NotificationPayloadByType;
```

### 3.2 `emit.ts` — el helper de emisión

**Invariante número uno de todo este trabajo:** emitir una notificación **jamás**
puede hacer fallar el proceso que la origina. Un escaneo correcto con una
notificación fallida es un escaneo correcto.

```ts
/**
 * Emite una notificación de forma idempotente y no bloqueante.
 *
 * - Idempotencia: `upsert` con `ignoreDuplicates` sobre el índice único
 *   (owner_user_id, dedupe_key). El ejecutor de escaneos se auto-encadena
 *   (SCAN-CHAIN-1) y se reintenta, así que la misma emisión puede correr más
 *   de una vez; la segunda no escribe nada.
 * - Nunca lanza: cualquier error se registra y se traga. La correcta
 *   finalización del escaneo no depende de esto.
 * - Nunca se llama antes del UPDATE que hace durable el evento: primero el
 *   hecho, después el aviso.
 */
export async function emitNotification<T extends NotificationType>(
  service: ReturnType<typeof createServiceClient>,
  input: {
    ownerUserId: string;
    projectId: string | null;
    type: T;
    severity: NotificationSeverity;
    dedupeKey: string;
    payload: NotificationPayloadByType[T];
  }
): Promise<void>
```

Implementación obligatoria:

- `service.from("notifications").upsert({...}, { onConflict: "owner_user_id,dedupe_key", ignoreDuplicates: true })`.
- Todo el cuerpo dentro de `try/catch`; en `catch`, `console.error("[notifications] emit failed", { type, projectId, message })` y `return`.
- **Nunca registrar `payload_json` completo en los logs** — puede contener texto
  de prompts del usuario.

### 3.3 `dedupe-keys.ts` — claves canónicas

Centralizadas para que emisor y tests no puedan divergir:

| Tipo | `dedupe_key` | Cardinalidad resultante |
|---|---|---|
| `scan_completed` | `scan_completed:${runId}` | una por escaneo |
| `scan_failed` | `scan_failed:${runId}` | una por escaneo |
| `gap_resolved` | `gap_resolved:${runId}` | una por escaneo (agregada, **no** una por brecha) |
| `gap_pending` | `gap_pending:${projectId}:${recDedupeKey}` | **una por brecha, para siempre** |
| `emerging_competitor` | `emerging_competitor:${projectId}:${competitorLower}` | una por competidor, para siempre |
| `ai_bot_blocked` | `ai_bot_blocked:${snapshotId}:${agent}` | una por transición a bloqueado |
| `audit_completed` | `audit_completed:${snapshotId}` | una por auditoría |
| `trial_ending` | `trial_ending:${userId}:${trialEndsAt}` | una por periodo de prueba |

Las dos claves "para siempre" (`gap_pending`, `emerging_competitor`) son
deliberadas: son avisos-empujón, y repetirlos en cada escaneo los convertiría
en el ruido que este diseño existe para evitar.

---

## 4. Puntos de emisión

Todos usan el cliente `service` que ya está en ámbito en cada sitio.

### 4.1 `scan_completed` — `lib/scan/executor.ts`

**Dónde:** inmediatamente **después** del `UPDATE scan_runs SET status='completed'`
(hoy ~línea 1043), nunca antes.

**Owner:** `project.owner_user_id`, ya seleccionado en el fetch de proyecto
(~línea 533). **Nunca** `run.triggered_by_user_id` — en escaneos recurrentes
(`trigger_source='cron'`) ese campo es `null` por diseño
(`0008_recurring_scans.sql`).

> **Verificar durante la implementación:** el fetch de la línea 533 usa el
> cliente de usuario (`supabase`). Confirmar que la ruta de escaneo por cron
> (`lib/scan/run-creation.ts`, `lib/scan/reconciliation.ts`) también tiene
> `owner_user_id` en ámbito; si no, hacer un `select owner_user_id` con el
> cliente `service` antes de emitir.

**Severidad:** `success` siempre. El icono de subida/bajada lo decide el
frontend a partir de `visibilityDelta`, no la severidad.

**Payload:** `visibilityScore`/`visibilityDelta` salen de comparar el
`run_scores` de este run con el del run completado inmediatamente anterior —
que el bloque RECS-3 **ya localiza** (`previousRunRow`, ~línea 918). Reusar esa
consulta, no añadir otra. Si no hay run anterior, `visibilityDelta: null`.

`newRecommendations` = `recommendationRows.length`. `resolvedGaps` =
`resolvedDedupeKeys.length`. Ambos ya están calculados en ese ámbito.

### 4.2 `scan_failed` — `lib/scan/executor.ts`

**Dónde:** en los **tres** caminos de fallo, después de su `UPDATE`:

1. ~línea 559 — "No se han encontrado jobs para el escaneo."
2. ~línea 1088 — el bloque `catch` general.
3. Cualquier otro camino que escriba `scan_runs.status='failed'`. **Buscar
   `status: "failed"` sobre `scan_runs` y cubrirlos todos**; dejar uno fuera
   reproduce exactamente el bug que esta notificación viene a arreglar.

**Severidad:** `critical`.

**Payload:** `errorSummary` **debe** venir de `getSanitizedScanError()`, que es
lo que ya se escribe en `scan_runs.error_summary`. Nunca el `error.message`
crudo.

### 4.3 `gap_resolved` — `lib/scan/executor.ts`

**Dónde:** dentro del bloque RECS-3, **después** de que el
`update({status:"resolved"})` devuelva sin error (~línea 949). Si ese update
falla, no se emite.

**Una sola notificación agregada** con `count: resolvedDedupeKeys.length`, no
una por brecha. Esta es la regla anti-duplicación del catálogo aplicada al
código.

`sampleTitles`: los títulos de hasta 3 de las recomendaciones resueltas. Salen
de `previousRows`; **añadir `title` al select de la línea ~931**, que hoy solo
trae `dedupe_key, status, consecutive_runs_open`. Es una columna más en una
consulta que ya se hace.

**Severidad:** `success`.

### 4.4 `gap_pending` — `lib/scan/executor.ts`

**Dónde:** después de insertar `recommendationRows` con su
`consecutive_runs_open`.

**Condición de disparo:** emitir **solo en el cruce exacto del umbral**,
`consecutiveRunsByDedupeKey.get(key) === 3`. No `>= 3`: el índice único ya
impediría duplicados, pero disparar en el cruce exacto hace la intención
explícita en el código en vez de delegarla en una restricción de BD.

**Como máximo una por escaneo**: si varias brechas cruzan el umbral a la vez,
emitir solo la de mayor `impact` (desempate por `priority_rank` ascendente).
Tres avisos-empujón el mismo día son ruido.

**Severidad:** `warning`.

### 4.5 Fase 2 — resto de tipos

- **`emerging_competitor`** — `lib/scan/executor.ts`, cuando se genera una
  recomendación `track_emerging_competitor` nueva. `competitor` y `promptCount`
  salen de `evidence_json.emerging_competitor` y `affected_prompt_ids.length`.
  Severidad `info`.
- **`audit_completed`** — `lib/web-audit/technical-audit.ts`, después del
  `insert` en `web_audit_snapshots` (~línea 449). Requiere `.select("id")` en
  ese insert para tener `snapshotId`. Severidad `info`.
- **`ai_bot_blocked`** — ✅ **implementado 2026-08-05** por WEB-AUDIT-ALERTS-1
  (log §25), en `lib/web-audit/regression-alerts.ts`, llamado desde
  `technical-audit.ts` justo tras el insert. Con un matiz sobre lo escrito
  abajo: se emite sólo cuando el lado anterior tenía `allowed: true`
  explícito, **no** cuando el agente era "inexistente" — un bot recién añadido
  a `TRACKED_BOT_AGENTS` que aparece bloqueado es un descubrimiento sobre un
  `robots.txt` que no ha cambiado, y una alerta crítica por eso enseña a
  desconfiar del aviso. Esa misma fase añadió cinco tipos más (migración
  0029): `coverage_dropped`, `surfacing_dropped`, `llms_txt_lost`,
  `sitemap_lost`, `page_unreachable`. `audit_completed` y
  `emerging_competitor` siguen **sin emitir**. Texto original de la fase 2:
  **Emitir solo en la transición**: leer el
  snapshot anterior del proyecto (`order created_at desc, limit 1`, antes del
  insert) y comparar su `bots` con el nuevo. Emitir por cada agente que pase de
  permitido (o inexistente) a `allowed: false`. **No** emitir en cada auditoría
  mientras siga bloqueado. Severidad `critical`.

### 4.6 Fase 3 — `trial_ending`

**No tiene evento natural.** No existe cron de facturación; emitirlo de forma
perezosa en cada lectura de plan metería una escritura en el camino de render,
que es justo lo que este diseño elimina.

**Queda explícitamente fuera de las fases 1 y 2.** Necesita una ruta cron propia
(mismo patrón que `CRON_DIGEST_ENABLED`), con su propia aprobación —
`background scheduler` es área prohibida en `CLAUDE.md`.

---

## 5. Camino de lectura

### 5.1 `lib/project-workspace.ts`

**Eliminar:**
- Los tipos `RecentCompletedRun` y `RecentPromptsAdded`.
- Las consultas `recentRuns` y `recentPromptRows` del `Promise.all`.
- El bloque de agregación `promptBatchCounts` y todo lo que lo consume.
- Los campos `recentCompletedRuns` / `recentPromptsAdded` de `WorkspaceCounters`.

**Añadir** una consulta al `Promise.all`:

```ts
supabase
  .from("notifications")
  .select("id, type, severity, project_id, payload_json, read_at, created_at")
  .order("created_at", { ascending: false })
  .limit(NOTIFICATIONS_BELL_LIMIT) // 15
```

Sin `.eq("owner_user_id", user.id)`: la política RLS `notifications_select_owner`
ya lo garantiza, igual que hacen hoy el resto de consultas de esta función.

**Contador de no leídas:** se deriva de las 15 filas cargadas
(`read_at === null`), **sin segunda consulta**. Si las 15 están sin leer, la
insignia muestra `15+`. Documentar ese tope en el código: es un compromiso
consciente de una-consulta-o-nada, no un descuido.

### 5.2 Renderizado del copy

Un módulo `lib/notifications/render.ts` traduce `{type, payload_json}` a
`{title, body, targetLabel, href, icon}`. El dominio del proyecto se resuelve
**en memoria** contra el array `projects` que `getWorkspaceCounters` ya carga —
cero coste adicional, y el dominio mostrado siempre es el actual aunque el
usuario lo haya editado.

Copy exacto por tipo (castellano, tú/informal, coherente con el producto):

| Tipo | Título | Cuerpo |
|---|---|---|
| `scan_completed` | Escaneo completado | `Visibilidad {score} ({+delta}). {n} acciones nuevas y {m} brechas cerradas.` — omitir cada frase cuyo dato sea 0 o `null` |
| `scan_failed` | Escaneo fallido | `{errorSummary}` |
| `gap_resolved` | Brecha cerrada / `{n} brechas cerradas` | `{sampleTitles[0]}` + `y {n-1} más` si procede |
| `gap_pending` | Brecha pendiente de resolver | `«{recommendationTitle}» sigue abierta {consecutiveRuns} escaneos después.` |
| `emerging_competitor` | Marca emergente en tus respuestas | `La IA menciona a {competitor} en {promptCount} consultas y no la monitorizas.` |
| `ai_bot_blocked` | `{agent} no puede acceder a tu web` | `Tu robots.txt lo bloquea. Mientras siga así no puedes aparecer en sus respuestas.` |
| `audit_completed` | Auditoría web completada | `Preparación técnica {readinessScore}/100.` |
| `trial_ending` | Tu prueba termina pronto | `Quedan {daysLeft} días. Después pasarás al plan Free.` |

### 5.3 Marcar como leídas

Server action nueva, `app/dashboard/notifications/actions.ts`:

```ts
"use server";
// Usa createServiceClient() porque notifications no tiene política de UPDATE
// para `authenticated` (ver migración 0021). La propiedad se reverifica
// explícitamente en el WHERE, mismo patrón que el resto de acciones
// service-role del proyecto.
export async function markAllNotificationsRead(): Promise<{ success: boolean }> {
  const { user } = await requireUser();
  const service = createServiceClient();
  await service
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("owner_user_id", user.id)   // reverificación de propiedad, no opcional
    .is("read_at", null);
  revalidatePath("/dashboard", "layout");
  return { success: true };
}
```

**Eliminar** de `components/notification-bell.tsx` toda la lógica de
`LAST_SEEN_KEY` / `localStorage`.

---

## 6. Frontend

### 6.1 Iconos nuevos (`components/ui/icon.tsx`)

Cuatro iconos que no existen. Mismo estilo que el resto: `viewBox 0 0 24 24`,
`stroke-width 1.7`, extremos redondeados.

```tsx
trendDown: <path d="M3 7l4 5 4-3 4 6 4-4" />,
flag: (
  <>
    <path d="M6 21V3.5" />
    <path d="M6 4.5h11.5l-2.4 3.9 2.4 3.9H6z" />
  </>
),
hourglass: (
  <>
    <path d="M7.5 3h9M7.5 21h9" />
    <path d="M9 3v3.2c0 1.9 3 3.4 3 5.3 0-1.9 3-3.4 3-5.3V3" />
    <path d="M9 21v-3.2c0-1.9 3-3.4 3-5.3 0 1.9 3 3.4 3 5.3V21" />
  </>
),
robot: (
  <>
    <rect x="3.5" y="8" width="17" height="11.5" rx="3.5" />
    <path d="M12 8V4.8" />
    <circle cx="12" cy="3.4" r="1.4" />
    <path d="M8.8 12.8v1.4M15.2 12.8v1.4" />
    <path d="M9.8 16.8h4.4" />
  </>
),
```

### 6.2 Mapa tipo → icono + color

`emerging_competitor` reutiliza `resonance`, el icono insignia de la marca:
es literalmente "hemos captado una señal".

| Tipo | Icono | Token de color |
|---|---|---|
| `scan_completed` (delta ≥ 0) | `trendUp` | `--brand-pos` sobre `--brand-pos-soft` |
| `scan_completed` (delta < 0) | `trendDown` | `--brand-neg` sobre `--brand-neg-soft` |
| `scan_failed` | `alertCircle` | `--brand-neg` |
| `gap_resolved` | `flag` | `--brand-pos` |
| `gap_pending` | `hourglass` | `--brand-warm` (texto `#a15c00` para contraste AA) |
| `emerging_competitor` | `resonance` | `--brand-cyan` (texto `#0a8f9c` para contraste AA) |
| `ai_bot_blocked` | `robot` | `--brand-neg` |
| `audit_completed` | `shield` | `--brand-blue` |
| `trial_ending` | `card` | `--brand-warm` |

**Los colores crudos `--brand-warm` (#ffb020) y `--brand-cyan` (#09c5d6) no
alcanzan contraste AA sobre fondo claro.** Usar los valores oscurecidos
indicados para el trazo del icono, dejando el token original solo para el
fondo tenue.

### 6.3 Repintado a marca v3 (`app/globals.css`)

Los estilos `.notif-*` y `.header-bell` siguen usando el índigo antiguo
(`--accent: #4f46e5`), que quedó fuera de los repintados BRAND-5b. Sustituir
por los tokens `--brand-*`. Referencia visual aprobada: el artifact de la
propuesta (secciones 1 y 2).

Añadir: pestañas Todas / No leídas con contador, agrupación por día
(`Hoy` / `Ayer` / fecha), y pie "Ver todas las notificaciones".

### 6.4 Página `/dashboard/notifications`

Server component. Cabecera con el título y el enlace pequeño
"Marcar como leídas" a la derecha (sin subtítulo descriptivo). Pestañas,
agrupación por día, filas a ancho completo. Límite 50, sin paginación en v1.

---

## 7. Tests (Vitest)

Obligatorios antes de considerar cualquier fase terminada:

**`lib/notifications/emit.test.ts`**
- Emite una vez → escribe una fila.
- Emite dos veces con el mismo `dedupeKey` → sigue habiendo una fila.
- El cliente devuelve error → `emitNotification` **resuelve**, no lanza.
- El payload nunca aparece completo en `console.error`.

**`lib/scan/executor.test.ts` (ampliar)**
- Escaneo completado → una notificación `scan_completed` con el `runId` correcto.
- Escaneo fallido por cada uno de los tres caminos → `scan_failed`.
- Un escaneo con `resolvedDedupeKeys.length === 3` → **una** notificación
  `gap_resolved` con `count: 3`, no tres notificaciones.
- Brecha con `consecutive_runs_open === 3` → emite; con `4` → no vuelve a emitir.
- Dos brechas cruzan el umbral a la vez → una sola notificación, la de mayor
  impacto.
- **Escaneo por cron (`triggered_by_user_id: null`) → la notificación se emite
  con el `owner_user_id` del proyecto.** Este es el test que protege el bug más
  probable de todo el trabajo.
- Un fallo al emitir no cambia el estado final del run.

**`lib/notifications/render.test.ts`**
- Cada tipo produce título y cuerpo no vacíos.
- `scan_completed` con `visibilityDelta: null` no imprime "(null)" ni "(+null)".
- `gap_resolved` con `count: 1` usa singular.

---

## 8. Fases

| Fase | Alcance | Toca schema | Toca UI |
|---|---|---|---|
| **1a** | Migración 0021, `lib/notifications/*`, emisión de los 4 tipos de escaneo, tests | Sí | No |
| **1b** | Camino de lectura, repintado de la campana, página `/dashboard/notifications`, iconos, retirar `prompts_added` | No | Sí |
| **2** | `emerging_competitor`, `audit_completed`, `ai_bot_blocked` | No | Mínimo |
| **3** | `trial_ending` (necesita cron) + cablear los toggles de ajustes a la emisión | Puede que sí | Sí |

**1a no cambia nada visible**: la campana sigue funcionando con los datos
derivados de hoy mientras la tabla se va llenando. Eso permite verificar en el
preview que las filas se escriben bien **antes** de que ningún usuario dependa
de ellas.

### Por qué los toggles de ajustes van en la fase 3

Hacer que "Escaneos completados" y "Nuevas recomendaciones"
(`components/settings/notifications-tab.tsx`, hoy marcados *Próximamente*)
filtren la emisión obliga a leer `profiles` en cada emisión. Es una decisión de
producto propia — ¿el toggle silencia el email, la campana, o ambos? — y
mezclarla con la fase 1 sería juntar dos concerns en un PR.

---

## 9. Fuera de alcance (no tocar)

- Emails: `lib/email/transactional.ts` no cambia. Este trabajo es solo in-app.
- El motor de recomendaciones: se **lee** `consecutive_runs_open` y
  `resolvedDedupeKeys`, no se cambia ninguna regla.
- Cualquier tipo de notificación que no esté en el CHECK de la migración.
- `Documentacion/`.
