import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildAffiliateConfirmationEmail,
  buildAffiliateOpsEmail,
  buildAffiliateReportEmail,
  buildAffiliateReportFailureEmail
} from "@/lib/affiliates/emails";
import { previousMonthInMadrid, type AffiliateReport } from "@/lib/affiliates/report";

const APPLICATION = {
  name: "Ana <script>alert(1)</script>",
  email: "ana@agencia.es",
  channel: "https://www.campamentoweb.es"
};
const PERIOD = previousMonthInMadrid(new Date("2026-10-05T07:00:00Z"));

describe("affiliate application emails", () => {
  it("escapes everything the applicant typed", () => {
    for (const { html } of [
      buildAffiliateOpsEmail(APPLICATION, { requestedAt: new Date(), source: "<x>" }),
      buildAffiliateConfirmationEmail(APPLICATION)
    ]) {
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    }
  });

  it("gives the operator a code to approve and where to add it", () => {
    const { html, subject } = buildAffiliateOpsEmail(APPLICATION, { requestedAt: new Date("2026-10-10T10:00:00Z"), source: null });
    expect(subject).toContain("[Afiliados]");
    expect(html).toContain("AFFILIATE_CODES");
    expect(html).toContain("?ref=campamentoweb");
  });

  it("states the terms the page states, with no brand-bidding or mass-email rule", () => {
    const { html } = buildAffiliateConfirmationEmail(APPLICATION);
    expect(html).toContain("30 %");
    expect(html).toContain("12 meses");
    expect(html).toContain("90 días");
    expect(html).toContain("50 €");
    expect(html).not.toMatch(/pujar|masiv/i);
  });
});

describe("affiliate report email", () => {
  it("says «sin comisiones este mes» when the month is empty", () => {
    const report: AffiliateReport = { period: PERIOD, affiliates: [], totalCommissionCents: 0, excluded: [] };
    const { subject, html } = buildAffiliateReportEmail(report);
    expect(subject).toContain("sin comisiones este mes");
    expect(html).toContain("Sin comisiones este mes");
  });

  it("lists each affiliate with base, commission and the accumulated note", () => {
    const report: AffiliateReport = {
      period: PERIOD,
      affiliates: [
        {
          code: "campamentoweb",
          baseCents: 5702,
          commissionCents: 1711,
          reachesPayoutFloor: false,
          lines: [
            {
              invoiceId: "in_1",
              invoiceNumber: "GS-0001",
              subscriptionId: "sub_1",
              paidAt: 1_789_000_000,
              baseCents: 5702,
              commissionCents: 1711,
              refundedCents: 0
            }
          ]
        }
      ],
      totalCommissionCents: 1711,
      excluded: [{ invoiceId: "in_2", code: "campamentoweb", reason: "not_pro" }]
    };
    const { subject, html } = buildAffiliateReportEmail(report);
    expect(subject).toContain("septiembre de 2026");
    expect(html).toContain("campamentoweb");
    expect(html.replace(/ /g, " ")).toContain("57,02 €");
    expect(html.replace(/ /g, " ")).toContain("17,11 €");
    expect(html).toContain("no llega a 50 €");
    expect(html).toContain("no es del plan Pro");
  });

  it("explains a failed run", () => {
    expect(buildAffiliateReportFailureEmail({ period: PERIOD, reason: "not_configured" }).html).toContain("STRIPE_PRICE_ID_PRO");
  });
});
