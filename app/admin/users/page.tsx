import Link from "next/link";
import type { Metadata } from "next";
import { requireOperator } from "@/lib/admin/operator";
import { getOperatorUserDetail, listOperatorUsers, type AdminUserStatus } from "@/lib/admin/users";
import { formatUsd, provenanceLabel, type CostProvenance } from "@/lib/admin/cost-model";
import { STATUS_FILTERS, buildQuery, currency } from "./shared";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Usuarios — Consola de operador" };

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

  // Sólo para la carga inicial (deep link / recarga real): a partir de aquí,
  // seleccionar otra cuenta es interacción de cliente (ADMIN-CONSOLE-UX-1,
  // corrección "no recargar la página al hacer clic" — ver users-table.tsx).
  const initialDetail = params.u ? await getOperatorUserDetail(service, params.u) : null;

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

      <UsersTable
        // Fuerza un remount completo en cada navegación real (filtro
        // cambiado, o redirect de un formulario de automatismo) — incluye
        // los cinco searchParams porque cualquiera de ellos puede cambiar
        // sin que otro lo haga (p. ej. `u` pasa de ausente a ausente al
        // cambiar sólo de filtro, ver el comentario en users-table.tsx).
        key={`${params.q ?? ""}|${params.status ?? ""}|${params.u ?? ""}|${params.admin_success ?? ""}|${params.admin_error ?? ""}`}
        users={filtered}
        q={params.q}
        status={params.status}
        initialSelectedId={params.u ?? null}
        initialDetail={initialDetail}
        initialAdminSuccess={params.admin_success}
        initialAdminError={params.admin_error}
      />
    </main>
  );
}
