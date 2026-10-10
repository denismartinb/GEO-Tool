import type Stripe from "stripe";
import { AFFILIATE_COMMISSION_MONTHS, AFFILIATE_COMMISSION_RATE, AFFILIATE_PAYOUT_MIN_EUR } from "@/lib/affiliates/terms";
import { normalizeAffiliateCode } from "@/lib/affiliates/codes";

/**
 * AFFILIATES-1 — the monthly commission report, as pure computation.
 *
 * On the 5th the cron (`/api/cron/affiliate-report`) lists the Stripe
 * invoices paid in the previous calendar month (Europe/Madrid) and hands them
 * here. An invoice earns commission only if ALL of these hold:
 *   - it belongs to a subscription whose metadata carries an affiliate `ref`;
 *   - one of its lines is the Pro plan's Stripe price;
 *   - it actually charged money (`amount_paid > 0`) — the trial never does;
 *   - it was paid within 12 months of that subscription's first paid invoice.
 * The base is what was charged without VAT and net of refunds; the commission
 * is 30 % of that base. Nothing here talks to Stripe or the clock: the cron
 * injects both.
 */

export type ReportInvoice = {
  id: string;
  number: string | null;
  subscriptionId: string | null;
  /** `ref` from the invoice's subscription-metadata snapshot, if any. */
  snapshotRef: string | null;
  /** Seconds since epoch (Stripe's unit). */
  paidAt: number | null;
  amountPaid: number;
  taxAmount: number;
  priceIds: string[];
  currency: string;
  /** Credit notes issued after payment (refunds through a credit note). */
  postPaymentCreditCents: number;
};

export type SubscriptionAttribution = {
  /** `ref` from the subscription's live metadata. */
  ref: string | null;
  /** When the subscription's first invoice with real money was paid (seconds). */
  firstPaidAt: number | null;
};

export type ReportPeriod = { start: Date; end: Date; label: string };

export type CommissionLine = {
  invoiceId: string;
  invoiceNumber: string | null;
  subscriptionId: string;
  paidAt: number;
  baseCents: number;
  commissionCents: number;
  refundedCents: number;
};

export type AffiliateSummary = {
  code: string;
  lines: CommissionLine[];
  baseCents: number;
  commissionCents: number;
  /** This month alone reaches the payout floor. Earlier unpaid months are not stored anywhere. */
  reachesPayoutFloor: boolean;
};

export type AffiliateReport = {
  period: ReportPeriod;
  affiliates: AffiliateSummary[];
  totalCommissionCents: number;
  /** Invoices with a ref that did not qualify, with the reason — so the operator can check. */
  excluded: Array<{ invoiceId: string; code: string; reason: ExclusionReason }>;
};

export type ExclusionReason = "not_pro" | "no_charge" | "outside_12_months" | "first_payment_unknown" | "non_eur";

const MADRID_TZ = "Europe/Madrid";

/** Offset of Europe/Madrid from UTC at `instant`, in minutes (60 or 120). */
function madridOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MADRID_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** 00:00 Madrid on the 1st of `month` (1–12) of `year`, as a UTC instant. */
function madridMonthStart(year: number, month: number): Date {
  const naive = Date.UTC(year, month - 1, 1, 0, 0, 0);
  // Never a DST switch day (those are last Sundays), so one correction is exact.
  return new Date(naive - madridOffsetMinutes(new Date(naive)) * 60_000);
}

/** The calendar month before `now`, with Madrid boundaries: [start, end). */
export function previousMonthInMadrid(now: Date): ReportPeriod {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: MADRID_TZ, year: "numeric", month: "numeric" }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const start = madridMonthStart(prevYear, prevMonth);
  const end = madridMonthStart(year, month);
  const label = new Intl.DateTimeFormat("es-ES", { timeZone: MADRID_TZ, month: "long", year: "numeric" }).format(start);
  return { start, end, label };
}

/** `seconds` plus `months` calendar months (UTC), in seconds. */
export function addMonthsSeconds(seconds: number, months: number): number {
  const date = new Date(seconds * 1000);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return Math.floor(date.getTime() / 1000);
}

/**
 * Base without VAT and net of refunds. A refund returns the gross amount (VAT
 * included), so it is removed proportionally: refunding half of a payment
 * removes half of its net base.
 */
export function commissionBaseCents(input: { amountPaid: number; taxAmount: number; refundedCents: number }): number {
  if (input.amountPaid <= 0) return 0;
  const net = Math.max(0, input.amountPaid - Math.max(0, input.taxAmount));
  const refundedShare = Math.min(1, Math.max(0, input.refundedCents) / input.amountPaid);
  return Math.max(0, Math.round(net * (1 - refundedShare)));
}

export function commissionCents(baseCents: number): number {
  return Math.round(baseCents * AFFILIATE_COMMISSION_RATE);
}

/** The Stripe-shaped fields this report reads, mapped once. */
export function toReportInvoice(invoice: Stripe.Invoice): ReportInvoice {
  const details = invoice.parent?.subscription_details ?? null;
  const subscription = details?.subscription ?? null;
  const priceIds: string[] = [];
  for (const line of invoice.lines?.data ?? []) {
    const price = line.pricing?.price_details?.price;
    if (typeof price === "string") priceIds.push(price);
    else if (price && typeof price === "object" && "id" in price) priceIds.push(price.id);
  }
  return {
    id: invoice.id ?? "",
    number: invoice.number ?? null,
    subscriptionId: typeof subscription === "string" ? subscription : (subscription?.id ?? null),
    snapshotRef: normalizeAffiliateCode(details?.metadata?.ref ?? null),
    paidAt: invoice.status_transitions?.paid_at ?? null,
    amountPaid: invoice.amount_paid ?? 0,
    taxAmount: (invoice.total_taxes ?? []).reduce((sum, tax) => sum + (tax.amount ?? 0), 0),
    priceIds,
    currency: (invoice.currency ?? "").toLowerCase(),
    postPaymentCreditCents: invoice.post_payment_credit_notes_amount ?? 0
  };
}

/** Invoices paid inside `period`, with an affiliate ref on their subscription. */
export function invoicesInPeriod(invoices: ReportInvoice[], period: ReportPeriod): ReportInvoice[] {
  const startS = period.start.getTime() / 1000;
  const endS = period.end.getTime() / 1000;
  return invoices.filter((invoice) => invoice.paidAt !== null && invoice.paidAt >= startS && invoice.paidAt < endS);
}

export function computeAffiliateReport(input: {
  period: ReportPeriod;
  invoices: ReportInvoice[];
  attributions: Map<string, SubscriptionAttribution>;
  refundedCents: Map<string, number>;
  proPriceId: string;
}): AffiliateReport {
  const byCode = new Map<string, AffiliateSummary>();
  const excluded: AffiliateReport["excluded"] = [];

  for (const invoice of invoicesInPeriod(input.invoices, input.period)) {
    if (!invoice.subscriptionId || invoice.paidAt === null) continue;
    // Only invoices that carry a ref are attributed (see `subscriptionsToResolve`).
    if (!invoice.snapshotRef) continue;
    const attribution = input.attributions.get(invoice.subscriptionId);
    // The live subscription metadata wins when present (the founder may have
    // corrected it by hand in Stripe); otherwise the invoice's snapshot.
    const code = normalizeAffiliateCode(attribution?.ref ?? null) ?? invoice.snapshotRef;

    const exclude = (reason: ExclusionReason) => excluded.push({ invoiceId: invoice.id, code, reason });
    if (!invoice.priceIds.includes(input.proPriceId)) {
      exclude("not_pro");
      continue;
    }
    if (invoice.amountPaid <= 0) {
      exclude("no_charge");
      continue;
    }
    if (invoice.currency !== "eur") {
      exclude("non_eur");
      continue;
    }
    const firstPaidAt = attribution?.firstPaidAt ?? null;
    if (firstPaidAt === null) {
      exclude("first_payment_unknown");
      continue;
    }
    if (invoice.paidAt >= addMonthsSeconds(firstPaidAt, AFFILIATE_COMMISSION_MONTHS)) {
      exclude("outside_12_months");
      continue;
    }

    const refundedCents = input.refundedCents.get(invoice.id) ?? 0;
    const baseCents = commissionBaseCents({ amountPaid: invoice.amountPaid, taxAmount: invoice.taxAmount, refundedCents });
    const line: CommissionLine = {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      subscriptionId: invoice.subscriptionId,
      paidAt: invoice.paidAt,
      baseCents,
      commissionCents: commissionCents(baseCents),
      refundedCents
    };
    const summary = byCode.get(code) ?? { code, lines: [], baseCents: 0, commissionCents: 0, reachesPayoutFloor: false };
    summary.lines.push(line);
    summary.baseCents += line.baseCents;
    summary.commissionCents += line.commissionCents;
    summary.reachesPayoutFloor = summary.commissionCents >= AFFILIATE_PAYOUT_MIN_EUR * 100;
    byCode.set(code, summary);
  }

  const affiliates = [...byCode.values()].sort((a, b) => b.commissionCents - a.commissionCents || a.code.localeCompare(b.code));
  return {
    period: input.period,
    affiliates,
    totalCommissionCents: affiliates.reduce((sum, a) => sum + a.commissionCents, 0),
    excluded
  };
}

/**
 * Subscription ids worth asking Stripe about: paid in the period AND carrying
 * a ref on the invoice. Checkout writes the ref into the subscription's
 * metadata at creation, so every attributed invoice carries it in its
 * snapshot — which bounds the Stripe calls to attributed accounts instead of
 * every paying customer.
 */
export function subscriptionsToResolve(invoices: ReportInvoice[], period: ReportPeriod): string[] {
  return [
    ...new Set(
      invoicesInPeriod(invoices, period).flatMap((i) => (i.subscriptionId && i.snapshotRef ? [i.subscriptionId] : []))
    )
  ];
}

/** What the runner needs from Stripe, injected so the whole run is testable. */
export type AffiliateReportSource = {
  /** Paid invoices created in [createdGte, createdLt) (seconds). */
  listPaidInvoices: (range: { createdGte: number; createdLt: number }) => Promise<ReportInvoice[]>;
  getAttribution: (subscriptionId: string) => Promise<SubscriptionAttribution>;
  /** Gross amount refunded on the invoice's payments (cents). */
  getRefundedCents: (invoiceId: string) => Promise<number>;
};

/**
 * How far back to list by creation date. An invoice is listed by `created`
 * but counted by `paid_at`: a renewal whose card failed can be paid weeks
 * after it was created, and it still belongs to the month it was paid in.
 */
export const INVOICE_CREATED_LOOKBACK_S = 62 * 24 * 60 * 60;

export type AffiliateReportRunResult =
  | { status: "sent" | "send_failed"; report: AffiliateReport }
  | { status: "source_failed" | "not_configured"; period: ReportPeriod };

export async function runAffiliateReport(deps: {
  now: Date;
  proPriceId: string | null;
  source: AffiliateReportSource | null;
  sendReport: (report: AffiliateReport) => Promise<boolean>;
  sendFailure: (input: { period: ReportPeriod; reason: "not_configured" | "source_failed" }) => Promise<boolean>;
  log?: (event: string, detail?: Record<string, unknown>) => void;
}): Promise<AffiliateReportRunResult> {
  const period = previousMonthInMadrid(deps.now);
  const log = deps.log ?? (() => {});

  // A month with no report is a month nobody gets paid: say so, never stay silent.
  if (!deps.source || !deps.proPriceId) {
    log("not_configured");
    await deps.sendFailure({ period, reason: "not_configured" });
    return { status: "not_configured", period };
  }

  let report: AffiliateReport;
  try {
    const startS = Math.floor(period.start.getTime() / 1000);
    const endS = Math.floor(period.end.getTime() / 1000);
    const invoices = await deps.source.listPaidInvoices({ createdGte: startS - INVOICE_CREATED_LOOKBACK_S, createdLt: endS });

    const attributions = new Map<string, SubscriptionAttribution>();
    for (const subscriptionId of subscriptionsToResolve(invoices, period)) {
      attributions.set(subscriptionId, await deps.source.getAttribution(subscriptionId));
    }

    const refundedCents = new Map<string, number>();
    for (const invoice of invoicesInPeriod(invoices, period)) {
      if (!invoice.snapshotRef || !invoice.subscriptionId || invoice.amountPaid <= 0) continue;
      const refunded = await deps.source.getRefundedCents(invoice.id);
      // A credit-note refund also refunds the charge: take the larger, never the sum.
      refundedCents.set(invoice.id, Math.max(refunded, invoice.postPaymentCreditCents));
    }

    report = computeAffiliateReport({ period, invoices, attributions, refundedCents, proPriceId: deps.proPriceId });
  } catch (error) {
    log("source_failed", { message: error instanceof Error ? error.message : String(error) });
    await deps.sendFailure({ period, reason: "source_failed" });
    return { status: "source_failed", period };
  }

  const sent = await deps.sendReport(report);
  if (!sent) log("report_not_accepted", { period: period.label });
  return { status: sent ? "sent" : "send_failed", report };
}
