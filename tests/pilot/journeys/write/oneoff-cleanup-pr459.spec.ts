import { expect, test } from "@playwright/test";
import { dismissWelcomeTour } from "../../support/journey";
import { PILOT_TEST_PROMPT_MARKER } from "../../support/write-guard";

/**
 * ONE-OFF, NOT PART OF THE PILOT HARNESS.
 *
 * The write-pilot's project resolver (`findProjectIdByDomain` in
 * `tests/pilot/support/write-guard.ts`) matched the wrong project on PR #459
 * (2026-08-21/22): it checks whether a domains-grid row's full text contains
 * "mozilla.org" and matched some other row instead of the reserved
 * write-project. It wrote a `[PILOT-TEST]` prompt (and a real scan) into
 * "Genscore / genscore.es" instead, then failed to clean the prompt back up.
 *
 * The founder confirmed the stray prompt is really there and asked for it to
 * be removed. This test does exactly that, against the exact confirmed
 * project id, driving the real "Borrar prompt" UI by hand instead of the
 * shared `sweepTestPrompts` (see below for why) — it bypasses only the buggy
 * domain resolver, not any deletion logic. No new prompt, no new scan.
 *
 * This branch (`chore/pilot-cleanup-pr459`) is not meant to be merged.
 */
const STRAY_PROJECT_ID = "72b2b61e-f89c-4575-8a97-d3303e4bd55d";

test("ONEOFF-CLEANUP-PR459: remove the stray [PILOT-TEST] prompt from the wrong project", async ({
  page
}) => {
  // Run 1 (a276651): "removed 0" — the fresh storageState's undismissed
  // welcome tour covered the whole page (its tour-seen marker is
  // deliberately stripped for the "auth" project — .claude/rules/
  // onboarding.md), so getByText(marker) found nothing behind it.
  await page.goto(`/dashboard/projects/${STRAY_PROJECT_ID}/prompts`, { waitUntil: "domcontentloaded" });
  await dismissWelcomeTour(page);

  // Run 2 (d63130f), tour dismissed: STILL "removed 0". Confirmed from this
  // run's own screenshot — prompt rows live inside per-topic accordions that
  // mount collapsed (`isOpen = expandedTopics.has(category) ||
  // query.trim().length > 0` in prompts-client.tsx), so with both topics
  // closed the marker text was never in the DOM for `sweepTestPrompts`'s
  // bare getByText to find. A non-empty search query force-opens the
  // matching topic — the same lever three earlier commits on this harness
  // already used for this exact bug (runs 10-12, 2026-08-05) before it
  // regressed. Three "Buscar prompt" inputs exist (mobile/tablet/desktop
  // toolbar placements); exactly one is visible at this viewport.
  const searchBoxes = page.getByLabel("Buscar prompt");
  const count = await searchBoxes.count();
  let filled = false;
  for (let i = 0; i < count; i += 1) {
    const box = searchBoxes.nth(i);
    if (await box.isVisible().catch(() => false)) {
      await box.fill(PILOT_TEST_PROMPT_MARKER);
      filled = true;
      break;
    }
  }
  expect(filled, "no visible 'Buscar prompt' search box found").toBe(true);

  const row = page.getByText(PILOT_TEST_PROMPT_MARKER, { exact: false }).first();
  await expect(row, "search did not reveal the marked prompt").toBeVisible({ timeout: 10_000 });
  await row.click();

  const drawer = page.locator(".prompt-drawer");
  await expect(drawer).toBeVisible();
  await drawer.getByLabel("Borrar prompt").click();

  const confirm = page.locator(".modal-card");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: /^borrar prompt$/i }).click();
  await expect(drawer).toBeHidden({ timeout: 15_000 });

  // eslint-disable-next-line no-console
  console.log(`Cleanup: removed 1 stray prompt from project ${STRAY_PROJECT_ID}.`);
});
