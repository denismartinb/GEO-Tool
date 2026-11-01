import type { Metadata } from "next";
import Link from "next/link";
import { requireOperator } from "@/lib/admin/operator";
import { PANEL_PERIODS, panelWindow, parsePanelPeriod } from "@/lib/admin/kpi/period";
import { loadCountedUsers } from "@/lib/admin/kpi/business";
import { loadEmailSection, readResendEmails } from "@/lib/admin/kpi/email";
import { EmailCapture } from "./email-capture";
import { refreshAdminCrm } from "./actions";

export const metadata: Metadata = { title: "CRM · Consola de operador" };

/**
 * ADMIN-EMAIL-1 — /admin/crm: email capture (contacts, unsubscribes, emails
 * sent). Its own tab at Denis's request (2026-11-01), with the panel's period
 * selector and account filter. Read-only: Supabase and Resend.
 */
export default async function AdminCrmPage({ searchParams }: { searchParams: Promise<{ periodo?: string | string[] }> }) {
  const { service } = await requireOperator("/admin/crm");
  const period = parsePanelPeriod((await searchParams).periodo);
  const now = new Date();
  const window = panelWindow(period, now);

  const resendRead = readResendEmails(now);
  const users = await loadCountedUsers(service);
  const email = await loadEmailSection({
    service,
    window,
    now,
    users: users?.users ?? null,
    authUsersTruncated: users?.authUsersTruncated ?? false,
    resend: resendRead
  });

  return (
    <main className="adm-main adm-pn">
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">CRM</h1>
          <p className="adm-sub">Supabase y Resend · sin cuentas propias ni de prueba</p>
        </div>
        <div className="adm-pn-controls">
          <nav className="adm-pn-seg" aria-label="Periodo">
            {PANEL_PERIODS.map((p) => (
              <Link
                key={p.id}
                href={`/admin/crm?periodo=${p.id}`}
                className={p.id === period ? "adm-pn-seg-on" : undefined}
                aria-current={p.id === period ? "page" : undefined}
              >
                {p.label}
              </Link>
            ))}
          </nav>
          <form action={refreshAdminCrm}>
            <input type="hidden" name="periodo" value={period} />
            <button type="submit" className="adm-pn-btn">
              Actualizar
            </button>
          </form>
        </div>
      </div>

      <EmailCapture email={email} periodLabel={window.label} />
    </main>
  );
}
