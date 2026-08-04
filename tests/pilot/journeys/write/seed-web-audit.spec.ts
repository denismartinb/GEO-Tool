import { expect, test } from "@playwright/test";
import {
  captureStep,
  resolveOrCreateWriteProject,
  waitForContent,
  waitForNoActiveRun
} from "../../support/write-guard";

/**
 * UX-PILOT-2b — seeds the pilot account with a real web audit.
 *
 * WHY THIS EXISTS (founder-approved 2026-08-02, after a real miss)
 * ---------------------------------------------------------------
 * The always-on read-only pilot auto-discovers the pilot account's first
 * project — which is the very same `PILOT_WRITE_DOMAIN` project this file
 * seeds. That project had never been audited, so `/web-audit` rendered its
 * empty state ("Todavía no has auditado tu web") on every run, and the pilot
 * happily reported `PILOT PASS` with ✅ across three viewports for a PR that
 * redesigned that entire screen. The founder found the real defects by hand.
 *
 * `assertPageIsHealthy`'s `renderedRealContent` check now makes that silence
 * impossible — but a loud failure is only useful if there is a way to fix it.
 * This journey is that way: it puts real audit data into the pilot account so
 * every subsequent read-only run judges the real UI instead of a placeholder.
 *
 * COST GUARD — read before changing anything here
 * -----------------------------------------------
 * Bounded by construction, not by discipline:
 *
 *  1. It runs against the dedicated write-project only (`PILOT_WRITE_DOMAIN`,
 *     `mozilla.org`) — never auto-discovered, never a real customer domain.
 *  2. That project is created by `resolveOrCreateWriteProject` trimmed to
 *     exactly ONE prompt, and the coverage audit's unit of work is one
 *     grounded Gemini call per active prompt. So a full audit here is ~1 LLM
 *     call, not the ~30 a real project would cost.
 *  3. The technical half (page checks + robots/llms) is deterministic HTTP
 *     only — no LLM spend at all, capped at 10 pages by MAX_AUDIT_PAGES.
 *  4. **It is idempotent and skips itself.** If the project already has audit
 *     data, it verifies and exits WITHOUT auditing again. Re-auditing on every
 *     run would burn the product's real 5-per-day rate limit
 *     (`DEFAULT_SNAPSHOT_RATE_LIMIT`, `checkGenerationRateLimit`) within a
 *     handful of pushes and then start failing for reasons that have nothing
 *     to do with the product. Set `PILOT_FORCE_AUDIT=1` to re-audit
 *     deliberately (e.g. after a change to the audit pipeline itself).
 *
 * It creates no prompts and deletes nothing, so unlike UX-PILOT-2a there is no
 * cleanup step: an audit is additive, idempotent product state — exactly the
 * state the pilot needs to exist permanently.
 */

test.describe.configure({ mode: "serial" });

// The coverage campaign runs batched, server-side, up to ~45s per call, and
// then piggybacks the technical audit (~25s) before refreshing. Well past the
// write project's 90s default.
const SEED_TIMEOUT_MS = 240_000;

test("the pilot account has a real web audit, seeding one if it does not", async ({ page }) => {
  test.setTimeout(SEED_TIMEOUT_MS);

  const projectId = await test.step("resolve (or bootstrap) the dedicated write-project", async () => {
    const id = await resolveOrCreateWriteProject(page);
    const free = await waitForNoActiveRun(page, id);
    if (!free) {
      throw new Error(
        "El proyecto de escritura sigue con un escaneo en curso tras esperar. " +
          "No se fuerza — reintenta cuando haya terminado."
      );
    }
    return id;
  });

  await page.goto(`/dashboard/projects/${projectId}/web-audit`, { waitUntil: "domcontentloaded" });

  // Same anchors the read-only journey uses to decide "this screen is real",
  // deliberately: seeding must satisfy exactly the check it exists to unblock,
  // or the two can drift and this journey would "succeed" while the pilot
  // keeps failing.
  const tabs = page.locator('[role="tablist"]');
  const auditButton = page.getByRole("button", { name: /auditar ahora/i }).first();
  const planGate = page.getByText(/disponible en el plan pro/i).first();

  await waitForContent(page, [
    () => tabs.isVisible(),
    () => auditButton.isVisible(),
    () => planGate.isVisible(),
    () => page.getByText(/todavía no hay ningún escaneo completado/i).isVisible()
  ]);

  await captureStep(page, "web-audit-initial-state");

  if (await planGate.isVisible().catch(() => false)) {
    // An honest environment precondition, not a product defect: the pilot
    // account lost Pro. Never force past a plan gate.
    throw new Error(
      "La cuenta piloto no tiene plan Pro, así que la Auditoría web está capada y no se " +
        "puede sembrar. Devuelve la cuenta a Pro y reintenta — el piloto no fuerza gates de plan."
    );
  }

  if (await page.getByText(/todavía no hay ningún escaneo completado/i).isVisible().catch(() => false)) {
    throw new Error(
      "El proyecto de escritura no tiene ningún escaneo completado, y la auditoría web " +
        "necesita uno para cruzar prompts con citas. Lanza primero el journey " +
        "add-prompt-and-scan (UX-PILOT-2a), que deja un escaneo real hecho."
    );
  }

  const alreadySeeded = await tabs.isVisible().catch(() => false);
  const force = process.env.PILOT_FORCE_AUDIT === "1";

  if (alreadySeeded && !force) {
    // eslint-disable-next-line no-console
    console.log(
      "La auditoría ya existe en el proyecto piloto — no se vuelve a auditar " +
        "(consume el límite real de 5/día). Usa PILOT_FORCE_AUDIT=1 para forzar."
    );
    await captureStep(page, "web-audit-already-seeded");
    return;
  }

  await test.step("launch the audit — one click that runs coverage AND technical", async () => {
    await expect(
      auditButton,
      "no se encontró el botón «Auditar ahora» en el cuerpo de la página"
    ).toBeVisible();
    await expect(
      auditButton,
      "«Auditar ahora» está deshabilitado — ya hay una auditoría en curso"
    ).toBeEnabled();

    await auditButton.click();
    await captureStep(page, "web-audit-campaign-started");

    // The campaign drives itself from the browser (WebAuditProvider), batching
    // until every active prompt is covered, then fires the technical audit and
    // calls router.refresh(). The tabs appearing IS the completion signal.
    await expect(
      tabs,
      "la campaña de auditoría no terminó a tiempo: las pestañas nunca aparecieron. " +
        "Puede ser lentitud real del pipeline (Gemini + fetches), no necesariamente un bug de UI."
    ).toBeVisible({ timeout: SEED_TIMEOUT_MS - 60_000 });
  });

  await test.step("verify the seeded audit actually renders the real screens", async () => {
    await captureStep(page, "web-audit-problemas");

    // Prove the seed produced what the read-only pilot will look for, rather
    // than just "something rendered".
    await expect(
      page.getByRole("tab", { name: /problemas/i }),
      "la pestaña Problemas no aparece tras auditar"
    ).toBeVisible();

    await page.getByRole("tab", { name: /correcto/i }).click();
    await captureStep(page, "web-audit-correcto");

    await page.getByRole("tab", { name: /páginas/i }).click();
    await captureStep(page, "web-audit-paginas");
  });
});
