import { describe, expect, it } from "vitest";
import { classifySource, groupChannels } from "@/lib/admin/kpi/channels";
import { isPanelExcludedEmail } from "@/lib/admin/kpi/excluded-accounts";
import {
  buildFunnel,
  daysLeft,
  describeDelta,
  formatEuros,
  formatShare,
  linePoints,
  monthlyCents,
  trialSignal,
  vitalView
} from "@/lib/admin/kpi/model";
import { lastMadridDates, madridDateKey, madridStartOfDay, panelWindow, parsePanelPeriod } from "@/lib/admin/kpi/period";

describe("panel periods", () => {
  it("falls back to 28 días for anything it does not know", () => {
    expect(parsePanelPeriod(undefined)).toBe("28d");
    expect(parsePanelPeriod("1y")).toBe("28d");
    expect(parsePanelPeriod(["7d", "hoy"])).toBe("7d");
    expect(parsePanelPeriod("mes")).toBe("mes");
  });

  it("starts «hoy» at Madrid midnight, summer and winter", () => {
    // 2026-10-11 17:54 UTC is 19:54 in Madrid (UTC+2).
    expect(madridStartOfDay(new Date("2026-10-11T17:54:00Z")).toISOString()).toBe("2026-10-10T22:00:00.000Z");
    // 2026-12-01 00:30 UTC is 01:30 in Madrid (UTC+1): still 1 December.
    expect(madridStartOfDay(new Date("2026-12-01T00:30:00Z")).toISOString()).toBe("2026-11-30T23:00:00.000Z");
  });

  it("compares every window with the one of the same length just before it", () => {
    const now = new Date("2026-10-11T17:54:00Z");
    const w = panelWindow("7d", now);
    expect(w.to.toISOString()).toBe(now.toISOString());
    expect(w.from.toISOString()).toBe("2026-10-04T17:54:00.000Z");
    expect(w.prevTo.toISOString()).toBe(w.from.toISOString());
    expect(w.prevFrom.toISOString()).toBe("2026-09-27T17:54:00.000Z");
    const month = panelWindow("mes", now);
    expect(month.from.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("lists the last 28 Madrid days ending today, oldest first", () => {
    const days = lastMadridDates(new Date("2026-10-11T23:30:00Z"), 28);
    expect(days).toHaveLength(28);
    // 23:30 UTC on the 11th is already the 12th in Madrid.
    expect(days[27]).toBe("2026-10-12");
    expect(days[0]).toBe("2026-09-15");
    expect(madridDateKey(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25");
  });
});

describe("channels", () => {
  it("folds referrers and utm_source into the panel's channels", () => {
    expect(classifySource("$direct")).toBe("direct");
    expect(classifySource(null)).toBe("direct");
    expect(classifySource("www.genscore.es")).toBe("direct");
    expect(classifySource("www.linkedin.com")).toBe("linkedin");
    expect(classifySource("com.linkedin.android")).toBe("linkedin");
    expect(classifySource("linkedin")).toBe("linkedin");
    expect(classifySource("email")).toBe("email");
    expect(classifySource("x")).toBe("x");
    expect(classifySource("t.co")).toBe("x");
    expect(classifySource("chatgpt.com")).toBe("ai");
    expect(classifySource("gemini.google.com")).toBe("ai");
    expect(classifySource("www.google.com")).toBe("search");
    expect(classifySource("www.google.es")).toBe("search");
    expect(classifySource("duckduckgo.com")).toBe("search");
    expect(classifySource("news.ycombinator.com")).toBe("other");
  });

  it("adds up visits per channel and sorts them", () => {
    const rows = groupChannels([
      { source: "$direct", visits: 299 },
      { source: "www.genscore.es", visits: 51 },
      { source: "www.linkedin.com", visits: 29 },
      { source: "com.linkedin.android", visits: 3 },
      { source: "chatgpt.com", visits: 2 },
      { source: "nowhere", visits: 0 }
    ]);
    expect(rows.map((r) => [r.label, r.visits])).toEqual([
      ["Directo", 350],
      ["LinkedIn", 32],
      ["Asistentes de IA", 2]
    ]);
    expect(rows[0].share).toBeCloseTo(350 / 384);
  });
});

describe("model", () => {
  it("formats in Spanish", () => {
    expect(formatShare(0.0183)).toBe("1,8 %");
    expect(formatShare(0.56)).toBe("56 %");
    expect(formatEuros(6900)).toBe("69 €");
    expect(formatEuros(2050)).toBe("20,50 €");
  });

  it("only gives a delta when there is an earlier figure", () => {
    expect(describeDelta(10, 0)).toBeNull();
    expect(describeDelta(10, null)).toBeNull();
    expect(describeDelta(15, 10)).toEqual({ text: "+50 % vs periodo anterior", tone: "up" });
    expect(describeDelta(5, 10)?.tone).toBe("down");
    expect(describeDelta(10, 10)?.tone).toBe("flat");
  });

  it("builds the funnel and points at the step that loses the most", () => {
    const funnel = buildFunnel([
      { label: "Visitas", value: 400, source: "PostHog" },
      { label: "Altas", value: 20, source: "Supabase" },
      { label: "Primer escaneo", value: 16, source: "Supabase" },
      { label: "Checkout iniciado", value: 2, source: "Stripe" },
      { label: "Pago", value: 0, source: "Stripe" }
    ]);
    expect(funnel.steps[1].stepRate).toBeCloseTo(0.05);
    expect(funnel.steps[2].stepRate).toBeCloseTo(0.8);
    expect(funnel.steps[4].stepRate).toBe(0);
    expect(funnel.biggestLeak).toBe(4);
    expect(funnel.steps[0].width).toBe(100);
  });

  it("never invents a rate for a step it could not read", () => {
    const funnel = buildFunnel([
      { label: "Visitas", value: null, source: "PostHog" },
      { label: "Altas", value: 20, source: "Supabase" },
      { label: "Checkout iniciado", value: null, source: "Stripe" },
      { label: "Pago", value: null, source: "Stripe" }
    ]);
    expect(funnel.steps.map((s) => s.stepRate)).toEqual([null, null, null, null]);
    expect(funnel.biggestLeak).toBeNull();
  });

  it("buckets web vitals with Google's thresholds", () => {
    expect(vitalView("LCP", { total: 0, good: 0, poor: 0 })).toBeNull();
    const view = vitalView("LCP", { total: 100, good: 80, poor: 5 });
    expect(view?.good).toBeCloseTo(0.8);
    expect(view?.mid).toBeCloseTo(0.15);
    expect(view?.poor).toBeCloseTo(0.05);
  });

  it("says only what we know about a trial", () => {
    const now = Date.parse("2026-10-11T18:00:00Z");
    expect(trialSignal({ checkoutOpened: true, lastSignInAt: null, scanCount30d: 0, now }).tone).toBe("hot");
    expect(trialSignal({ checkoutOpened: false, lastSignInAt: "2026-10-07T10:00:00Z", scanCount30d: 4, now }).label).toBe(
      "Sin entrar 4 días"
    );
    expect(trialSignal({ checkoutOpened: false, lastSignInAt: "2026-10-11T10:00:00Z", scanCount30d: 3, now }).label).toBe(
      "3 escaneos"
    );
    expect(trialSignal({ checkoutOpened: false, lastSignInAt: "2026-10-11T10:00:00Z", scanCount30d: 0, now }).label).toBe(
      "Sin escaneos"
    );
    expect(daysLeft("2026-10-11T21:00:00Z", now)).toBe(1);
    expect(daysLeft("2026-10-10T21:00:00Z", now)).toBe(0);
  });

  it("brings an invoice to a monthly amount", () => {
    expect(monthlyCents(6900, "month", 1)).toBe(6900);
    expect(monthlyCents(120000, "year", 1)).toBe(10000);
    expect(monthlyCents(6000, "month", 3)).toBe(2000);
  });

  it("draws a polyline inside its box", () => {
    expect(linePoints([], 100, 40)).toBe("");
    expect(linePoints([0, 10], 100, 40)).toBe("0,36 100,4");
    // All zeros stays on the baseline instead of dividing by zero.
    expect(linePoints([0, 0, 0], 100, 40)).toBe("0,36 50,36 100,36");
  });
});

describe("own accounts", () => {
  it("leaves out the team's sign-ups by prefix and the instinct domains", () => {
    expect(isPanelExcludedEmail("denislagarteiru@gmail.com")).toBe(true);
    expect(isPanelExcludedEmail("Denis.MartinB+prueba3@gmail.com")).toBe(true);
    expect(isPanelExcludedEmail("chuchibolu2@hotmail.com")).toBe(true);
    expect(isPanelExcludedEmail("arangulina@gmail.com")).toBe(true);
    expect(isPanelExcludedEmail("ana@instinct.ai")).toBe(true);
    expect(isPanelExcludedEmail("ana@instinct.com")).toBe(true);
    expect(isPanelExcludedEmail("ana@clinicadental.es")).toBe(false);
    expect(isPanelExcludedEmail("maria.denislagarteiru@gmail.com")).toBe(false);
    expect(isPanelExcludedEmail("ana@notinstinct.com")).toBe(false);
    expect(isPanelExcludedEmail(null)).toBe(false);
  });
});
