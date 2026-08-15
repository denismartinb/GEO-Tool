import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRELAUNCH-HARDENING-1 Fase Q3 — el cableado de la continuación de un escaneo.
 * Ver `cron/weekly-scans/route.test.ts` para el porqué general.
 *
 * Esta ruta es la que hace que una campaña de varios lotes llegue al final
 * (SCAN-CHAIN-1, ADR 0014): `executePendingScan` se llama a sí misma por aquí
 * cuando quedan prompts pendientes. Si el cableado se rompe, la campaña se
 * queda a medias con sus jobs en `pending` y **nada falla ruidosamente** — el
 * escaneo simplemente no termina.
 *
 * Usa `SCAN_CONTINUE_SECRET`, no `CRON_SECRET`. Son dos variables distintas y
 * confundirlas es exactamente el tipo de regresión que estos tests existen para
 * cazar.
 */

const executePendingScan = vi.fn(async (_args?: unknown) => undefined);
vi.mock("@/lib/scan/scan-runner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan/scan-runner")>();
  return { ...actual, executePendingScan: (args: unknown) => executePendingScan(args) };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { POST } from "./route";

const SECRET = "scan-continue-secret";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const authorized = { authorization: `Bearer ${SECRET}`, "content-type": "application/json" };

function post(body: unknown, headers: Record<string, string> = authorized) {
  return POST(
    new Request("https://genscore.es/api/scan/continue", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body)
    })
  );
}

const validBody = { projectId: PROJECT_ID, runId: RUN_ID };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SCAN_CONTINUE_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.SCAN_CONTINUE_SECRET;
  delete process.env.CRON_SECRET;
});

describe("POST /api/scan/continue · autorización", () => {
  it("rechaza sin cabecera y con secreto ajeno", async () => {
    expect((await post(validBody, { "content-type": "application/json" })).status).toBe(401);
    expect((await post(validBody, { authorization: "Bearer otro" })).status).toBe(401);
    expect(executePendingScan).not.toHaveBeenCalled();
  });

  it("sin secreto configurado no entra nadie", async () => {
    delete process.env.SCAN_CONTINUE_SECRET;
    expect((await post(validBody)).status).toBe(401);
    expect(executePendingScan).not.toHaveBeenCalled();
  });

  /** Lee SU variable, no la de los crons. */
  it("el secreto de los crons no abre esta ruta", async () => {
    delete process.env.SCAN_CONTINUE_SECRET;
    process.env.CRON_SECRET = "cron-secret-value";

    const response = await post(validBody, { authorization: "Bearer cron-secret-value" });
    expect(response.status).toBe(401);
    expect(executePendingScan).not.toHaveBeenCalled();
  });
});

describe("POST /api/scan/continue · entrada", () => {
  it("exige uuids reales para proyecto y run", async () => {
    expect((await post({ projectId: "no-uuid", runId: RUN_ID })).status).toBe(400);
    expect((await post({ projectId: PROJECT_ID, runId: "no-uuid" })).status).toBe(400);
    expect((await post({ projectId: PROJECT_ID })).status).toBe(400);
    expect((await post("no soy json")).status).toBe(400);
    expect(executePendingScan).not.toHaveBeenCalled();
  });

  it("ejecuta el lote con el proyecto y el run que le pasan", async () => {
    const response = await post(validBody);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(executePendingScan).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, runId: RUN_ID })
    );
  });
});

describe("POST /api/scan/continue · qué pasa cuando el lote falla", () => {
  /**
   * **200 con `ok: false`, no 500, y es deliberado.** El estado del fallo ya lo
   * persiste `executePendingScan` sobre el propio run —que es donde el usuario
   * y el reconciliador lo miran—, así que este código de respuesta es sólo
   * informativo para los logs. Devolver 500 invitaría a que quien despacha lo
   * reintentara, y reintentar un lote que ya falló y ya se registró es gastar
   * llamadas a LLM por nada.
   */
  it("un lote fallido responde 200 con ok:false, para no invitar a reintentar", async () => {
    executePendingScan.mockRejectedValueOnce(new Error("scan_failed"));
    const response = await post(validBody);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false });
  });

  it("no filtra el mensaje del error a la respuesta", async () => {
    executePendingScan.mockRejectedValueOnce(new Error('relation "scan_prompt_results" does not exist'));
    const body = await (await post(validBody)).json();
    expect(JSON.stringify(body)).not.toContain("relation");
  });
});
