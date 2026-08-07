import { describe, expect, it } from "vitest";
import {
  AUDIT_CAMPAIGN_STALE_MS,
  deriveAuditPillState,
  isWebAuditJobDue
} from "@/lib/web-audit/audit-liveness";

const NOW = new Date("2026-08-07T21:20:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

/**
 * Regression: the 2026-08-07 genscore.es audit. The coverage campaign ran for
 * 13 minutes driven by the founder's browser tab, then stopped when the phone
 * locked. The `generated_solutions` row stayed `status='running'` forever, and
 * the screen rendered "Auditando…" off that status alone — so a campaign that
 * had not moved in hours was indistinguishable from one mid-batch.
 */
describe("deriveAuditPillState", () => {
  it("says auditing while the campaign is persisting batches", () => {
    expect(deriveAuditPillState({ campaignUpdatedAt: ago(30_000), now: NOW })).toBe("auditing");
  });

  it("stops claiming motion once the campaign has gone quiet", () => {
    // The real incident: last batch at 19:14, screenshot at 21:12.
    expect(deriveAuditPillState({ campaignUpdatedAt: ago(2 * 60 * 60_000), now: NOW })).toBe("pending");
  });

  it("draws the line at AUDIT_CAMPAIGN_STALE_MS", () => {
    expect(deriveAuditPillState({ campaignUpdatedAt: ago(AUDIT_CAMPAIGN_STALE_MS - 1_000), now: NOW })).toBe(
      "auditing"
    );
    expect(deriveAuditPillState({ campaignUpdatedAt: ago(AUDIT_CAMPAIGN_STALE_MS + 1_000), now: NOW })).toBe(
      "pending"
    );
  });

  it("never claims motion for a job waiting out its backoff, however fresh the campaign row", () => {
    // The backoff reaches 10h; "Auditando…" there is a flat lie.
    expect(deriveAuditPillState({ campaignUpdatedAt: ago(1_000), jobStatus: "retrying", now: NOW })).toBe("pending");
  });

  it("treats an unparseable timestamp as quiet, not as moving", () => {
    expect(deriveAuditPillState({ campaignUpdatedAt: "not a date", now: NOW })).toBe("pending");
  });

  it("covers a claimed job that has not written its first batch yet", () => {
    expect(deriveAuditPillState({ jobStatus: "running", now: NOW })).toBe("auditing");
    expect(deriveAuditPillState({ jobStatus: "pending", now: NOW })).toBe("pending");
  });

  it("is idle when there is neither a campaign nor a job", () => {
    expect(deriveAuditPillState({ now: NOW })).toBe("idle");
    expect(deriveAuditPillState({ jobStatus: "completed", now: NOW })).toBe("idle");
    expect(deriveAuditPillState({ jobStatus: "failed", now: NOW })).toBe("idle");
  });
});

describe("isWebAuditJobDue", () => {
  const STALE_LOCK_MS = 10 * 60_000;
  const due = (args: Parameters<typeof isWebAuditJobDue>[0]) => isWebAuditJobDue({ ...args, now: NOW });

  it("is due when pending with no scheduled attempt", () => {
    expect(due({ status: "pending", staleLockMs: STALE_LOCK_MS })).toBe(true);
  });

  it("is due once the backoff has elapsed, and not before", () => {
    expect(due({ status: "retrying", nextAttemptAt: ago(60_000), staleLockMs: STALE_LOCK_MS })).toBe(true);
    expect(
      due({
        status: "retrying",
        nextAttemptAt: new Date(NOW.getTime() + 60_000).toISOString(),
        staleLockMs: STALE_LOCK_MS
      })
    ).toBe(false);
  });

  it("is due when a running job's lock has expired", () => {
    expect(due({ status: "running", lockedAt: ago(STALE_LOCK_MS + 60_000), staleLockMs: STALE_LOCK_MS })).toBe(true);
  });

  it("leaves a live invocation's job alone", () => {
    expect(due({ status: "running", lockedAt: ago(5_000), staleLockMs: STALE_LOCK_MS })).toBe(false);
  });

  it("treats a running job with no lock as abandoned rather than eternally in-flight", () => {
    expect(due({ status: "running", staleLockMs: STALE_LOCK_MS })).toBe(true);
  });

  it("is never due for a terminal job", () => {
    for (const status of ["completed", "failed", "cancelled"]) {
      expect(due({ status, staleLockMs: STALE_LOCK_MS })).toBe(false);
    }
  });
});
