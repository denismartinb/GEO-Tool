import Link from "next/link";
import type { Metadata } from "next";
import { requireOperator } from "@/lib/admin/operator";
import { getOperatorUserDetail, listOperatorUsers, type AdminUserRow, type AdminUserStatus } from "@/lib/admin/users";
import { formatUsd, provenanceLabel, type CostProvenance } from "@/lib/admin/cost-model";
import type { AccountAutomation, ProjectAutomation } from "@/lib/admin/automation";
import { setAutoAuditHalfAsOperator, setRecurringScansAsOperator } from "@/lib/admin/automation-actions";
import { relativeTime } from "@/lib/notifications/render";

const ADMIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Datos inválidos. El motivo es obligatorio (mínimo 5 caracteres).",
  project_not_found: "Ese dominio no existe o está archivado.",
  recurring_free_plan_ineffective:
    "Este dominio es Free: el barrido descarta los proyectos Free, así que activar el recurrente no tendría efecto.",
  recurring_requires_completed_scan: "Hace falta al menos un escaneo completado antes de activar el recurrente.",
  recurring_update_failed: "No se pudo guardar el cambio del escaneo recurrente.",
  coverage_plan_ineffective:
    "La auditoría de cobertura sólo corre en Pro o superior: activarla aquí no tendría efecto.",
  auto_audit_update_failed: "No se pudo guardar el cambio de la auditoría automática."
};

const ADMIN_SUCCESS_MESSAGES: Record<string, string> = {
  recurring_enabled: "Escaneo recurrente activado.",
  recurring_disabled: "Escaneo recurrente desactivado.",
  audit_technical_enabled: "Auditoría técnica activada.",
  audit_technical_disabled: "Auditoría técnica desactivada.",
  audit_coverage_enabled: "Auditoría de cobertura IA activada.",
  audit_coverage_disabled: "Auditoría de cobertura IA desactivada."
};

export const metadata: Metadata = { title: "Usuarios — Consola de operador" };

const STATUS_FILTERS: Array<{ value: AdminUserStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "trial", label: "En prueba" },
  { value: "paid", label: "De pago" },
  { value: "free", label: "Free" },
  { value: "trial_expired", label: "Prueba caducada" }
];

const STATUS_LABEL: Record<AdminUserStatus, (row: AdminUserRow) => string> = {
  trial: (row) => `Prueba · vence ${formatShortDate(row.trialEndsAt)}`,
  trial_expired: () => "Prueba caducada",
  paid: () => "De pago",
  free: () => "Free"
};

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function formatFullDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function currency(value: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

/**
 * ADMIN-CONSOLE-2a. Un agregado `activos/total`, nunca un booleano por
 * usuario: esos interruptores viven en `projects`, así que una cuenta con
 * cinco dominios puede tenerlos mezclados y una sola casilla mentiría en
 * cuanto dos discreparan.
 */
function AutomationCell({ automation, kind }: { automation: AccountAutomation | null; kind: "recurring" | "audit" }) {
  if (!automation) return <span className="adm-dim">sin dato</span>;
  if (automation.totalProjects === 0) return <span className="adm-dim">—</span>;

  const active = kind === "recurring" ? automation.recurringActive : automation.auditActive;
  const inert = kind === "recurring" ? automation.recurringInertOnFree : 0;

  return (
    <span className="adm-frac">
      <span className={active > 0 ? "adm-frac-on" : "adm-frac-off"}>{active}</span>
      <span className="adm-frac-sep">/</span>
      <span className="adm-frac-total">{automation.totalProjects}</span>
      {inert > 0 ? (
        <span className="adm-inert" title="El barrido descarta los proyectos de plan Free, así que el interruptor no surte efecto">
          {inert} sin efecto
        </span>
      ) : null}
    </span>
  );
}

/** Nunca una cifra desnuda: el coste sale siempre con su procedencia al lado. */
function Cost({ usd, provenance }: { usd: number; provenance: CostProvenance }) {
  return (
    <span className="adm-cost">
      {formatUsd(usd)}
      <span className="adm-cost-tag">{provenanceLabel(provenance)}</span>
    </span>
  );
}

function ProjectAutomationLine({ automation }: { automation: ProjectAutomation | null }) {
  if (!automation) return <span className="adm-dim">sin dato de automatismos</span>;

  const bits: string[] = [];
  if (automation.recurringScansEffective) bits.push("escaneo recurrente");
  else if (automation.recurringScansEnabled) bits.push("recurrente sin efecto (Free)");
  else bits.push("sin recurrente");
  // Las dos mitades por separado: sólo la de cobertura gasta LLM.
  bits.push(automation.coverageAuditEnabled ? "auditoría IA" : "sin auditoría IA");
  bits.push(automation.technicalAuditEnabled ? "auditoría técnica ($0)" : "sin auditoría técnica");

  return (
    <>
      <span>{bits.join(" · ")}</span>
      <span className="adm-cost-basis">
        {automation.cost.basis} · {formatUsd(automation.cost.monthlyUsd)}/mes ({provenanceLabel(automation.cost.provenance)})
      </span>
    </>
  );
}

/**
 * ADMIN-CONSOLE-2b. Un formulario por interruptor, no uno compartido: cada
 * uno lleva su propio motivo, porque "activé el recurrente" y "activé la
 * auditoría de cobertura" no son la misma decisión ni deben compartir un
 * único campo de texto que obligue a explicar dos cosas a la vez.
 */
function AutomationToggleForm({
  action,
  projectId,
  half,
  enabled,
  label,
  q,
  status
}: {
  action: (formData: FormData) => Promise<void>;
  projectId: string;
  half?: "technical" | "coverage";
  enabled: boolean;
  label: string;
  q?: string;
  status?: string;
}) {
  return (
    <form action={action} className="adm-toggle-form">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      {half ? <input type="hidden" name="half" value={half} /> : null}
      {q ? <input type="hidden" name="q" value={q} /> : null}
      {status ? <input type="hidden" name="status" value={status} /> : null}
      <span className={`adm-toggle-label ${enabled ? "adm-toggle-on" : "adm-toggle-off"}`}>{label}</span>
      <input
        type="text"
        name="reason"
        placeholder="Motivo del cambio (obligatorio)"
        required
        minLength={5}
        maxLength={500}
        className="field adm-toggle-reason"
      />
      <button type="submit" className={`btn ${enabled ? "adm-toggle-btn-off" : "btn-primary"}`}>
        {enabled ? "Desactivar" : "Activar"}
      </button>
    </form>
  );
}

function buildQuery(base: { q?: string; status?: string; u?: string }): string {
  const params = new URLSearchParams();
  if (base.q) params.set("q", base.q);
  if (base.status && base.status !== "all") params.set("status", base.status);
  if (base.u) params.set("u", base.u);
  const qs = params.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; status?: string; u?: string; admin_success?: string; admin_error?: string }>;
}) {
  const params = await searchParams;
  const { service } = await requireOperator("/admin/users");

  const { users, authUsersTruncated, automationAvailability } = await listOperatorUsers(service);

  const search = params.q?.trim().toLowerCase() ?? "";
  const statusFilter = (params.status as AdminUserStatus | undefined) ?? "all";

  const filtered = users.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (search && !row.email.toLowerCase().includes(search) && !row.id.toLowerCase().includes(search)) return false;
    return true;
  });

  const trialCount = users.filter((row) => row.status === "trial").length;
  const paidCount = users.filter((row) => row.status === "paid").length;
  const estimatedMrr = users.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.planPrice, 0);
  const estimatedLlmMonthlyUsd = users.reduce((sum, row) => sum + (row.automation?.monthlyUsd ?? 0), 0);
  // El pie del KPI no puede ser una constante: si alguna cuenta aporta coste de
  // cobertura (sin medir), el total tampoco está medido.
  const llmCostProvenance: CostProvenance = users.some((row) => row.automation?.provenance === "no_medido")
    ? "no_medido"
    : "estimado";

  const detail = params.u ? await getOperatorUserDetail(service, params.u) : null;

  return (
    <main className="adm-main">
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Usuarios</h1>
          <p className="adm-sub">{users.length} cuentas · sólo lectura</p>
        </div>
      </div>

      {automationAvailability === "unmigrated" ? (
        <p className="adm-note">
          No se pudieron leer los automatismos (escaneo recurrente y auditoría automática): probablemente falte
          aplicar una migración en Supabase. Las columnas muestran «sin dato» en vez de un cero que parecería una
          respuesta.
        </p>
      ) : null}

      {authUsersTruncated ? (
        <p className="adm-note">
          Hay más cuentas de las que esta vista puede leer de una vez — la fecha de último acceso puede faltar en
          algunas filas. Avisa para ampliar el límite.
        </p>
      ) : null}

      <dl className="adm-kpis">
        <div className="adm-kpi">
          <dt>Cuentas</dt>
          <dd>{users.length}</dd>
        </div>
        <div className="adm-kpi">
          <dt>En prueba</dt>
          <dd>{trialCount}</dd>
        </div>
        <div className="adm-kpi">
          <dt>De pago</dt>
          <dd>{paidCount}</dd>
        </div>
        <div className="adm-kpi">
          <dt>MRR estimado</dt>
          <dd>{currency(estimatedMrr)}</dd>
        </div>
        <div className="adm-kpi">
          <dt>Coste LLM/mes</dt>
          <dd>{automationAvailability === "ok" ? formatUsd(estimatedLlmMonthlyUsd) : "—"}</dd>
          <span className="adm-kpi-foot">
            {automationAvailability === "ok"
              ? `${provenanceLabel(llmCostProvenance)}, no facturado`
              : "sin dato"}
          </span>
        </div>
      </dl>

      <form method="get" className="adm-toolbar">
        {statusFilter !== "all" ? <input type="hidden" name="status" value={statusFilter} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Buscar por email o user_id…"
          className="field adm-search"
        />
      </form>

      <div className="adm-toolbar">
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={buildQuery({ q: params.q, status: filter.value })}
            className={`adm-chip${statusFilter === filter.value ? " adm-chip-on" : ""}`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="adm-table-wrap">
          <p className="adm-empty">Ninguna cuenta coincide con este filtro.</p>
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Alta</th>
                <th>Estado</th>
                <th className="adm-num">Dominios</th>
                <th className="adm-num">Escaneos 30d</th>
                <th>Recurrente</th>
                <th>Auditoría</th>
                <th className="adm-num">Coste/mes</th>
                <th>Último acceso</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className={row.id === params.u ? "adm-row-selected" : undefined}>
                  <td>
                    <Link href={buildQuery({ q: params.q, status: params.status, u: row.id })}>
                      <span className="adm-em">{row.email}</span>
                      <span className="adm-uid">{row.id}</span>
                    </Link>
                  </td>
                  <td>{formatShortDate(row.createdAt)}</td>
                  <td>
                    <span className={`adm-pill adm-pill-${row.status}`}>{STATUS_LABEL[row.status](row)}</span>
                  </td>
                  <td className="adm-num">{row.projectCount}</td>
                  <td className="adm-num">{row.scanCount30d}</td>
                  <td>
                    <AutomationCell automation={row.automation} kind="recurring" />
                  </td>
                  <td>
                    <AutomationCell automation={row.automation} kind="audit" />
                  </td>
                  <td className="adm-num">
                    {row.automation ? (
                      <Cost usd={row.automation.monthlyUsd} provenance={row.automation.provenance} />
                    ) : (
                      <span className="adm-dim">sin dato</span>
                    )}
                  </td>
                  <td>{row.lastSignInAt ? relativeTime(row.lastSignInAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {params.u ? (
        detail ? (
          <div className="adm-drawer">
            <div className="adm-drawer-top">
              <div>
                <h2>{detail.email}</h2>
                <span className="adm-uid">{detail.id}</span>
              </div>
              <Link href={buildQuery({ q: params.q, status: params.status })} className="adm-close">
                Cerrar ✕
              </Link>
            </div>
            {params.admin_success ? (
              <p className="feedback success" style={{ margin: "14px 20px 0" }}>
                {ADMIN_SUCCESS_MESSAGES[params.admin_success] ?? "Cambio guardado."}
              </p>
            ) : null}
            {params.admin_error ? (
              <p className="feedback error" style={{ margin: "14px 20px 0" }}>
                {ADMIN_ERROR_MESSAGES[params.admin_error] ?? "No se pudo completar el cambio."}
              </p>
            ) : null}
            <div className="adm-drawer-cols">
              <div>
                <p className="adm-mini-title">Cuenta</p>
                <dl className="adm-dl">
                  <dt>Alta</dt>
                  <dd>{formatFullDate(detail.createdAt)}</dd>
                  <dt>Último acceso</dt>
                  <dd>{detail.lastSignInAt ? formatFullDate(detail.lastSignInAt) : "Nunca"}</dd>
                  <dt>Plan</dt>
                  <dd>{detail.planLabel}</dd>
                  <dt>Estado</dt>
                  <dd>{STATUS_LABEL[detail.status](detail)}</dd>
                  <dt>Cliente Stripe</dt>
                  <dd>{detail.stripeCustomerId ?? "—"}</dd>
                  {detail.cancelAt ? (
                    <>
                      <dt>Cancela el</dt>
                      <dd>{formatFullDate(detail.cancelAt)}</dd>
                    </>
                  ) : null}
                </dl>
              </div>
              <div>
                <p className="adm-mini-title">Dominios y actividad</p>
                {detail.projects.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--ink-4)", margin: 0 }}>Sin dominios creados.</p>
                ) : (
                  detail.projects.map((project) => (
                    <div className="adm-proj-block" key={project.id}>
                      <div className="adm-proj">
                        <span className="adm-proj-d">
                          {project.domain}
                          {project.isArchived ? " (archivado)" : ""}
                        </span>
                        <span className="adm-proj-s">
                          {project.latestScan
                            ? `${project.latestScan.status} · ${formatShortDate(project.latestScan.createdAt)}`
                            : "sin escaneos"}
                        </span>
                      </div>
                      {/* El interruptor real vive por proyecto; el agregado de la
                          tabla sólo resume esto. Archivado = el barrido no lo toca. */}
                      {project.isArchived ? null : (
                        <div className="adm-proj-auto">
                          <ProjectAutomationLine automation={project.automation} />
                        </div>
                      )}
                      {/* Escritura: ADMIN-CONSOLE-2b. Sin dato de automatismos no
                          hay estado actual que invertir con seguridad, así que no
                          se ofrece el control — mismo criterio que la lectura. */}
                      {!project.isArchived && project.automation ? (
                        <div className="adm-proj-write">
                          <AutomationToggleForm
                            action={setRecurringScansAsOperator}
                            projectId={project.id}
                            enabled={project.automation.recurringScansEnabled}
                            label="Recurrente"
                            q={params.q}
                            status={params.status}
                          />
                          <AutomationToggleForm
                            action={setAutoAuditHalfAsOperator}
                            half="technical"
                            projectId={project.id}
                            enabled={project.automation.technicalAuditEnabled}
                            label="Auditoría técnica"
                            q={params.q}
                            status={params.status}
                          />
                          <AutomationToggleForm
                            action={setAutoAuditHalfAsOperator}
                            half="coverage"
                            projectId={project.id}
                            enabled={project.automation.coverageAuditEnabled}
                            label="Auditoría IA"
                            q={params.q}
                            status={params.status}
                          />
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
                <p className="adm-cost-note">
                  El coste es una <strong>estimación</strong>, no lo facturado: sale de las tarifas por llamada de
                  <code> docs/llm-cost-analysis-2026-08.md</code> §7 (generación medida, extracción estimada, cobertura
                  de auditoría sin medir) por los prompts y motores activos de cada dominio.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="adm-empty">Esa cuenta ya no existe.</p>
        )
      ) : null}
    </main>
  );
}
