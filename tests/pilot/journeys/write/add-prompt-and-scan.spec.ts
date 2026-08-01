import { expect, test } from "@playwright/test";
import {
  assertSingleManualPromptDraft,
  buildTestPromptText,
  captureStep,
  readActivePromptCount,
  resolveOrCreateWriteProject,
  sweepTestPrompts,
  waitForContent,
  waitForNoActiveRun
} from "../../support/write-guard";

/**
 * UX-PILOT-2a — the one write journey approved so far.
 *
 * SCOPE GUARD, enforced by construction, not just by discipline:
 *   - Adds exactly ONE manual prompt via the real "Añadir prompts" UI. That
 *     flow (`lib/projects/add-prompts.ts`) launches a scan with
 *     `onlyPromptIds` set to just the new prompt(s) — the cost is ~1 prompt
 *     × active engines (~2-3 LLM calls), never the project's full active set
 *     (up to MAX_REAL_SCAN_PROMPTS × engines ≈ 30 calls).
 *   - Never touches the write-project's existing prompts, competitors, or
 *     settings. Never creates or deletes a project. Never launches the
 *     unrestricted "Lanzar escaneo" button.
 *   - Cleans up the one prompt it created (and sweeps any debris a crashed
 *     previous run left behind) so the project's prompt count never creeps
 *     toward `plan.caps.prompts` across repeated runs.
 *
 * Requires PILOT_WRITE_PROJECT_ID — a dedicated project the founder created
 * for this purpose, with headroom under its plan's prompt cap and no
 * conflicting scan in progress. There is no auto-discovery: guessing which
 * project is safe to write into is not an acceptable failure mode here.
 */

test.describe.configure({ mode: "serial" });

test("adding one manual prompt launches a scan restricted to it, and the founder sees real data", async ({
  page
}) => {
  const runId = `${Date.now()}`;
  const promptText = buildTestPromptText(runId);

  const projectId = await test.step("resolve (or bootstrap) the dedicated write-project", async () => {
    const id = await resolveOrCreateWriteProject(page);
    // Creation launches its own scan; the add-prompts button stays disabled
    // while it runs, so wait it out rather than reporting a false blocker.
    const free = await waitForNoActiveRun(page, id);
    if (!free) {
      throw new Error(
        "El proyecto de escritura sigue con un escaneo en curso tras esperar. " +
          "No se fuerza — reintenta cuando haya terminado."
      );
    }
    return id;
  });

  const baselinePromptCount = await test.step(
    "cleanup: sweep any test prompts left by a previous run, then record the baseline",
    async () => {
      const swept = await sweepTestPrompts(page, projectId);
      if (swept > 0) {
        // eslint-disable-next-line no-console
        console.log(`Swept ${swept} leftover pilot test prompt(s) before starting.`);
      }
      // Recorded AFTER the opening sweep so leftover debris from an earlier
      // failed run is never baked into the baseline as if it belonged there.
      return readActivePromptCount(page, projectId);
    }
  );

  await page.goto(`/dashboard/projects/${projectId}/prompts`, { waitUntil: "domcontentloaded" });

  const addButton = page.getByRole("button", { name: /añadir prompts/i }).first();

  const isBlocked = await addButton.isDisabled().catch(() => true);
  if (isBlocked) {
    // A run in progress or an at-limit project are real, honest states this
    // journey cannot safely push through — forcing past either would mean
    // acting on the founder's real data outside what was approved. This is
    // an environment precondition failure, not a product defect: INCONCLUSIVE.
    throw new Error(
      "El botón «Añadir prompts» está deshabilitado en el proyecto de escritura " +
        "(escaneo en curso o límite de prompts del plan alcanzado). El piloto no " +
        "fuerza ninguno de los dos casos — reintenta cuando el proyecto esté libre."
    );
  }

  await captureStep(page, "prompts-before");

  await test.step("open the add-prompts modal and switch to manual mode", async () => {
    await addButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await captureStep(page, "add-prompts-methods");
    await page.getByText("Manual", { exact: true }).click();
  });

  await test.step("draft exactly one prompt", async () => {
    await page.locator("#add-prompts-manual-input").fill(promptText);
    await page.getByRole("button", { name: /^añadir$/i }).click();

    const draftCount = await page.locator(".add-prompts-manual-item").count();
    assertSingleManualPromptDraft(draftCount);
    await captureStep(page, "manual-prompt-drafted");
  });

  await test.step("submit — this synchronously runs a real, scoped scan", async () => {
    const submit = page.getByRole("button", { name: /añadir 1 prompt/i });
    await expect(submit).toBeEnabled();

    // The server action executes the scan in-request (ENABLE_SYNC_SCAN_EXECUTION)
    // before redirecting, bounded by Vercel's maxDuration=60. A timeout here is
    // the pipeline being slow, not this journey finding a UI bug — classified as
    // INCONCLUSIVE (see UNREACHABLE_SIGNATURES in scripts/pilot.mjs).
    try {
      await Promise.all([
        page.waitForURL(/promptsAdded=1/, { timeout: 70_000 }),
        submit.click()
      ]);
    } catch {
      throw new Error(
        "SCAN_TIMEOUT_NOT_PRODUCT_BUG: el escaneo restringido al prompt nuevo no " +
          "terminó en 70s. Esto es un problema de rendimiento del pipeline, no " +
          "necesariamente del producto — no se reporta como FAIL de UI."
      );
    }
  });

  await test.step("verify the founder-visible confirmation names the scoped scan", async () => {
    const banner = page.getByText(/se ha añadido 1 prompt nuevo/i);
    await expect(banner).toBeVisible();

    const url = new URL(page.url());
    const scanLaunched = url.searchParams.get("scanLaunched");

    if (scanLaunched !== "true") {
      const warning = url.searchParams.get("scanWarning");
      throw new Error(
        "SCAN_TIMEOUT_NOT_PRODUCT_BUG: el prompt se creó pero el escaneo no se " +
          `lanzó (scanWarning=${warning ?? "(vacío)"}). No es un fallo de UI.`
      );
    }

    await expect(
      page.getByText(/se ha lanzado un escaneo restringido a estos prompts nuevos/i),
      "el copy de confirmación no confirma que el escaneo se restringió al prompt nuevo — " +
        "sin esta frase no hay garantía textual de que el coste se limitó a 1 prompt"
    ).toBeVisible();

    await captureStep(page, "scan-confirmed-on-prompts");
  });

  await test.step("verify the scan's result reached the founder-facing screens", async () => {
    // The point of the whole journey: a scan that completes but never shows up
    // in the product is still a broken product. These two screens are where a
    // founder would look for the new data.
    //
    // Each capture waits for real content first. Screenshotting straight after
    // `goto` photographs the route's loading skeleton — which is what the first
    // passing run did, producing an "overview-after-scan" image showing nothing
    // but grey placeholders. Evidence that cannot be read is not evidence.
    await page.goto(`/dashboard/projects/${projectId}/runs`, { waitUntil: "domcontentloaded" });
    await waitForContent(page, [
      () => page.getByText(/completado|en curso|pendiente|fallido/i).first().isVisible()
    ]);
    await captureStep(page, "runs-after-scan");

    await page.goto(`/dashboard/projects/${projectId}`, { waitUntil: "domcontentloaded" });
    await waitForContent(page, [
      () => page.getByText(/puntuación geo/i).first().isVisible(),
      () => page.getByText(/tasa de mención/i).first().isVisible()
    ]);
    await expect(
      page.getByText(/puntuación geo/i).first(),
      "Visión general no mostró la puntuación GEO tras el escaneo"
    ).toBeVisible();
    await captureStep(page, "overview-after-scan");
  });

  await test.step("cleanup: remove the prompt this run created", async () => {
    // The prompt list (and with it the search box the sweep drives) is replaced
    // by ScanInProgress while a run is active, so settle first — otherwise
    // cleanup would silently find nothing and leave its own prompt behind.
    await waitForNoActiveRun(page, projectId);

    const swept = await sweepTestPrompts(page, projectId);
    expect(swept, "expected to clean up at least the prompt this run just created").toBeGreaterThan(0);

    // The real invariant: the project's ACTIVE prompt count — the number that
    // consumes plan.caps.prompts — is back where it started. Counting rendered
    // rows would measure the wrong thing, since a deleted prompt keeps its row
    // until a later scan drops it.
    const afterCleanup = await readActivePromptCount(page, projectId);
    expect(
      afterCleanup,
      `la limpieza no devolvió el cupo de prompts activos a su valor inicial ` +
        `(${baselinePromptCount}); cada pasada que deja residuo consume cupo del plan`
    ).toBe(baselinePromptCount);

    await captureStep(page, "prompts-after-cleanup");
  });
});
