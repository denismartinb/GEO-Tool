import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLANS } from "@/app/pricing/plans-data";

/**
 * Option B of the prompt-pool decision derives the cap IN SQL
 * (docs/specs/billing/proposals/prompt-pool/B_trigger_no_service_role.sql). That
 * copy of the plan caps is the one place the numbers live outside TypeScript, so
 * it is pinned here: changing a plan's prompt cap without the SQL fails CI instead
 * of silently capping real accounts at the old number.
 */
const sql = readFileSync(
  join(process.cwd(), "docs/specs/billing/proposals/prompt-pool/B_trigger_no_service_role.sql"),
  "utf8"
);

function sqlCapFor(planId: string): number | null {
  const match = sql.match(new RegExp(`when '${planId}' then (\\d+)`));
  return match ? Number(match[1]) : null;
}

describe("prompt-pool proposal B: SQL cap map follows PLANS", () => {
  for (const plan of PLANS) {
    it(`${plan.id} cap in SQL equals plans-data caps.prompts (${plan.caps.prompts})`, () => {
      expect(sqlCapFor(plan.id)).toBe(plan.caps.prompts);
    });
  }

  it("fails closed for unknown plans and missing profiles (cap 10, the Free cap)", () => {
    const free = PLANS.find((p) => p.id === "free")!;
    expect(sql).toMatch(/else 10\s+end/);
    expect(sql).toMatch(/return 10;/);
    expect(free.caps.prompts).toBe(10);
  });

  it("does not offer a plan SQL does not know about", () => {
    const sqlPlans = [...sql.matchAll(/when '(\w+)' then \d+/g)].map((m) => m[1]).sort();
    expect(sqlPlans).toEqual(PLANS.map((p) => p.id).sort());
  });
});
