import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

const requireOperatorMock = vi.fn();
vi.mock("@/lib/admin/operator", () => ({
  requireOperator: (...args: unknown[]) => requireOperatorMock(...args)
}));

const sendAdminAutomationChangeAlertEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendAdminAutomationChangeAlertEmail: (...args: unknown[]) => sendAdminAutomationChangeAlertEmail(...args)
}));

type Row = Record<string, unknown>;

function fakeService(options: {
  project?: Row | null;
  owner?: Row | null;
  completedRun?: Row | null;
  updateFails?: boolean;
}) {
  const updates: Array<{ table: string; patch: Row }> = [];

  return {
    updates,
    from(table: string) {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: options.project ?? null, error: null })
            })
          }),
          update: (patch: Row) => {
            updates.push({ table, patch });
            const chain = {
              eq: () => chain,
              select: () => ({
                maybeSingle: () =>
                  Promise.resolve(
                    options.updateFails
                      ? { data: null, error: { message: "boom" } }
                      : { data: { id: (options.project as Row)?.id }, error: null }
                  )
              })
            };
            return chain;
          }
        };
      }
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: options.owner ?? null, error: null }) }) }) };
      }
      if (table === "scan_runs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: options.completedRun ?? null, error: null })
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

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT = { id: PROJECT_ID, name: "Acme", domain: "acme.com", owner_user_id: "u1", is_archived: false };
const OWNER_PRO = { email: "owner@example.com", current_plan: "pro" };
const OWNER_FREE = { email: "owner@example.com", current_plan: "free" };

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  redirectMock.mockClear();
  sendAdminAutomationChangeAlertEmail.mockReset();
  requireOperatorMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setRecurringScansAsOperator", () => {
  it("refuses to enable on a Free-plan project — the sweep would ignore it", async () => {
    const service = fakeService({ project: PROJECT, owner: OWNER_FREE });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setRecurringScansAsOperator } = await import("./automation-actions");

    await expect(
      setRecurringScansAsOperator(formData({ projectId: PROJECT_ID, enabled: "true" }))
    ).rejects.toThrow("admin_error=recurring_free_plan_ineffective");

    expect(service.updates).toHaveLength(0);
    expect(sendAdminAutomationChangeAlertEmail).not.toHaveBeenCalled();
  });

  it("refuses to enable without a completed scan, same precondition as the owner's own action", async () => {
    const service = fakeService({ project: PROJECT, owner: OWNER_PRO, completedRun: null });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setRecurringScansAsOperator } = await import("./automation-actions");

    await expect(
      setRecurringScansAsOperator(formData({ projectId: PROJECT_ID, enabled: "true" }))
    ).rejects.toThrow("admin_error=recurring_requires_completed_scan");

    expect(service.updates).toHaveLength(0);
  });

  it("enables for a Pro project with a completed scan, and sends the alert email", async () => {
    const service = fakeService({ project: PROJECT, owner: OWNER_PRO, completedRun: { id: "run-1" } });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setRecurringScansAsOperator } = await import("./automation-actions");

    await expect(
      setRecurringScansAsOperator(formData({ projectId: PROJECT_ID, enabled: "true" }))
    ).rejects.toThrow("REDIRECT:/admin/users?u=u1&admin_success=recurring_enabled");

    expect(service.updates).toEqual([{ table: "projects", patch: { recurring_scans_enabled: true } }]);
    expect(sendAdminAutomationChangeAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorEmail: "op@example.com",
        targetUserEmail: "owner@example.com",
        targetUserId: "u1",
        change: "Escaneo recurrente → activado"
      })
    );
    // El motivo se retiró explícitamente (ADMIN-CONSOLE-UX-1, §98): el email
    // ya no lo lleva porque el formulario ya no lo pide.
    expect(sendAdminAutomationChangeAlertEmail.mock.calls[0][0]).not.toHaveProperty("reason");
  });

  it("disabling never checks the completed-scan precondition", async () => {
    const service = fakeService({ project: PROJECT, owner: OWNER_PRO, completedRun: null });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setRecurringScansAsOperator } = await import("./automation-actions");

    await expect(
      setRecurringScansAsOperator(formData({ projectId: PROJECT_ID, enabled: "false" }))
    ).rejects.toThrow("admin_success=recurring_disabled");

    expect(service.updates).toEqual([{ table: "projects", patch: { recurring_scans_enabled: false } }]);
  });

  it("refuses a project that doesn't exist", async () => {
    const service = fakeService({ project: null });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setRecurringScansAsOperator } = await import("./automation-actions");

    await expect(
      setRecurringScansAsOperator(formData({ projectId: PROJECT_ID, enabled: "true" }))
    ).rejects.toThrow("admin_error=project_not_found");
  });

  it("refuses an archived project", async () => {
    const service = fakeService({ project: { ...PROJECT, is_archived: true }, owner: OWNER_PRO, completedRun: { id: "run-1" } });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setRecurringScansAsOperator } = await import("./automation-actions");

    await expect(
      setRecurringScansAsOperator(formData({ projectId: PROJECT_ID, enabled: "true" }))
    ).rejects.toThrow("admin_error=project_not_found");

    expect(service.updates).toHaveLength(0);
  });

  it("never sends the alert email when the write itself fails", async () => {
    const service = fakeService({ project: PROJECT, owner: OWNER_PRO, completedRun: { id: "run-1" }, updateFails: true });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setRecurringScansAsOperator } = await import("./automation-actions");

    await expect(
      setRecurringScansAsOperator(formData({ projectId: PROJECT_ID, enabled: "true" }))
    ).rejects.toThrow("admin_error=recurring_update_failed");

    expect(sendAdminAutomationChangeAlertEmail).not.toHaveBeenCalled();
  });

  it("still redirects to success when the alert email itself throws", async () => {
    const service = fakeService({ project: PROJECT, owner: OWNER_PRO, completedRun: { id: "run-1" } });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    sendAdminAutomationChangeAlertEmail.mockRejectedValueOnce(new Error("smtp down"));
    const { setRecurringScansAsOperator } = await import("./automation-actions");

    await expect(
      setRecurringScansAsOperator(formData({ projectId: PROJECT_ID, enabled: "true" }))
    ).rejects.toThrow("REDIRECT:/admin/users?u=u1&admin_success=recurring_enabled");

    expect(service.updates).toEqual([{ table: "projects", patch: { recurring_scans_enabled: true } }]);
  });

  it("never puts a raw UUID in the email's targetUserEmail field when the owner profile can't be found", async () => {
    // Uses the technical audit half (never plan-gated) so the missing-profile
    // fallback ?? "free" on the recurring-scans path doesn't mask this case.
    const service = fakeService({ project: PROJECT, owner: null });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setAutoAuditHalfAsOperator } = await import("./automation-actions");

    await expect(
      setAutoAuditHalfAsOperator(formData({ projectId: PROJECT_ID, enabled: "true", half: "technical" }))
    ).rejects.toThrow("admin_success=audit_technical_enabled");

    const call = sendAdminAutomationChangeAlertEmail.mock.calls[0][0];
    expect(call.targetUserEmail).not.toBe(PROJECT.owner_user_id);
    expect(call.targetUserEmail).toContain("no encontrado");
  });
});

describe("setAutoAuditHalfAsOperator", () => {
  it("enables the technical half regardless of plan — it has always been free", async () => {
    const service = fakeService({ project: PROJECT, owner: OWNER_FREE });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setAutoAuditHalfAsOperator } = await import("./automation-actions");

    await expect(
      setAutoAuditHalfAsOperator(formData({ projectId: PROJECT_ID, enabled: "true", half: "technical" }))
    ).rejects.toThrow("admin_success=audit_technical_enabled");

    expect(service.updates).toEqual([{ table: "projects", patch: { auto_technical_audit_enabled: true } }]);
  });

  it("refuses to enable the coverage half below Pro — audit-job-runner would skip it as plan_required", async () => {
    const service = fakeService({ project: PROJECT, owner: OWNER_FREE });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setAutoAuditHalfAsOperator } = await import("./automation-actions");

    await expect(
      setAutoAuditHalfAsOperator(formData({ projectId: PROJECT_ID, enabled: "true", half: "coverage" }))
    ).rejects.toThrow("admin_error=coverage_plan_ineffective");

    expect(service.updates).toHaveLength(0);
  });

  it("enables the coverage half on a Pro project", async () => {
    const service = fakeService({ project: PROJECT, owner: OWNER_PRO });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setAutoAuditHalfAsOperator } = await import("./automation-actions");

    await expect(
      setAutoAuditHalfAsOperator(formData({ projectId: PROJECT_ID, enabled: "true", half: "coverage" }))
    ).rejects.toThrow("admin_success=audit_coverage_enabled");

    expect(service.updates).toEqual([{ table: "projects", patch: { auto_coverage_audit_enabled: true } }]);
  });

  it("disabling the coverage half is never plan-gated", async () => {
    const service = fakeService({ project: PROJECT, owner: OWNER_FREE });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setAutoAuditHalfAsOperator } = await import("./automation-actions");

    await expect(
      setAutoAuditHalfAsOperator(formData({ projectId: PROJECT_ID, enabled: "false", half: "coverage" }))
    ).rejects.toThrow("admin_success=audit_coverage_disabled");
  });

  it("rejects an invalid half value", async () => {
    const service = fakeService({ project: PROJECT, owner: OWNER_PRO });
    requireOperatorMock.mockResolvedValue({ user: { id: "op", email: "op@example.com" }, service });
    const { setAutoAuditHalfAsOperator } = await import("./automation-actions");

    await expect(
      setAutoAuditHalfAsOperator(formData({ projectId: PROJECT_ID, enabled: "true", half: "bogus" }))
    ).rejects.toThrow("admin_error=invalid_input");
  });
});
