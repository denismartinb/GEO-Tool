import { expect, type Page, test } from "@playwright/test";
import { assertPageIsHealthy, visitAsUser } from "../support/journey";

/**
 * GROWTH-2 Fase 2.3 read-only journey over the new /docs surface (public
 * product documentation, first slice: index + 4 pages — kept in sync by
 * hand with lib/docs/nav.ts, same pattern public-pages.spec.ts already
 * uses for BLOG_SLUGS rather than importing app code into the Playwright
 * runtime).
 *
 * SCOPE GUARD — same as core-flow.spec.ts and public-pages.spec.ts: strictly
 * read-only, navigates by URL, never submits a form or triggers a scan.
 * These pages are public — no auth required to view them.
 */

const SITE_URL = "https://www.genscore.es";

const DOCS_SLUGS = [
  "empezar/primer-escaneo",
  "informes/overview",
  "metodologia/geo-score",
  "planes-y-limites"
];

async function assertCanonical(page: Page, expectedPath: string): Promise<void> {
  const href = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(href, `canonical ausente en ${expectedPath}`).toBe(`${SITE_URL}${expectedPath}`);
}

test.describe.configure({ mode: "serial" });

test("/docs (índice) renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/docs", "docs-index");
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/docs");
});

for (const slug of DOCS_SLUGS) {
  test(`/docs/${slug} renders, has its own canonical, and highlights itself in the sidebar`, async ({
    page
  }, testInfo) => {
    const findings = await visitAsUser(page, testInfo, `/docs/${slug}`, `docs-${slug}`);
    assertPageIsHealthy(findings);
    await assertCanonical(page, `/docs/${slug}`);
    await expect(page.locator(`a.active[href="/docs/${slug}"]`)).toBeVisible();
  });
}
