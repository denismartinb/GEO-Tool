import { beforeEach, describe, expect, it, vi } from "vitest";

const sendScoreDropAlertEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendScoreDropAlertEmail: (...args: unknown[]) => sendScoreDropAlertEmail(...args)
}));

import { checkAndSendScoreDropAlert } from "./score-alert";

type Row = Record<string, unknown>;

function fakeService(options: { previousRow?: Row | null; profile?: Row | null; runScoresError?: boolean }) {
  return {
    from(table: string) {
      if (table === "run_scores") {
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () =>
                      options.runScoresError
                        ? Promise.reject(new Error("db down"))
                        : Promise.resolve({ data: options.previousRow ?? null, error: null })
                  })
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
  runId: "run-2",
  ownerUserId: "user-1",
  projectDomain: "acme.com"
};

beforeEach(() => {
  sendScoreDropAlertEmail.mockReset();
});

describe("checkAndSendScoreDropAlert", () => {
  it("sends nothing on a project's first-ever scored run (no previous row)", async () => {
    const service = fakeService({ previousRow: null });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: { visibility_score: 40, details_json: null }
    });

    expect(sendScoreDropAlertEmail).not.toHaveBeenCalled();
  });

  it("sends nothing when the drop is below the threshold", async () => {
    const service = fakeService({
      previousRow: { visibility_score: 70, details_json: null },
      profile: { email: "founder@example.com", notify_score_drop_alert: true }
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: { visibility_score: 65, details_json: null } // -5, below the 10-point threshold
    });

    expect(sendScoreDropAlertEmail).not.toHaveBeenCalled();
  });

  it("sends the alert when the drop meets the threshold and the owner hasn't opted out", async () => {
    const service = fakeService({
      previousRow: { visibility_score: 70, details_json: null },
      profile: { email: "founder@example.com", notify_score_drop_alert: true }
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: { visibility_score: 55, details_json: null } // -15
    });

    expect(sendScoreDropAlertEmail).toHaveBeenCalledWith("founder@example.com", "acme.com", 70, 55);
  });

  it("uses the composite geo_score from details_json over the raw visibility_score when present", async () => {
    const service = fakeService({
      previousRow: { visibility_score: 90, details_json: { geo_score: { score: 70 } } },
      profile: { email: "founder@example.com", notify_score_drop_alert: true }
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: { visibility_score: 90, details_json: { geo_score: { score: 55 } } } // composite drop -15, visibility unchanged
    });

    expect(sendScoreDropAlertEmail).toHaveBeenCalledWith("founder@example.com", "acme.com", 70, 55);
  });

  it("doesn't send when the owner has opted out", async () => {
    const service = fakeService({
      previousRow: { visibility_score: 70, details_json: null },
      profile: { email: "founder@example.com", notify_score_drop_alert: false }
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: { visibility_score: 40, details_json: null }
    });

    expect(sendScoreDropAlertEmail).not.toHaveBeenCalled();
  });

  it("doesn't send when the profile has no email on file", async () => {
    const service = fakeService({
      previousRow: { visibility_score: 70, details_json: null },
      profile: { email: null, notify_score_drop_alert: true }
    });

    await checkAndSendScoreDropAlert({
      service: service as never,
      ...BASE,
      currentRow: { visibility_score: 40, details_json: null }
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
        currentRow: { visibility_score: 40, details_json: null }
      })
    ).resolves.toBeUndefined();

    expect(sendScoreDropAlertEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
