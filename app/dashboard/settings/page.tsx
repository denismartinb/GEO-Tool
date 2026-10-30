import type { Metadata } from "next";
import { ConversionOnMount } from "@/components/ads/conversion-on-mount";
import { requireUser } from "@/lib/auth";
import { getAccountRole } from "@/lib/account-role";
import { getUsageSummary } from "@/lib/billing";
import { deriveNameFromEmail } from "@/lib/derive-name-from-email";
import { PLANS, SELLABLE_PLANS, type Plan } from "@/app/pricing/plans-data";
import { AccountSection } from "@/components/settings/account-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";
import { SettingsFrame } from "@/components/ins/settings/settings-frame";
import { BillingContent } from "@/components/billing/billing-content";
import { readBillingDetails, readCompanyDetails } from "@/lib/settings/company-details";
import { readAvatarUrl } from "@/lib/settings/avatar";
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
  searchParams: Promise<{ checkout?: string; openPlan?: string }>;
}) {
  const { supabase, user } = await requireUser();
  const role = await getAccountRole();
  const isAdmin = role === "admin";

  const { checkout, openPlan } = await searchParams;

  const email = user.email ?? "";
  const avatarUrl = await readAvatarUrl(supabase, user.id);
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

  // EMAIL-UNSUB-1 (log §232): the two newer columns (migration 0036) in their
  // own query, same reason as the scan's `sampling_enabled`: a column
  // PostgREST doesn't know yet fails the WHOLE select, and that must not take
  // the two older toggles down with it. Missing reads as "subscribed", which
  // is the default the column itself carries.
  const { data: newerPrefs } = await supabase
    .from("profiles")
    .select("notify_first_scan, notify_lifecycle")
    .eq("id", user.id)
    .maybeSingle();

  const emailPreferences = {
    score_drop: profile?.notify_score_drop_alert ?? true,
    weekly_digest: profile?.notify_weekly_digest ?? true,
    first_scan: newerPrefs?.notify_first_scan ?? true,
    lifecycle: newerPrefs?.notify_lifecycle ?? true
  };

  // Only fetched for an admin: the section it feeds is admin-only, and so is
  // the plan pill in the header. A non-admin never triggers the query.
  const usage = isAdmin ? await getUsageSummary() : null;
  const plan = usage ? PLANS.find((candidate) => candidate.id === usage.planId) : null;

  const trialDaysLeft = usage?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(usage.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  const planPill = plan
    ? {
        text:
          (plan.id === "free" ? "Sin plan · solo lectura" : `Plan ${plan.name}`) +
          (trialDaysLeft !== null ? ` · ${trialDaysLeft} ${trialDaysLeft === 1 ? "día" : "días"} de prueba` : ""),
        readOnly: plan.id === "free"
      }
    : null;

  return (
    <div className="ins">
      <SettingsFrame
        name={fullName || "Tu cuenta"}
        email={email}
        initials={initials}
        avatarUrl={avatarUrl}
        planPill={planPill}
        showPlan={isAdmin}
        forcePlan={Boolean(openPlan) || Boolean(checkout)}
        plan={
          isAdmin ? (
            <>
              {checkout === "success" && <ConversionOnMount kind="purchase" dedupeKey="purchase" />}
              <BillingContent
                checkoutStatus={checkout}
                openPlanId={SELLABLE_PLANS.some((p) => p.id === openPlan) ? (openPlan as Plan["id"]) : undefined}
              />
            </>
          ) : null
        }
        account={
          <>
            <AccountSection
              email={email}
              firstName={firstName}
              lastName={lastName}
              company={company}
              billingDetails={billingDetails}
            />
            {/* Last block of the account tab and deliberately not a section of its
                own: an irreversible action is reached by scrolling, not by one
                click (founder, 2026-08-06). */}
            <div className="set-end">
              <div className="set-row-txt">
                <div className="set-end-t">Eliminar cuenta</div>
                <div className="set-end-d">
                  Esta acción es irreversible. Se borrará el historial y todos los datos asociados a tu cuenta.
                </div>
              </div>
              <DeleteAccountButton email={email} />
            </div>
          </>
        }
        notifications={<NotificationsSection initial={emailPreferences} />}
      />
    </div>
  );
}
