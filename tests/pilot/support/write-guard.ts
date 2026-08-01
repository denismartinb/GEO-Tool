import { mkdirSync } from "node:fs";
import { type Page, expect } from "@playwright/test";

/**
 * Captures a named, full-page screenshot into the directory the evidence
 * branch publishes.
 *
 * The write journey drives the product through the same clicks a founder
 * would, so its screenshots are a genuine visual record of the create-domain
 * and add-prompt flows — the parts the read-only pilot can never show. Naming
 * them by step (rather than relying on Playwright's automatic end-of-test
 * capture) is what makes them reviewable afterwards.
 */
let stepCounter = 0;
export async function captureStep(page: Page, name: string): Promise<void> {
  stepCounter += 1;
  mkdirSync(".pilot/screens", { recursive: true });
  await page
    .screenshot({
      path: `.pilot/screens/write-${String(stepCounter).padStart(2, "0")}--${name}.png`,
      fullPage: true
    })
    .catch(() => undefined);
}

/**
 * Every prompt the write journeys create carries this marker, in the position
 * a founder would notice first if one ever leaked into view. It exists so
 * `sweepTestPrompts` can find and remove pilot debris without touching a
 * single real prompt, and so a human looking at the write-project's prompt
 * list immediately understands where an unfamiliar row came from.
 */
export const PILOT_TEST_PROMPT_MARKER = "[PILOT-TEST]";

/**
 * The domain of the project the write journeys are allowed to mutate.
 *
 * Chosen deliberately: a real, stable, non-commercial homepage (the onboarding
 * wizard fetches it to ground its suggestions, so an invented domain would
 * fail), with no overlap whatsoever with the founder's actual market. It is
 * obviously a test artifact to anyone looking at the projects list.
 *
 * Matching on this exact string is a reserved convention, NOT the "pick the
 * first project" auto-discovery this harness refuses to do — that would risk
 * writing into a real project like `mahou.es`. An exact match on a domain
 * nobody would track for real cannot select the wrong project.
 */
export const PILOT_WRITE_DOMAIN = "mozilla.org";

/**
 * Waits for a route's real content to replace its `loading.tsx` skeleton.
 *
 * Every dashboard route in this app ships a Next.js loading skeleton, and
 * `domcontentloaded` fires while that skeleton is still on screen. Reading a
 * list straight after `goto` therefore reports "nothing here" for a page that
 * simply has not rendered yet — which is exactly how two consecutive write runs
 * concluded there were no prompts to clean up while the sidebar counter plainly
 * said otherwise.
 *
 * Waits for any of the passed anchors; each caller names something only the
 * real, settled page renders.
 */
async function waitForContent(page: Page, anchors: Array<() => Promise<boolean>>): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const isReady of anchors) {
      if (await isReady().catch(() => false)) return;
    }
    await page.waitForTimeout(250);
  }
}

/**
 * Waits until the write-project has no scan in progress.
 *
 * Both project creation and the add-prompts flow launch real scans, and the
 * "Añadir prompts" button is disabled while one is running. Without this the
 * first run after a bootstrap would always report INCONCLUSIVE ("button
 * disabled") purely because it raced its own setup scan.
 */
export async function waitForNoActiveRun(
  page: Page,
  projectId: string,
  timeoutMs = 120_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await page.goto(`/dashboard/projects/${projectId}/prompts`, { waitUntil: "domcontentloaded" });
    const addButton = page.getByRole("button", { name: /añadir prompts/i }).first();
    // The button does not exist while the loading skeleton is up, so without
    // settling first this would read "still busy" from a page that had simply
    // not rendered. The 5s poll below papered over it; being explicit is what
    // keeps this loop honest about what it is measuring.
    await waitForContent(page, [() => addButton.isVisible()]);
    if (await addButton.isEnabled().catch(() => false)) return true;
    await page.waitForTimeout(5_000);
  }

  return false;
}

/**
 * Returns the id of the pilot's write-project, creating it through the real
 * onboarding wizard if it does not exist yet.
 *
 * Self-bootstrapping for the same reason `sweepTestPrompts` is self-healing:
 * the pilot should not need a human to prepare its environment. Creation is
 * bounded and one-off — it happens only when no project with
 * `PILOT_WRITE_DOMAIN` exists on the account.
 *
 * Cost note: the wizard's first step runs real grounded Gemini calls to suggest
 * competitors and prompts (that IS the product's onboarding, and driving it any
 * other way would not test it), and creation launches a scan of whatever
 * prompts survive. The journey therefore trims the suggested prompts down to
 * exactly one before submitting, so that scan is ~1 prompt × active engines
 * rather than the full suggested set.
 */
export async function resolveOrCreateWriteProject(page: Page): Promise<string> {
  const pinned = process.env.PILOT_WRITE_PROJECT_ID?.trim();
  if (pinned) return pinned;

  await page.goto("/dashboard/projects", { waitUntil: "domcontentloaded" });

  // Higher stakes than the sweep's version of this wait: reading the projects
  // list before it renders would conclude the write-project does not exist and
  // create a second one.
  await waitForContent(page, [
    () => page.locator('a[href^="/dashboard/projects/"]').first().isVisible(),
    () => page.getByRole("link", { name: /nuevo dominio|crear/i }).first().isVisible()
  ]);

  const existing = await findProjectIdByDomain(page);
  if (existing) return existing;

  await page.goto("/dashboard/projects/new", { waitUntil: "domcontentloaded" });

  const domainField = page.getByLabel("Dominio");
  if (!(await domainField.isVisible().catch(() => false))) {
    throw new Error(
      "No se pudo abrir el asistente de alta de dominio. ¿La cuenta piloto ha " +
        "alcanzado el límite de dominios de su plan?"
    );
  }

  await domainField.fill(PILOT_WRITE_DOMAIN);
  await captureStep(page, "wizard-domain");
  await page.getByRole("button", { name: /^continuar$/i }).click();

  // Step 1 (competitors) appears only after the grounded suggestion call
  // returns — that call fetches the homepage and runs Gemini, so it is slow.
  await expect(
    page.getByRole("button", { name: /continuar a prompts/i }),
    "el asistente no llegó al paso de competidores — la sugerencia de Gemini falló o tardó demasiado"
  ).toBeVisible({ timeout: 90_000 });
  // Real Gemini output, worth seeing: this is the product's actual competitor
  // suggestion for a domain it has never analysed before.
  await captureStep(page, "wizard-competitors-suggested");
  await page.getByRole("button", { name: /continuar a prompts/i }).click();

  await captureStep(page, "wizard-prompts-suggested");

  // Trim to a single prompt: creation scans every prompt that survives here,
  // and this is the only place that cost is bounded.
  const removeButtons = page.getByRole("button", { name: /^quitar$/i });
  for (let guard = 0; guard < 40; guard += 1) {
    const count = await removeButtons.count();
    if (count <= 1) break;
    await removeButtons.last().click();
  }

  const remaining = await page.getByRole("button", { name: /^quitar$/i }).count();
  if (remaining !== 1) {
    throw new Error(
      `Refusing to create the project: expected exactly 1 prompt left, found ${remaining}. ` +
        "Creation scans every remaining prompt, so this is the cost cap for bootstrap."
    );
  }

  await captureStep(page, "wizard-trimmed-to-one-prompt");
  await page.getByRole("button", { name: /crear dominio y escanear/i }).click();

  await page.waitForURL(/\/dashboard\/projects\/[^/]+\/runs/, { timeout: 90_000 }).catch(() => undefined);

  await captureStep(page, "project-created-runs-page");

  const created = page.url().match(/\/dashboard\/projects\/([^/?#]+)\/runs/)?.[1];
  if (!created) {
    throw new Error(
      `El alta de dominio no terminó en la pantalla de escaneos. URL final: ${page.url()}`
    );
  }

  return created;
}

/** Finds the project whose row links to a project and matches the reserved domain. */
async function findProjectIdByDomain(page: Page): Promise<string | undefined> {
  const links = page.locator('a[href^="/dashboard/projects/"]');
  const count = await links.count();

  for (let i = 0; i < count; i += 1) {
    const link = links.nth(i);
    const href = await link.getAttribute("href");
    const id = href?.match(/\/dashboard\/projects\/([^/?#]+)$/)?.[1];
    if (!id || id === "new") continue;

    // The domain is rendered as a sibling of the project-name link, so check
    // the enclosing row rather than the link's own text.
    const rowText = await link.locator("xpath=ancestor::*[self::li or self::tr or self::div][1]")
      .innerText()
      .catch(() => "");
    if (rowText.includes(PILOT_WRITE_DOMAIN)) return id;
  }

  return undefined;
}

export function buildTestPromptText(runId: string): string {
  return (
    `${PILOT_TEST_PROMPT_MARKER} Comparativa de opciones para comprar online (${runId}) — ` +
    "prompt de prueba del piloto agéntico, seguro de borrar."
  );
}

/**
 * Removes every prompt carrying the pilot's marker from the write-project,
 * including ones a previous run left behind because it crashed before its own
 * cleanup ran. This is what makes the journey self-healing: a failed run does
 * not permanently eat into the project's prompt-count limit
 * (`plan.caps.prompts`), which would otherwise silently block every future
 * write-pilot run once the cap is hit.
 *
 * Bounded to a fixed number of iterations — a real bug that keeps recreating
 * matching rows must not turn this into an infinite loop.
 */
export async function sweepTestPrompts(page: Page, projectId: string): Promise<number> {
  const MAX_SWEEPS = 10;
  let deleted = 0;

  for (let i = 0; i < MAX_SWEEPS; i += 1) {
    // The cache-busting param matters: Next's App Router serves the client-side
    // RSC cache on repeat navigations to the same URL, so a plain re-`goto`
    // after a delete can render the list exactly as it was before it. Observed
    // live — a run reported having swept a prompt while the page still listed
    // it, and two runs' debris survived a sweep that believed it had succeeded.
    // The page ignores unknown search params.
    await page.goto(`/dashboard/projects/${projectId}/prompts?pilot=${Date.now()}-${i}`, {
      waitUntil: "domcontentloaded"
    });

    // "Añadir prompts" only exists once the real page renders, so it is a
    // reliable signal that the loading skeleton is gone and the list below can
    // be trusted.
    await waitForContent(page, [
      () => page.getByRole("button", { name: /añadir prompts/i }).first().isVisible(),
      () => page.getByText(/no hay prompts activos/i).isVisible()
    ]);

    // Deliberately does NOT drive the "Buscar prompt" box. That input is
    // rendered up to three times and shown one per breakpoint, is a controlled
    // React input, and filters client-side — three dependencies this sweep does
    // not need. The write-project holds a handful of prompts, so scanning the
    // rendered list directly is both simpler and strictly more reliable.
    const row = page.getByText(PILOT_TEST_PROMPT_MARKER, { exact: false }).first();

    if (!(await row.isVisible().catch(() => false))) {
      if (deleted === 0) {
        // Nothing found on the first pass is the one case worth photographing:
        // either the project genuinely has no test prompts (fine) or the list
        // is not rendering as expected (a finding). Without this the caller
        // only ever sees "swept 0" with no way to tell which.
        await captureStep(page, `sweep-found-nothing-pass-${i + 1}`);
      }
      break;
    }

    await row.click();

    // Two different elements carry role="dialog" here — the prompt drawer
    // (.prompt-drawer) and the delete confirmation (.modal-overlay/.modal-card).
    // getByRole("dialog") matches both once the modal opens, so target the
    // classes explicitly rather than letting strict mode fail on the ambiguity.
    const drawer = page.locator(".prompt-drawer");
    await expect(drawer, "el panel del prompt no se abrió al hacer clic en la fila").toBeVisible();

    await drawer.getByLabel("Borrar prompt").click();

    const confirm = page.locator(".modal-card");
    await expect(confirm, "no apareció el modal de confirmación de borrado").toBeVisible();
    await confirm.getByRole("button", { name: /^borrar prompt$/i }).click();

    // DeletePromptButton's onDeleted closes the drawer; wait for that rather
    // than a fixed sleep so the next pass starts from a settled list.
    await expect(drawer).toBeHidden({ timeout: 15_000 });
    deleted += 1;
  }

  return deleted;
}

/**
 * The invariant that actually matters after cleanup: the write-project carries
 * no pilot debris at all.
 *
 * `sweepTestPrompts` returning a positive count is not the same claim — a run
 * once deleted one prompt, reported success, and left two behind. Asserting the
 * end state instead of the action is what makes "cleaned up" mean cleaned up.
 */
export async function assertNoTestPromptsRemain(page: Page, projectId: string): Promise<void> {
  await page.goto(`/dashboard/projects/${projectId}/prompts?pilot=verify-${Date.now()}`, {
    waitUntil: "domcontentloaded"
  });
  await waitForContent(page, [
    () => page.getByRole("button", { name: /añadir prompts/i }).first().isVisible(),
    () => page.getByText(/no hay prompts activos/i).isVisible()
  ]);

  const remaining = await page.getByText(PILOT_TEST_PROMPT_MARKER, { exact: false }).count();
  if (remaining > 0) {
    await captureStep(page, "cleanup-left-debris");
    throw new Error(
      `La limpieza dejó ${remaining} prompt(s) de prueba en el proyecto de escritura. ` +
        "Cada pasada consume cupo del plan, así que esto no puede darse por bueno."
    );
  }
}

/**
 * Hard safety assertions the write journey checks immediately before the one
 * irreversible-ish action it takes (submitting the new prompt, which
 * synchronously launches a real scan). Centralised here so every write
 * journey added later goes through the same gate instead of re-deriving it.
 */
export function assertSingleManualPromptDraft(draftCount: number): void {
  if (draftCount !== 1) {
    throw new Error(
      `Refusing to submit: expected exactly 1 draft prompt, found ${draftCount}. ` +
        "The entire cost cap for this journey depends on adding exactly one " +
        "prompt at a time (add-prompts-button.tsx launches a scan scoped to " +
        "only the newly-created prompts) — never raise this without redesigning " +
        "the cost guard first."
    );
  }
}
