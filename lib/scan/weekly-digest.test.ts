import { beforeEach, describe, expect, it, vi } from "vitest";

const sendWeeklyDigestEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendWeeklyDigestEmail: (...args: unknown[]) => sendWeeklyDigestEmail(...args)
}));

import { runWeeklyDigest } from "./weekly-digest";

type Row = Record<string, unknown>;

/** A count-style query (`{ count: "exact", head: true }`) is awaited directly instead of via `.maybeSingle()`/`.order()` — this builder supports both by exposing `.then()` alongside the normal chain methods. */
function countChain(getCount: (filters: Record<string, unknown>) => number) {
  const filters: Record<string, unknown> = {};
  const chain = {
    eq(col: string, val: unknown) {
      filters[col] = val;
      return chain;
    },
    gte(col: string, val: unknown) {
      filters[col] = val;
      return chain;
    },
    then(resolve: (value: { count: number; error: null }) => unknown) {
      return Promise.resolve({ count: getCount(filters), error: null }).then(resolve);
    }
  };
  return chain;
}

function fakeService({
  projects,
  profiles,
  runScoresByProject,
  recommendationByRunId,
  activeRecommendationsCountByRunId = {},
  promptsCountByProject = {},
  competitorsCountByProject = {},
  scansThisWeekByProject = {}
}: {
  projects: Row[];
  profiles: Row[];
  runScoresByProject: Record<string, Row[]>;
  recommendationByRunId?: Record<string, Row | null>;
  activeRecommendationsCountByRunId?: Record<string, number>;
  promptsCountByProject?: Record<string, number>;
  competitorsCountByProject?: Record<string, number>;
  scansThisWeekByProject?: Record<string, number>;
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
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              return countChain((filters) => activeRecommendationsCountByRunId[filters.run_id as string] ?? 0);
            }
            return {
              eq: (_col: string, runId: string) => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () => Promise.resolve({ data: recommendationByRunId?.[runId] ?? null, error: null })
                    })
                  })
                })
              })
            };
          }
        };
      }
      if (table === "project_prompts") {
        return { select: () => countChain((filters) => promptsCountByProject[filters.project_id as string] ?? 0) };
      }
      if (table === "project_competitors") {
        return { select: () => countChain((filters) => competitorsCountByProject[filters.project_id as string] ?? 0) };
      }
      if (table === "scan_runs") {
        return { select: () => countChain((filters) => scansThisWeekByProject[filters.project_id as string] ?? 0) };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };
}

const ZERO_EXTRAS = { activeRecommendationsCount: 0, promptsCount: 0, competitorsCount: 0, scansThisWeek: 0 };

beforeEach(() => {
  sendWeeklyDigestEmail.mockReset();
});

describe("runWeeklyDigest", () => {
  it("skips a project with fewer than 2 scored runs", async () => {
    const service = fakeService({
      projects: [{ id: "p1", domain: "acme.com", owner_user_id: "u1" }],
      profiles: [{ id: "u1", email: "founder@example.com", notify_weekly_digest: true }],
      runScoresByProject: { p1: [{ run_id: "r1", visibility_score: 80, citation_score: 60, details_json: null }] }
    });

    const result = await runWeeklyDigest({ service: service as never });

    expect(sendWeeklyDigestEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, sent: 0, skipped: 1 });
  });

  it("sends the digest with the score delta, real sub-scores, and section counts", async () => {
    const service = fakeService({
      projects: [{ id: "p1", domain: "acme.com", owner_user_id: "u1" }],
      profiles: [{ id: "u1", email: "founder@example.com", notify_weekly_digest: true }],
      runScoresByProject: {
        p1: [
          { run_id: "r2", visibility_score: 70, citation_score: 40, details_json: null },
          { run_id: "r1", visibility_score: 80, citation_score: 50, details_json: null }
        ]
      },
      recommendationByRunId: { r2: null },
      activeRecommendationsCountByRunId: { r2: 3 },
      promptsCountByProject: { p1: 8 },
      competitorsCountByProject: { p1: 4 },
      scansThisWeekByProject: { p1: 2 }
    });

    const result = await runWeeklyDigest({ service: service as never });

    expect(sendWeeklyDigestEmail).toHaveBeenCalledWith("founder@example.com", "acme.com", {
      currentScore: 70,
      previousScore: 80,
      subScores: { visibility: 70, citation: 40, standing: null },
      topMover: null,
      recommendation: null,
      activeRecommendationsCount: 3,
      promptsCount: 8,
      competitorsCount: 4,
      scansThisWeek: 2
    });
    expect(result).toEqual({ processed: 1, sent: 1, skipped: 0 });
  });

  it("reads standing from geo_score.components when present", async () => {
    const service = fakeService({
      projects: [{ id: "p1", domain: "acme.com", owner_user_id: "u1" }],
      profiles: [{ id: "u1", email: "founder@example.com", notify_weekly_digest: true }],
      runScoresByProject: {
        p1: [
          {
            run_id: "r2",
            visibility_score: 70,
            citation_score: 40,
            details_json: { geo_score: { components: { standing: { value: 55.5 } } } }
          },
          { run_id: "r1", visibility_score: 80, citation_score: 50, details_json: null }
        ]
      },
      recommendationByRunId: { r2: null }
    });

    await runWeeklyDigest({ service: service as never });

    expect(sendWeeklyDigestEmail).toHaveBeenCalledWith(
      "founder@example.com",
      "acme.com",
      expect.objectContaining({ subScores: { visibility: 70, citation: 40, standing: 55.5 } })
    );
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
            citation_score: 40,
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
            citation_score: 50,
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

    expect(sendWeeklyDigestEmail).toHaveBeenCalledWith(
      "founder@example.com",
      "acme.com",
      expect.objectContaining({
        currentScore: 70,
        previousScore: 80,
        topMover: { name: "Rival", mentionDelta: 5 },
        recommendation: { title: "Añade una página de comparativa", description: "..." }
      })
    );
  });

  it("doesn't send to an owner who opted out of the weekly digest", async () => {
    const service = fakeService({
      projects: [{ id: "p1", domain: "acme.com", owner_user_id: "u1" }],
      profiles: [{ id: "u1", email: "founder@example.com", notify_weekly_digest: false }],
      runScoresByProject: {
        p1: [
          { run_id: "r2", visibility_score: 70, citation_score: 40, details_json: null },
          { run_id: "r1", visibility_score: 80, citation_score: 50, details_json: null }
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
          { run_id: "r2", visibility_score: 70, citation_score: 40, details_json: null },
          { run_id: "r1", visibility_score: 80, citation_score: 50, details_json: null }
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
          { run_id: "r2", visibility_score: 70, citation_score: 40, details_json: null },
          { run_id: "r1", visibility_score: 80, citation_score: 50, details_json: null }
        ],
        p2: [
          { run_id: "r4", visibility_score: 50, citation_score: 30, details_json: null },
          { run_id: "r3", visibility_score: 60, citation_score: 35, details_json: null }
        ]
      }
    });

    const result = await runWeeklyDigest({ service: service as never, maxProjects: 1 });

    expect(sendWeeklyDigestEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ processed: 1, sent: 1, skipped: 0 });
  });

  it("defaults every section count to 0 when no data is on file", async () => {
    const service = fakeService({
      projects: [{ id: "p1", domain: "acme.com", owner_user_id: "u1" }],
      profiles: [{ id: "u1", email: "founder@example.com", notify_weekly_digest: true }],
      runScoresByProject: {
        p1: [
          { run_id: "r2", visibility_score: 70, citation_score: 40, details_json: null },
          { run_id: "r1", visibility_score: 80, citation_score: 50, details_json: null }
        ]
      },
      recommendationByRunId: { r2: null }
    });

    await runWeeklyDigest({ service: service as never });

    expect(sendWeeklyDigestEmail).toHaveBeenCalledWith("founder@example.com", "acme.com", expect.objectContaining(ZERO_EXTRAS));
  });
});
