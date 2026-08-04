/**
 * The self-check's own assertions, as pure functions.
 *
 * They live here rather than inline in `pilot-selfcheck.mjs` so they can be
 * unit-tested in both directions. A check that has never been observed failing
 * is indistinguishable from a check that cannot fail, and these two exist
 * specifically to catch regressions in the harness — a harness that quietly
 * stopped working would otherwise report a comfortable PASS forever.
 *
 * Proving them by sabotaging the real harness and running the full self-check
 * was the first approach; it took a quarter of an hour per attempt and twice
 * left modified files behind. Feeding them crafted findings takes milliseconds
 * and cannot clobber anything.
 *
 * Each returns `{ ok, message }` rather than logging, so the caller owns
 * presentation and the tests can assert on the reason.
 */

/** Pixel height straight out of a PNG's IHDR chunk (bytes 20..24, big-endian). */
export function pngHeightFrom(buffer) {
  return buffer.readUInt32BE(20);
}

/**
 * Did captures actually reach past the fold?
 *
 * `fullPage: true` grows to `document.documentElement.scrollHeight`, which
 * never exceeds one viewport when the app shell pins itself and scrolls an
 * inner element — so every dashboard screenshot was cropped at the fold while
 * looking exactly like a complete one (found 2026-08-03).
 *
 * The PNG's own header is the evidence: the findings could claim any
 * `capturedHeight` while the file on disk is a single viewport tall.
 */
export function checkCaptureDepth(findings, { fileExists, pngHeight }) {
  // Pages whose real content runs past the tallest viewport the pilot uses.
  const shellPages = findings.filter((f) => f.contentHeight > 1_024);

  if (shellPages.length === 0) {
    return {
      ok: false,
      message:
        "no page reported content taller than a viewport — the fixture shell is not reproducing the real one"
    };
  }

  for (const f of shellPages) {
    if (f.capturedHeight < f.contentHeight && !f.captureTruncated) {
      return {
        ok: false,
        message: `${f.label} @ ${f.viewport} captured ${f.capturedHeight}px of ${f.contentHeight}px without flagging truncation`
      };
    }
    if (!fileExists(f.screenshot)) {
      return { ok: false, message: `${f.label} @ ${f.viewport} screenshot missing at ${f.screenshot}` };
    }
    const height = pngHeight(f.screenshot);
    if (height < f.capturedHeight - 4) {
      return {
        ok: false,
        message: `${f.label} @ ${f.viewport} PNG is only ${height}px tall, expected ~${f.capturedHeight}px (content ${f.contentHeight}px)`
      };
    }
  }

  const tallest = Math.max(...shellPages.map((f) => f.contentHeight));
  return {
    ok: true,
    message: `${shellPages.length} shell page(s) captured to full content height (tallest ${tallest}px)`
  };
}

/**
 * Did the always-on, per-deploy run stay away from the one journey that spends
 * money (UX-PILOT-3)?
 *
 * The guard is structural — `journeys/scan/*.spec.ts` is matched only by the
 * `scan` Playwright project, which `PROJECT_SETS` includes only for an explicit
 * `--journeys scan` — but structural is a claim until something checks it. This
 * is a behavioural check on the default invocation, which is exactly what every
 * preview deploy runs. If a future refactor widens a `testMatch` or adds `scan`
 * to the read set, this catches it.
 */
export function checkScanLockout(findings) {
  const leaked = findings.filter(
    (f) => f.label?.startsWith("scan-") || f.viewport === "scan" || f.path?.includes("/scan")
  );

  if (leaked.length > 0) {
    return {
      ok: false,
      message:
        `the default read run reached ${leaked.length} scan journey page(s) — ` +
        `e.g. "${leaked[0].label}". The per-deploy pilot must never be able to spend money.`
    };
  }

  return { ok: true, message: `default read run reached 0 scan journeys across ${findings.length} pages` };
}
