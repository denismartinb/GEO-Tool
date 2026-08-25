/**
 * CONSOLE-REDESIGN-1. The settings page's index entries.
 *
 * WHY THIS IS NOT IN `components/settings/settings-index.tsx`: that file is
 * `"use client"`, and every export of a client-boundary module becomes a client
 * *reference* when a server module imports it. Calling one during a server
 * render throws — which is exactly what shipped in the first attempt at this
 * phase and what the pilot caught (PILOT FAIL on a5a425c: "An error occurred in
 * the Server Components render", all three viewports).
 *
 * Neither the build nor the unit test could catch it: `tsc` sees a normal
 * function, and Vitest does not honour the `"use client"` directive. The rule
 * to carry forward is structural, not a matter of care — a helper a Server
 * Component calls never lives in a `"use client"` file.
 */
import type { ReactNode } from "react";

export type SettingsIndexEntry = {
  /** Matches the `id` of the section heading it points at. */
  id: string;
  label: string;
  /**
   * The section's live state, shown under the label. Usually plain text, but
   * PRICING-PROMO-1 needs a struck-through price for the Plan entry, so this
   * accepts any node rather than forcing every caller into string-only.
   */
  detail: ReactNode;
};

/**
 * `planLabel` is null for a non-admin, which is the same condition that hides
 * the Plan section itself, so the index can never advertise a section that is
 * not there. Note what is deliberately absent: "Eliminar cuenta" is the last
 * block of the page and never an entry here.
 */
export function buildSettingsIndex({
  fullName,
  email,
  activeAlerts,
  planLabel
}: {
  fullName: string;
  email: string;
  activeAlerts: number;
  planLabel: ReactNode | null;
}): SettingsIndexEntry[] {
  return [
    { id: "cuenta", label: "Cuenta", detail: fullName.trim() || email },
    {
      id: "avisos",
      label: "Avisos",
      detail: `${activeAlerts} ${activeAlerts === 1 ? "activo" : "activos"}`
    },
    ...(planLabel ? [{ id: "plan", label: "Plan", detail: planLabel }] : [])
  ];
}
