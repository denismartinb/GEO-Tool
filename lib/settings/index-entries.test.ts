import { describe, expect, it } from "vitest";

import { buildSettingsIndex } from "./index-entries";

/**
 * CONSOLE-REDESIGN-1. Folding four screens into one moved the admin check:
 * `/dashboard/settings/billing` used to redirect a non-admin away before
 * rendering anything, and now the same role decides whether the Plan section
 * and its index entry exist at all. If that check is ever dropped, a member
 * would be shown billing — so it gets a test rather than a comment.
 */
describe("buildSettingsIndex", () => {
  const base = { fullName: "Denis Martín", email: "de5@gmail.com", activeAlerts: 2 };

  it("gives a non-admin two entries and never a Plan one", () => {
    const entries = buildSettingsIndex({ ...base, planLabel: null });

    expect(entries.map((entry) => entry.id)).toEqual(["cuenta", "avisos"]);
  });

  it("adds Plan for an admin, with the plan as its live detail", () => {
    const entries = buildSettingsIndex({ ...base, planLabel: "Pro · 179 €/mes" });

    expect(entries.map((entry) => entry.id)).toEqual(["cuenta", "avisos", "plan"]);
    expect(entries[2].detail).toBe("Pro · 179 €/mes");
  });

  it("never lists «Eliminar cuenta» — it is the last block of the page, reached by scrolling", () => {
    const entries = buildSettingsIndex({ ...base, planLabel: "Pro · 179 €/mes" });

    expect(entries.some((entry) => /eliminar/i.test(entry.label))).toBe(false);
  });

  it("falls back to the email when the account has no name yet", () => {
    const entries = buildSettingsIndex({ ...base, fullName: "   ", planLabel: null });

    expect(entries[0].detail).toBe("de5@gmail.com");
  });

  it("counts alerts in singular and plural", () => {
    expect(buildSettingsIndex({ ...base, activeAlerts: 1, planLabel: null })[1].detail).toBe("1 activo");
    expect(buildSettingsIndex({ ...base, activeAlerts: 0, planLabel: null })[1].detail).toBe("0 activos");
  });
});
