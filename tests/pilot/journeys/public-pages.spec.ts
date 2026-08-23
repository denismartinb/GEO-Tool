import { expect, type Page, test } from "@playwright/test";
import { assertPageIsHealthy, captureInteraction, visitAsUser } from "../support/journey";

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

// Slug -> cluster. Esta lista se mantiene a mano (el spec de Playwright no
// importa código de la app a propósito), así que **al publicar un artículo hay
// que añadirlo aquí**: si no, ese artículo no se pilota y nadie se entera.
// GROWTH-3 lo demostró — `geo-para-ecommerce` se publicó y esta lista se quedó
// atrás.
//
// El cluster va al lado del slug para que "¿está vacío este cluster?" se
// DERIVE de los datos en vez de escribirse aparte. Esa duplicación es la que
// hizo fallar al pilot el 2026-08-05 en las tres viewports.
const BLOG_POSTS_BY_CLUSTER: Record<string, string> = {
  "que-es-el-geo-score": "medicion",
  "que-es-geo-generative-engine-optimization": "fundamentos",
  "como-elegir-prompts-monitorizar-marca-ia": "medicion",
  "como-elegir-competidores-analisis-geo": "medicion",
  "genscore-vs-herramientas-geo": "fundamentos",
  "llms-txt-guia-practica": "playbooks",
  "como-conseguir-que-chatgpt-te-cite": "playbooks",
  "geo-para-ecommerce": "sectores",
  "geo-para-saas-b2b": "sectores",
  "geo-para-agencias": "sectores",
  "que-es-una-auditoria-geo": "playbooks",
  // S1 se publicó el 2026-08-10 y esta lista se quedó atrás: el piloto llevaba
  // tres días sin abrirlo nunca. Lo mismo que le pasó a `geo-para-ecommerce` y
  // a `/comparativas/genscore-vs-profound` (log §62). Ahora hay test
  // (fixture-drift.test.ts) que contrasta este mapa contra BLOG_POSTS.
  "como-saber-si-tu-marca-aparece-en-chatgpt": "playbooks",
  // SEO-POS-1 Fase C, S6 (2026-08-13).
  "metricas-geo-que-medir": "medicion",
  // SEO-POS-1 Fase C, S7 (2026-08-14).
  "como-aparecer-en-perplexity": "playbooks",
  // SEO-POS-1 Fase C, S8 (2026-08-14).
  "como-medir-trafico-chatgpt-ga4": "medicion",
  // SEO-POS-1 Fase C, S9 (2026-08-15).
  "como-hacer-que-chatgpt-recomiende-tu-negocio": "playbooks",
  // Cluster "fundamentos" (2026-08-23): la confusión de nomenclatura GEO/AEO/SEO/LLMO.
  "geo-vs-aeo-vs-seo": "fundamentos"
};

const BLOG_POSTS = Object.keys(BLOG_POSTS_BY_CLUSTER);

const BLOG_CLUSTERS = ["fundamentos", "medicion", "playbooks", "sectores"] as const;

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
  await expect(page).toHaveTitle(/— GenScore$/);
  // GROWTH-2 Fase 2.5: the index groups posts into clusters instead of one
  // flat list — every cluster heading must render, even the still-empty
  // ones (which should show their "Próximamente" placeholder, not vanish).
  for (const title of BLOG_CLUSTER_TITLES) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
});

// GROWTH-2 Fase 2.9 (B1b), corregido en GROWTH-3: la lista de clusters
// poblados estaba escrita a mano y excluía "sectores" porque tenía cero
// artículos. Cuando el primer artículo de `sectores` se publicó (2026-08-05),
// esta lista quedó desactualizada y el pilot falló en las tres viewports por
// una aserción que ya no describía la realidad — el tercer test que caducó ese
// día por la misma causa. Ahora se deriva de los datos, así que no puede
// volver a desincronizarse.
const BLOG_PILLAR_CLUSTERS = BLOG_CLUSTERS;

for (const cluster of BLOG_PILLAR_CLUSTERS) {
  test(`blog cluster pillar page renders and has its own canonical: ${cluster}`, async ({ page }, testInfo) => {
    const findings = await visitAsUser(page, testInfo, `/blog/${cluster}`, `blog-pillar-${cluster}`);
    assertPageIsHealthy(findings);
    await assertCanonical(page, `/blog/${cluster}`);
  });
}

// La carga de honestidad de este slice: un cluster SIN artículos debe mostrar
// un estado vacío real, nunca contenido fabricado. Esa garantía sigue viva,
// pero ya no se ancla a "sectores" — se decide mirando los datos.
//
// Hasta GROWTH-3 este test iba clavado a `sectores` porque era el único
// cluster vacío. Al publicarse su primer artículo la aserción pasó a exigir un
// placeholder que, correctamente, ya no existe. La lección es la misma que dejó
// GROWTH-3 en `lib/blog/posts.test.ts`: un test que codifica un ESTADO caduca;
// uno que codifica la REGLA, no.
for (const cluster of BLOG_CLUSTERS) {
  const isEmpty = !Object.values(BLOG_POSTS_BY_CLUSTER).includes(cluster);
  if (!isEmpty) continue;

  test(`blog cluster pillar page for an empty cluster shows an honest placeholder, not fake content: ${cluster}`, async ({
    page
  }, testInfo) => {
    const findings = await visitAsUser(page, testInfo, `/blog/${cluster}`, `blog-pillar-${cluster}`);
    assertPageIsHealthy(findings);
    await assertCanonical(page, `/blog/${cluster}`);
    await expect(page.getByText(/todavía no hay artículos/i)).toBeVisible();
  });
}

for (const slug of BLOG_POSTS) {
  test(`blog post renders and has its own canonical: ${slug}`, async ({ page }, testInfo) => {
    const findings = await visitAsUser(page, testInfo, `/blog/${slug}`, `blog-${slug}`);
    assertPageIsHealthy(findings);
    await assertCanonical(page, `/blog/${slug}`);
    await expect(page).toHaveTitle(/— GenScore$/);
    // GROWTH-2 Fase 2.5: every post must link to at least one sibling in its
    // cluster — the internal-linking rule in docs/content-strategy.md §4.3.
    await expect(page.locator(".blog-related a").first()).toBeVisible();
  });
}

test("/que-es-genscore renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/que-es-genscore", "que-es-genscore");
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/que-es-genscore");
});

test("/geo renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/geo", "geo");
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/geo");
});

/**
 * FREE-CHECKER-1. Estrictamente de lectura, como el resto de este fichero:
 * visita la página y comprueba que carga, **nunca pulsa el botón**.
 *
 * Y desde la Fase B eso ya no es sólo una convención de alcance: pulsarlo
 * lanzaría una comprobación real contra ChatGPT, o sea **gastaría dinero y
 * consumiría una de las tres comprobaciones diarias de la IP del runner** en
 * cada pasada del piloto, en cada deploy de preview. El journey de escritura
 * (`--journeys write`) es el único sitio donde eso podría plantearse, y hoy no
 * está planteado.
 */
test("/gratis/aparece-mi-marca-en-chatgpt renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/gratis/aparece-mi-marca-en-chatgpt", "free-checker", {
    describedAs: "el formulario de dominio y la explicación de qué obtiene el visitante",
    anyOf: [{ selector: ".lp-hero-form" }]
  });
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/gratis/aparece-mi-marca-en-chatgpt");
});

/**
 * GENSCORE-HEADER-3, a petición del `ux-pilot` (2026-08-12). El barrido de
 * interacción sólo abre menús en pantallas de consola, así que **el cajón
 * móvil de la cabecera pública no se fotografiaba nunca**: cuando
 * GENSCORE-HEADER-2 metió el chip de cuenta ahí dentro, el piloto dio PASS sin
 * haberlo visto en 375 ni en 768, y quien lo verificó fue el fundador con su
 * teléfono. Eso es exactamente lo que el piloto existe para no delegar.
 *
 * Es también el sitio donde ya se coló un fallo real: el CTA duplicado que
 * §63 tuvo que corregir vivía justo aquí.
 *
 * Sólo corre por debajo de 900px, que es donde `.lp-burger` existe: por encima
 * el cajón no está en el DOM y el test no tendría nada que abrir.
 */
test("el cajón móvil de la cabecera pública se abre y muestra el estado de sesión", async ({
  page
}, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/geo", "geo-mobile-drawer-source");
  assertPageIsHealthy(findings);

  const burger = page.locator(".lp-burger");
  if (!(await burger.isVisible().catch(() => false))) {
    test.skip(true, "El cajón sólo existe por debajo de 900px — en escritorio no hay nada que abrir.");
    return;
  }

  await burger.click();
  const drawer = page.locator(".lp-mobnav");
  await expect(drawer).toBeVisible();

  // El piloto entra con sesión, así que aquí abajo va el chip de cuenta y NO
  // los CTA de alta. Se afirma por `data-testid` en vez de por texto: el
  // email y el plan de la cuenta piloto pueden cambiar, la existencia del
  // chip no.
  await expect(drawer.getByTestId("account-chip")).toBeVisible();
  // `button`, no `link`: los CTA del cajón son <button onClick>, así que
  // preguntar por un enlace llamado "Prueba gratis" da cero SIEMPRE y la
  // aserción no podría fallar nunca — que es peor que no tenerla.
  await expect(drawer.getByRole("button", { name: /Prueba gratis/i })).toHaveCount(0);

  await captureInteraction(page, testInfo, "geo-mobile-drawer-open");
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

test("/comparativas/genscore-vs-profound renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(
    page,
    testInfo,
    "/comparativas/genscore-vs-profound",
    "comparativas-genscore-vs-profound"
  );
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/comparativas/genscore-vs-profound");
});

test("/comparativas/alternativas-a-otterly renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(
    page,
    testInfo,
    "/comparativas/alternativas-a-otterly",
    "comparativas-alternativas-a-otterly"
  );
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/comparativas/alternativas-a-otterly");
});

test("/comparativas renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/comparativas", "comparativas-index");
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/comparativas");
});

test("/comparativas/mejores-herramientas-geo-en-espanol renders and has its own canonical", async ({ page }, testInfo) => {
  const findings = await visitAsUser(
    page,
    testInfo,
    "/comparativas/mejores-herramientas-geo-en-espanol",
    "comparativas-mejores-herramientas-geo"
  );
  assertPageIsHealthy(findings);
  await assertCanonical(page, "/comparativas/mejores-herramientas-geo-en-espanol");
});

/**
 * GROWTH-3 Fase 3.1 — verificación de enlaces contra el despliegue real.
 *
 * Regla del fundador (2026-08-03): "probar siempre todos los links". El nivel
 * estático vive en `lib/blog/article-links.test.ts` y coge enlaces a rutas
 * inexistentes antes de desplegar. Este es el segundo nivel: coge las rutas
 * que existen en el código pero fallan en el despliegue real (build roto,
 * página que revienta al renderizar, redirección mal configurada).
 *
 * SCOPE GUARD: solo peticiones GET a rutas públicas. Se descarta cualquier
 * enlace a /dashboard o /api — la cuenta piloto vive en el mismo proyecto de
 * Supabase que producción y este journey no debe tocar nada autenticado.
 */
const LINK_SCAN_PAGES = [
  "/blog",
  "/blog/llms-txt-guia-practica",
  "/glosario",
  "/glosario/geo",
  "/comparativas",
  "/comparativas/mejores-herramientas-geo-en-espanol",
  "/docs"
];

test("todos los enlaces internos del contenido publicado responden 200", async ({ page }) => {
  const targets = new Set<string>();

  for (const path of LINK_SCAN_PAGES) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${path} no cargó para escanear sus enlaces`).toBeLessThan(400);

    const hrefs = await page
      .locator('a[href^="/"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));

    for (const raw of hrefs) {
      const clean = raw.split("#")[0].split("?")[0].replace(/\/$/, "") || "/";
      if (clean.startsWith("/dashboard") || clean.startsWith("/api")) continue;
      targets.add(clean);
    }
  }

  expect(targets.size, "no se encontró ningún enlace interno que comprobar").toBeGreaterThan(5);

  const broken: string[] = [];
  for (const href of targets) {
    const res = await page.request.get(href);
    if (res.status() >= 400) broken.push(`${href} → ${res.status()}`);
  }

  expect(broken, `enlaces internos rotos: ${broken.join(", ")}`).toEqual([]);
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

/**
 * NOT-FOUND-ROCKET-1. La 404 pública dejó de ser una lista de enlaces y pasó a
 * ser una pantalla con escena a sangre completa
 * (`docs/design-reference/not-found-rocket-1/`).
 *
 * Las dos mitades que se comprueban aquí son distintas y las dos importan: que
 * la respuesta siga siendo un 404 de verdad —lo que hace que un buscador no la
 * trate como contenido— y que lo que se pinta sea la escena y no un
 * placeholder. La `ContentExpectation` ancla a la escena Y al titular: sin ella
 * esto certificaría "la página cargó", que es exactamente el pase vacío que
 * costó la Auditoría web el 2026-08-02.
 */
const MISSING_PATH = "/esta-ruta-no-existe-nunca-jamas";

/**
 * El orden importa: el test que PINTA la pantalla va primero porque este spec
 * corre en modo `serial`, así que un fallo en las cabeceras se llevaría por
 * delante las capturas y la 404 no aparecería en la tabla del piloto — que es
 * exactamente lo que pasó en la primera pasada de este PR.
 */
test("la 404 pública pinta la misión, no un texto suelto", async ({ page }, testInfo) => {
  const findings = await visitAsUser(
    page,
    testInfo,
    MISSING_PATH,
    "not-found-mission",
    {
      describedAs: "la escena del cohete y el titular de la 404, no un estado vacío",
      anyOf: [{ selector: ".nf-scene" }, { text: /no está en el mapa/i }]
    },
    // El documento responde 404 porque es una 404: sin declararlo, el harness
    // lo cuenta como "first-party request failed" y esta pantalla no puede
    // pilotarse nunca. Un 404 de un subrecurso sigue tumbando la pasada.
    { expectDocumentStatus: 404 }
  );
  assertPageIsHealthy(findings);

  // El cohete y el destino inexistente son la pantalla. Si el recorte de
  // `slice` se los come en una anchura, esto lo dice en esa anchura.
  await expect(page.locator(".nf-flight")).toBeVisible();
  await expect(page.locator(".nf-target")).toBeVisible();
  await expect(page.getByRole("heading", { name: /no está en el mapa/i })).toBeVisible();

  // La cabecera es la blanca del sitio: una instrucción explícita del fundador,
  // no un accidente de contraste.
  await expect(page.locator(".nf-page .lp-nav-wrap")).toBeVisible();

  // La escena ocupa el ancho completo, no una columna con márgenes.
  const stage = await page.locator(".nf-stage").boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(stage?.width ?? 0, "la escena no llega a los bordes").toBeGreaterThanOrEqual(width - 1);

  // Las salidas tienen que existir: una 404 que no lleva a ningún sitio es la
  // que teníamos antes de SEO-POS-1 (T7).
  await expect(page.locator(".nf-rail a").first()).toBeVisible();
});

test("una URL inexistente responde 404 de verdad y no se indexa", async ({ page }) => {
  const response = await page.request.get(MISSING_PATH);
  expect(response.status(), `${MISSING_PATH} no respondió 404`).toBe(404);

  await page.goto(MISSING_PATH, { waitUntil: "domcontentloaded" });

  /**
   * Hay DOS `<meta name="robots">` en esta página y las dos son legítimas: Next
   * añade la suya (`noindex`) a toda página `not-found`, y `app/not-found.tsx`
   * declara la nuestra (`noindex, follow`) desde SEO-POS-1 (T7). No se
   * contradicen —ninguna dice `nofollow`, así que el resultado efectivo es
   * `noindex, follow`— y por eso la duplicidad se deja como está en vez de
   * quitar una: retirar la nuestra sería un cambio de SEO, y retirar la de Next
   * no está en nuestra mano.
   *
   * Lo que se comprueba, entonces, no es "hay una meta" sino la garantía real:
   * que NINGUNA de las que haya deje esto indexable. Con `.first()` el test
   * pasaría aunque una segunda meta dijera `index`, que es el fallo que de
   * verdad importaría.
   */
  const robots = await page.locator('meta[name="robots"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute("content") ?? "")
  );
  expect(robots.length, "la 404 no declara ninguna meta robots").toBeGreaterThan(0);
  for (const content of robots) {
    expect(content, `una meta robots de la 404 no dice noindex: "${content}"`).toContain("noindex");
  }
  expect(
    robots.some((c) => c.includes("follow") && !c.includes("nofollow")),
    "ninguna meta robots declara follow: la 404 dejaría de repartir sus enlaces"
  ).toBe(true);
});
