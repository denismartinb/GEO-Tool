import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRELAUNCH-HARDENING-1 Fase Q3 — el cableado de la continuación del barrido.
 * Ver `weekly-scans/route.test.ts` para el porqué general.
 *
 * Lo propio de esta ruta es el **tope de la cadena**. Es una auto-llamada: el
 * barrido se despacha a sí mismo cuando quedan proyectos por atender
 * (ASYNC-SCAN-1a, ADR 0016). Sin un límite comprobado en el lado que recibe,
 * un `chainIndex` manipulado o un fallo de cálculo en el que despacha
 * convierten la red de seguridad en un bucle que se paga en llamadas a LLM.
 */

const runDailyCronScan = vi.fn(async (_args?: unknown) => ({
  processed: 1,
  scanned: 1,
  results: [],
  deferred: 0,
  continuationScheduled: false
}));
const MAX_CHAIN = 5;
vi.mock("@/lib/scan/cron", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan/cron")>();
  return {
    ...actual,
    runDailyCronScan: (args: unknown) => runDailyCronScan(args),
    resolveMaxSweepChainInvocations: () => MAX_CHAIN
  };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { POST } from "./route";

const SECRET = "cron-secret-value";
const authorized = { authorization: `Bearer ${SECRET}`, "content-type": "application/json" };

function post(body: unknown, headers: Record<string, string> = authorized) {
  return POST(
    new Request("https://genscore.es/api/cron/sweep-continue", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body)
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  process.env.CRON_SCANS_ENABLED = "true";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.CRON_SCANS_ENABLED;
});

describe("POST /api/cron/sweep-continue · autorización e interruptor", () => {
  it("rechaza sin cabecera y con secreto ajeno", async () => {
    expect((await post({ chainIndex: 1 }, { "content-type": "application/json" })).status).toBe(401);
    expect((await post({ chainIndex: 1 }, { authorization: "Bearer otro" })).status).toBe(401);
    expect(runDailyCronScan).not.toHaveBeenCalled();
  });

  /**
   * El interruptor de los escaneos también para una cadena YA EN VUELO: apagar
   * el cron y que las continuaciones siguieran corriendo sería un apagado que
   * no apaga.
   */
  it("apagar el cron detiene también una cadena en vuelo", async () => {
    process.env.CRON_SCANS_ENABLED = "false";
    const response = await post({ chainIndex: 2 });

    expect(await response.json()).toEqual({ skipped: "cron_scans_disabled" });
    expect(runDailyCronScan).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/sweep-continue · tope de la cadena", () => {
  it("acepta los índices que el lado que despacha puede producir", async () => {
    for (const chainIndex of [1, MAX_CHAIN - 1]) {
      vi.clearAllMocks();
      const response = await post({ chainIndex });
      expect(response.status).toBe(200);
      expect(runDailyCronScan).toHaveBeenCalledWith(expect.objectContaining({ chainIndex }));
    }
  });

  /**
   * Un índice legítimo siempre está en [1, cap-1] porque quien despacha sólo
   * encadena mientras `chainIndex + 1 < cap`. Cualquier otra cosa es un error
   * de cableado o una petición manipulada: se rechaza, no se recorta.
   */
  it("rechaza un índice fuera del rango en vez de recortarlo", async () => {
    for (const chainIndex of [0, -1, MAX_CHAIN, MAX_CHAIN + 50, 1.5]) {
      const response = await post({ chainIndex });
      expect(response.status, `chainIndex=${chainIndex}`).toBe(400);
    }
    expect(runDailyCronScan).not.toHaveBeenCalled();
  });

  it("rechaza un cuerpo ausente, no-JSON o sin chainIndex", async () => {
    expect((await post("no soy json")).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ chainIndex: "2" })).status).toBe(400);
    expect(runDailyCronScan).not.toHaveBeenCalled();
  });

  /**
   * El tope se lee del entorno en CADA petición, no se congela al importar el
   * módulo: si alguien sube el cap, la ruta tiene que aceptar el rango nuevo
   * sin redesplegar nada raro.
   */
  it("el rango sigue al tope configurado, no a un número fijo", async () => {
    expect((await post({ chainIndex: MAX_CHAIN - 1 })).status).toBe(200);
    expect((await post({ chainIndex: MAX_CHAIN })).status).toBe(400);
  });
});

describe("POST /api/cron/sweep-continue · ejecución", () => {
  it("un fallo responde 500 con un código propio, nunca el error crudo", async () => {
    runDailyCronScan.mockRejectedValueOnce(new Error('permission denied for table "projects"'));
    const response = await post({ chainIndex: 1 });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ processed: 0, error: "query_failed" });
    expect(JSON.stringify(body)).not.toContain("permission denied");
  });
});
