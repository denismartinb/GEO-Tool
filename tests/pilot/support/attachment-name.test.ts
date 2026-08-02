import { describe, expect, it } from "vitest";
import { attachmentName } from "./journey";

/**
 * Regression guard for a real PILOT FAIL (2026-08-02): the interaction
 * sweeper names attachments after the control's accessible name, Playwright
 * derives the on-disk filename from that name, and an InfoTip whose
 * aria-label was a full explanatory sentence pushed it past the 255-byte
 * filename limit — failing all three viewports with ENAMETOOLONG on a
 * deployment where the product itself was fine.
 *
 * The bar these tests hold: a screenshot filename must never be able to fail
 * a run, whatever product copy ends up in an accessible name.
 */
describe("attachmentName", () => {
  it("1. leaves a short name untouched", () => {
    expect(attachmentName("competitors (desktop)")).toBe("competitors (desktop)");
  });

  it("2. truncates the real aria-label that caused the ENAMETOOLONG failure", () => {
    const real =
      "competitors → Puesto medio en el que la IA nombra a cada marca. Los prompts donde una marca " +
      "no aparece cuentan como el último puesto, así que una marca poco mencionada tiene una media " +
      "alta aunque salga primera cuando aparece. Más bajo es mejor; puede haber empates. (mobile)";
    const result = attachmentName(real);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith("…")).toBe(true);
  });

  it("3. output always fits a filename even for absurd input", () => {
    // Playwright appends a sanitized form plus a hash and an extension; 80
    // chars leaves ample headroom under the 255-byte limit even if every
    // character expands during sanitization.
    const result = attachmentName("á".repeat(5_000));
    expect(result.length).toBeLessThanOrEqual(80);
    expect(Buffer.byteLength(result, "utf8")).toBeLessThan(255);
  });

  it("4. collapses newlines and runs of whitespace — they become separators in the filename", () => {
    expect(attachmentName("  competitors \n\n  →   tooltip  ")).toBe("competitors → tooltip");
  });

  it("5. a name exactly at the limit is not truncated", () => {
    const exact = "x".repeat(80);
    expect(attachmentName(exact)).toBe(exact);
    expect(attachmentName(`${exact}y`).endsWith("…")).toBe(true);
  });
});
