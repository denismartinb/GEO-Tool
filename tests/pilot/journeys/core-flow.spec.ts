import { expect, test } from "@playwright/test";
import { assertPageIsHealthy, resolveProjectId, visitAsUser } from "../support/journey";

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
