import { describe, expect, it } from "vitest";
import { collectSweepFindings } from "@/lib/scan/sweep-alert";
import type { CronResult } from "@/lib/scan/cron";

/**
 * RECURRING-CADENCE-1 Fase B (log §193). Lo que decide qué despierta al
 * operador es esta función; el resto es fontanería. Los silencios se prueban
 * tan explícitamente como los avisos: una alerta que llega todos los días es
 * una alerta que se aprende a ignorar, que es peor que no tener ninguna.
 */
const result = (projectId: string, status: CronResult["status"]): CronResult => ({ projectId, status });

describe("collectSweepFindings", () => {
  it("no dice nada de una pasada sana", () => {
    const findings = collectSweepFindings({
      results: [result("p1", "scanned"), result("p2", "scanned")],
      scanned: 2,
      deferred: 0
    });

    expect(findings).toEqual([]);
  });

  it("calla ante los saltos normales: al día, plan sin derecho, o ya escaneando", () => {
    const findings = collectSweepFindings({
      results: [
        result("p1", "skipped_recent"),
        result("p2", "skipped_plan_ineligible"),
        result("p3", "skipped_active_run")
      ],
      scanned: 0,
      deferred: 0
    });

    expect(findings).toEqual([]);
  });

  it("avisa de un escaneo del cron que reventó", () => {
    const findings = collectSweepFindings({
      results: [result("p1", "scanned"), result("p2", "failed")],
      scanned: 1,
      deferred: 0
    });

    expect(findings).toEqual([{ projectId: "p2", reason: "scan_failed" }]);
  });

  it("avisa de un proyecto expulsado del recurrente por racha de fallos", () => {
    // El agujero que motivó la fase: hoy sale del barrido PARA SIEMPRE y sólo
    // lo desbloquea un escaneo manual con éxito.
    const findings = collectSweepFindings({
      results: [result("p1", "skipped_failure_streak")],
      scanned: 0,
      deferred: 0
    });

    expect(findings).toEqual([{ projectId: "p1", reason: "failure_streak" }]);
  });

  it("avisa cuando la pasada aplazó trabajo sin escanear nada (guardián de progreso)", () => {
    const findings = collectSweepFindings({
      results: [result("p1", "failed"), result("p2", "skipped_budget")],
      scanned: 0,
      deferred: 1
    });

    expect(findings).toContainEqual({ projectId: "p2", reason: "sweep_no_progress" });
  });

  it("NO avisa de una pasada que escaneó 0 porque todos estaban al día", () => {
    // La distinción entera de `sweep_no_progress`: sin trabajo aplazado, cero
    // escaneos es exactamente lo que debe pasar la mayoría de los días.
    const findings = collectSweepFindings({
      results: [result("p1", "skipped_recent"), result("p2", "skipped_recent")],
      scanned: 0,
      deferred: 0
    });

    expect(findings).toEqual([]);
  });

  it("NO avisa de trabajo aplazado cuando la pasada sí avanzó", () => {
    // Aplazar habiendo escaneado es el funcionamiento normal de la cadena:
    // la continuación recoge el resto en su propia invocación.
    const findings = collectSweepFindings({
      results: [result("p1", "scanned"), result("p2", "skipped_budget")],
      scanned: 1,
      deferred: 1
    });

    expect(findings).toEqual([]);
  });

  it("junta todo lo de una pasada mala en una sola lista", () => {
    const findings = collectSweepFindings({
      results: [result("p1", "failed"), result("p2", "skipped_failure_streak"), result("p3", "skipped_recent")],
      scanned: 0,
      deferred: 0
    });

    expect(findings).toEqual([
      { projectId: "p1", reason: "scan_failed" },
      { projectId: "p2", reason: "failure_streak" }
    ]);
  });
});
