import type { Metadata } from "next";
import { requireOperator } from "@/lib/admin/operator";
import { affiliateCodesEnv } from "@/lib/affiliates/codes";
import { summarizeAffiliateCodes, type AffiliateAccount } from "@/lib/admin/affiliates";
import { SITE_URL } from "@/lib/seo/metadata";
import { AffiliateLinks } from "./affiliate-links";

export const metadata: Metadata = { title: "Afiliados · Consola de operador" };

/** Same cap as the Usuarios table (`lib/admin/users.ts`). */
const AUTH_USERS_FETCH_CAP = 1000;

/**
 * AFFILIATES-ADMIN-1 — active codes, the accounts each one brought, and the
 * links to share. Read-only: codes are edited in Vercel (`AFFILIATE_CODES`).
 */
export default async function AdminAffiliatesPage() {
  const { service } = await requireOperator("/admin/afiliados");

  const [authResult, profilesResult] = await Promise.all([
    service.auth.admin.listUsers({ page: 1, perPage: AUTH_USERS_FETCH_CAP }),
    service.from("profiles").select("id, stripe_subscription_id")
  ]);
  if (authResult.error) throw new Error(`admin affiliates: failed to read auth users — ${authResult.error.message}`);
  if (profilesResult.error) throw new Error(`admin affiliates: failed to read profiles — ${profilesResult.error.message}`);

  const paidIds = new Set((profilesResult.data ?? []).filter((p) => p.stripe_subscription_id).map((p) => p.id));
  const authUsers = authResult.data.users ?? [];
  const authTotal = "total" in authResult.data ? (authResult.data.total as number) : authUsers.length;
  const accounts: AffiliateAccount[] = authUsers.map((user) => ({
    referralCode: user.user_metadata?.referral_code,
    paid: paidIds.has(user.id)
  }));

  const envValue = affiliateCodesEnv();
  const rows = summarizeAffiliateCodes(envValue, accounts);
  const activeCodes = rows.filter((row) => row.active).map((row) => row.code);

  return (
    <main className="adm-main">
      <div className="adm-head">
        <div>
          <h1 className="adm-h1">Afiliados</h1>
          <p className="adm-sub">
            Códigos activos y enlaces para compartir · sólo lectura. Los códigos se añaden o quitan en Vercel
            (<code>AFFILIATE_CODES</code>) y se aplican tras un Redeploy.
          </p>
        </div>
      </div>

      {authTotal > authUsers.length ? (
        <p className="adm-note">
          Hay más cuentas de las que esta página lee de una vez, así que las altas por código pueden quedarse cortas.
        </p>
      ) : null}

      {activeCodes.length === 0 ? (
        <p className="adm-note">
          No hay ningún código activo: <code>AFFILIATE_CODES</code> está vacía o sin códigos válidos en este entorno.
          Mientras tanto, ningún enlace con <code>?ref=</code> atribuye altas.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="adm-table-wrap adm-aff-table">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Estado</th>
                <th className="adm-num">Altas</th>
                <th className="adm-num">De pago</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code}>
                  <td className="adm-em">{row.code}</td>
                  <td>
                    <span className={`adm-pill ${row.active ? "adm-pill-paid" : "adm-pill-free"}`}>
                      {row.active ? "Activo" : "Retirado"}
                    </span>
                  </td>
                  <td className="adm-num">{row.signups}</td>
                  <td className="adm-num">{row.paid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="adm-cmp-hint">
        «De pago» cuenta las cuentas con suscripción en Stripe, igual que en Usuarios. La comisión real la calcula el
        informe del día 5 a partir de los cobros.
      </p>

      {activeCodes.length > 0 ? <AffiliateLinks codes={activeCodes} siteUrl={SITE_URL} /> : null}
    </main>
  );
}
