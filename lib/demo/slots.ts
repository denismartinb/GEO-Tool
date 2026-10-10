/**
 * DEMO-CALL-1 — the 20-minute video-call slots `/demo` offers.
 *
 * The founder's availability, as he set it (2026-10-10): Monday to Friday,
 * 18:00–21:00 Madrid time, 20-minute calls. There is no booking calendar
 * behind this: a picked slot reaches the operator by email and he confirms it
 * with the invitation. That is why the page says «solicitud» and the
 * confirmation email promises an invitation, never a booked meeting.
 *
 * Pure on purpose (no `server-only`, no clock read): the page computes the
 * list in the browser and the action re-checks the submitted slot against the
 * same function, so a hand-crafted POST cannot ask for 03:00 on a Sunday.
 */

export const DEMO_TIME_ZONE = "Europe/Madrid";
export const DEMO_SLOT_MINUTES = 20;
/** First and last call start, in Madrid wall-clock minutes from midnight. 20:40 ends at 21:00. */
export const DEMO_FIRST_START = 18 * 60;
export const DEMO_LAST_START = 20 * 60 + 40;
/** How many working days ahead a visitor can pick. */
export const DEMO_DAYS_AHEAD = 10;
/** A slot closer than this cannot be offered: the operator has to see the email first. */
export const DEMO_MIN_LEAD_MS = 4 * 60 * 60 * 1000;

/**
 * Spanish national holidays (BOE) inside the booking horizon. Regional ones
 * are left out on purpose: a call on a local holiday is still possible, the
 * operator can move it in the reply.
 */
export const DEMO_HOLIDAYS = new Set([
  "2026-10-12",
  "2026-12-08",
  "2026-12-25",
  "2027-01-01",
  "2027-01-06",
  "2027-04-02"
]);

export type DemoSlot = {
  /** UTC start as ISO string — the value the form submits. */
  id: string;
  /** Madrid calendar day, YYYY-MM-DD. */
  day: string;
  /** Madrid wall-clock start, HH:MM. */
  time: string;
};

type MadridParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DEMO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23"
});

export function madridParts(date: Date): MadridParts {
  const get = (type: string) => partsFormatter.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday"))
  };
}

/** The UTC instant at which Madrid's wall clock reads the given time. Handles CET/CEST. */
export function madridWallClockToUtc(year: number, month: number, day: number, minutes: number): Date {
  const wanted = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  // First guess treats the wall clock as UTC; the difference to what Madrid
  // actually shows at that instant is the offset. One correction is enough
  // outside the 02:00–03:00 changeover hour, which the 18:00–21:00 window
  // never touches.
  let guess = wanted;
  for (let i = 0; i < 2; i += 1) {
    const p = madridParts(new Date(guess));
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - shown;
  }
  return new Date(guess);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Every slot a visitor may pick right now, earliest first. */
export function listDemoSlots(now: Date): DemoSlot[] {
  const slots: DemoSlot[] = [];
  const today = madridParts(now);
  // Walk calendar days from Madrid's today; Date.UTC normalises month ends.
  let workingDays = 0;
  for (let offset = 0; workingDays < DEMO_DAYS_AHEAD && offset < 40; offset += 1) {
    const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day + offset, 12));
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    const weekday = cursor.getUTCDay();
    const dayKey = `${year}-${pad(month)}-${pad(day)}`;
    if (weekday === 0 || weekday === 6 || DEMO_HOLIDAYS.has(dayKey)) continue;
    workingDays += 1;
    for (let start = DEMO_FIRST_START; start <= DEMO_LAST_START; start += DEMO_SLOT_MINUTES) {
      const at = madridWallClockToUtc(year, month, day, start);
      if (at.getTime() - now.getTime() < DEMO_MIN_LEAD_MS) continue;
      slots.push({ id: at.toISOString(), day: dayKey, time: `${pad(Math.floor(start / 60))}:${pad(start % 60)}` });
    }
  }
  return slots;
}

/** The slot behind a submitted id, if it is one we offer right now. */
export function findOfferedSlot(id: string, now: Date): DemoSlot | null {
  return listDemoSlots(now).find((slot) => slot.id === id) ?? null;
}

/** «martes 13 de octubre, 18:20» — how a slot is written to people. */
export function formatDemoSlot(slot: DemoSlot): string {
  const date = new Intl.DateTimeFormat("es-ES", {
    timeZone: DEMO_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date(slot.id));
  return `${date}, ${slot.time}`;
}
