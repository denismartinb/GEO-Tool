import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MAX_PROMPT_SAMPLES, MIN_RESPONSES_PER_RUN } from "@/lib/scan/sampling";

/**
 * SCAN-PLAN-UNITS-1 — contratos a nivel de fuente.
 *
 * El incidente (2026-10-08): el asistente prometió "45 respuestas" y la misión
 * anunció 90; en elcorteingles.es, 24 frente a 72. Los dos sitios hacían su
 * propia aritmética. Lo que impide que vuelvan a divergir no es un test de
 * valores —ésos viven en `lib/scan/run-plan.test.ts`— sino que NINGUNO de los
 * dos vuelva a multiplicar por su cuenta.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("onboarding and mission share one run-plan module", () => {
  it("the wizard no longer multiplies prompts x engines itself", () => {
    const wizard = read("components/onboarding-wizard.tsx");
    expect(wizard).not.toMatch(/promptsCount\s*\*\s*engineCount/);
    expect(wizard).not.toContain("ENGINE_PROVIDERS");
    expect(wizard).toContain('from "@/lib/scan/run-plan"');
    expect(wizard).toContain("describeRunPlan(");
  });

  it("the wizard copy no longer hard-codes 'tres motores' (a Free account runs one)", () => {
    expect(read("components/onboarding-wizard.tsx")).not.toMatch(/tres motores/);
  });

  it("the wizard's engines come from the server, not from a hard-coded list of three", () => {
    const page = read("app/dashboard/projects/new/page.tsx");
    expect(page).toContain("resolveScanProvidersForPlan(");
    expect(page).toContain("newProjectDefaults(");
  });

  it("the mission reads sample_count and no longer deduces pasadas from launches / prompts", () => {
    const takeover = read("components/first-scan-takeover.tsx");
    expect(takeover).toContain("describeRunPlanFromRun(");
    expect(takeover).toContain("sample_count");
    expect(takeover).not.toMatch(/Math\.round\(\s*launches\s*\/\s*prompts\s*\)/);
  });

  it("the mission rail prints the equation from the module, not its own join", () => {
    const rocket = read("components/scan-mission-rocket.tsx");
    expect(rocket).toContain("runPlanEquation(");
    expect(rocket).not.toContain("pasadas`");
  });

  it("the pre-launch estimate is labelled 'esperadas', not 'estimadas', and shows the why", () => {
    const wizard = read("components/onboarding-wizard.tsx");
    expect(wizard).toContain("respuestas esperadas en el primer escaneo");
    expect(wizard).toContain("runPlanWhy(");
  });
});

describe("the public methodology states the floor the code enforces", () => {
  // Una cifra del producto que se publica se ata al código (growth-content.md):
  // si alguien cambia el suelo o el tope de pasadas, la página tiene que caer
  // en el mismo PR.
  const page = read("app/docs/metodologia/geo-score/page.tsx");

  it("names the floor of responses", () => {
    expect(page).toContain(`al menos ${MIN_RESPONSES_PER_RUN} respuestas`);
    expect(page).toContain(`<strong>${MIN_RESPONSES_PER_RUN} respuestas de IA</strong>`);
  });

  it("names the cap on pasadas", () => {
    expect(page).toContain(`con un máximo de ${MAX_PROMPT_SAMPLES}`);
  });

  it("explains the multiplication in the units the product uses", () => {
    expect(page).toContain("respuestas = prompts × motores × pasadas");
  });
});
