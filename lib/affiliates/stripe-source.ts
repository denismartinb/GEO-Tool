import "server-only";

import type Stripe from "stripe";
import { normalizeAffiliateCode } from "@/lib/affiliates/codes";
import { toReportInvoice, type AffiliateReportSource, type ReportInvoice } from "@/lib/affiliates/report";

/**
 * AFFILIATES-1 — the Stripe reads behind the monthly report. Read-only: this
 * module never writes to Stripe. Every list auto-paginates, so a busy month
 * is not silently cut at the first page (`.claude/rules/scan.md`, "Never cap
 * the work by row count", same lesson).
 */
export function createStripeAffiliateSource(stripe: Stripe): AffiliateReportSource {
  return {
    async listPaidInvoices({ createdGte, createdLt }) {
      const invoices: ReportInvoice[] = [];
      for await (const invoice of stripe.invoices.list({
        status: "paid",
        created: { gte: createdGte, lt: createdLt },
        limit: 100
      })) {
        invoices.push(toReportInvoice(invoice));
      }
      return invoices;
    },

    async getAttribution(subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      let firstPaidAt: number | null = null;
      for await (const invoice of stripe.invoices.list({ subscription: subscriptionId, status: "paid", limit: 100 })) {
        // The trial's 0 € invoice is "paid" too; the 12 months start at the first real charge.
        if ((invoice.amount_paid ?? 0) <= 0) continue;
        const paidAt = invoice.status_transitions?.paid_at ?? null;
        if (paidAt !== null && (firstPaidAt === null || paidAt < firstPaidAt)) firstPaidAt = paidAt;
      }
      return { ref: normalizeAffiliateCode(subscription.metadata?.ref ?? null), firstPaidAt };
    },

    async getRefundedCents(invoiceId) {
      let refunded = 0;
      for await (const payment of stripe.invoicePayments.list({ invoice: invoiceId, status: "paid", limit: 100 })) {
        const { charge, payment_intent: paymentIntent } = payment.payment;
        if (charge) {
          const chargeObject = typeof charge === "string" ? await stripe.charges.retrieve(charge) : charge;
          refunded += chargeObject.amount_refunded ?? 0;
        } else if (paymentIntent) {
          const intent =
            typeof paymentIntent === "string"
              ? await stripe.paymentIntents.retrieve(paymentIntent, { expand: ["latest_charge"] })
              : paymentIntent;
          const latest = intent.latest_charge;
          const latestCharge = typeof latest === "string" ? await stripe.charges.retrieve(latest) : latest;
          refunded += latestCharge?.amount_refunded ?? 0;
        }
      }
      return refunded;
    }
  };
}
