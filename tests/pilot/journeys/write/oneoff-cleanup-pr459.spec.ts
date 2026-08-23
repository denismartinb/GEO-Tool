import { test } from "@playwright/test";
import { sweepTestPrompts } from "../../support/write-guard";

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
 * project id, reusing the same trusted `sweepTestPrompts` the write-pilot
 * itself uses for cleanup — it bypasses only the buggy domain resolver, not
 * the deletion mechanism. No new prompt, no new scan.
 *
 * This branch (`chore/pilot-cleanup-pr459`) is not meant to be merged; this
 * file exists only so a CI run can drive the real "Borrar prompt" UI once.
 */
const STRAY_PROJECT_ID = "72b2b61e-f89c-4575-8a97-d3303e4bd55d";

test("ONEOFF-CLEANUP-PR459: remove the stray [PILOT-TEST] prompt from the wrong project", async ({
  page
}) => {
  const deleted = await sweepTestPrompts(page, STRAY_PROJECT_ID);
  // eslint-disable-next-line no-console
  console.log(`Cleanup: removed ${deleted} stray prompt(s) from project ${STRAY_PROJECT_ID}.`);
});
