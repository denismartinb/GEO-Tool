import { beforeEach, describe, expect, it, vi } from "vitest";

const sendScoreDropAlertEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendScoreDropAlertEmail: (...args: unknown[]) => sendScoreDropAlertEmail(...args)
}));

import { checkAndSendScoreDropAlert } from "./score-alert";

type Row = Record<string, unknown>;
type ScoreRow = { visibility_score: number | null; details_json: unknown };

/**
 * previousRows is what the run_scores query returns: newest-first, so
 * [0] = the run immediately before the current one, [1] = the pre-drop
 * baseline before that (GEO-SCORE-V2 E2 fetches the last 2).
 */
function fakeService(options: { previousRows?: Row[] | null; profile?: Row | null; runScoresError?: boolean }) {
  return {
    from(table: string) {
      if (table === "run_scores") {
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                order: () => ({
                  limit: () =>
                    options.runScoresError
                      ? Promise.reject(new Error("db down"))
                      : Promise.resolve({ data: options.previousRows ?? null, error: null })
                })
              })
            })
          })
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: options.profile ?? null, error: null })
            })
          })
        };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };
}

const BASE = {
  projectId: "project-1",
  runId: "run-3",
  ownerUserId: "user-1",
  projectDomain: "acme.com"
};

const PROFILE_OK = { email: "founder@example.com", notify_score_drop_alert: true };

/** A run_scores row scored under geo-score-v2 with the given composite score. */
function v2Row(score: number): ScoreRow {
  return { visibility_score: score, details_json: { geo_score: { score, composite_version: "geo-score-v2" } } };
}

beforeEach(() => {
  sendScoreDropAlertEmail.mockReset();
});

describe("checkAndSendScoreDropAlert", () => {
  it("sends nothing on a project's first-ever scored run (no previous rows)", async () => {
    const service = fakeService({ previousRows: null });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: v2Row(40)
    });

    expect(sendScoreDropAlertEmail).not.toHaveBeenCalled();
  });

  it("sends nothing with only one previous run — persistence needs a pre-drop baseline (E2)", async () => {
    const service = fakeService({
      previousRows: [v2Row(70)],
      profile: PROFILE_OK
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: v2Row(40) // -30 vs the only prior run, but no baseline yet
    });

    expect(sendScoreDropAlertEmail).not.toHaveBeenCalled();
  });

  it("sends nothing when the sustained drop is below the threshold", async () => {
    const service = fakeService({
      previousRows: [v2Row(65), v2Row(70)], // newest-first: prev 65, baseline 70
      profile: PROFILE_OK
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: v2Row(64) // both drops vs baseline are < 10
    });

    expect(sendScoreDropAlertEmail).not.toHaveBeenCalled();
  });

  it("sends nothing on a fresh single-run dip — the drop hasn't persisted yet (E2)", async () => {
    const service = fakeService({
      previousRows: [v2Row(68), v2Row(70)], // prev is still near the baseline
      profile: PROFILE_OK
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: v2Row(55) // -15 vs baseline, but only for this one run so far
    });

    expect(sendScoreDropAlertEmail).not.toHaveBeenCalled();
  });

  it("sends the alert when the drop persists across two consecutive runs, reporting baseline -> current", async () => {
    const service = fakeService({
      previousRows: [v2Row(55), v2Row(70)], // prev 55 and current 55 are both >= 10 below baseline 70
      profile: PROFILE_OK
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: v2Row(55)
    });

    expect(sendScoreDropAlertEmail).toHaveBeenCalledWith("founder@example.com", "acme.com", 70, 55);
  });

  it("never compares runs scored under different composite versions (v1 -> v2 methodology step, ADR 0015)", async () => {
    const v1Row = (score: number): Row => ({
      visibility_score: score,
      details_json: { geo_score: { score, composite_version: "geo-score-v1" } }
    });
    const service = fakeService({
      previousRows: [v1Row(80), v1Row(82)], // healthy v1 history
      profile: PROFILE_OK
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: v2Row(50) // large step down, but it's the methodology change, not a regression
    });

    expect(sendScoreDropAlertEmail).not.toHaveBeenCalled();
  });

  it("uses the composite geo_score from details_json over the raw visibility_score when present", async () => {
    const mixed = (composite: number): ScoreRow => ({
      visibility_score: 90, // unchanged raw visibility on every run
      details_json: { geo_score: { score: composite, composite_version: "geo-score-v2" } }
    });
    const service = fakeService({
      previousRows: [mixed(55), mixed(70)],
      profile: PROFILE_OK
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: mixed(55)
    });

    expect(sendScoreDropAlertEmail).toHaveBeenCalledWith("founder@example.com", "acme.com", 70, 55);
  });

  it("doesn't send when the owner has opted out", async () => {
    const service = fakeService({
      previousRows: [v2Row(55), v2Row(70)],
      profile: { email: "founder@example.com", notify_score_drop_alert: false }
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: v2Row(55)
    });

    expect(sendScoreDropAlertEmail).not.toHaveBeenCalled();
  });

  it("doesn't send when the profile has no email on file", async () => {
    const service = fakeService({
      previousRows: [v2Row(55), v2Row(70)],
      profile: { email: null, notify_score_drop_alert: true }
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: v2Row(55)
    });

    expect(sendScoreDropAlertEmail).not.toHaveBeenCalled();
  });

  it("fails soft (never throws) when the run_scores lookup itself errors", async () => {
    const service = fakeService({ runScoresError: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      checkAndSendScoreDropAlert({
        service: service as never,
        ...BASE,
        currentRow: v2Row(40)
      })
    ).resolves.toBeUndefined();

    expect(sendScoreDropAlertEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
