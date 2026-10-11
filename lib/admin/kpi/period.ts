/**
 * ADMIN-PANEL-1 — the time windows of /admin/panel.
 *
 * Pure: no clock of its own, the caller passes `now`. Every window is
 * compared against the window of the same length right before it, so a
 * delta always reads "against the previous period of the same size".
 */

export type PanelPeriodId = "hoy" | "7d" | "28d" | "mes";

export const PANEL_PERIODS: Array<{ id: PanelPeriodId; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "28d", label: "28 días" },
  { id: "mes", label: "Este mes" }
];

export const DEFAULT_PANEL_PERIOD: PanelPeriodId = "28d";

export function parsePanelPeriod(raw: unknown): PanelPeriodId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return PANEL_PERIODS.some((p) => p.id === value) ? (value as PanelPeriodId) : DEFAULT_PANEL_PERIOD;
}

export type PanelWindow = {
  id: PanelPeriodId;
  label: string;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const PANEL_TIME_ZONE = "Europe/Madrid";

/** Midnight in Madrid of the day `now` falls on, as a UTC instant. */
export function madridStartOfDay(now: Date): Date {
  const { year, month, day, offsetMs } = madridParts(now);
  return new Date(Date.UTC(year, month - 1, day) - offsetMs);
}

/** The first of the month in Madrid, as a UTC instant. */
export function madridStartOfMonth(now: Date): Date {
  const { year, month, offsetMs } = madridParts(now);
  return new Date(Date.UTC(year, month - 1, 1) - offsetMs);
}

/** Madrid calendar date (`YYYY-MM-DD`) of an instant. */
export function madridDateKey(instant: Date): string {
  const { year, month, day } = madridParts(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function madridParts(now: Date): { year: number; month: number; day: number; offsetMs: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PANEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const asUtc = Date.UTC(year, month - 1, day, get("hour"), get("minute"), get("second"));
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  return { year, month, day, offsetMs };
}

export function panelWindow(id: PanelPeriodId, now: Date): PanelWindow {
  const label = PANEL_PERIODS.find((p) => p.id === id)?.label ?? "";
  const to = new Date(now.getTime());
  let from: Date;
  switch (id) {
    case "hoy":
      from = madridStartOfDay(now);
      break;
    case "7d":
      from = new Date(now.getTime() - 7 * DAY_MS);
      break;
    case "mes":
      from = madridStartOfMonth(now);
      break;
    default:
      from = new Date(now.getTime() - 28 * DAY_MS);
  }
  const length = to.getTime() - from.getTime();
  return { id, label, from, to, prevFrom: new Date(from.getTime() - length), prevTo: from };
}

/** The last `days` Madrid dates ending on the day of `now`, oldest first. */
export function lastMadridDates(now: Date, days: number): string[] {
  const out: string[] = [];
  // Noon avoids landing on the wrong day across a DST change.
  const noon = madridStartOfDay(now).getTime() + 12 * 60 * 60 * 1000;
  for (let i = days - 1; i >= 0; i -= 1) out.push(madridDateKey(new Date(noon - i * DAY_MS)));
  return out;
}
