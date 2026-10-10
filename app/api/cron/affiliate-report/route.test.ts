import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AFFILIATES-1 — the wiring of the monthly affiliate report route: the same
 * CRON_SECRET gate as every other cron, and an answer that reflects whether
 * the operator email went out. The computation itself is tested in
 * `lib/affiliates/report.test.ts`.
 */

vi.mock("server-only", () => ({}));

const runAffiliateReport = vi.fn();
vi.mock("@/lib/affiliates/report", () => ({ runAffiliateReport: (args: unknown) => runAffiliateReport(args) }));
vi.mock("@/lib/affiliates/stripe-source", () => ({ createStripeAffiliateSource: () => ({}) }));
vi.mock("@/lib/affiliates/emails", () => ({
  sendAffiliateReportEmail: vi.fn(),
  sendAffiliateReportFailureEmail: vi.fn()
}));
const getStripeClient = vi.fn(() => null as unknown);
vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => getStripeClient(),
  getPriceIdForPlan: (planId: string) => (planId === "pro" ? "price_pro" : null)
}));

import { GET } from "./route";

const SECRET = "cron-secret-value";

function get(headers: Record<string, string> = {}) {
  return GET(new Request("https://genscore.es/api/cron/affiliate-report", { headers }));
}

const PERIOD = { start: new Date(0), end: new Date(0), label: "septiembre de 2026" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/affiliate-report", () => {
  it("rejects without the header, with another secret, and with no secret configured", async () => {
    expect((await get()).status).toBe(401);
    expect((await get({ authorization: "Bearer otro" })).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await get({ authorization: `Bearer ${SECRET}` })).status).toBe(401);
    expect(runAffiliateReport).not.toHaveBeenCalled();
  });

  it("runs the report for Pro and answers 200 when the email went out", async () => {
    getStripeClient.mockReturnValue({});
    runAffiliateReport.mockResolvedValue({
      status: "sent",
      report: { period: PERIOD, affiliates: [], totalCommissionCents: 0, excluded: [] }
    });

    const response = await get({ authorization: `Bearer ${SECRET}` });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "sent", period: "septiembre de 2026", affiliates: 0, totalCommissionCents: 0 });
    expect(runAffiliateReport).toHaveBeenCalledWith(expect.objectContaining({ proPriceId: "price_pro" }));
  });

  it("answers 500 when the report could not be built or sent", async () => {
    getStripeClient.mockReturnValue(null);
    runAffiliateReport.mockResolvedValue({ status: "not_configured", period: PERIOD });
    expect((await get({ authorization: `Bearer ${SECRET}` })).status).toBe(500);
    expect(runAffiliateReport).toHaveBeenCalledWith(expect.objectContaining({ source: null }));
  });
});
