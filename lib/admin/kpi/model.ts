/**
 * ADMIN-PANEL-1 — the pure half of /admin/panel: deltas, the funnel, web
 * vitals buckets, the trial signal and chart geometry.
 *
 * No fetch, no clock, no Supabase. The loaders decide which rows; this module
 * decides what is said about them, so every number on the screen has a test.
 */

const numberFormat = new Intl.NumberFormat("es-ES");

export function formatInt(n: number): string {
  return numberFormat.format(Math.round(n));
}

/** 0.0183 → "1,8 %". */
export function formatShare(ratio: number, decimals = 1): string {
  const value = (ratio * 100).toFixed(decimals).replace(".", ",");
  return `${value.replace(/,0+$/, "")} %`;
}

export function formatEuros(cents: number): string {
  const euros = cents / 100;
  const text = Number.isInteger(euros)
    ? numberFormat.format(euros)
    : new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(euros);
  return `${text} €`;
}

/** Percentage change; null when there is no earlier figure to compare with. */
export function deltaPct(current: number, previous: number | null | undefined): number | null {
  if (previous == null || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export type DeltaView = { text: string; tone: "up" | "down" | "flat" };

export function describeDelta(current: number, previous: number | null | undefined): DeltaView | null {
  const pct = deltaPct(current, previous);
  if (pct === null) return null;
  const rounded = Math.round(pct);
  if (rounded === 0) return { text: "igual que el periodo anterior", tone: "flat" };
  return {
    text: `${rounded > 0 ? "+" : "−"}${formatInt(Math.abs(rounded))} % vs periodo anterior`,
    tone: rounded > 0 ? "up" : "down"
  };
}

// ── Funnel ──────────────────────────────────────────────────────────────────

export type FunnelSource = "PostHog" | "Supabase" | "Stripe";

export type FunnelStepInput = {
  label: string;
  /** null when the source could not be read: the step and the ones after it say so. */
  value: number | null;
  source: FunnelSource;
};

export type FunnelStepView = FunnelStepInput & {
  /** Share of the step before it that reached this one; null for the first step or without data. */
  stepRate: number | null;
  /** Bar width relative to the first step, 0..100. */
  width: number;
};

export type FunnelView = {
  steps: FunnelStepView[];
  /** Index of the step with the lowest pass rate, among steps that had people to lose. */
  biggestLeak: number | null;
};

export function buildFunnel(inputs: FunnelStepInput[]): FunnelView {
  const top = inputs[0]?.value ?? null;
  const steps = inputs.map((step, i) => {
    const prev = i > 0 ? inputs[i - 1].value : null;
    const stepRate = i > 0 && step.value !== null && prev !== null && prev > 0 ? step.value / prev : null;
    const width = step.value !== null && top !== null && top > 0 ? Math.min(100, (step.value / top) * 100) : 0;
    return { ...step, stepRate, width };
  });
  let biggestLeak: number | null = null;
  steps.forEach((step, i) => {
    if (step.stepRate === null) return;
    if (biggestLeak === null || step.stepRate < (steps[biggestLeak].stepRate ?? 1)) biggestLeak = i;
  });
  return { steps, biggestLeak };
}

// ── Web vitals ──────────────────────────────────────────────────────────────

/** Google's thresholds (web.dev/vitals): good ≤ first, poor > second. */
export const VITAL_THRESHOLDS = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25]
} as const;

export type VitalKey = keyof typeof VITAL_THRESHOLDS;

export type VitalCounts = { total: number; good: number; poor: number };

export type VitalView = { key: VitalKey; label: string; total: number; good: number; mid: number; poor: number };

const VITAL_LABELS: Record<VitalKey, string> = {
  LCP: "Carga (LCP)",
  INP: "Respuesta (INP)",
  CLS: "Estabilidad (CLS)"
};

export function vitalView(key: VitalKey, counts: VitalCounts): VitalView | null {
  if (counts.total <= 0) return null;
  const good = counts.good / counts.total;
  const poor = counts.poor / counts.total;
  return { key, label: VITAL_LABELS[key], total: counts.total, good, poor, mid: Math.max(0, 1 - good - poor) };
}

// ── Trials ──────────────────────────────────────────────────────────────────

export type TrialSignalTone = "hot" | "warm" | "cold";

export type TrialSignal = { label: string; tone: TrialSignalTone };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the panel says next to a trial. Only facts we hold: a Stripe checkout
 * the person opened and did not finish, their last sign-in, and their scans.
 * Never "visited pricing": page views are anonymous and cannot be tied to an
 * account.
 */
export function trialSignal(input: {
  checkoutOpened: boolean;
  lastSignInAt: string | null;
  scanCount30d: number;
  now: number;
}): TrialSignal {
  if (input.checkoutOpened) return { label: "Checkout sin terminar", tone: "hot" };
  const lastSignIn = input.lastSignInAt ? Date.parse(input.lastSignInAt) : NaN;
  if (Number.isFinite(lastSignIn)) {
    const idleDays = Math.floor((input.now - lastSignIn) / DAY_MS);
    if (idleDays >= 3) return { label: `Sin entrar ${idleDays} días`, tone: "cold" };
  }
  if (input.scanCount30d > 0) {
    return { label: input.scanCount30d === 1 ? "1 escaneo" : `${formatInt(input.scanCount30d)} escaneos`, tone: "warm" };
  }
  return { label: "Sin escaneos", tone: "cold" };
}

/** Whole days left, rounded up: a trial ending in 3 hours still has "1 día". */
export function daysLeft(endsAtIso: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(endsAtIso) - now) / DAY_MS));
}

// ── Revenue ─────────────────────────────────────────────────────────────────

/** A subscription's last invoice, brought to a monthly amount. */
export function monthlyCents(invoiceTotalCents: number, interval: string, intervalCount: number): number {
  const count = Math.max(1, intervalCount);
  switch (interval) {
    case "year":
      return invoiceTotalCents / (12 * count);
    case "week":
      return (invoiceTotalCents * 52) / (12 * count);
    case "day":
      return (invoiceTotalCents * 365) / (12 * count);
    default:
      return invoiceTotalCents / count;
  }
}

// ── Charts ──────────────────────────────────────────────────────────────────

/** `points` attribute of an SVG polyline, values scaled into a w×h box with a small inset. */
export function linePoints(values: number[], width: number, height: number, max?: number): string {
  if (values.length === 0) return "";
  const top = Math.max(max ?? Math.max(...values), 1);
  const inset = 4;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => `${round1(i * step)},${round1(height - inset - (Math.max(0, v) / top) * (height - inset * 2))}`)
    .join(" ");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
