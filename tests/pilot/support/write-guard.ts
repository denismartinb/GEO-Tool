import { type Page, expect } from "@playwright/test";

/**
 * Every prompt the write journeys create carries this marker, in the position
 * a founder would notice first if one ever leaked into view. It exists so
 * `sweepTestPrompts` can find and remove pilot debris without touching a
 * single real prompt, and so a human looking at the write-project's prompt
 * list immediately understands where an unfamiliar row came from.
 */
export const PILOT_TEST_PROMPT_MARKER = "[PILOT-TEST]";

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
    await page.goto(`/dashboard/projects/${projectId}/prompts`, { waitUntil: "domcontentloaded" });

    const search = page.getByLabel("Buscar prompt").first();
    await search.fill(PILOT_TEST_PROMPT_MARKER);
    // The list filters client-side with no loading state to await; give React
    // a beat to re-render before reading the result.
    await page.waitForTimeout(300);

    const row = page.getByText(PILOT_TEST_PROMPT_MARKER, { exact: false }).first();
    if (!(await row.isVisible().catch(() => false))) break;

    await row.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer, "prompt drawer did not open for a matched test prompt").toBeVisible();

    await drawer.getByLabel("Borrar prompt").click();
    await page.getByRole("button", { name: /^borrar prompt$/i }).click();

    // DeletePromptButton's onDeleted closes the drawer; wait for that instead
    // of a fixed sleep so the next iteration starts from a settled list.
    await expect(drawer).toBeHidden({ timeout: 10_000 });
    deleted += 1;
  }

  return deleted;
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
