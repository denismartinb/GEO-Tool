import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTrialEndingSoonEmail = vi.fn(async (_to: string, _trialEndsAt: Date) => undefined);
vi.mock("@/lib/email/transactional", () => ({
  sendTrialEndingSoonEmail: (to: string, trialEndsAt: Date) => sendTrialEndingSoonEmail(to, trialEndsAt)
}));

import { runTrialReminders } from "./trial-reminders";

type ProfileRow = { id: string; email: string | null; trial_ends_at: string | null };

/**
 * A minimal fake of the chain this module actually calls — a select filtered
 * by `.not/.is/.lte/.gt` (thenable at the end, no `.order`/`.limit`), and an
 * `.update(...).eq(...).is(...)` write. Mirrors the shape already used by
 * `weekly-digest.test.ts`'s `fakeService`, just narrower.
 */
function fakeService({
  candidates,
  selectError = null,
  updateErrorForIds = new Set<string>()
}: {
  candidates: ProfileRow[];
  selectError?: { message: string } | null;
  updateErrorForIds?: Set<string>;
}) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  return {
    updates,
    from(table: string) {
      if (table !== "profiles") throw new Error(`unexpected table: ${table}`);
      return {
        select() {
          const chain = {
            not: () => chain,
            is: () => chain,
            lte: () => chain,
            gt: () => chain,
            then(resolve: (value: { data: ProfileRow[] | null; error: { message: string } | null }) => unknown) {
              return Promise.resolve({ data: selectError ? null : candidates, error: selectError }).then(resolve);
            }
          };
          return chain;
        },
        update(patch: Record<string, unknown>) {
          let targetId = "";
          const chain = {
            eq(_col: string, id: string) {
              targetId = id;
              return chain;
            },
            is() {
              updates.push({ id: targetId, patch });
              const error = updateErrorForIds.has(targetId) ? { message: "boom" } : null;
              return Promise.resolve({ error });
            }
          };
          return chain;
        }
      };
    }
  };
}

const NOW = new Date("2026-09-19T09:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("runTrialReminders", () => {
  it("manda el aviso a cada cuenta candidata y marca trial_reminder_sent_at", async () => {
    const service = fakeService({
      candidates: [
        { id: "u1", email: "a@example.com", trial_ends_at: "2026-09-21T09:00:00Z" },
        { id: "u2", email: "b@example.com", trial_ends_at: "2026-09-22T09:00:00Z" }
      ]
    });

    const result = await runTrialReminders({ service: service as never });

    expect(result).toEqual({ processed: 2, sent: 2, skipped: 0 });
    expect(sendTrialEndingSoonEmail).toHaveBeenCalledTimes(2);
    expect(sendTrialEndingSoonEmail).toHaveBeenCalledWith("a@example.com", new Date("2026-09-21T09:00:00Z"));
    expect(service.updates.map((u) => u.id)).toEqual(["u1", "u2"]);
    expect(service.updates[0].patch).toHaveProperty("trial_reminder_sent_at");
  });

  it("salta una fila sin email o sin trial_ends_at, sin enviar ni marcar", async () => {
    const service = fakeService({
      candidates: [{ id: "u1", email: null, trial_ends_at: "2026-09-21T09:00:00Z" }]
    });

    const result = await runTrialReminders({ service: service as never });

    expect(result).toEqual({ processed: 1, sent: 0, skipped: 1 });
    expect(sendTrialEndingSoonEmail).not.toHaveBeenCalled();
    expect(service.updates).toEqual([]);
  });

  it("manda igual aunque el marcado falle — perder el aviso es peor que un duplicado", async () => {
    const service = fakeService({
      candidates: [{ id: "u1", email: "a@example.com", trial_ends_at: "2026-09-21T09:00:00Z" }],
      updateErrorForIds: new Set(["u1"])
    });

    const result = await runTrialReminders({ service: service as never });

    expect(result).toEqual({ processed: 1, sent: 1, skipped: 0 });
    expect(sendTrialEndingSoonEmail).toHaveBeenCalledTimes(1);
  });

  it("un fallo en la consulta lanza un error propio, nunca el crudo de Postgres", async () => {
    const service = fakeService({ candidates: [], selectError: { message: 'column "trial_reminder_sent_at" does not exist' } });

    await expect(runTrialReminders({ service: service as never })).rejects.toThrow("query_failed");
    expect(sendTrialEndingSoonEmail).not.toHaveBeenCalled();
  });

  it("sin candidatas no manda nada", async () => {
    const service = fakeService({ candidates: [] });
    const result = await runTrialReminders({ service: service as never });

    expect(result).toEqual({ processed: 0, sent: 0, skipped: 0 });
    expect(sendTrialEndingSoonEmail).not.toHaveBeenCalled();
  });
});
