import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  addMonthsSeconds,
  commissionBaseCents,
  computeAffiliateReport,
  previousMonthInMadrid,
  runAffiliateReport,
  toReportInvoice,
  type AffiliateReport,
  type AffiliateReportSource,
  type ReportInvoice,
  type SubscriptionAttribution
} from "@/lib/affiliates/report";

const PRO = "price_pro";
const s = (iso: string) => Math.floor(Date.parse(iso) / 1000);

// The report runs on 5 October 2026: the period is September 2026, Madrid time.
const NOW = new Date("2026-10-05T07:00:00Z");
const PERIOD = previousMonthInMadrid(NOW);

function invoice(overrides: Partial<ReportInvoice> = {}): ReportInvoice {
  return {
    id: "in_1",
    number: "GS-0001",
    subscriptionId: "sub_1",
    snapshotRef: "campamentoweb",
    paidAt: s("2026-09-12T10:00:00Z"),
    // 69 € with 21 % VAT included: 57,02 € base + 11,98 € tax.
    amountPaid: 6900,
    taxAmount: 1198,
    priceIds: [PRO],
    currency: "eur",
    postPaymentCreditCents: 0,
    ...overrides
  };
}

function attributions(entries: Record<string, SubscriptionAttribution>) {
  return new Map(Object.entries(entries));
}

const FIRST_PAID = { ref: "campamentoweb", firstPaidAt: s("2026-08-12T10:00:00Z") };

describe("previousMonthInMadrid", () => {
  it("uses Madrid boundaries (CEST in September: UTC+2)", () => {
    expect(PERIOD.start.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(PERIOD.end.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(PERIOD.label).toBe("septiembre de 2026");
  });

  it("crosses the year and the winter offset (CET: UTC+1)", () => {
    const january = previousMonthInMadrid(new Date("2027-01-05T07:00:00Z"));
    expect(january.start.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(january.end.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });
});

describe("addMonthsSeconds", () => {
  it("adds calendar months and clamps to the month's last day", () => {
    expect(new Date(addMonthsSeconds(s("2026-01-31T10:00:00Z"), 1) * 1000).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(new Date(addMonthsSeconds(s("2026-08-12T10:00:00Z"), 12) * 1000).toISOString()).toBe("2027-08-12T10:00:00.000Z");
  });
});

describe("commissionBaseCents", () => {
  it("removes the VAT", () => {
    expect(commissionBaseCents({ amountPaid: 6900, taxAmount: 1198, refundedCents: 0 })).toBe(5702);
  });
  it("removes a refund proportionally, and a full refund leaves nothing", () => {
    expect(commissionBaseCents({ amountPaid: 6900, taxAmount: 1198, refundedCents: 3450 })).toBe(2851);
    expect(commissionBaseCents({ amountPaid: 6900, taxAmount: 1198, refundedCents: 6900 })).toBe(0);
  });
  it("is zero when nothing was charged (the trial)", () => {
    expect(commissionBaseCents({ amountPaid: 0, taxAmount: 0, refundedCents: 0 })).toBe(0);
  });
});

describe("computeAffiliateReport", () => {
  it("pays 30 % of the base without VAT on a Pro invoice with a ref", () => {
    const report = computeAffiliateReport({
      period: PERIOD,
      invoices: [invoice()],
      attributions: attributions({ sub_1: FIRST_PAID }),
      refundedCents: new Map(),
      proPriceId: PRO
    });
    expect(report.affiliates).toHaveLength(1);
    expect(report.affiliates[0]).toMatchObject({ code: "campamentoweb", baseCents: 5702, commissionCents: 1711 });
    expect(report.affiliates[0].reachesPayoutFloor).toBe(false);
    expect(report.totalCommissionCents).toBe(1711);
  });

  it("ignores invoices without a ref and invoices paid outside the period", () => {
    const report = computeAffiliateReport({
      period: PERIOD,
      invoices: [
        invoice({ id: "in_noref", snapshotRef: null }),
        invoice({ id: "in_aug", paidAt: s("2026-08-31T21:59:59Z") }),
        invoice({ id: "in_oct", paidAt: s("2026-09-30T22:00:00Z") })
      ],
      attributions: attributions({ sub_1: FIRST_PAID }),
      refundedCents: new Map(),
      proPriceId: PRO
    });
    expect(report.affiliates).toEqual([]);
    expect(report.excluded).toEqual([]);
  });

  it("excludes Starter, the 0 € trial invoice and anything past 12 months, saying why", () => {
    const report = computeAffiliateReport({
      period: PERIOD,
      invoices: [
        invoice({ id: "in_starter", priceIds: ["price_starter"] }),
        invoice({ id: "in_trial", amountPaid: 0, taxAmount: 0 }),
        invoice({ id: "in_old", subscriptionId: "sub_old" })
      ],
      attributions: attributions({
        sub_1: FIRST_PAID,
        sub_old: { ref: "campamentoweb", firstPaidAt: s("2025-09-12T10:00:00Z") }
      }),
      refundedCents: new Map(),
      proPriceId: PRO
    });
    expect(report.affiliates).toEqual([]);
    expect(report.excluded.map((e) => [e.invoiceId, e.reason])).toEqual([
      ["in_starter", "not_pro"],
      ["in_trial", "no_charge"],
      ["in_old", "outside_12_months"]
    ]);
  });

  it("counts the twelfth month and not the thirteenth", () => {
    // Paid months 1..12: Oct 2025 .. Sep 2026. Oct 2026 is the 13th.
    const twelfth = computeAffiliateReport({
      period: PERIOD,
      invoices: [invoice({ paidAt: s("2026-09-12T10:00:00Z") })],
      attributions: attributions({ sub_1: { ref: "campamentoweb", firstPaidAt: s("2025-10-12T10:00:00Z") } }),
      refundedCents: new Map(),
      proPriceId: PRO
    });
    expect(twelfth.affiliates).toHaveLength(1);
    const thirteenth = computeAffiliateReport({
      period: previousMonthInMadrid(new Date("2026-11-05T07:00:00Z")),
      invoices: [invoice({ paidAt: s("2026-10-12T10:00:00Z") })],
      attributions: attributions({ sub_1: { ref: "campamentoweb", firstPaidAt: s("2025-10-12T10:00:00Z") } }),
      refundedCents: new Map(),
      proPriceId: PRO
    });
    expect(thirteenth.affiliates).toEqual([]);
    expect(thirteenth.excluded[0].reason).toBe("outside_12_months");
  });

  it("groups by affiliate and flags who reaches the 50 € floor this month", () => {
    const invoices = Array.from({ length: 3 }, (_, i) => invoice({ id: `in_${i}`, subscriptionId: `sub_${i}` }));
    const report = computeAffiliateReport({
      period: PERIOD,
      invoices: [...invoices, invoice({ id: "in_b", subscriptionId: "sub_b", snapshotRef: "newsletter-seo" })],
      attributions: attributions({
        sub_0: FIRST_PAID,
        sub_1: FIRST_PAID,
        sub_2: FIRST_PAID,
        sub_b: { ref: null, firstPaidAt: FIRST_PAID.firstPaidAt }
      }),
      refundedCents: new Map(),
      proPriceId: PRO
    });
    expect(report.affiliates.map((a) => [a.code, a.lines.length, a.commissionCents, a.reachesPayoutFloor])).toEqual([
      ["campamentoweb", 3, 5133, true],
      ["newsletter-seo", 1, 1711, false]
    ]);
  });

  it("subtracts refunds", () => {
    const report = computeAffiliateReport({
      period: PERIOD,
      invoices: [invoice()],
      attributions: attributions({ sub_1: FIRST_PAID }),
      refundedCents: new Map([["in_1", 6900]]),
      proPriceId: PRO
    });
    expect(report.affiliates[0]).toMatchObject({ baseCents: 0, commissionCents: 0 });
  });
});

describe("toReportInvoice", () => {
  it("reads the subscription, its metadata snapshot, the line prices and the taxes", () => {
    const mapped = toReportInvoice({
      id: "in_9",
      number: "GS-9",
      amount_paid: 6900,
      currency: "EUR",
      post_payment_credit_notes_amount: 0,
      total_taxes: [{ amount: 1198 }],
      status_transitions: { paid_at: 1_790_000_000 },
      parent: { subscription_details: { subscription: "sub_9", metadata: { ref: "CampamentoWeb" } } },
      lines: { data: [{ pricing: { price_details: { price: PRO } } }] }
    } as unknown as Stripe.Invoice);
    expect(mapped).toEqual({
      id: "in_9",
      number: "GS-9",
      subscriptionId: "sub_9",
      snapshotRef: "campamentoweb",
      paidAt: 1_790_000_000,
      amountPaid: 6900,
      taxAmount: 1198,
      priceIds: [PRO],
      currency: "eur",
      postPaymentCreditCents: 0
    });
  });
});

describe("runAffiliateReport", () => {
  function source(overrides: Partial<AffiliateReportSource> = {}): AffiliateReportSource {
    return {
      listPaidInvoices: vi.fn(async () => [invoice(), invoice({ id: "in_other", subscriptionId: "sub_x", snapshotRef: null })]),
      getAttribution: vi.fn(async () => FIRST_PAID),
      getRefundedCents: vi.fn(async () => 0),
      ...overrides
    };
  }

  it("asks Stripe only about attributed subscriptions and sends the report", async () => {
    const src = source();
    const sendReport = vi.fn(async () => true);
    const result = await runAffiliateReport({ now: NOW, proPriceId: PRO, source: src, sendReport, sendFailure: vi.fn(async () => true) });
    expect(result.status).toBe("sent");
    expect(src.getAttribution).toHaveBeenCalledTimes(1);
    expect(src.getAttribution).toHaveBeenCalledWith("sub_1");
    expect(src.getRefundedCents).toHaveBeenCalledWith("in_1");
    expect(sendReport).toHaveBeenCalledTimes(1);
    // Listed by creation with a lookback, counted by payment date.
    const range = (src.listPaidInvoices as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(range.createdLt).toBe(PERIOD.end.getTime() / 1000);
    expect(range.createdGte).toBeLessThan(PERIOD.start.getTime() / 1000);
  });

  it("sends the report even when nobody earned anything", async () => {
    const sendReport = vi.fn(async () => true);
    const result = await runAffiliateReport({
      now: NOW,
      proPriceId: PRO,
      source: source({ listPaidInvoices: vi.fn(async () => []) }),
      sendReport,
      sendFailure: vi.fn(async () => true)
    });
    expect(result.status).toBe("sent");
    expect(sendReport).toHaveBeenCalledWith(expect.objectContaining({ affiliates: [], totalCommissionCents: 0 }));
  });

  it("uses the larger of the charge refund and a post-payment credit note, never the sum", async () => {
    const sendReport = vi.fn(async (_report: AffiliateReport) => true);
    await runAffiliateReport({
      now: NOW,
      proPriceId: PRO,
      source: source({
        listPaidInvoices: vi.fn(async () => [invoice({ postPaymentCreditCents: 3450 })]),
        getRefundedCents: vi.fn(async () => 3450)
      }),
      sendReport,
      sendFailure: vi.fn(async () => true)
    });
    expect(sendReport.mock.calls[0][0].affiliates[0].baseCents).toBe(2851);
  });

  it("tells the operator when it cannot run, instead of staying silent", async () => {
    const sendFailure = vi.fn(async () => true);
    const sendReport = vi.fn(async () => true);
    expect((await runAffiliateReport({ now: NOW, proPriceId: null, source: source(), sendReport, sendFailure })).status).toBe(
      "not_configured"
    );
    const failing = source({ listPaidInvoices: vi.fn(async () => Promise.reject(new Error("stripe down"))) });
    expect((await runAffiliateReport({ now: NOW, proPriceId: PRO, source: failing, sendReport, sendFailure })).status).toBe(
      "source_failed"
    );
    expect(sendFailure).toHaveBeenCalledTimes(2);
    expect(sendReport).not.toHaveBeenCalled();
  });
});
