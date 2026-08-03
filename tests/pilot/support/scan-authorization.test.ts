import { describe, expect, it } from "vitest";
import {
  describeAuthorization,
  MAX_SCANS_PER_RUN,
  resolveScanAuthorization
} from "./scan-authorization";

const VALID = {
  PILOT_SCAN_AUTHORIZATION: "granted-by-founder",
  PILOT_SCAN_PROJECT_ID: "proj-123",
  PILOT_SCAN_COUNT: "2"
};

describe("resolveScanAuthorization", () => {
  it("refuses without the founder's token — the default state of every deploy run", () => {
    const result = resolveScanAuthorization({ ...VALID, PILOT_SCAN_AUTHORIZATION: undefined });
    expect(result.authorized).toBe(false);
    expect(result.authorized === false && result.reason).toContain("PILOT_SCAN_AUTHORIZATION");
  });

  it("treats an empty or whitespace token as absent", () => {
    for (const token of ["", "   ", "\n"]) {
      expect(resolveScanAuthorization({ ...VALID, PILOT_SCAN_AUTHORIZATION: token }).authorized).toBe(
        false
      );
    }
  });

  it("refuses without an explicitly named project — it will not go find one to spend money on", () => {
    const result = resolveScanAuthorization({ ...VALID, PILOT_SCAN_PROJECT_ID: undefined });
    expect(result.authorized).toBe(false);
    expect(result.authorized === false && result.reason).toContain("PILOT_SCAN_PROJECT_ID");
  });

  it("authorizes exactly what it was told to", () => {
    const result = resolveScanAuthorization(VALID);
    expect(result).toEqual({ authorized: true, projectId: "proj-123", scanCount: 2 });
  });

  it("defaults to one scan when no count is given — never 'as many as it takes'", () => {
    const result = resolveScanAuthorization({ ...VALID, PILOT_SCAN_COUNT: undefined });
    expect(result).toEqual({ authorized: true, projectId: "proj-123", scanCount: 1 });
  });

  it("refuses above the cap rather than clamping", () => {
    // Clamping would spend less than instructed while reporting success, which
    // reads as a run that did what it was asked.
    const result = resolveScanAuthorization({
      ...VALID,
      PILOT_SCAN_COUNT: String(MAX_SCANS_PER_RUN + 1)
    });
    expect(result.authorized).toBe(false);
    expect(result.authorized === false && result.reason).toContain(String(MAX_SCANS_PER_RUN));
  });

  it("rejects counts that are not whole numbers of at least one", () => {
    for (const count of ["0", "-1", "1.5", "many", "1e2"]) {
      expect(
        resolveScanAuthorization({ ...VALID, PILOT_SCAN_COUNT: count }).authorized,
        `count "${count}" must be refused`
      ).toBe(false);
    }
  });

  it("refuses on an empty environment, which is what a per-deploy run passes", () => {
    expect(resolveScanAuthorization({}).authorized).toBe(false);
  });
});

describe("describeAuthorization", () => {
  it("states the spend that was permitted", () => {
    expect(describeAuthorization(resolveScanAuthorization(VALID))).toContain("2 escaneo(s)");
    expect(describeAuthorization(resolveScanAuthorization(VALID))).toContain("proj-123");
  });

  it("states why it refused", () => {
    const described = describeAuthorization(resolveScanAuthorization({}));
    expect(described).toContain("no autorizado");
    expect(described).toContain("PILOT_SCAN_AUTHORIZATION");
  });
});
