import "server-only";

import { NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/api/internal-auth";
import { getPriceIdForPlan, getStripeClient } from "@/lib/stripe";
import { runAffiliateReport } from "@/lib/affiliates/report";
import { createStripeAffiliateSource } from "@/lib/affiliates/stripe-source";
import { sendAffiliateReportEmail, sendAffiliateReportFailureEmail } from "@/lib/affiliates/emails";
import { AFFILIATE_PLAN_ID } from "@/lib/affiliates/terms";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * AFFILIATES-1. On the 5th of every month at 07:00 UTC ("0 7 5 * *",
 * `vercel.json`): the commissions earned in the previous calendar month
 * (Europe/Madrid), emailed to `OPS_ALERT_EMAIL`. Read-only against Stripe and
 * writes nothing anywhere, so a manual re-run (same `CRON_SECRET`) only sends
 * the email again. Same auth as every other cron.
 */
export async function GET(request: Request) {
  if (!isAuthorizedInternalRequest(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stripe = getStripeClient();
  const result = await runAffiliateReport({
    now: new Date(),
    proPriceId: getPriceIdForPlan(AFFILIATE_PLAN_ID),
    source: stripe ? createStripeAffiliateSource(stripe) : null,
    sendReport: sendAffiliateReportEmail,
    sendFailure: sendAffiliateReportFailureEmail,
    log: (event, detail) => console.warn(`[geo:affiliate-report] ${event}`, detail ?? {})
  });

  if ("report" in result) {
    return NextResponse.json(
      {
        status: result.status,
        period: result.report.period.label,
        affiliates: result.report.affiliates.length,
        totalCommissionCents: result.report.totalCommissionCents
      },
      { status: result.status === "sent" ? 200 : 500 }
    );
  }
  return NextResponse.json({ status: result.status, period: result.period.label }, { status: 500 });
}
