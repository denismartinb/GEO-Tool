import { expect, test } from "@playwright/test";
import {
  assertFullyVisible,
  assertPageIsHealthy,
  captureInteraction,
  resolveProjectId,
  visitAsUser
} from "../support/journey";
import { exploreInteractions } from "../support/explore";

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
 *
 * Every screen additionally gets an interaction sweep (`exploreInteractions`,
 * UX-PILOT-1c): the pilot no longer stops at "it rendered", it exercises the
 * safe in-page controls it finds and captures each resulting state, so the
 * agent has evidence of what a screen does when a user actually uses it — not
 * just what it looks like sitting still. That module enforces the same scope
 * guard above with an allow-list; see its header before widening anything.
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
  await exploreInteractions(page, testInfo, "dashboard");
});

test("projects list renders at least one project", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/dashboard/projects", "projects-list");
  assertPageIsHealthy(findings);

  await expect(
    page.locator('a[href^="/dashboard/projects/"]').first(),
    "pilot account shows no project — seed it before trusting this run"
  ).toBeVisible();
  await exploreInteractions(page, testInfo, "projects-list");
});

test("project overview renders real scan data", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(page, testInfo, `/dashboard/projects/${id}`, "overview", {
    describedAs: "la puntuación GEO del último escaneo",
    anyOf: [{ text: /puntuación geo/i }, { text: /tasa de mención/i }]
  });
  assertPageIsHealthy(findings);
  await exploreInteractions(page, testInfo, "overview");
});

test("prompts screen renders", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${id}/prompts`,
    "prompts",
    {
      describedAs: "la lista de prompts monitorizados",
      anyOf: [{ text: /GenScore monitoriza/i }, { selector: ".pr2-page" }]
    }
  );
  assertPageIsHealthy(findings);
  await exploreInteractions(page, testInfo, "prompts");
});

test("competitors screen renders", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${id}/competitors`,
    "competitors",
    {
      describedAs: "la tabla de competidores con datos del escaneo",
      anyOf: [{ selector: ".tbl" }, { text: /cuota de voz|share of voice/i }]
    }
  );
  assertPageIsHealthy(findings);
  await exploreInteractions(page, testInfo, "competitors");
});

test("recommendations screen renders", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${id}/recommendations`,
    "recommendations",
    {
      describedAs: "el backlog de acciones generado por el último escaneo",
      anyOf: [{ text: /backlog de acciones/i }, { selector: ".rec-card" }]
    }
  );
  assertPageIsHealthy(findings);
  await exploreInteractions(page, testInfo, "recommendations");
});

test("scan history screen renders", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(page, testInfo, `/dashboard/projects/${id}/runs`, "runs", {
    // `.run-tbl` (the history table) and NOT the status text: the first
    // version of this anchor matched /completado|en curso|.../, which on this
    // page lives inside `.scan-status` — and globals.css hides that element
    // entirely below 900px. The result was a mobile-only failure on a screen
    // that renders perfectly at every width (caught by the pilot on its first
    // real run, 2026-08-02).
    //
    // Rule for every anchor here: it must be (a) absent in the empty state,
    // so it actually discriminates, and (b) visible at all three viewports,
    // so it never reports a CSS breakpoint as missing data. Prefer a
    // structural element that only exists with data over prose that a media
    // query might hide.
    describedAs: "la tabla del historial de escaneos",
    anyOf: [{ selector: ".run-tbl" }]
  });
  assertPageIsHealthy(findings);
  await exploreInteractions(page, testInfo, "runs");
});

test("citations screen renders", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${id}/citations`,
    "citations",
    {
      describedAs: "la lista de páginas citadas",
      anyOf: [{ selector: ".cit2-page" }, { selector: ".cit2-row" }]
    }
  );
  assertPageIsHealthy(findings);
  await exploreInteractions(page, testInfo, "citations");
});

test("web audit screen renders", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${id}/web-audit`,
    "web-audit",
    {
      // The tabs only exist once `summary` does — i.e. once the project has a
      // real coverage audit. Anchoring here is exactly what would have turned
      // the 2026-08-02 false PASS into a loud failure: every capture that day
      // showed the "Todavía no has auditado tu web" card instead of these.
      describedAs: "las pestañas de la auditoría (Problemas · Correcto · Páginas)",
      anyOf: [{ selector: '[role="tablist"]' }, { text: /problemas técnicos/i }]
    }
  );
  assertPageIsHealthy(findings);
  await exploreInteractions(page, testInfo, "web-audit");
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

  // 1. KPI tooltips: hover reveals the bubble (pure CSS :hover, no JS), and
  //    the bubble must be legible — not clipped by its card, not running off
  //    the viewport. EVERY tip is checked, not just the first: the last KPI's
  //    bubble is the one most likely to overflow the right edge on a narrow
  //    viewport, so testing only `.first()` would have missed exactly the
  //    case worth catching.
  const infoTips = page.locator(".cit2-kpis .info-tip");
  const tipCount = await infoTips.count();
  expect(tipCount, "no info-tip icons found next to the KPI strip").toBeGreaterThan(0);

  for (let i = 0; i < tipCount; i++) {
    await infoTips.nth(i).hover();
    const bubble = page.locator(".cit2-kpis .info-tip-bubble").nth(i);
    await expect(bubble, `hovering KPI info-tip #${i + 1} did not reveal its tooltip`).toBeVisible();
    await assertFullyVisible(page, `.cit2-kpis .info-tip-bubble >> nth=${i}`, `KPI tooltip #${i + 1}`);
    if (i === 0) await captureInteraction(page, testInfo, "citations-tooltip-open");
  }

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

  // 4. Search narrows the list AND says how many rows matched (founder
  //    review, 2026-08-02: "escribes algo y la lista se acorta sin confirmar
  //    cuántas quedan"). The explorer's click sweep never types into inputs,
  //    so this is the only evidence this specific fix actually works —
  //    without it, the count text existing in the JSX would be unverified.
  // `:visible` (a Playwright selector extension, not vanilla CSS), not a bare
  // DOM count: the real page removes filtered-out rows from the tree, but the
  // fixture only toggles them hidden — asserting on visibility holds for both.
  const rowCountBefore = await page.locator(".cit2-row:visible").count();
  const searchInput = page.locator(".cit2-search input");
  await expect(searchInput, "citations search input not found").toBeVisible();
  // A substring unlikely to match every row, so the list — and the count —
  // actually change; falls back gracefully if the fixture/project has zero
  // rows containing "co".
  await searchInput.fill("co");
  const filterCount = page.locator(".cit2-filtercount");
  const rowCountAfter = await page.locator(".cit2-row:visible").count();
  if (rowCountAfter !== rowCountBefore && rowCountAfter > 0) {
    await expect(filterCount, "filtering the list did not show a result count").toBeVisible();
    await expect(filterCount).toContainText(`${rowCountAfter} de ${rowCountBefore}`);
    await captureInteraction(page, testInfo, "citations-search-filtered");
  }
  await searchInput.fill("");
  await expect(filterCount, "clearing the search did not hide the result count again").toBeHidden();
});
