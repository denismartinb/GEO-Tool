# ADR 0035 — La auditoría técnica deja de ser Pro

- **Estado:** **aceptado** — aprobado por el fundador el 2026-08-05
  (*"Auditoría en no pro: la extendemos"*)
- **Fecha:** 2026-08-05
- **Fase:** WEB-AUDIT-TECH-ALL-PLANS-1
- **Supersede:** ADR 0033 §8 ("no cambia qué planes tienen auditoría web") y la
  formulación de la puerta Pro en `.claude/rules/web-audit.md`.

---

## 1 · Qué se decide

**La mitad técnica de la auditoría web corre en todos los planes.** La mitad de
**cobertura sigue siendo Pro**.

## 2 · Por qué, y por qué ahora

La puerta Pro sobre la auditoría entera se justificaba como frontera comercial,
y para la cobertura sigue siendo correcta: son llamadas a Gemini por lotes,
gasto real que escala con el uso.

**Nunca aplicó a la mitad técnica.** `readiness_score` se calcula con fetch y
regex (`lib/web-audit/page-checks.ts`): cero LLM. Su coste es ≤10 GET a páginas
del dominio propio bajo un presupuesto de 25 s.

Lo que forzó revisarlo es **GEO-SCORE-V4** (ADR 0033): esa nota pasó a ser un
componente del GeoScore con peso 0,20. Con la puerta puesta, el componente se
caía siempre en los planes por debajo de Pro y sus cuatro componentes
restantes renormalizaban a la escala v3. Es decir: **el GeoScore medía un
número distinto de componentes según el plan**. Una métrica que significa cosas
distintas según lo que pagues no es una métrica; es dos métricas con el mismo
nombre.

Cerrarlo tenía dos salidas —quitar la puerta, o aceptar la asimetría y
etiquetarla— y la asimetría era justo la clase de discontinuidad que toda la
fase GEO-SCORE-V4 existía para eliminar.

## 3 · Qué cambia en el código

1. **`lib/web-audit/technical-audit.ts`** — fuera la puerta `isProOrAbove` y su
   `PLAN_REQUIRED_FAILURE`. Las otras tres precondiciones siguen intactas:
   proyecto existente, no archivado, y **al menos un escaneo completado**
   (`no_scan`) — que los planes gratuitos cumplen tras su primer escaneo.
2. **`lib/web-audit/audit-job-runner.ts`** — un `plan_required` procedente de
   **cobertura** deja de cancelar el trabajo entero; marca la cobertura como
   omitida por plan y continúa a la mitad técnica. Es deliberadamente estrecho:
   sólo ese motivo, y sólo desde cobertura. `project_not_found`,
   `project_archived` y `no_prompts` siguen cancelando, porque significan que
   no hay nada que auditar — no "esta mitad no es tuya".
   Además, una cobertura omitida por plan **no se aparca como continuación**:
   no hay nada a lo que volver, y reencolar sólo gastaría invocaciones hasta el
   tope de continuaciones.
3. **`lib/web-audit/run-audit-status.ts`** — nuevo `coverageIncludedInPlan`
   (por defecto `true`, así que ningún llamador existente cambia de
   significado). Sin él, un plan que sólo tiene la mitad técnica saldría
   **«Parcial» en todos sus escaneos, para siempre**. «Parcial» significa *el
   trabajo se quedó a medias y falta algo*, e invita a esperar o reintentar
   algo que no va a llegar. Ahí no falta nada: la auditoría está completa para
   lo que el plan incluye.

## 4 · Coste, dicho con números

- **Por auditoría:** ≤10 peticiones HTTPS a páginas del dominio propio, más
  `robots.txt` / `llms.txt` / `sitemap.xml`. `TECH_AUDIT_TOTAL_BUDGET_MS` =
  25 s. **Cero llamadas a LLM.**
- **Free:** su plan permite un único escaneo completado, así que el alcance es
  del orden de **una auditoría por proyecto**.
- **Starter y superiores:** acotado por su propio cupo de escaneos.
- **Sin campaña de cobertura**, `selectCandidateUrls` degrada a portada + citas
  de grounding del dominio propio. Nunca falla; `computeReadinessScore` sobre
  una sola página es un score válido.

**Fuga heredada, sin resolver aquí** (ADR 0027, "Consecuencias" R3a): la ruta
automática se salta la *comprobación* del límite de 5/día pero **inserta igual
las filas que ese límite cuenta**, así que consume el contador que lee una
auditoría manual. Extender a más planes aumenta el número de cuentas que pueden
toparse con ese "has alcanzado el límite" fantasma. Arreglarlo bien exige un
discriminador en la tabla — `source` existe (`'manual' | 'cron'`) pero hoy se
escribe siempre `'manual'`, así que usarlo es un cambio de comportamiento y de
datos. **Queda anotado, no arreglado.**

## 5 · Lo que este ADR NO hace

- **No toca la cobertura.** Sigue siendo Pro y sigue siendo el gasto real.
- **No cambia ninguna fórmula.** El GeoScore es el mismo de ADR 0033; lo único
  que cambia es que ahora *tiene* su quinto componente en más planes.
- **No toca RLS.** `web_audit_select_owner` ya era agnóstico al plan: un dueño
  no-Pro siempre pudo leer sus propios snapshots, simplemente no existía
  ninguno.
- **No hay migración.**

## 6 · Consecuencia comercial, dicha de frente

La auditoría técnica era parte de lo que distinguía a Pro. Dejarla abierta
resta un motivo para subir de plan, y a cambio hace que el número principal del
producto signifique lo mismo para todo el mundo. Es una decisión de producto del
fundador, tomada con ese intercambio a la vista. Lo que queda como Pro —la
cobertura, que es donde está el gasto y el análisis de contenido— sigue siendo
la parte cara.

## Referencias

ADR 0027 (auditoría post-escaneo) · ADR 0033 (GeoScore v4) ·
`.claude/rules/web-audit.md` · `lib/web-audit/page-checks.ts` ·
`docs/specs/web-audit/ROADMAP.md`.
