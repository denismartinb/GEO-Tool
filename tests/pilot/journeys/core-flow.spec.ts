import { expect, test } from "@playwright/test";
import { assertPageIsHealthy, captureInteraction, resolveProjectId, visitAsUser } from "../support/journey";

/**
 * UX-PILOT-1 read-only journey over the core flow surfaces.
 *
 * SCOPE GUARD — this journey is strictly read-only. It navigates by URL and
 * asserts on what renders. It must never:
 *   - launch a scan (real cost against Gemini / OpenAI / Anthropic),
 *   - create, rename, or delete a project,
 *   - submit any form that writes to Supabase.
 * Write journeys are a separate, separately-approved phase (UX-PILOT-2).
 * See `docs/agentic-user-pilot.md`.
 */

test.describe.configure({ mode: "serial" });

let cachedProjectId: string | undefined;

async function projectId(page: Parameters<typeof resolveProjectId>[0]): Promise<string> {
  cachedProjectId ??= await resolveProjectId(page);
  return cachedProjectId;
}

test("dashboard home renders for a logged-in user", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/dashboard", "dashboard");
  assertPageIsHealthy(findings);
});

test("projects list renders at least one project", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/dashboard/projects", "projects-list");
  assertPageIsHealthy(findings);

  await expect(
    page.locator('a[href^="/dashboard/projects/"]').first(),
    "pilot account shows no project — seed it before trusting this run"
  ).toBeVisible();
});

test("project overview renders real scan data", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(page, testInfo, `/dashboard/projects/${id}`, "overview");
  assertPageIsHealthy(findings);
});

test("prompts screen renders", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${id}/prompts`,
    "prompts"
  );
  assertPageIsHealthy(findings);
});

test("competitors screen renders", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${id}/competitors`,
    "competitors"
  );
  assertPageIsHealthy(findings);
});

test("recommendations screen renders", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${id}/recommendations`,
    "recommendations"
  );
  assertPageIsHealthy(findings);
});

test("scan history screen renders", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(page, testInfo, `/dashboard/projects/${id}/runs`, "runs");
  assertPageIsHealthy(findings);
});

test("citations screen renders", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${id}/citations`,
    "citations"
  );
  assertPageIsHealthy(findings);
});

/**
 * Real proof, not a claim: hovers/clicks and ASSERTS the revealed element
 * appears (Playwright fails the test otherwise), then captures that exact
 * mid-interaction state — a tooltip bubble and an expanded evidence panel
 * that a plain page-load screenshot can never show. Added 2026-08-02 after
 * the founder asked for evidence the click-to-expand/tooltip behavior
 * actually works, not just that the trigger icons render.
 */
test("citations KPI tooltip and row expand actually work, not just render their triggers", async ({
  page
}, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${id}/citations`,
    "citations"
  );
  assertPageIsHealthy(findings);

  // 1. KPI tooltip: hover reveals the bubble (pure CSS :hover, no JS).
  const infoTip = page.locator(".cit2-kpis .info-tip").first();
  await expect(infoTip, "no info-tip icon next to the KPI strip").toBeVisible();
  await infoTip.hover();
  await expect(
    page.locator(".cit2-kpis .info-tip-bubble").first(),
    "hovering the KPI info-tip did not reveal its tooltip bubble"
  ).toBeVisible();
  await captureInteraction(page, testInfo, "citations-tooltip-open");

  // 2. Full list row expands to show the prompt/evidence panel on click.
  const firstRow = page.locator(".cit2-rowmain").first();
  await expect(firstRow, "full citation list is empty — cannot verify row expand").toBeVisible();
  await firstRow.click();
  await expect(
    page.locator(".cit2-row.open .cit2-detail").first(),
    "clicking a citation row did not open its detail panel"
  ).toBeVisible();
  await captureInteraction(page, testInfo, "citations-row-expanded");

  // 3. Opportunities row must behave identically (founder request,
  //    2026-08-01) — same click, same panel, on the other table.
  const firstOppRow = page.locator(".cit2-opp-row").first();
  if ((await firstOppRow.count()) > 0) {
    await firstOppRow.click();
    await expect(
      page.locator(".cit2-opp-item.open .cit2-detail").first(),
      "clicking an opportunities row did not open its detail panel"
    ).toBeVisible();
    await captureInteraction(page, testInfo, "citations-opportunity-expanded");
  }
});
