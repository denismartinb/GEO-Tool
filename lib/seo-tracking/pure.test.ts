import { describe, expect, it } from "vitest";
import { fitUnderCap, seoTrackingCapsFor } from "@/lib/seo-tracking/caps";
import { planCompetitorChange } from "@/lib/seo-tracking/competitors";
import { categorizeDfsFailure, isRetryable, needsOperator } from "@/lib/seo-tracking/errors";
import { normalizeKeyword, normalizeKeywordList } from "@/lib/seo-tracking/keyword-text";
import { weekStartUtc } from "@/lib/seo-tracking/week";

describe("seoTrackingCapsFor", () => {
  it("gives each sellable plan its cap", () => {
    expect(seoTrackingCapsFor("starter")).toEqual({ keywords: 15, competitors: 1 });
    expect(seoTrackingCapsFor("pro")).toEqual({ keywords: 50, competitors: 3 });
    expect(seoTrackingCapsFor("agency")).toEqual({ keywords: 150, competitors: 3 });
  });

  it("gives nothing to a read-only account or an unknown plan (never falls back to yes)", () => {
    for (const plan of ["free", null, undefined, "", "enterprise"]) expect(seoTrackingCapsFor(plan)).toEqual({ keywords: 0, competitors: 0 });
  });
});

describe("fitUnderCap", () => {
  it("keeps order and cuts at the remaining room", () => {
    expect(fitUnderCap(13, 15, ["a", "b", "c"])).toEqual({ accepted: ["a", "b"], rejected: ["c"] });
  });

  it("accepts nothing when already over the cap (downgraded plan)", () => {
    expect(fitUnderCap(60, 50, ["a"])).toEqual({ accepted: [], rejected: ["a"] });
  });
});

describe("weekStartUtc", () => {
  it("returns the Monday of the UTC week", () => {
    expect(weekStartUtc(new Date("2026-10-19T05:00:00Z"))).toBe("2026-10-19"); // Monday
    expect(weekStartUtc(new Date("2026-10-18T23:59:59Z"))).toBe("2026-10-12"); // Sunday
    expect(weekStartUtc(new Date("2026-10-21T12:00:00Z"))).toBe("2026-10-19");
  });

  it("crosses month and year boundaries", () => {
    expect(weekStartUtc(new Date("2027-01-01T10:00:00Z"))).toBe("2026-12-28");
  });
});

describe("normalizeKeyword", () => {
  it("collapses case and spaces into one spelling", () => {
    expect(normalizeKeyword("  Herramienta   GEO ")).toBe("herramienta geo");
  });

  it("rejects empty and over-long text", () => {
    expect(normalizeKeyword("   ")).toBeNull();
    expect(normalizeKeyword("a".repeat(201))).toBeNull();
  });

  it("drops duplicates after normalizing, keeping first order", () => {
    expect(normalizeKeywordList(["SEO para IA", "qué es geo", "seo  para ia", ""])).toEqual(["seo para ia", "qué es geo"]);
  });
});

describe("planCompetitorChange", () => {
  it("normalizes, drops the own domain and its subdomains, and cuts to the cap", () => {
    const plan = planCompetitorChange({
      ownDomain: "genscore.es",
      current: [],
      wanted: ["https://www.Peec.ai/", "blog.genscore.es", "otterly.ai", "peec.ai", "trygeometrics.com"],
      cap: 2
    });
    expect(plan.add).toEqual(["peec.ai", "otterly.ai"]);
    expect(plan.rejected).toEqual(["blog.genscore.es", "trygeometrics.com"]);
    expect(plan.own).toBe("genscore.es");
  });

  it("rejects names that are not domains", () => {
    expect(planCompetitorChange({ ownDomain: "genscore.es", current: [], wanted: ["OtterlyAI"], cap: 3 }).rejected).toEqual(["OtterlyAI"]);
  });

  it("keeps what stays, removes what left", () => {
    const plan = planCompetitorChange({ ownDomain: "genscore.es", current: ["peec.ai", "otterly.ai"], wanted: ["otterly.ai", "profound.com"], cap: 3 });
    expect(plan).toMatchObject({ keep: ["otterly.ai"], add: ["profound.com"], remove: ["peec.ai"] });
  });

  it("removes everything on a plan without rivals", () => {
    expect(planCompetitorChange({ ownDomain: "genscore.es", current: ["peec.ai"], wanted: ["peec.ai"], cap: 0 }).remove).toEqual(["peec.ai"]);
  });
});

describe("categorizeDfsFailure", () => {
  it("maps DataForSEO codes to self-authored categories", () => {
    expect(categorizeDfsFailure(401, "Credenciales rechazadas")).toBe("auth");
    expect(categorizeDfsFailure(40100, "x")).toBe("auth");
    expect(categorizeDfsFailure(40200, "x")).toBe("balance");
    expect(categorizeDfsFailure(null, "Tiempo agotado")).toBe("timeout");
    expect(categorizeDfsFailure(50000, "x")).toBe("provider");
  });

  it("retries only transient failures and escalates only the operator's", () => {
    expect([isRetryable("timeout"), isRetryable("provider"), isRetryable("auth"), isRetryable("balance")]).toEqual([true, true, false, false]);
    expect([needsOperator("auth"), needsOperator("balance"), needsOperator("timeout")]).toEqual([true, true, false]);
  });
});
