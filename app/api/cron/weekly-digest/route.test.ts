import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRELAUNCH-HARDENING-1 Fase Q3 — el cableado de la ruta del resumen semanal.
 * Ver `weekly-scans/route.test.ts` para el porqué.
 *
 * Aquí el interruptor importa por una razón extra: este endpoint **manda
 * correos**. Encenderlo por accidente no gasta LLM, escribe a clientes.
 */

const runWeeklyDigest = vi.fn(async (_args?: unknown) => ({ processed: 3, sent: 2, skipped: 1 }));
vi.mock("@/lib/scan/weekly-digest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan/weekly-digest")>();
  return { ...actual, runWeeklyDigest: (args: unknown) => runWeeklyDigest(args) };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { GET } from "./route";

const SECRET = "cron-secret-value";
const authorized = { authorization: `Bearer ${SECRET}` };

function get(headers: Record<string, string> = {}) {
  return GET(new Request("https://genscore.es/api/cron/weekly-digest", { headers }));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  process.env.CRON_DIGEST_ENABLED = "true";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_DIGEST_ENABLED;
});

describe("GET /api/cron/weekly-digest · autorización", () => {
  it("rechaza sin cabecera y con secreto ajeno", async () => {
    expect((await get()).status).toBe(401);
    expect((await get({ authorization: "Bearer otro" })).status).toBe(401);
    expect(runWeeklyDigest).not.toHaveBeenCalled();
  });

  it("sin secreto configurado no entra nadie", async () => {
    delete process.env.CRON_SECRET;
    expect((await get(authorized)).status).toBe(401);
    expect(runWeeklyDigest).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/weekly-digest · interruptor", () => {
  /**
   * Este endpoint escribe a clientes, así que su interruptor tiene que ser
   * INDEPENDIENTE del de los escaneos: encender los escaneos no puede encender
   * los correos de rebote.
   */
  it("no se enciende con el interruptor de los escaneos", async () => {
    delete process.env.CRON_DIGEST_ENABLED;
    process.env.CRON_SCANS_ENABLED = "true";

    const response = await get(authorized);
    expect(await response.json()).toEqual({ skipped: "cron_digest_disabled" });
    expect(runWeeklyDigest).not.toHaveBeenCalled();

    delete process.env.CRON_SCANS_ENABLED;
  });

  it("apagado no manda nada", async () => {
    process.env.CRON_DIGEST_ENABLED = "false";
    expect(await (await get(authorized)).json()).toEqual({ skipped: "cron_digest_disabled" });
    expect(runWeeklyDigest).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/weekly-digest · ejecución", () => {
  it("autorizada y encendida, publica cuántos envió y cuántos saltó", async () => {
    const response = await get(authorized);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 3, sent: 2, skipped: 1 });
  });

  it("un fallo responde 500 con un código propio, nunca el error crudo", async () => {
    runWeeklyDigest.mockRejectedValueOnce(new Error('column "digest_sent_at" does not exist'));
    const response = await get(authorized);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ processed: 0, error: "query_failed" });
    expect(JSON.stringify(body)).not.toContain("digest_sent_at");
  });
});
