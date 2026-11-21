import { describe, expect, it } from "vitest";
import { decideFeatureEmail, type FeatureAccountState, type FeatureSentState } from "./feature-schedule";

/** FEATURE-EMAILS-1 (log §417): the rules the founder approved on 2026-11-01. */
const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-04T07:45:00Z"); // Wednesday
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);

const account = (overrides: Partial<FeatureAccountState> = {}): FeatureAccountState => ({
  createdAt: ago(4 * 24),
  planId: "pro",
  isExcluded: false,
  lifecycleOptIn: true,
  hasCompletedScan: true,
  gscAvailable: true,
  gscConnected: false,
  firstAgenticResultAt: null,
  ...overrides
});
const sent = (overrides: Partial<FeatureSentState> = {}): FeatureSentState => ({
  kinds: new Set(),
  lastLifecycleSentAt: null,
  ...overrides
});

describe("decideFeatureEmail", () => {
  it("sends Search Console from day 3 to day 14 after sign-up", () => {
    expect(decideFeatureEmail(account({ createdAt: ago(71) }), sent(), NOW)).toBeNull();
    expect(decideFeatureEmail(account({ createdAt: ago(72) }), sent(), NOW)).toEqual({ kind: "feature_gsc" });
    expect(decideFeatureEmail(account({ createdAt: ago(14 * 24) }), sent(), NOW)).toEqual({ kind: "feature_extension" });
  });

  it("skips Search Console when connected, unavailable, without a scan or already sent", () => {
    expect(decideFeatureEmail(account({ gscConnected: true }), sent(), NOW)).toBeNull();
    expect(decideFeatureEmail(account({ gscAvailable: false }), sent(), NOW)).toBeNull();
    expect(decideFeatureEmail(account({ hasCompletedScan: false }), sent(), NOW)).toBeNull();
    expect(decideFeatureEmail(account(), sent({ kinds: new Set(["feature_gsc"]) }), NOW)).toBeNull();
  });

  it("sends the agentic result the day after the first scored review, Pro and Agencia", () => {
    const base = { gscConnected: true, firstAgenticResultAt: ago(19) };
    expect(decideFeatureEmail(account(base), sent(), NOW)).toBeNull();
    const due = { ...base, firstAgenticResultAt: ago(20) };
    expect(decideFeatureEmail(account(due), sent(), NOW)).toEqual({ kind: "feature_agentic", variant: "result" });
    expect(decideFeatureEmail(account({ ...due, planId: "agency" }), sent(), NOW)).toEqual({
      kind: "feature_agentic",
      variant: "result"
    });
  });

  it("sends Starter the upgrade variant, never the result one", () => {
    expect(decideFeatureEmail(account({ planId: "starter", gscConnected: true }), sent(), NOW)).toEqual({
      kind: "feature_agentic",
      variant: "upgrade"
    });
    expect(
      decideFeatureEmail(account({ planId: "starter", gscConnected: true, hasCompletedScan: false }), sent(), NOW)
    ).toBeNull();
  });

  it("sends the extension from day 7, old accounts included", () => {
    const base = { gscConnected: true };
    expect(decideFeatureEmail(account({ ...base, createdAt: ago(6 * 24) }), sent(), NOW)).toBeNull();
    expect(decideFeatureEmail(account({ ...base, createdAt: ago(7 * 24) }), sent(), NOW)).toEqual({
      kind: "feature_extension"
    });
    expect(decideFeatureEmail(account({ ...base, createdAt: ago(300 * 24) }), sent(), NOW)).toEqual({
      kind: "feature_extension"
    });
  });

  it("orders Search Console, then the agentic audit, then the extension, one per pass", () => {
    const all = account({ createdAt: ago(8 * 24), firstAgenticResultAt: ago(30) });
    expect(decideFeatureEmail(all, sent(), NOW)).toEqual({ kind: "feature_gsc" });
    expect(decideFeatureEmail(all, sent({ kinds: new Set(["feature_gsc"]) }), NOW)).toEqual({
      kind: "feature_agentic",
      variant: "result"
    });
    expect(decideFeatureEmail(all, sent({ kinds: new Set(["feature_gsc", "feature_agentic"]) }), NOW)).toEqual({
      kind: "feature_extension"
    });
  });

  it("keeps 48 h between lifecycle emails and stays quiet on Mondays", () => {
    expect(decideFeatureEmail(account(), sent({ lastLifecycleSentAt: ago(47) }), NOW)).toBeNull();
    expect(decideFeatureEmail(account(), sent({ lastLifecycleSentAt: ago(48) }), NOW)).toEqual({ kind: "feature_gsc" });
    const monday = new Date("2026-11-02T07:45:00Z");
    expect(decideFeatureEmail(account({ createdAt: new Date(monday.getTime() - 4 * 24 * HOUR) }), sent(), monday)).toBeNull();
  });

  it("never writes to excluded, opted-out, read-only or unknown-plan accounts", () => {
    expect(decideFeatureEmail(account({ isExcluded: true }), sent(), NOW)).toBeNull();
    expect(decideFeatureEmail(account({ lifecycleOptIn: false }), sent(), NOW)).toBeNull();
    expect(decideFeatureEmail(account({ planId: "free" }), sent(), NOW)).toBeNull();
    expect(decideFeatureEmail(account({ planId: null }), sent(), NOW)).toBeNull();
    expect(decideFeatureEmail(account({ planId: "mystery" }), sent(), NOW)).toBeNull();
  });
});
