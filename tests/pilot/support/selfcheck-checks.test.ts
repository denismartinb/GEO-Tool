import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs module, no types; the self-check is not TypeScript.
import { checkCaptureDepth, checkScanLockout, pngHeightFrom } from "../../../scripts/pilot-selfcheck-checks.mjs";

/**
 * The self-check guards the harness; these guard the self-check.
 *
 * Both assertions exist to catch a regression that would otherwise turn into a
 * comfortable, permanent PASS — a capture cropped at the fold, or the per-deploy
 * pilot gaining the ability to spend money. An assertion nobody has watched fail
 * is indistinguishable from one that cannot.
 */

const tallPage = {
  label: "overview",
  viewport: "desktop",
  contentHeight: 1_938,
  capturedHeight: 1_938,
  captureTruncated: false,
  screenshot: ".pilot/screens/desktop--overview.png"
};

const io = (heights: Record<string, number>) => ({
  fileExists: (path: string) => path in heights,
  pngHeight: (path: string) => heights[path]
});

describe("checkCaptureDepth", () => {
  it("passes when the PNG really is as tall as the content", () => {
    const result = checkCaptureDepth([tallPage], io({ [tallPage.screenshot]: 1_938 }));
    expect(result.ok).toBe(true);
    expect(result.message).toContain("1938px");
  });

  it("FAILS when the PNG was cropped at one viewport — the exact defect it exists for", () => {
    // What every dashboard capture looked like before the fix: findings claim
    // the full height, the file on disk is a single viewport tall.
    const result = checkCaptureDepth([tallPage], io({ [tallPage.screenshot]: 812 }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("only 812px");
    expect(result.message).toContain("1938px");
  });

  it("FAILS when a page was cut short without saying so", () => {
    const truncatedSilently = { ...tallPage, capturedHeight: 6_000, contentHeight: 9_000, captureTruncated: false };
    const result = checkCaptureDepth([truncatedSilently], io({ [tallPage.screenshot]: 6_000 }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("without flagging truncation");
  });

  it("accepts an honestly-flagged truncation", () => {
    const truncated = { ...tallPage, capturedHeight: 6_000, contentHeight: 9_000, captureTruncated: true };
    expect(checkCaptureDepth([truncated], io({ [tallPage.screenshot]: 6_000 })).ok).toBe(true);
  });

  it("FAILS when the screenshot is missing entirely", () => {
    const result = checkCaptureDepth([tallPage], io({}));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("missing");
  });

  it("FAILS when no page is taller than a viewport — the fixture stopped reproducing the real shell", () => {
    const flat = { ...tallPage, contentHeight: 800, capturedHeight: 800 };
    const result = checkCaptureDepth([flat], io({ [tallPage.screenshot]: 800 }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not reproducing the real one");
  });
});

describe("checkScanLockout", () => {
  it("passes when the default read run touched no scan journey", () => {
    const result = checkScanLockout([
      { label: "overview", viewport: "desktop", path: "/dashboard/projects/1" },
      { label: "competitors", viewport: "mobile", path: "/dashboard/projects/1/competitors" }
    ]);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("0 scan journeys");
  });

  it("FAILS when a scan journey leaked into the per-deploy set — money spent on every preview", () => {
    const result = checkScanLockout([
      { label: "overview", viewport: "desktop", path: "/dashboard/projects/1" },
      { label: "scan-overview", viewport: "scan", path: "/dashboard/projects/1" }
    ]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("scan-overview");
    expect(result.message).toContain("must never be able to spend money");
  });

  it("catches the leak by viewport as well as by label", () => {
    expect(checkScanLockout([{ label: "runs", viewport: "scan", path: "/x" }]).ok).toBe(false);
  });

  it("catches it by path, so a renamed label cannot hide it", () => {
    expect(checkScanLockout([{ label: "anything", viewport: "desktop", path: "/scan/whatever" }]).ok).toBe(
      false
    );
  });
});

describe("pngHeightFrom", () => {
  it("reads the height out of a PNG's IHDR chunk", () => {
    // Minimal PNG prefix: 8-byte signature, 4-byte length, "IHDR", width, height.
    const buffer = Buffer.alloc(24);
    buffer.writeUInt32BE(1_280, 16);
    buffer.writeUInt32BE(2_046, 20);
    expect(pngHeightFrom(buffer)).toBe(2_046);
  });
});
