# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/public-pages.spec.ts >> blog cluster pillar page for an empty cluster shows an honest placeholder, not fake content: sectores
- Location: tests/pilot/journeys/public-pages.spec.ts:80:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/todavía no hay artículos/i)
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByText(/todavía no hay artículos/i)

```

```yaml
- navigation:
  - link "Genscore":
    - /url: /
    - img "Genscore"
  - link "Qué es GEO":
    - /url: /geo
  - link "Blog":
    - /url: /blog
  - link "Precios":
    - /url: /pricing
  - link "Iniciar sesión":
    - /url: /login
  - link "Prueba gratis":
    - /url: /signup
- paragraph:
  - link "Blog":
    - /url: /blog
- heading "GEO por sector" [level=1]
- paragraph: GEO aplicado a ecommerce, SaaS y agencias.
- paragraph: Las reglas del GEO son las mismas para todos, pero la pregunta que hace un comprador no se parece en nada a la que hace un comité de compra de software. Un cliente de ecommerce pregunta por una decisión con presupuesto y restricción —"un regalo para alguien que empieza a correr, menos de 60 euros"— y recibe dos o tres nombres. Un comprador B2B hace una secuencia larga de preguntas antes de pedir una demo, y ninguna de ellas menciona todavía a un proveedor. Medir lo mismo en los dos casos da un número que no significa nada.
- paragraph: "Esta sección traduce la metodología a cada sector: qué preguntas representan de verdad a sus clientes, qué fuentes cita el modelo en ese mercado, y cuál es la palanca que rinde primero. Empieza por ecommerce, donde la lista corta de marcas es literalmente corta y el trabajo útil está casi todo fuera de tu propia web."
- 'link "GEO para ecommerce: cómo aparecer cuando la IA recomienda productos Una respuesta de IA solo nombra dos o tres tiendas. Qué mover primero si vendes online, y qué no sabemos todavía. 5 de agosto de 2026"':
  - /url: /blog/geo-para-ecommerce
  - 'heading "GEO para ecommerce: cómo aparecer cuando la IA recomienda productos" [level=2]'
  - paragraph: Una respuesta de IA solo nombra dos o tres tiendas. Qué mover primero si vendes online, y qué no sabemos todavía.
  - paragraph: 5 de agosto de 2026
- contentinfo:
  - link "Genscore":
    - /url: /
    - img "Genscore"
  - link "Producto":
    - /url: /#producto
  - link "Qué es GEO":
    - /url: /geo
  - link "Precios":
    - /url: /pricing
  - link "Blog":
    - /url: /blog
  - link "Privacidad":
    - /url: /privacidad
  - link "Términos":
    - /url: /terminos
  - text: © 2026 GenScore · Generative Engine Optimization para empresas y agencias.
- alert
```

# Test source

```ts
  1   | import { expect, type Page, test } from "@playwright/test";
  2   | import { assertPageIsHealthy, visitAsUser } from "../support/journey";
  3   | 
  4   | /**
  5   |  * GROWTH-2 Fase 2.1 read-only journey over the new public/SEO surfaces:
  6   |  * the blog (index + 5 posts), /geo, and the legal pages, plus /feed.xml.
  7   |  *
  8   |  * SCOPE GUARD — same as core-flow.spec.ts: strictly read-only, navigates by
  9   |  * URL, never submits a form or triggers a scan. All pages here are public
  10  |  * (no auth required to view them); the journey still runs after the "auth"
  11  |  * project because it shares the "mobile"/"tablet"/"desktop" Playwright
  12  |  * projects with core-flow.spec.ts (see playwright.config.ts) — an
  13  |  * authenticated session present in the browser context is harmless for a
  14  |  * public page and is exactly what would surface a real bug if one of these
  15  |  * routes ever started bouncing a logged-in visitor to /login unexpectedly.
  16  |  *
  17  |  * Does NOT cover `/` or `/pricing`: both are client components that cannot
  18  |  * export per-page `metadata` yet (see docs/launch-plan.md, Fase 7b ledger) —
  19  |  * add them here once a future phase gives them their own canonical.
  20  |  */
  21  | 
  22  | const SITE_URL = "https://www.genscore.es";
  23  | 
  24  | const BLOG_POSTS = [
  25  |   "que-es-el-geo-score",
  26  |   "que-es-geo-generative-engine-optimization",
  27  |   "como-elegir-prompts-monitorizar-marca-ia",
  28  |   "como-elegir-competidores-analisis-geo",
  29  |   "genscore-vs-herramientas-geo",
  30  |   "llms-txt-guia-practica",
  31  |   "como-conseguir-que-chatgpt-te-cite"
  32  | ] as const;
  33  | 
  34  | /** Asserts the page's own <link rel="canonical"> matches its expected, absolute URL exactly (no trailing slash, no query string). */
  35  | async function assertCanonical(page: Page, expectedPath: string): Promise<void> {
  36  |   const href = await page.locator('link[rel="canonical"]').getAttribute("href");
  37  |   expect(href, `canonical ausente en ${expectedPath}`).toBe(`${SITE_URL}${expectedPath}`);
  38  | }
  39  | 
  40  | test.describe.configure({ mode: "serial" });
  41  | 
  42  | const BLOG_CLUSTER_TITLES = [
  43  |   "Fundamentos GEO",
  44  |   "Metodología y medición",
  45  |   "Playbooks de ejecución",
  46  |   "GEO por sector"
  47  | ];
  48  | 
  49  | test("blog index renders and has its own canonical", async ({ page }, testInfo) => {
  50  |   const findings = await visitAsUser(page, testInfo, "/blog", "blog-index");
  51  |   assertPageIsHealthy(findings);
  52  |   await assertCanonical(page, "/blog");
  53  |   await expect(page).toHaveTitle(/— Genscore$/);
  54  |   // GROWTH-2 Fase 2.5: the index groups posts into clusters instead of one
  55  |   // flat list — every cluster heading must render, even the still-empty
  56  |   // ones (which should show their "Próximamente" placeholder, not vanish).
  57  |   for (const title of BLOG_CLUSTER_TITLES) {
  58  |     await expect(page.getByRole("heading", { name: title })).toBeVisible();
  59  |   }
  60  | });
  61  | 
  62  | // GROWTH-2 Fase 2.9 (B1b): pillar pages for the 3 populated clusters — not
  63  | // "sectores", which has zero posts and is deliberately excluded from the
  64  | // sitemap (see app/sitemap.ts), though the route itself still exists.
  65  | const BLOG_PILLAR_CLUSTERS = ["fundamentos", "medicion", "playbooks"] as const;
  66  | 
  67  | for (const cluster of BLOG_PILLAR_CLUSTERS) {
  68  |   test(`blog cluster pillar page renders and has its own canonical: ${cluster}`, async ({ page }, testInfo) => {
  69  |     const findings = await visitAsUser(page, testInfo, `/blog/${cluster}`, `blog-pillar-${cluster}`);
  70  |     assertPageIsHealthy(findings);
  71  |     await assertCanonical(page, `/blog/${cluster}`);
  72  |   });
  73  | }
  74  | 
  75  | // GROWTH-2 Fase 2.9: "sectores" carries the honesty burden of this slice
  76  | // (zero posts — it must show a real "no hay artículos" state, never a
  77  | // fabricated one) and QA flagged it as the page most worth a pilot eyeball,
  78  | // so it gets its own dedicated check rather than riding along with the
  79  | // populated clusters above.
  80  | test("blog cluster pillar page for an empty cluster shows an honest placeholder, not fake content: sectores", async ({
  81  |   page
  82  | }, testInfo) => {
  83  |   const findings = await visitAsUser(page, testInfo, "/blog/sectores", "blog-pillar-sectores");
  84  |   assertPageIsHealthy(findings);
  85  |   await assertCanonical(page, "/blog/sectores");
> 86  |   await expect(page.getByText(/todavía no hay artículos/i)).toBeVisible();
      |                                                             ^ Error: expect(locator).toBeVisible() failed
  87  | });
  88  | 
  89  | for (const slug of BLOG_POSTS) {
  90  |   test(`blog post renders and has its own canonical: ${slug}`, async ({ page }, testInfo) => {
  91  |     const findings = await visitAsUser(page, testInfo, `/blog/${slug}`, `blog-${slug}`);
  92  |     assertPageIsHealthy(findings);
  93  |     await assertCanonical(page, `/blog/${slug}`);
  94  |     await expect(page).toHaveTitle(/— Genscore$/);
  95  |     // GROWTH-2 Fase 2.5: every post must link to at least one sibling in its
  96  |     // cluster — the internal-linking rule in docs/content-strategy.md §4.3.
  97  |     await expect(page.locator(".blog-related a").first()).toBeVisible();
  98  |   });
  99  | }
  100 | 
  101 | test("/geo renders and has its own canonical", async ({ page }, testInfo) => {
  102 |   const findings = await visitAsUser(page, testInfo, "/geo", "geo");
  103 |   assertPageIsHealthy(findings);
  104 |   await assertCanonical(page, "/geo");
  105 | });
  106 | 
  107 | test("/privacidad renders and has its own canonical", async ({ page }, testInfo) => {
  108 |   const findings = await visitAsUser(page, testInfo, "/privacidad", "privacidad");
  109 |   assertPageIsHealthy(findings);
  110 |   await assertCanonical(page, "/privacidad");
  111 | });
  112 | 
  113 | test("/cookies renders and has its own canonical", async ({ page }, testInfo) => {
  114 |   const findings = await visitAsUser(page, testInfo, "/cookies", "cookies");
  115 |   assertPageIsHealthy(findings);
  116 |   await assertCanonical(page, "/cookies");
  117 | });
  118 | 
  119 | test("/terminos renders and has its own canonical", async ({ page }, testInfo) => {
  120 |   const findings = await visitAsUser(page, testInfo, "/terminos", "terminos");
  121 |   assertPageIsHealthy(findings);
  122 |   await assertCanonical(page, "/terminos");
  123 | });
  124 | 
  125 | test("/glosario renders and has its own canonical", async ({ page }, testInfo) => {
  126 |   const findings = await visitAsUser(page, testInfo, "/glosario", "glosario");
  127 |   assertPageIsHealthy(findings);
  128 |   await assertCanonical(page, "/glosario");
  129 | });
  130 | 
  131 | // GROWTH-2 Fase 2.6b: each term now has its own page (/glosario/<slug>)
  132 | // instead of only an anchor on the index. Two representative terms, not all
  133 | // 15 — they all render through the same dynamic route/component.
  134 | const GLOSSARY_TERM_SLUGS = ["geo", "geo-score"] as const;
  135 | 
  136 | for (const slug of GLOSSARY_TERM_SLUGS) {
  137 |   test(`glossary term page renders and has its own canonical: ${slug}`, async ({ page }, testInfo) => {
  138 |     const findings = await visitAsUser(page, testInfo, `/glosario/${slug}`, `glosario-${slug}`);
  139 |     assertPageIsHealthy(findings);
  140 |     await assertCanonical(page, `/glosario/${slug}`);
  141 |     // Internal-linking rule (content-strategy.md §4.3): every term page
  142 |     // must link onward to at least one related term/doc/post.
  143 |     await expect(page.locator(".glossary-related a").first()).toBeVisible();
  144 |   });
  145 | }
  146 | 
  147 | test("/comparativas/genscore-vs-otterly renders and has its own canonical", async ({ page }, testInfo) => {
  148 |   const findings = await visitAsUser(
  149 |     page,
  150 |     testInfo,
  151 |     "/comparativas/genscore-vs-otterly",
  152 |     "comparativas-genscore-vs-otterly"
  153 |   );
  154 |   assertPageIsHealthy(findings);
  155 |   await assertCanonical(page, "/comparativas/genscore-vs-otterly");
  156 | });
  157 | 
  158 | test("/comparativas/genscore-vs-peec-ai renders and has its own canonical", async ({ page }, testInfo) => {
  159 |   const findings = await visitAsUser(
  160 |     page,
  161 |     testInfo,
  162 |     "/comparativas/genscore-vs-peec-ai",
  163 |     "comparativas-genscore-vs-peec-ai"
  164 |   );
  165 |   assertPageIsHealthy(findings);
  166 |   await assertCanonical(page, "/comparativas/genscore-vs-peec-ai");
  167 | });
  168 | 
  169 | test("/comparativas renders and has its own canonical", async ({ page }, testInfo) => {
  170 |   const findings = await visitAsUser(page, testInfo, "/comparativas", "comparativas-index");
  171 |   assertPageIsHealthy(findings);
  172 |   await assertCanonical(page, "/comparativas");
  173 | });
  174 | 
  175 | test("/comparativas/mejores-herramientas-geo-en-espanol renders and has its own canonical", async ({ page }, testInfo) => {
  176 |   const findings = await visitAsUser(
  177 |     page,
  178 |     testInfo,
  179 |     "/comparativas/mejores-herramientas-geo-en-espanol",
  180 |     "comparativas-mejores-herramientas-geo"
  181 |   );
  182 |   assertPageIsHealthy(findings);
  183 |   await assertCanonical(page, "/comparativas/mejores-herramientas-geo-en-espanol");
  184 | });
  185 | 
  186 | /**
```