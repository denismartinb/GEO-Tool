import Link from "next/link";
import { formatUsd, provenanceLabel, type CostProvenance } from "@/lib/admin/cost-format";
import type { AccountAutomation, ProjectAutomation } from "@/lib/admin/automation";
import { setAutoAuditHalfAsOperator, setRecurringScansAsOperator } from "@/lib/admin/automation-actions";
import type { AdminUserDetail, AdminUserRow, AdminUserStatus } from "@/lib/admin/users";

/**
 * Piezas compartidas entre `page.tsx` (server, carga inicial) y
 * `users-table.tsx` (client, interacción de selección — ADMIN-CONSOLE-UX-1,
 * corrección "no recargar la página al hacer clic"). Ninguna usa nada
 * server-only: son funciones puras y componentes sin `async`, así que
 * pueden importarse desde cualquiera de los dos lados de la frontera.
 */

export const ADMIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_input: "Datos inválidos.",
  project_not_found: "Ese dominio no existe o está archivado.",
  recurring_free_plan_ineffective:
    "Este dominio es Free: el barrido descarta los proyectos Free, así que activar el recurrente no tendría efecto.",
  recurring_requires_completed_scan: "Hace falta al menos un escaneo completado antes de activar el recurrente.",
  recurring_update_failed: "No se pudo guardar el cambio del escaneo recurrente.",
  coverage_plan_ineffective:
    "La auditoría de cobertura sólo corre en Pro o superior: activarla aquí no tendría efecto.",
  auto_audit_update_failed: "No se pudo guardar el cambio de la auditoría automática."
};

export const ADMIN_SUCCESS_MESSAGES: Record<string, string> = {
  recurring_enabled: "Escaneo recurrente activado.",
  recurring_disabled: "Escaneo recurrente desactivado.",
  audit_technical_enabled: "Auditoría técnica activada.",
  audit_technical_disabled: "Auditoría técnica desactivada.",
  audit_coverage_enabled: "Auditoría de cobertura IA activada.",
  audit_coverage_disabled: "Auditoría de cobertura IA desactivada."
};

export const STATUS_FILTERS: Array<{ value: AdminUserStatus | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "trial", label: "En prueba" },
  { value: "paid", label: "De pago" },
  { value: "free", label: "Free" },
  { value: "trial_expired", label: "Prueba caducada" }
];

export const STATUS_LABEL: Record<AdminUserStatus, (row: AdminUserRow) => string> = {
  trial: (row) => `Prueba · vence ${formatShortDate(row.trialEndsAt)}`,
  trial_expired: () => "Prueba caducada",
  paid: () => "De pago",
  free: () => "Free"
};

export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export function formatFullDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function currency(value: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

export function buildQuery(base: { q?: string; status?: string; u?: string }): string {
  const params = new URLSearchParams();
  if (base.q) params.set("q", base.q);
  if (base.status && base.status !== "all") params.set("status", base.status);
  if (base.u) params.set("u", base.u);
  const qs = params.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

/**
 * ADMIN-CONSOLE-2a. Un agregado `activos/total`, nunca un booleano por
 * usuario: esos interruptores viven en `projects`, así que una cuenta con
 * cinco dominios puede tenerlos mezclados y una sola casilla mentiría en
 * cuanto dos discreparan.
 */
export function AutomationCell({ automation, kind }: { automation: AccountAutomation | null; kind: "recurring" | "audit" }) {
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
export function Cost({ usd, provenance }: { usd: number; provenance: CostProvenance }) {
  return (
    <span className="adm-cost">
      {formatUsd(usd)}
      <span className="adm-cost-tag">{provenanceLabel(provenance)}</span>
    </span>
  );
}

export function ProjectAutomationLine({ automation }: { automation: ProjectAutomation | null }) {
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
 * uno actúa sobre un proyecto y una columna distintos, y "activé el
 * recurrente" no debe poder confundirse con "activé la auditoría de
 * cobertura" al enviar. Desde ADMIN-CONSOLE-UX-1 (§80) ya no lleva campo de
 * motivo — decisión explícita del fundador; el email de aviso sigue siendo
 * el registro de quién/qué/cuándo, sin el porqué.
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
      <button type="submit" className={`btn ${enabled ? "adm-toggle-btn-off" : "btn-primary"}`}>
        {enabled ? "Desactivar" : "Activar"}
      </button>
    </form>
  );
}

/**
 * Contenido de la ficha de una cuenta. `onClose` sustituye al enlace "Cerrar"
 * de antes de ADMIN-CONSOLE-UX-1 (corrección "no recargar la página"): quien
 * la usa decide si cerrar navega o sólo limpia estado local.
 */
export function UserDetailPanel({
  detail,
  q,
  status,
  adminSuccess,
  adminError,
  onClose
}: {
  detail: AdminUserDetail;
  q?: string;
  status?: string;
  adminSuccess?: string;
  adminError?: string;
  onClose: () => void;
}) {
  return (
    <div className="adm-drawer">
      <div className="adm-drawer-top">
        <div>
          <h2>{detail.email}</h2>
          <span className="adm-uid">{detail.id}</span>
        </div>
        <Link
          href={buildQuery({ q, status })}
          className="adm-close"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onClose();
          }}
        >
          Cerrar ✕
        </Link>
      </div>
      {adminSuccess ? (
        <p className="feedback success" style={{ margin: "14px 20px 0" }}>
          {ADMIN_SUCCESS_MESSAGES[adminSuccess] ?? "Cambio guardado."}
        </p>
      ) : null}
      {adminError ? (
        <p className="feedback error" style={{ margin: "14px 20px 0" }}>
          {ADMIN_ERROR_MESSAGES[adminError] ?? "No se pudo completar el cambio."}
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
                      q={q}
                      status={status}
                    />
                    <AutomationToggleForm
                      action={setAutoAuditHalfAsOperator}
                      half="technical"
                      projectId={project.id}
                      enabled={project.automation.technicalAuditEnabled}
                      label="Auditoría técnica"
                      q={q}
                      status={status}
                    />
                    <AutomationToggleForm
                      action={setAutoAuditHalfAsOperator}
                      half="coverage"
                      projectId={project.id}
                      enabled={project.automation.coverageAuditEnabled}
                      label="Auditoría IA"
                      q={q}
                      status={status}
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
  );
}
