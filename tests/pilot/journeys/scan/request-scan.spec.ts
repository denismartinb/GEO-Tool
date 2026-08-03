import { expect, test, type Page } from "@playwright/test";
import { assertPageIsHealthy, captureInteraction, visitAsUser } from "../../support/journey";
import { waitForContent } from "../../support/write-guard";
import {
  describeAuthorization,
  resolveScanAuthorization
} from "../../support/scan-authorization";

/**
 * UX-PILOT-3 — the pilot asks for a scan when a state is unreachable without
 * one, and the founder grants it per run.
 *
 * WHY THIS EXISTS. Some states cannot be reached by looking harder. After a
 * scoring change there is, by construction, no run anywhere carrying the new
 * shape of data — `run_scores.details_json` holds whatever the code that scored
 * *that* run wrote, and there is no backfill (ADR 0026 §4). PR #308 hit this
 * exactly: six acceptance criteria, including the whole trend chart, had no
 * qualifying data on any project the pilot could reach, so the verdict was
 * INCONCLUSIVE and no amount of harness work could change it. Without this
 * journey that repeats on every methodology PR, forever.
 *
 * ---------------------------------------------------------------------------
 * SAFETY — this is the only journey in the harness that spends money.
 * ---------------------------------------------------------------------------
 * A scan runs real calls against Gemini, OpenAI and Anthropic and writes to the
 * production Supabase project. Two independent things must both hold before a
 * single click happens:
 *
 *   1. `resolveScanAuthorization` refuses unless the founder's
 *      `PILOT_SCAN_AUTHORIZATION` secret is present, the project is named
 *      explicitly, and the count is within the hard cap. The per-deploy
 *      workflow never passes that secret.
 *   2. This file lives under `journeys/scan/`, which only the `scan` Playwright
 *      project matches, which `scripts/pilot.mjs` only includes for an explicit
 *      `--journeys scan`. The always-on run cannot reach it at all.
 *
 * Within those bounds the journey is still deliberately narrow: it presses the
 * project's own "Repetir escaneo" button on a project that already exists. It
 * does not create projects, add prompts, touch competitors, or delete anything.
 */

test.describe.configure({ mode: "serial" });

/**
 * A full-project scan runs every active prompt across every active engine, so
 * it is much slower than the single-prompt scan UX-PILOT-2a triggers. Generous
 * on purpose: timing out half way leaves a scan running and its money spent
 * with nothing to show.
 */
const SCAN_COMPLETION_TIMEOUT_MS = 420_000;

const SCAN_BUTTON = /repetir escaneo/i;

/**
 * Waits until the project has no scan in progress, using the product's own
 * signal: the runs page disables "Repetir escaneo" while a run is active.
 *
 * The cache-busting param matters — Next's App Router serves the client-side
 * RSC cache on a repeat navigation to the same URL, so a plain re-`goto` can
 * render the page exactly as it was before the scan started.
 */
async function waitForScanToSettle(page: Page, projectId: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await page.goto(`/dashboard/projects/${projectId}/runs?pilot=scan-${Date.now()}`, {
      waitUntil: "domcontentloaded"
    });

    const button = page.getByRole("button", { name: SCAN_BUTTON }).first();
    // The button does not exist while the loading skeleton is up, so without
    // settling first this reads "still busy" from a page that has not rendered.
    await waitForContent(page, [() => button.isVisible()]);

    if (await button.isEnabled().catch(() => false)) return true;
    await page.waitForTimeout(10_000);
  }

  return false;
}

test("launches the scans the founder authorized, then captures what they unlocked", async ({
  page
}, testInfo) => {
  const auth = resolveScanAuthorization(process.env);

  // Loud, never silent. A run the founder deliberately triggered that quietly
  // did nothing is the same class of lie as a pass for a screen nobody saw.
  testInfo.annotations.push({ type: "scan-authorization", description: describeAuthorization(auth) });
  test.skip(!auth.authorized, describeAuthorization(auth));
  if (!auth.authorized) return;

  const { projectId, scanCount } = auth;

  const settledBefore = await waitForScanToSettle(page, projectId, SCAN_COMPLETION_TIMEOUT_MS);
  expect(
    settledBefore,
    "the project already had a scan running and it did not finish in time — nothing was launched"
  ).toBe(true);

  for (let i = 1; i <= scanCount; i += 1) {
    const button = page.getByRole("button", { name: SCAN_BUTTON }).first();
    await expect(button, `"Repetir escaneo" is not available on run ${i}`).toBeEnabled();

    await captureInteraction(page, testInfo, `scan-${i}-before`);
    await button.click();

    // Proof the click did something, before committing to a long wait: the
    // button goes disabled the moment a run exists. Without this, a dead button
    // would look identical to a scan that finished very fast.
    await expect(
      page.getByRole("button", { name: SCAN_BUTTON }).first(),
      `clicking "Repetir escaneo" on run ${i} did not start anything — the button stayed enabled`
    ).toBeDisabled({ timeout: 30_000 });
    await captureInteraction(page, testInfo, `scan-${i}-launched`);

    const settled = await waitForScanToSettle(page, projectId, SCAN_COMPLETION_TIMEOUT_MS);
    expect(settled, `scan ${i} of ${scanCount} did not finish within the timeout`).toBe(true);

    testInfo.annotations.push({
      type: "scan-launched",
      description: `run ${i} of ${scanCount} on project ${projectId} completed`
    });
  }

  // The reason the scans were worth paying for: the screens that had no
  // qualifying data now do. Captured through the normal helper so they land in
  // the evidence branch alongside every other screenshot, and so the same
  // mechanical checks apply.
  const runs = await visitAsUser(page, testInfo, `/dashboard/projects/${projectId}/runs`, "scan-runs");
  assertPageIsHealthy(runs);

  const overview = await visitAsUser(page, testInfo, `/dashboard/projects/${projectId}`, "scan-overview");
  assertPageIsHealthy(overview);

  const competitors = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${projectId}/competitors`,
    "scan-competitors"
  );
  assertPageIsHealthy(competitors);
});
