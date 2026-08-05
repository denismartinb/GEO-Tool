import { describe, expect, it } from "vitest";
import { computeAccountScanState } from "./account-scan-state";

/** Un run en fase de generación (aún quedan prompts por lanzar). */
function generating() {
  return { status: "running", total_prompts: 36, successful_prompts: 10, failed_prompts: 0, started_at: null };
}

/** Un run con la generación terminada: lo que queda es extracción. */
function analyzing() {
  return {
    status: "running",
    total_prompts: 36,
    successful_prompts: 36,
    failed_prompts: 0,
    started_at: null,
    responses_total: 36,
    responses_processed: 12
  };
}

describe("computeAccountScanState", () => {
  it("no dice nada cuando no hay nada corriendo", () => {
    expect(computeAccountScanState([{ domain: "movistar.es" }, { domain: "vodafone.es" }])).toEqual({ kind: "idle" });
  });

  it("sin dominios tampoco dice nada", () => {
    expect(computeAccountScanState([])).toEqual({ kind: "idle" });
  });

  it("nombra el dominio cuando sólo hay uno escaneando", () => {
    expect(
      computeAccountScanState([{ domain: "movistar.es", activeRun: generating() }, { domain: "vodafone.es" }])
    ).toEqual({ kind: "scanning", label: "Escaneando movistar.es" });
  });

  it("distingue la etapa de análisis, igual que la pastilla de proyecto", () => {
    expect(computeAccountScanState([{ domain: "movistar.es", activeRun: analyzing() }])).toEqual({
      kind: "scanning",
      label: "Analizando movistar.es"
    });
  });

  it("cuenta en vez de mezclar etapas cuando hay varios escaneando", () => {
    const state = computeAccountScanState([
      { domain: "movistar.es", activeRun: generating() },
      { domain: "vodafone.es", activeRun: analyzing() }
    ]);

    // Ni "Escaneando" ni "Analizando": cada una sería falsa para uno de los dos.
    expect(state).toEqual({ kind: "scanning", label: "2 dominios en curso" });
  });

  it("el escaneo gana a la auditoría: la auditoría corre después del escaneo", () => {
    expect(
      computeAccountScanState([
        { domain: "movistar.es", activeRun: generating() },
        { domain: "lowi.es", auditing: true }
      ])
    ).toEqual({ kind: "scanning", label: "Escaneando movistar.es" });
  });

  it("anuncia la auditoría sólo cuando no queda ningún escaneo vivo", () => {
    expect(computeAccountScanState([{ domain: "lowi.es", auditing: true }, { domain: "movistar.es" }])).toEqual({
      kind: "auditing",
      label: "Auditando lowi.es"
    });
  });

  it("agrega también las auditorías", () => {
    expect(
      computeAccountScanState([
        { domain: "lowi.es", auditing: true },
        { domain: "orange.es", auditing: true }
      ])
    ).toEqual({ kind: "auditing", label: "2 auditorías en curso" });
  });

  it("un dominio que escanea y se audita a la vez cuenta una sola vez", () => {
    expect(computeAccountScanState([{ domain: "movistar.es", activeRun: generating(), auditing: true }])).toEqual({
      kind: "scanning",
      label: "Escaneando movistar.es"
    });
  });
});
