import { beforeEach, describe, expect, it, vi } from "vitest";

const sendWeeklyDigestEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendWeeklyDigestEmail: (...args: unknown[]) => sendWeeklyDigestEmail(...args)
}));

import { runWeeklyDigest } from "./weekly-digest";

type Row = Record<string, unknown>;

function fakeService({
  projects,
  profiles,
  runScoresByProject,
  recommendationByRunId
}: {
  projects: Row[];
  profiles: Row[];
  runScoresByProject: Record<string, Row[]>;
  recommendationByRunId?: Record<string, Row | null>;
}) {
  return {
    from(table: string) {
      if (table === "projects") {
        return { select: () => ({ eq: () => Promise.resolve({ data: projects, error: null }) }) };
      }
      if (table === "profiles") {
        return { select: () => ({ in: () => Promise.resolve({ data: profiles, error: null }) }) };
      }
      if (table === "run_scores") {
        return {
          select: () => ({
            eq: (_col: string, projectId: string) => ({
              order: () => ({
                limit: (n: number) => Promise.resolve({ data: (runScoresByProject[projectId] ?? []).slice(0, n), error: null })
              })
            })
          })
        };
      }
      if (table === "recommendations") {
        return {
          select: () => ({
            eq: (_col: string, runId: string) => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: recommendationByRunId?.[runId] ?? null, error: null })
                  })
                })
              })
            })
          })
        };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };
}

beforeEach(() => {
  sendWeeklyDigestEmail.mockReset();
});

describe("runWeeklyDigest", () => {
  it("skips a project with fewer than 2 scored runs", async () => {
    const service = fakeService({
      projects: [{ id: "p1", domain: "acme.com", owner_user_id: "u1" }],
      profiles: [{ id: "u1", email: "founder@example.com", notify_weekly_digest: true }],
      runScoresByProject: { p1: [{ run_id: "r1", visibility_score: 80, details_json: null }] }
    });

    const result = await runWeeklyDigest({ service: service as never });

    expect(sendWeeklyDigestEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, sent: 0, skipped: 1 });
  });

  it("sends the digest with the score delta since the previous run, no topMover when brand_position is absent", async () => {
    const service = fakeService({
      projects: [{ id: "p1", domain: "acme.com", owner_user_id: "u1" }],
      profiles: [{ id: "u1", email: "founder@example.com", notify_weekly_digest: true }],
      runScoresByProject: {
        p1: [
          { run_id: "r2", visibility_score: 70, details_json: null },
          { run_id: "r1", visibility_score: 80, details_json: null }
        ]
      },
      recommendationByRunId: { r2: null }
    });

    const result = await runWeeklyDigest({ service: service as never });

    expect(sendWeeklyDigestEmail).toHaveBeenCalledWith("founder@example.com", "acme.com", {
      currentScore: 70,
      previousScore: 80,
      topMover: null,
      recommendation: null
    });
    expect(result).toEqual({ processed: 1, sent: 1, skipped: 0 });
  });

  it("computes the biggest competitor mention-count swing as topMover", async () => {
    const service = fakeService({
      projects: [{ id: "p1", domain: "acme.com", owner_user_id: "u1" }],
      profiles: [{ id: "u1", email: "founder@example.com", notify_weekly_digest: true }],
      runScoresByProject: {
        p1: [
          {
            run_id: "r2",
            visibility_score: 70,
            details_json: {
              brand_position: {
                ranking: [
                  { name: "Acme", is_brand: true, avg_position: 1.5, mention_count: 5 },
                  { name: "Rival", is_brand: false, avg_position: 2.0, mention_count: 8 },
                  { name: "Other", is_brand: false, avg_position: 3.0, mention_count: 2 }
                ]
              }
            }
          },
          {
            run_id: "r1",
            visibility_score: 80,
            details_json: {
              brand_position: {
                ranking: [
                  { name: "Acme", is_brand: true, avg_position: 1.2, mention_count: 6 },
                  { name: "Rival", is_brand: false, avg_position: 2.5, mention_count: 3 },
                  { name: "Other", is_brand: false, avg_position: 3.0, mention_count: 2 }
                ]
              }
            }
          }
        ]
      },
      recommendationByRunId: { r2: { title: "Añade una página de comparativa", description: "..." } }
    });

    await runWeeklyDigest({ service: service as never });

    expect(sendWeeklyDigestEmail).toHaveBeenCalledWith("founder@example.com", "acme.com", {
      currentScore: 70,
      previousScore: 80,
      topMover: { name: "Rival", mentionDelta: 5 },
      recommendation: { title: "Añade una página de comparativa", description: "..." }
    });
  });

  it("doesn't send to an owner who opted out of the weekly digest", async () => {
    const service = fakeService({
      projects: [{ id: "p1", domain: "acme.com", owner_user_id: "u1" }],
      profiles: [{ id: "u1", email: "founder@example.com", notify_weekly_digest: false }],
      runScoresByProject: {
        p1: [
          { run_id: "r2", visibility_score: 70, details_json: null },
          { run_id: "r1", visibility_score: 80, details_json: null }
        ]
      }
    });

    const result = await runWeeklyDigest({ service: service as never });

    expect(sendWeeklyDigestEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, sent: 0, skipped: 0 });
  });

  it("doesn't send when the profile has no email on file", async () => {
    const service = fakeService({
      projects: [{ id: "p1", domain: "acme.com", owner_user_id: "u1" }],
      profiles: [{ id: "u1", email: null, notify_weekly_digest: true }],
      runScoresByProject: {
        p1: [
          { run_id: "r2", visibility_score: 70, details_json: null },
          { run_id: "r1", visibility_score: 80, details_json: null }
        ]
      }
    });

    const result = await runWeeklyDigest({ service: service as never });

    expect(sendWeeklyDigestEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, sent: 0, skipped: 0 });
  });

  it("respects maxProjects", async () => {
    const service = fakeService({
      projects: [
        { id: "p1", domain: "one.com", owner_user_id: "u1" },
        { id: "p2", domain: "two.com", owner_user_id: "u1" }
      ],
      profiles: [{ id: "u1", email: "founder@example.com", notify_weekly_digest: true }],
      runScoresByProject: {
        p1: [
          { run_id: "r2", visibility_score: 70, details_json: null },
          { run_id: "r1", visibility_score: 80, details_json: null }
        ],
        p2: [
          { run_id: "r4", visibility_score: 50, details_json: null },
          { run_id: "r3", visibility_score: 60, details_json: null }
        ]
      }
    });

    const result = await runWeeklyDigest({ service: service as never, maxProjects: 1 });

    expect(sendWeeklyDigestEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ processed: 1, sent: 1, skipped: 0 });
  });
});
