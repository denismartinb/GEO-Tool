#!/usr/bin/env node
/**
 * ONE-OFF cleanup script, not part of the pilot harness.
 *
 * The write-pilot's project resolver (`findProjectIdByDomain` in
 * `tests/pilot/support/write-guard.ts`) matched the wrong project on PR #459
 * (2026-08-21/22): it checks whether a domains-grid row's full text contains
 * "mozilla.org", and matched a row that mentioned it for some other reason
 * instead of the reserved write-project. It wrote a `[PILOT-TEST]` prompt and
 * launched a real scan into the "Genscore / genscore.es" project, then failed
 * to clean the prompt back up.
 *
 * The founder confirmed the stray prompt is really there and asked for it to
 * be removed. This script does exactly that, against the exact confirmed
 * project id, and nothing else — no new prompt, no scan. It intentionally
 * bypasses the buggy domain-matching resolver instead of going through
 * `sweepTestPrompts`'s normal call path.
 *
 * Deliberately NOT part of `tests/pilot/**`: it must never be picked up by a
 * future `--journeys write` run, and it is meant to be deleted (along with
 * its throwaway workflow and branch) once it has done this one job.
 */

import { chromium } from "@playwright/test";

const BASE_URL = process.env.PILOT_BASE_URL;
const PROJECT_ID = process.env.CLEANUP_PROJECT_ID;
const EMAIL = process.env.PILOT_EMAIL;
const PASSWORD = process.env.PILOT_PASSWORD;
const BYPASS = process.env.PILOT_VERCEL_BYPASS;
const MARKER = "[PILOT-TEST]";

if (!BASE_URL || !PROJECT_ID || !EMAIL || !PASSWORD) {
  console.error("Missing one of PILOT_BASE_URL, CLEANUP_PROJECT_ID, PILOT_EMAIL, PILOT_PASSWORD.");
  process.exit(1);
}

async function waitForContent(page, checks, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const check of checks) {
      if (await check().catch(() => false)) return;
    }
    await page.waitForTimeout(250);
  }
  throw new Error("Timed out waiting for the page to settle.");
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: BASE_URL,
    ...(BYPASS
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": BYPASS,
            "x-vercel-set-bypass-cookie": "true"
          }
        }
      : {})
  });
  const page = await context.newPage();

  try {
    console.log(`Logging in against ${BASE_URL} ...`);
    await page.goto("/login");
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 30_000 });
    console.log("Logged in.");

    let deleted = 0;
    for (let pass = 0; pass < 12; pass += 1) {
      await page.goto(`/dashboard/projects/${PROJECT_ID}/prompts?cleanup=${Date.now()}-${pass}`, {
        waitUntil: "domcontentloaded"
      });
      await waitForContent(page, [
        () => page.getByRole("button", { name: /añadir prompts/i }).first().isVisible(),
        () => page.getByText(/no hay prompts activos/i).isVisible()
      ]);

      const marker = page.getByText(MARKER, { exact: false }).first();
      if (!(await marker.isVisible().catch(() => false))) {
        console.log(pass === 0 ? "No [PILOT-TEST] prompt found — nothing to clean." : "No more matches.");
        break;
      }

      await marker.click();
      const drawer = page.locator(".prompt-drawer");
      await drawer.waitFor({ state: "visible", timeout: 15_000 });

      const deleteButton = drawer.getByLabel("Borrar prompt");
      await deleteButton.waitFor({ state: "visible", timeout: 15_000 });
      await deleteButton.click();

      const confirm = page.locator(".modal-card");
      await confirm.waitFor({ state: "visible", timeout: 15_000 });
      await confirm.getByRole("button", { name: /^borrar prompt$/i }).click();

      await drawer.waitFor({ state: "hidden", timeout: 15_000 });
      deleted += 1;
      console.log(`Deleted match #${deleted}.`);
    }

    console.log(`Done. Deleted ${deleted} prompt(s) carrying the ${MARKER} marker.`);
    process.exitCode = deleted > 0 ? 0 : 1;
  } catch (error) {
    await page.screenshot({ path: "cleanup-failure.png", fullPage: true }).catch(() => undefined);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
