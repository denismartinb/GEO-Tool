import { expect, type Page, test } from "@playwright/test";
import { assertPageIsHealthy, visitAsUser } from "../support/journey";

/**
 * GROWTH-2 Fase 2.1 read-only journey over the new public/SEO surfaces:
 * the blog (index + 5 posts), /geo, and the legal pages, plus /feed.xml.
 *
 * SCOPE GUARD — same as core-flow.spec.ts: strictly read-only, navigates by
 * URL, never submits a form or triggers a scan. All pages here are public
 * (no auth required to view them); the journey still runs after the "auth"
 * project because it shares the "mobile"/"tablet"/"desktop" Playwright
 * projects with core-flow.spec.ts (see playwright.config.ts) — an
 * authenticated session present in the browser context is harmless for a
 * public page and is exactly what would surface a real bug if one of these
 * routes ever started bouncing a logged-in visitor to /login unexpectedly.
 *
 * Does NOT cover `/` or `/pricing`: both are client components that cannot
 * export per-page `metadata` yet (see docs/launch-plan.md, Fase 7b ledger) —
 * add them here once a future phase gives them their own canonical.
 */

const SITE_URL = "https://www.genscore.es";

const BLOG_POSTS = [
  "que-es-el-geo-score",
  "que-es-geo-generative-engine-optimization",
  "como-elegir-prompts-monitorizar-marca-ia",
  "como-elegir-competidores-analisis-geo",
  "genscore-vs-herramientas-geo",
  "llms-txt-guia-practica",
  "como-conseguir-que-chatgpt-te-cite"
] as const;

/** Asserts the page's own <link rel="canonical"> matches its expected, absolute URL exactly (no trailing slash, no query string). */
async function assertCanonical(page: Page, expectedPath: string): Promise<void> {
  const href = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(href, `canonical ausente en ${expectedPath}`).toBe(`${SITE_URL}${expectedPath}`);
}

test.describe.configure({ mode: "serial" });

const BLOG_CLUSTER_TITLES = [
  "Fundamentos GEO",
  "Metodología y medición",
  "Playbooks de ejecución",
  "GEO por sector"
];

test("blog index renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/blog", "blog-index");
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/blog");
  await expect(page).toHaveTitle(/— Genscore$/);
  // GROWTH-2 Fase 2.5: the index groups posts into clusters instead of one
  // flat list — every cluster heading must render, even the still-empty
  // ones (which should show their "Próximamente" placeholder, not vanish).
  for (const title of BLOG_CLUSTER_TITLES) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
});

for (const slug of BLOG_POSTS) {
  test(`blog post renders and has its own canonical: ${slug}`, async ({ page }, testInfo) => {
    const findings = await visitAsUser(page, testInfo, `/blog/${slug}`, `blog-${slug}`);
    assertPageIsHealthy(findings);
    await assertCanonical(page, `/blog/${slug}`);
    await expect(page).toHaveTitle(/— Genscore$/);
    // GROWTH-2 Fase 2.5: every post must link to at least one sibling in its
    // cluster — the internal-linking rule in docs/content-strategy.md §4.3.
    await expect(page.locator(".blog-related a").first()).toBeVisible();
  });
}

test("/geo renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/geo", "geo");
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/geo");
});

test("/privacidad renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/privacidad", "privacidad");
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/privacidad");
});

test("/cookies renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/cookies", "cookies");
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/cookies");
});

test("/terminos renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/terminos", "terminos");
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/terminos");
});

test("/glosario renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/glosario", "glosario");
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/glosario");
});

// GROWTH-2 Fase 2.6b: each term now has its own page (/glosario/<slug>)
// instead of only an anchor on the index. Two representative terms, not all
// 15 — they all render through the same dynamic route/component.
const GLOSSARY_TERM_SLUGS = ["geo", "geo-score"] as const;

for (const slug of GLOSSARY_TERM_SLUGS) {
  test(`glossary term page renders and has its own canonical: ${slug}`, async ({ page }, testInfo) => {
    const findings = await visitAsUser(page, testInfo, `/glosario/${slug}`, `glosario-${slug}`);
    assertPageIsHealthy(findings);
    await assertCanonical(page, `/glosario/${slug}`);
    // Internal-linking rule (content-strategy.md §4.3): every term page
    // must link onward to at least one related term/doc/post.
    await expect(page.locator(".glossary-related a").first()).toBeVisible();
  });
}

test("/comparativas/genscore-vs-otterly renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(
    page,
    testInfo,
    "/comparativas/genscore-vs-otterly",
    "comparativas-genscore-vs-otterly"
  );
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/comparativas/genscore-vs-otterly");
});

test("/comparativas/genscore-vs-peec-ai renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(
    page,
    testInfo,
    "/comparativas/genscore-vs-peec-ai",
    "comparativas-genscore-vs-peec-ai"
  );
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/comparativas/genscore-vs-peec-ai");
});

test("/feed.xml responds with a valid RSS 2.0 document", async ({ page }) => {
  const response = await page.request.get("/feed.xml");
  expect(response.status(), "/feed.xml no respondió 200").toBe(200);

  const contentType = response.headers()["content-type"] ?? "";
  expect(contentType, "/feed.xml no declaró Content-Type XML").toContain("xml");

  const body = await response.text();
  expect(body, "/feed.xml no contiene el elemento <rss>").toContain('<rss version="2.0">');
  expect(body, "/feed.xml no enlaza ningún post del blog").toContain(`${SITE_URL}/blog/`);
});
