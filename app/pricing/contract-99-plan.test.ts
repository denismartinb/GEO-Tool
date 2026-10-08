import { describe, expect, it } from "vitest";
import { LISTED_PLANS, PLANS, PLAN_FAQ, PLAN_MATRIX, matrixColumnOf, plansOfferedTo } from "./plans-data";
import { isWeeklyCadence } from "@/lib/plan-cadence";
import { resolvePlan } from "@/lib/billing";

/**
 * CONTRACT-99 (log §237) — the contract the owner confirmed, pinned where it lives in code.
 * If one of these fails, the contract changed: update the decision record first, not the test.
 */
describe("el plan único de 99 € (contrato confirmado por el dueño)", () => {
  const pro = PLANS.find((p) => p.id === "pro")!;

  it("hay UN solo plan de pago ofrecido, a 99 €/mes, para todos", () => {
    const offeredPaid = LISTED_PLANS.filter((p) => p.price > 0);
    expect(offeredPaid.map((p) => p.id)).toEqual(["pro"]);
    expect(pro.price).toBe(99);
    expect(pro.period).toBe("mes");
  });

  it("sin precio de lanzamiento: ningún plan lo anuncia", () => {
    expect(pro.promoPrice).toBeUndefined();
  });

  it("3 dominios · 75 prompts en total · 3 motores, y el medidor dice lo mismo que los topes", () => {
    expect(pro.caps).toEqual({ projects: 3, prompts: 75, engines: 3 });
    expect(pro.meter).toMatchObject({ projects: "3", prompts: 75, engines: 3, refresh: "Semanal" });
  });

  it("el escaneo recurrente de Pro es semanal (la misma fuente que el cron)", () => {
    expect(isWeeklyCadence("pro")).toBe(true);
    expect(pro.meter.refresh).toBe("Semanal");
  });

  it("el copy de Pro no promete lo que aún no existe (revisión mensual, prueba de 14 días)", () => {
    const text = [pro.tagline, pro.who, ...pro.highlights].join(" ");
    expect(text).not.toMatch(/revisi[oó]n manual|14 d[ií]as/i);
  });

  it("Starter y Agencia siguen existiendo (su ID técnico se reconoce) pero ya no se ofrecen", () => {
    for (const id of ["starter", "agency"] as const) {
      const plan = PLANS.find((p) => p.id === id);
      expect(plan, id).toBeDefined();
      expect(plan!.listed, id).toBe(false);
      expect(LISTED_PLANS.some((p) => p.id === id), id).toBe(false);
      expect(resolvePlan(id).id, id).toBe(id);
    }
  });

  it("las columnas de la matriz siguen el orden de PLANS aunque se oculten planes", () => {
    for (const group of PLAN_MATRIX) {
      for (const row of group.rows) expect(row.vals.length, row.label).toBe(PLANS.length);
    }
    expect(LISTED_PLANS.map((p) => p.id)).toEqual(["free", "pro"]);
    expect(LISTED_PLANS.map((p) => matrixColumnOf(p.id))).toEqual([0, 2]);
  });
});

describe("qué se ofrece a cada cuenta (consola)", () => {
  it("a una cuenta Free o Pro NO se le ofrece Starter ni Agencia", () => {
    expect(plansOfferedTo("free").map((p) => p.id)).toEqual(["free", "pro"]);
    expect(plansOfferedTo("pro").map((p) => p.id)).toEqual(["free", "pro"]);
  });

  it("una cuenta que ya está en un plan retirado lo sigue viendo, y solo ella", () => {
    expect(plansOfferedTo("starter").map((p) => p.id)).toEqual(["free", "starter", "pro"]);
    expect(plansOfferedTo("agency").map((p) => p.id)).toEqual(["free", "pro", "agency"]);
  });
});

describe("la FAQ de precios no vuelve a hablar de planes que ya no se ofrecen ni de un precio escrito a mano", () => {
  it("no menciona Agencia ni Starter como opciones", () => {
    const text = PLAN_FAQ.map((item) => `${item.q} ${item.a}`).join(" ");
    expect(text).not.toMatch(/plan Agencia|Starter/);
  });

  it("el precio que cita sale de PLANS", () => {
    const item = PLAN_FAQ.find((entry) => /único plan de pago/.test(entry.q));
    expect(item).toBeDefined();
    expect(item!.a).toContain(`${PLANS.find((p) => p.id === "pro")!.price} €`);
  });
});
