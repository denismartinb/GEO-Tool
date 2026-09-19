import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mismo cableado que `weekly-digest/route.test.ts` — ver ese fichero para el
 * porqué del patrón. Aquí el interruptor importa por la misma razón extra:
 * este endpoint manda correos a clientes.
 */

const runTrialReminders = vi.fn(async (_args?: unknown) => ({ processed: 3, sent: 2, skipped: 1 }));
vi.mock("@/lib/billing/trial-reminders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/trial-reminders")>();
  return { ...actual, runTrialReminders: (args: unknown) => runTrialReminders(args) };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { GET } from "./route";

const SECRET = "cron-secret-value";
const authorized = { authorization: `Bearer ${SECRET}` };

function get(headers: Record<string, string> = {}) {
  return GET(new Request("https://genscore.es/api/cron/trial-reminders", { headers }));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  process.env.CRON_TRIAL_REMINDER_ENABLED = "true";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_TRIAL_REMINDER_ENABLED;
});

describe("GET /api/cron/trial-reminders · autorización", () => {
  it("rechaza sin cabecera y con secreto ajeno", async () => {
    expect((await get()).status).toBe(401);
    expect((await get({ authorization: "Bearer otro" })).status).toBe(401);
    expect(runTrialReminders).not.toHaveBeenCalled();
  });

  it("sin secreto configurado no entra nadie", async () => {
    delete process.env.CRON_SECRET;
    expect((await get(authorized)).status).toBe(401);
    expect(runTrialReminders).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/trial-reminders · interruptor", () => {
  /**
   * Este endpoint escribe a clientes, así que su interruptor tiene que ser
   * INDEPENDIENTE del de los escaneos o del resumen — encender cualquiera de
   * los otros no puede encender este.
   */
  it("no se enciende con el interruptor de los escaneos ni con el del resumen", async () => {
    delete process.env.CRON_TRIAL_REMINDER_ENABLED;
    process.env.CRON_SCANS_ENABLED = "true";
    process.env.CRON_DIGEST_ENABLED = "true";

    const response = await get(authorized);
    expect(await response.json()).toEqual({ skipped: "cron_trial_reminder_disabled" });
    expect(runTrialReminders).not.toHaveBeenCalled();

    delete process.env.CRON_SCANS_ENABLED;
    delete process.env.CRON_DIGEST_ENABLED;
  });

  it("apagado no manda nada", async () => {
    process.env.CRON_TRIAL_REMINDER_ENABLED = "false";
    expect(await (await get(authorized)).json()).toEqual({ skipped: "cron_trial_reminder_disabled" });
    expect(runTrialReminders).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/trial-reminders · ejecución", () => {
  it("autorizada y encendida, publica cuántos envió y cuántos saltó", async () => {
    const response = await get(authorized);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 3, sent: 2, skipped: 1 });
  });

  it("un fallo responde 500 con un código propio, nunca el error crudo", async () => {
    runTrialReminders.mockRejectedValueOnce(new Error('column "trial_reminder_sent_at" does not exist'));
    const response = await get(authorized);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ processed: 0, error: "query_failed" });
    expect(JSON.stringify(body)).not.toContain("trial_reminder_sent_at");
  });
});
