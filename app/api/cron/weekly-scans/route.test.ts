import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRELAUNCH-HARDENING-1 Fase Q3 — el cableado de la ruta del barrido diario.
 *
 * La lógica de dentro (`runDailyCronScan`) ya está testeada; lo que no tenía
 * detector es **el cableado**: que la ruta compruebe de verdad la autorización,
 * que lea SU variable de entorno y no otra, y que el interruptor apague. Una
 * regresión aquí no falla ruidosamente — apaga el escaneo recurrente entero y
 * en producción no se nota hasta días después, cuando alguien mira por qué su
 * puntuación no se mueve.
 *
 * Es el mismo argumento que ya justificó los tests de `cron/run-audit`, ahora
 * para las tres rutas que faltaban.
 */

const runDailyCronScan = vi.fn(async (_args?: unknown) => ({
  processed: 2,
  scanned: 1,
  results: [],
  deferred: 0,
  continuationScheduled: false
}));
vi.mock("@/lib/scan/cron", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan/cron")>();
  return { ...actual, runDailyCronScan: (args: unknown) => runDailyCronScan(args) };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { GET } from "./route";

const SECRET = "cron-secret-value";

function get(headers: Record<string, string> = {}) {
  return GET(new Request("https://genscore.es/api/cron/weekly-scans", { headers }));
}

const authorized = { authorization: `Bearer ${SECRET}` };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  process.env.CRON_SCANS_ENABLED = "true";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_SCANS_ENABLED;
});

describe("GET /api/cron/weekly-scans · autorización", () => {
  it("rechaza sin cabecera", async () => {
    const response = await get();
    expect(response.status).toBe(401);
    expect(runDailyCronScan).not.toHaveBeenCalled();
  });

  it("rechaza con un secreto que no es el suyo", async () => {
    const response = await get({ authorization: "Bearer otro-secreto" });
    expect(response.status).toBe(401);
    expect(runDailyCronScan).not.toHaveBeenCalled();
  });

  /**
   * Fail-closed: sin `CRON_SECRET` configurado **nadie** entra, ni siquiera
   * quien no manda cabecera. Una ruta que se abre sola cuando falta su secreto
   * es una ruta abierta el día que alguien despliega sin esa variable.
   */
  it("sin secreto configurado no entra nadie", async () => {
    delete process.env.CRON_SECRET;
    expect((await get(authorized)).status).toBe(401);
    expect((await get()).status).toBe(401);
    expect(runDailyCronScan).not.toHaveBeenCalled();
  });

  /**
   * Cruce de secretos: el de las continuaciones de escaneo no puede abrir la
   * puerta de los crons. Son dos variables distintas a propósito.
   */
  it("el secreto de /api/scan/continue no abre esta ruta", async () => {
    process.env.SCAN_CONTINUE_SECRET = "scan-continue-secret";
    const response = await get({ authorization: "Bearer scan-continue-secret" });
    expect(response.status).toBe(401);
    delete process.env.SCAN_CONTINUE_SECRET;
  });
});

describe("GET /api/cron/weekly-scans · interruptor", () => {
  it("apagado no ejecuta nada y lo dice", async () => {
    process.env.CRON_SCANS_ENABLED = "false";
    const response = await get(authorized);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: "cron_scans_disabled" });
    expect(runDailyCronScan).not.toHaveBeenCalled();
  });

  /**
   * La comparación es `=== "true"`, así que una variable ausente o con
   * cualquier otro valor cae en «apagado». Es la dirección de fallo correcta
   * para algo que gasta LLM.
   */
  it("una variable ausente o rara cuenta como apagado", async () => {
    delete process.env.CRON_SCANS_ENABLED;
    expect(await (await get(authorized)).json()).toEqual({ skipped: "cron_scans_disabled" });

    process.env.CRON_SCANS_ENABLED = "TRUE";
    expect(await (await get(authorized)).json()).toEqual({ skipped: "cron_scans_disabled" });

    expect(runDailyCronScan).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/weekly-scans · ejecución", () => {
  it("autorizada y encendida, ejecuta el barrido y publica su recuento", async () => {
    const response = await get(authorized);

    expect(response.status).toBe(200);
    expect(runDailyCronScan).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ processed: 2, scanned: 1 });
  });

  /**
   * Un fallo no puede filtrar el error crudo de Postgres a la respuesta
   * (`.claude/rules/supabase.md`: "No raw Postgres errors in the UI").
   */
  it("un fallo responde 500 con un código propio, nunca el error crudo", async () => {
    runDailyCronScan.mockRejectedValueOnce(new Error('relation "scan_runs" does not exist'));
    const response = await get(authorized);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ processed: 0, error: "query_failed" });
    expect(JSON.stringify(body)).not.toContain("relation");
  });
});
