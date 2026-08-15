"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { fetchOperatorUserDetail } from "@/lib/admin/user-detail-action";
import type { AdminUserDetail, AdminUserRow } from "@/lib/admin/users";
import { relativeTime } from "@/lib/notifications/render";
import {
  AutomationCell,
  Cost,
  STATUS_LABEL,
  UserDetailPanel,
  buildQuery,
  formatShortDate
} from "./shared";

/**
 * ADMIN-CONSOLE-UX-1, corrección "no recargar la página al hacer clic en una
 * cuenta" (founder, 2026-08-15). Antes, cada fila era un `<Link
 * href="?u=...">`: seleccionar una cuenta navegaba, y esa navegación volvía
 * a ejecutar TODA `AdminUsersPage` en el servidor — incluida
 * `listOperatorUsers()`, que no depende de qué cuenta esté seleccionada —
 * sólo para traer el detalle de una. Sin `loading.tsx` ni límite de
 * `<Suspense>` alrededor, no había ninguna señal visual mientras tanto: la
 * página se quedaba congelada y luego cambiaba de golpe, con scroll al
 * inicio incluido — se sentía como una recarga aunque técnicamente fuera
 * navegación de cliente de Next.
 *
 * Aquí la selección es estado local: al pulsar una fila se llama a
 * `fetchOperatorUserDetail` (server action, misma puerta `requireOperator()`
 * de siempre) dentro de una transición, y sólo la ficha se actualiza — la
 * tabla ni se vuelve a pedir ni se vuelve a montar. La URL se sincroniza con
 * `history.replaceState` directamente (sin pasar por el router de Next) para
 * que la cuenta seleccionada siga siendo enlazable/recargable, sin que ese
 * cambio de URL dispare por sí mismo una nueva petición al servidor.
 *
 * Los filtros (buscador, chips de estado) siguen siendo navegación real —
 * ésos sí necesitan una lista nueva del servidor. `page.tsx` le pasa a este
 * componente una `key` derivada de TODOS los searchParams relevantes
 * (`q`+`status`+`u`+`admin_success`+`admin_error`), así que cualquier
 * navegación real (filtro cambiado, o el redirect de un formulario de
 * automatismo) cambia esa `key` y React remonta el componente entero desde
 * cero — sin necesidad de un `useEffect` comparando identidades de props,
 * que tenía un caso roto: pasar de una URL sin `u` a otra URL sin `u`
 * (p. ej. cambiar de filtro sin ninguna cuenta seleccionada) daba
 * `initialSelectedId === null` en ambas, así que nunca se detectaba como
 * cambio y el acordeón se quedaba abierto con la fila que se hubiera tocado
 * antes en el cliente — encontrado por QA antes del Human Gate.
 */
export function UsersTable({
  users,
  q,
  status,
  initialSelectedId,
  initialDetail,
  initialAdminSuccess,
  initialAdminError
}: {
  users: AdminUserRow[];
  q?: string;
  status?: string;
  initialSelectedId: string | null;
  initialDetail: AdminUserDetail | null;
  initialAdminSuccess?: string;
  initialAdminError?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [detailCache, setDetailCache] = useState<Record<string, AdminUserDetail | null>>(() =>
    initialSelectedId ? { [initialSelectedId]: initialDetail } : {}
  );
  const [adminSuccess, setAdminSuccess] = useState<string | undefined>(initialAdminSuccess);
  const [adminError, setAdminError] = useState<string | undefined>(initialAdminError);
  const [, startTransition] = useTransition();

  function selectUser(userId: string) {
    setSelectedId(userId);
    setAdminSuccess(undefined);
    setAdminError(undefined);
    window.history.replaceState(null, "", buildQuery({ q, status, u: userId }));
    if (!(userId in detailCache)) {
      startTransition(async () => {
        const detail = await fetchOperatorUserDetail(userId);
        setDetailCache((prev) => ({ ...prev, [userId]: detail }));
      });
    }
  }

  function closeDetail() {
    setSelectedId(null);
    setAdminSuccess(undefined);
    setAdminError(undefined);
    window.history.replaceState(null, "", buildQuery({ q, status }));
  }

  if (users.length === 0) {
    return (
      <div className="adm-table-wrap">
        <p className="adm-empty">Ninguna cuenta coincide con este filtro.</p>
      </div>
    );
  }

  const selectedVisible = selectedId ? users.some((row) => row.id === selectedId) : false;

  function renderDetail(userId: string) {
    if (!(userId in detailCache)) return <p className="adm-empty">Cargando…</p>;
    const detail = detailCache[userId];
    if (!detail) return <p className="adm-empty">Esa cuenta ya no existe.</p>;
    return <UserDetailPanel detail={detail} q={q} status={status} adminSuccess={adminSuccess} adminError={adminError} onClose={closeDetail} />;
  }

  return (
    <>
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
            {users.map((row) => (
              <Fragment key={row.id}>
                <tr className={row.id === selectedId ? "adm-row-selected" : undefined}>
                  <td>
                    <Link
                      href={buildQuery({ q, status, u: row.id })}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                        event.preventDefault();
                        selectUser(row.id);
                      }}
                    >
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
                {/* Acordeón en el sitio (ADMIN-CONSOLE-UX-1, §80): el detalle
                    baja justo bajo la fila tocada. .adm-detail-sticky ancla
                    el contenido al borde visible de .adm-table-wrap (100cqi)
                    en vez de al ancho de esta fila de 760px+ — si no, sólo se
                    lee desplazando la tabla, cortado a los lados en móvil. */}
                {row.id === selectedId ? (
                  <tr className="adm-detail-row">
                    <td colSpan={9} className="adm-detail-cell">
                      <div className="adm-detail-sticky">{renderDetail(row.id)}</div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sólo cuando la cuenta seleccionada ya no está en la página filtrada
          actual (un cambio de buscador/filtro la dejó fuera) — el caso
          normal ya se pintó en línea, justo bajo su fila, arriba. */}
      {selectedId && !selectedVisible ? <div className="adm-drawer-standalone">{renderDetail(selectedId)}</div> : null}
    </>
  );
}
