import type { UsageSummary } from "@/lib/billing";
import { PLANS } from "@/app/pricing/plans-data";

/**
 * ANDROID-TWA-1 (log §381, adenda): dentro de la app la pestaña Plan es de
 * solo lectura. Dice qué plan tiene la cuenta y en qué estado está, y nada más:
 * ni precios, ni «Cambiar de plan», ni checkout, ni enlace a pagar fuera.
 */
export function InAppPlan({ usage }: { usage: UsageSummary }) {
  const plan = PLANS.find((p) => p.id === usage.planId);
  const days = usage.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(usage.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;
  const readOnly = usage.planId === "free";
  const title = readOnly ? "Sin plan · solo lectura" : `Plan ${plan?.name ?? ""}`.trim();
  const detail = readOnly
    ? "Tu prueba ha terminado. Tus datos siguen aquí, pero los escaneos están en pausa."
    : days !== null
      ? `Prueba de Pro: te quedan ${days} ${days === 1 ? "día" : "días"}.`
      : "Suscripción activa.";
  return (
    <section aria-label="Tu suscripción">
      <div className="pf-row">
        <div className="l">
          <b>{title}</b>
          <span>{detail}</span>
        </div>
      </div>
      <div className="pf-row">
        <div className="l">
          <span>Para cambiar de plan o gestionar los pagos, entra en tu cuenta desde genscore.es en el navegador.</span>
        </div>
      </div>
    </section>
  );
}
