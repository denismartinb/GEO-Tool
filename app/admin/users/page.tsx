import Link from "next/link";
import type { Metadata } from "next";
import { requireOperator } from "@/lib/admin/operator";
import { getOperatorUserDetail, listOperatorUsers, type AdminUserRow, type AdminUserStatus } from "@/lib/admin/users";
import { relativeTime } from "@/lib/notifications/render";

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
  searchParams: Promise<{ q?: string; status?: string; u?: string }>;
}) {
  const params = await searchParams;
  const { service } = await requireOperator("/admin/users");

  const { users, authUsersTruncated } = await listOperatorUsers(service);

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

  const detail = params.u ? await getOperatorUserDetail(service, params.u) : null;

  return (
    <main className="adm-main">
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Usuarios</h1>
          <p className="adm-sub">{users.length} cuentas · sólo lectura</p>
        </div>
      </div>

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
                    <div className="adm-proj" key={project.id}>
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
                  ))
                )}
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
