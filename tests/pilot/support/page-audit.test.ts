import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  findDuplicateControls,
  findLowContrastControls,
  parseRgb,
  relativeLuminance,
  type ControlSnapshot
} from "./page-audit";

function control(overrides: Partial<ControlSnapshot> = {}): ControlSnapshot {
  return {
    describe: 'a.lp-cta "Analiza gratis"',
    group: "#1 section.lp-hero",
    tag: "a",
    name: "Analiza gratis",
    text: "Analiza gratis",
    classes: "lp-cta lp-cta-lg",
    href: "/signup",
    inRepeatedStructure: false,
    disabled: false,
    fontSizePx: 16,
    bold: false,
    color: "255,255,255",
    background: "37,99,235",
    ...overrides
  };
}

describe("parseRgb", () => {
  it("parses a triple", () => {
    expect(parseRgb("12, 34,56")).toEqual([12, 34, 56]);
  });

  it("rejects anything it cannot read, instead of guessing", () => {
    expect(parseRgb(null)).toBeNull();
    expect(parseRgb("")).toBeNull();
    expect(parseRgb("12,34")).toBeNull();
    expect(parseRgb("12,34,cinco")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("returns the WCAG extremes", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
  });

  it("is symmetric — order of foreground and background does not change it", () => {
    const a = contrastRatio([120, 120, 120], [37, 99, 235]);
    const b = contrastRatio([37, 99, 235], [120, 120, 120]);
    expect(a).toBeCloseTo(b, 10);
  });

  it("matches the reference luminance of mid grey", () => {
    expect(relativeLuminance([119, 119, 119])).toBeCloseTo(0.1845, 3);
  });
});

describe("findDuplicateControls", () => {
  it("reports the real landing-hero regression: two identical CTAs in one section", () => {
    // The bug that produced this whole check (2026-08-11). Note the two copies
    // are in DIFFERENT parents — a same-parent rule would have missed it.
    const findings = findDuplicateControls([
      control({ describe: 'div.lp-hero-form > a.lp-cta "Analiza gratis"' }),
      control({ describe: 'div.lp-hero-actions > a.lp-cta "Analiza gratis"' })
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("2×");
    expect(findings[0]).toContain("Analiza gratis");
    expect(findings[0]).toContain("section.lp-hero");
  });

  it("stays quiet on a healthy page", () => {
    expect(
      findDuplicateControls([control(), control({ name: "Ver planes", href: "/pricing" })])
    ).toEqual([]);
  });

  it("does not confuse a nav link with a hero CTA that share a name", () => {
    expect(
      findDuplicateControls([
        control(),
        control({ group: "#2 nav.lp-nav", classes: "lp-nav-link", describe: "nav link" })
      ])
    ).toEqual([]);
  });

  it("does not confuse two controls that differ only in class", () => {
    expect(findDuplicateControls([control(), control({ classes: "lp-cta-soft" })])).toEqual([]);
  });

  it("exempts repeats inside a list or table — that is a table, not a duplicate", () => {
    expect(
      findDuplicateControls([
        control({ name: "Ver", inRepeatedStructure: true }),
        control({ name: "Ver", inRepeatedStructure: true }),
        control({ name: "Ver", inRepeatedStructure: true })
      ])
    ).toEqual([]);
  });

  it("ignores unnamed controls, which have nothing to key on", () => {
    expect(findDuplicateControls([control({ name: "" }), control({ name: "" })])).toEqual([]);
  });

  it("honours the allow-list", () => {
    const pair = [control(), control()];
    expect(findDuplicateControls(pair)).toHaveLength(1);
    expect(findDuplicateControls(pair, [/Analiza gratis/])).toEqual([]);
  });
});

describe("findLowContrastControls", () => {
  it("reports the real drawer regression: grey text on the blue CTA", () => {
    // #6b7280 on #2563eb — what `.lp-mobnav a` imposed on `.lp-cta`.
    const findings = findLowContrastControls([
      control({ color: "107,114,128", background: "37,99,235" })
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("below the 4.5:1 minimum");
  });

  it("passes white on the same blue", () => {
    expect(findLowContrastControls([control()])).toEqual([]);
  });

  it("applies the large-text threshold to large text only", () => {
    const grey = { color: "130,130,130", background: "255,255,255" };
    expect(findLowContrastControls([control({ ...grey })])).toHaveLength(1);
    expect(findLowContrastControls([control({ ...grey, fontSizePx: 24 })])).toEqual([]);
    expect(findLowContrastControls([control({ ...grey, fontSizePx: 20, bold: true })])).toEqual([]);
  });

  it("skips a disabled control — low contrast is the point there", () => {
    expect(
      findLowContrastControls([control({ color: "160,160,160", background: "255,255,255", disabled: true })])
    ).toEqual([]);
  });

  it("skips an icon-only control — an aria-label is not a glyph", () => {
    // El falso positivo real, encontrado midiendo contra la landing de verdad
    // ANTES de subir esto: el punto de 8px del tour, sin texto ninguno,
    // reportaba 3.46:1 de tinta oscura sobre azul.
    expect(
      findLowContrastControls([
        control({
          describe: 'button.pt-dot.is-on "Paso 1 de 8"',
          tag: "button",
          name: "Paso 1 de 8",
          text: "",
          color: "15,23,41",
          background: "37,99,235"
        })
      ])
    ).toEqual([]);
  });

  it("skips what it cannot judge honestly rather than guessing", () => {
    // A gradient/image background, or semi-transparent text: `background`/
    // `color` arrive unresolved and the control is not reported either way.
    expect(findLowContrastControls([control({ color: "160,160,160", background: null })])).toEqual([]);
    expect(findLowContrastControls([control({ color: "", background: "255,255,255" })])).toEqual([]);
  });

  it("honours the allow-list", () => {
    const bad = [control({ color: "107,114,128", background: "37,99,235" })];
    expect(findLowContrastControls(bad)).toHaveLength(1);
    expect(findLowContrastControls(bad, [/Analiza gratis/])).toEqual([]);
  });
});
