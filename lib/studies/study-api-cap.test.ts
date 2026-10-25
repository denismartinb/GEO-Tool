import { describe, expect, it } from "vitest";
import { reserveStudyApiUnits, STUDY_API_DEFAULT_DAILY_CAP, studyApiDailyCap } from "./study-api-cap";

/**
 * STUDY-API-1 — the ceiling is the only bound on a caller holding the secret,
 * so what is pinned here is that it fails closed and records before spending.
 */

function fakeService({ count = 0, countError = null as unknown, insertError = null as unknown } = {}) {
  const inserted: unknown[] = [];
  const filters: Array<[string, unknown]> = [];
  const service = {
    from: () => ({
      select: () => {
        const query = {
          gte: () => query,
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return Promise.resolve({ count, error: countError });
          }
        };
        return query;
      },
      insert: (rows: unknown[]) => {
        inserted.push(...rows);
        return Promise.resolve({ error: insertError });
      }
    })
  };
  return { service: service as never, inserted, filters };
}

describe("reserveStudyApiUnits", () => {
  it("records one row per unit and allows under the ceiling", async () => {
    const { service, inserted, filters } = fakeService({ count: 10 });
    const result = await reserveStudyApiUnits(service, { units: 3, label: "clinica.es" }, { cap: 600 });
    expect(result).toEqual({ allowed: true, usedToday: 13, cap: 600 });
    expect(inserted).toHaveLength(3);
    expect(inserted[0]).toMatchObject({ engine: "study_api", domain: "clinica.es", status: "pending" });
    expect(filters).toContainEqual(["engine", "study_api"]);
  });

  it("denies a request that would cross the ceiling, and writes nothing", async () => {
    const { service, inserted } = fakeService({ count: 598 });
    const result = await reserveStudyApiUnits(service, { units: 3, label: "clinica.es" }, { cap: 600 });
    expect(result).toMatchObject({ allowed: false, reason: "daily_cap_reached" });
    expect(inserted).toHaveLength(0);
  });

  it("fails closed when the count fails", async () => {
    const { service } = fakeService({ countError: new Error("down") });
    const result = await reserveStudyApiUnits(service, { units: 1, label: "x" }, { cap: 600 });
    expect(result).toMatchObject({ allowed: false, reason: "cap_check_failed" });
  });

  it("fails closed when the reservation cannot be written", async () => {
    const { service } = fakeService({ insertError: new Error("down") });
    const result = await reserveStudyApiUnits(service, { units: 1, label: "x" }, { cap: 600 });
    expect(result).toMatchObject({ allowed: false, reason: "cap_check_failed" });
  });
});

describe("studyApiDailyCap", () => {
  it("reads a positive integer and falls back otherwise", () => {
    expect(studyApiDailyCap("250")).toBe(250);
    expect(studyApiDailyCap(undefined)).toBe(STUDY_API_DEFAULT_DAILY_CAP);
    expect(studyApiDailyCap("0")).toBe(STUDY_API_DEFAULT_DAILY_CAP);
    expect(studyApiDailyCap("abc")).toBe(STUDY_API_DEFAULT_DAILY_CAP);
  });
});
