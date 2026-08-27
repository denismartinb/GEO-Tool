import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getAccountRole } from "@/lib/account-role";
import { getUsageSummary } from "@/lib/billing";
import { deriveNameFromEmail } from "@/lib/derive-name-from-email";
import { PLANS } from "@/app/pricing/plans-data";
import { AccountSection } from "@/components/settings/account-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";
import { SettingsIndex } from "@/components/settings/settings-index";
import { buildSettingsIndex } from "@/lib/settings/index-entries";
import { BillingContent } from "@/components/billing/billing-content";
import { readBillingDetails, readCompanyDetails } from "@/lib/settings/company-details";
import { consoleMetadata } from "@/lib/seo/console-metadata";

/**
 * CONSOLE-REDESIGN-1 — the four account screens folded into one route.
 *
 * Was: /settings/{profile,organization,notifications,billing} behind a tab bar.
 * Now: this page, with three sections and a sticky index that also summarises
 * the account. The four old routes stay forever as redirects to the anchors —
 * four transactional emails already in people's inboxes link to them
 * (lib/email/transactional.ts), and those cannot be rewritten.
 *
 * Approved design: docs/design-reference/console-redesign-1/.
 */
// ROOT-METADATA-1: pestaña propia. Ver `lib/seo/console-metadata.ts`.
export const metadata: Metadata = consoleMetadata("Ajustes");

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const role = await getAccountRole();
  const isAdmin = role === "admin";

  const { checkout } = await searchParams;

  const email = user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  const metadata = user.user_metadata ?? {};
  const [fallbackFirst, ...fallbackLastParts] = deriveNameFromEmail(email).split(" ");
  const firstName =
    typeof metadata.first_name === "string" && metadata.first_name.trim()
      ? metadata.first_name
      : fallbackFirst ?? "";
  const lastName =
    typeof metadata.last_name === "string" && metadata.last_name.trim()
      ? metadata.last_name
      : fallbackLastParts.join(" ");

  const company = readCompanyDetails(metadata);
  const billingDetails = readBillingDetails(metadata);

  const { data: profile } = await supabase
    .from("profiles")
    .select("notify_score_drop_alert, notify_weekly_digest")
    .eq("id", user.id)
    .maybeSingle();

  const scoreDropAlert = profile?.notify_score_drop_alert ?? true;
  const weeklyDigest = profile?.notify_weekly_digest ?? true;
  const activeAlerts = [scoreDropAlert, weeklyDigest].filter(Boolean).length;

  // Only fetched for an admin: the section it feeds is admin-only, and so is
  // the plan pill in the header. A non-admin never triggers the query.
  const usage = isAdmin ? await getUsageSummary() : null;
  const plan = usage ? PLANS.find((candidate) => candidate.id === usage.planId) : null;

  const trialDaysLeft = usage?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(usage.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  // PRICING-PROMO-1: same struck-through/promo-price convention as "Tu plan"
  // below (plan-billing-section.tsx) — usage.subscriptionPromo is already the
  // real, Stripe-verified discount for this exact subscription.
  const planLabel =
    isAdmin && plan
      ? (plan.priceLabel ??
        (usage?.subscriptionPromo ? (
          <>
            {plan.name} ·{" "}
            <span className="was">
              {plan.price}&nbsp;€/{plan.period}
            </span>{" "}
            <span className="now">
              {usage.subscriptionPromo.promoPrice}&nbsp;€/{plan.period}
            </span>
          </>
        ) : (
          `${plan.name} · ${plan.price} €/mes`
        )))
      : null;

  const entries = buildSettingsIndex({
    fullName,
    email,
    activeAlerts,
    // Null for a non-admin — the same condition that hides the Plan section
    // below, so the index can never advertise a section that is not there.
    planLabel
  });

  return (
    <div className="page set-scope">
      <div className="set-page">
        <div className="set-head">
          <div>
            <p className="set-kicker">Espacio de trabajo</p>
            <h1 className="set-title">Ajustes</h1>
          </div>
          {plan && (
            <span className="set-pill">
              Plan {plan.name}
              {trialDaysLeft !== null && ` · ${trialDaysLeft} ${trialDaysLeft === 1 ? "día" : "días"} de prueba`}
            </span>
          )}
        </div>

        <div className="set-two">
          <SettingsIndex entries={entries} />

          <div className="set-col">
            <h2 className="set-sech" id="cuenta">
              Cuenta
            </h2>
            <AccountSection
              email={email}
              initials={initials}
              firstName={firstName}
              lastName={lastName}
              company={company}
              billingDetails={billingDetails}
            />

            {isAdmin && (
              <>
                <h2 className="set-sech sp" id="plan">
                  Plan
                </h2>
                <BillingContent checkoutStatus={checkout} />
              </>
            )}

            <h2 className="set-sech sp" id="avisos">
              Notificaciones
            </h2>
            <NotificationsSection initialScoreDropAlert={scoreDropAlert} initialWeeklyDigest={weeklyDigest} />

            {/* Last block on the page and deliberately not in the index: an
                irreversible action is reached by scrolling, not by one click
                (founder, 2026-08-06). */}
            <div className="set-end">
              <div className="set-row-txt">
                <div className="set-end-t">Eliminar cuenta</div>
                <div className="set-end-d">
                  Esta acción es irreversible. Se borrará el historial y todos los datos asociados a tu cuenta.
                </div>
              </div>
              <DeleteAccountButton email={email} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
