/** Pure timing helpers of the app splash (log §382): one clock, in ms. */
export const SPLASH_VARIANTS = ["calibre", "compas", "bruma"] as const;
export type SplashVariant = (typeof SPLASH_VARIANTS)[number];

export const SPLASH_LAST_KEY = "gs_splash_last";
export const SPLASH_SEEN_KEY = "gs_splash_seen";
/** Web login (SPLASH-WEB-1): the short entrance plays once per browser. */
export const WEB_SPLASH_KEY = "gs_splash_web_seen";

/** The short web entrance, never in the app rotation. */
export type SplashKind = SplashVariant | "breve";

export const ease = {
  o: (x: number) => 1 - Math.pow(1 - x, 3),
  io: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  back: (x: number) => {
    const c1 = 1.5;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }
};

/** 0 before `a`, 1 after `b`, linear between. */
export const seg = (t: number, a: number, b: number) => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Moment (ms) at which each variant hands the G over to the login. */
export const LANDING_AT: Record<SplashKind, number> = { calibre: 1900, compas: 1850, bruma: 1950, breve: 650 };
/** From the hand-over to the end of the splash. */
export const TAIL_MS = 1250;
/** The short web entrance ends once the wordmark is in (≈1,6 s in all). */
export const BRIEF_TAIL_MS = 950;

/** Total length of an entrance, in ms. */
export const splashLength = (kind: SplashKind) => LANDING_AT[kind] + (kind === "breve" ? BRIEF_TAIL_MS : TAIL_MS);

/**
 * The variant to show now: never the one shown last time. With no memory
 * (storage blocked) it is random. `rand` is injectable for tests.
 */
export function pickVariant(last: string | null, rand: () => number = Math.random): SplashVariant {
  const pool = SPLASH_VARIANTS.filter((v) => v !== last);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}
