/**
 * Two mechanical page checks the pilot runs on every capture, plus the pure
 * functions that judge them.
 *
 * Why they exist (2026-08-11). The founder found two visible regressions in
 * PRELAUNCH-HARDENING-1 Fase V by looking at the deployed site — after the
 * pilot had run:
 *
 *   1. The landing hero shipped its "Analiza gratis" CTA TWICE, because the
 *      block was moved into a client island and the original was left behind.
 *      The capture of `/` exists and shows both buttons plainly. Nothing in
 *      the harness counts controls, so nothing failed.
 *   2. The mobile drawer's "Prueba gratis" CTA turned grey-on-blue, because
 *      the element changed from `<button>` to `<a>` and `.lp-mobnav a`
 *      (specificity 0,1,1) beats `.lp-cta` (0,1,0). Nothing in the harness
 *      reads a colour, so nothing failed.
 *
 * Both classes of defect are mechanical: a machine can count and a machine can
 * compute a contrast ratio. Leaving them to "someone will notice the
 * screenshot" is exactly the reasoning that produced the 2026-08-02
 * empty-state incident, and the fix is the same shape — assert it, and make
 * the self-check prove the assertion can fail.
 *
 * The measuring lives in `journey.ts` (it needs a browser); the JUDGING lives
 * here as pure functions so it can be unit-tested in both directions without
 * one, the same split as `pilot-selfcheck-checks.mjs`.
 */

/** A visible interactive control, as measured in the page. */
export interface ControlSnapshot {
  /** Human-readable path to the element, quoted verbatim in the failure. */
  describe: string;
  /** Identity of the nearest landmark ancestor — duplicates only count within one. */
  group: string;
  tag: string;
  /** Accessible name (aria-label, else trimmed text). */
  name: string;
  /**
   * The control's own rendered text, trimmed — empty for an icon-only control.
   *
   * Separate from `name` because the contrast check applies to TEXT and an
   * `aria-label` is not a glyph. Caught by measuring against the real landing
   * before this shipped: the tour's 8px step dot (`button.pt-dot.is-on`,
   * `aria-label="Paso 1 de 8"`, no text at all) reported 3.46:1 of dark ink on
   * blue — a ratio for a character that does not exist.
   */
  text: string;
  /** Full class attribute, so a repeat with different styling is not a repeat. */
  classes: string;
  /** Destination for links; "" for everything else. */
  href: string;
  /**
   * The control sits inside a list/table/repeating structure. Set in the page,
   * where the sibling shape is visible; a table of N rows with one "Ver" link
   * each is not a duplicated control, it is a table.
   */
  inRepeatedStructure: boolean;
  disabled: boolean;
  fontSizePx: number;
  bold: boolean;
  /** "r,g,b" of the computed text colour. */
  color: string;
  /**
   * "r,g,b" of the first fully opaque background found walking up from the
   * element, or null when it could not be resolved (a gradient, an image, or
   * transparency all the way to the root). Null means "not judged", never
   * "fine".
   */
  background: string | null;
}

/**
 * WCAG AA for body text. Interactive controls are the one thing on a page a
 * user MUST be able to read, so the pilot holds them to AA and nothing looser.
 */
export const CONTRAST_MIN_NORMAL = 4.5;
/** WCAG's large-text exception: >=24px, or >=18.66px when bold. */
export const CONTRAST_MIN_LARGE = 3;

/**
 * Controls that are allowed to repeat inside one landmark.
 *
 * Deliberately empty. An allow-list that starts populated is a list nobody
 * ever audited; entries get added one at a time, each with the reason, when a
 * real run proves a repeat is intentional.
 */
export const DUPLICATE_ALLOW_LIST: RegExp[] = [];

/**
 * Controls exempt from the contrast check.
 *
 * Deliberately empty, same reasoning as above. A pre-existing offender is a
 * defect to fix or a decision to write down, not a line to quietly silence.
 */
export const CONTRAST_ALLOW_LIST: RegExp[] = [];

export function parseRgb(value: string | null): [number, number, number] | null {
  if (!value) return null;
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

/** sRGB relative luminance, per WCAG 2.1. */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [light, dark] = a >= b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

function allowed(describe: string, allowList: RegExp[]): boolean {
  return allowList.some((pattern) => pattern.test(describe));
}

/**
 * Two or more identical controls inside the same landmark.
 *
 * "Identical" is deliberately strict — same tag, same accessible name, same
 * classes, same href. A nav link that also appears as a hero CTA differs in
 * class and is not reported; the hero bug had two byte-identical `<a class=
 * "lp-cta lp-cta-lg" href="/signup">Analiza gratis</a>` inside `section
 * .lp-hero`, which is.
 *
 * Grouping is by nearest landmark, NOT by shared parent: the two hero CTAs
 * lived in two SIBLING containers, so a same-parent rule would have missed the
 * one bug this exists for.
 */
export function findDuplicateControls(
  snapshots: ControlSnapshot[],
  allowList: RegExp[] = DUPLICATE_ALLOW_LIST
): string[] {
  const buckets = new Map<string, ControlSnapshot[]>();

  for (const control of snapshots) {
    if (control.inRepeatedStructure) continue;
    // An unnamed control (an icon-only close button) has nothing to key on;
    // reporting on class alone would flag every icon button pair on a page.
    if (!control.name) continue;
    if (allowed(control.describe, allowList)) continue;
    const key = [control.group, control.tag, control.name, control.classes, control.href].join("|");
    const bucket = buckets.get(key);
    if (bucket) bucket.push(control);
    else buckets.set(key, [control]);
  }

  const findings: string[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const first = bucket[0];
    findings.push(
      `${bucket.length}× <${first.tag}> "${first.name}" inside ${first.group} — ` +
        bucket.map((control) => control.describe).join(" AND ")
    );
  }
  return findings.sort();
}

/**
 * Controls whose text does not meet WCAG AA against their own background.
 *
 * Skips anything it cannot judge honestly rather than guessing: a control with
 * no rendered text (there is no glyph to read — icon-only controls are WCAG
 * 1.4.11 territory, a different measurement this does not make), a disabled
 * control (low contrast is the point there), and a background that never
 * resolved to a solid opaque colour. A check that guesses is a check that gets
 * allow-listed into silence within a week.
 */
export function findLowContrastControls(
  snapshots: ControlSnapshot[],
  allowList: RegExp[] = CONTRAST_ALLOW_LIST
): string[] {
  const findings: string[] = [];

  for (const control of snapshots) {
    if (!control.text) continue;
    if (control.disabled) continue;
    if (allowed(control.describe, allowList)) continue;
    const fg = parseRgb(control.color);
    const bg = parseRgb(control.background);
    if (!fg || !bg) continue;

    const large = control.fontSizePx >= 24 || (control.bold && control.fontSizePx >= 18.66);
    const threshold = large ? CONTRAST_MIN_LARGE : CONTRAST_MIN_NORMAL;
    const ratio = contrastRatio(fg, bg);
    if (ratio >= threshold) continue;

    findings.push(
      `${control.describe} — rgb(${control.color}) on rgb(${control.background}) is ` +
        `${ratio.toFixed(2)}:1, below the ${threshold}:1 minimum`
    );
  }

  return findings.sort();
}
