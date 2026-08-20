import { expect, test } from "@playwright/test";
import {
  assertFullyVisible,
  assertPageIsHealthy,
  captureInteraction,
  discoverProjectIds,
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

/**
 * DOMAINS-ARCHIVE-RETIRE-1 (log §104): `/dashboard/projects` ya no es una
 * pantalla, es la redirección que mantiene vivos los marcadores y enlaces que
 * apuntaban a ella. Esta prueba pasó de comprobar una lista a comprobar la
 * redirección — y merece existir: era el único sitio donde se ejercitaba esa
 * ruta, y una redirección rota da 404 a quien tenga el marcador, sin que nada
 * más en la suite lo note.
 */
test("la ruta retirada de proyectos sigue llevando a Dominios", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/dashboard/projects", "projects-legacy-redirect");
  assertPageIsHealthy(findings);

  expect(
    findings.finalUrl,
    "`/dashboard/projects` debería redirigir a `/dashboard/domains`. Si se ha quedado " +
      "sirviendo una pantalla, ha vuelto la duplicada que retiró DOMAINS-ARCHIVE-RETIRE-1; " +
      "si da 404, se han roto los marcadores de todos los clientes que la tuvieran guardada."
  ).toContain("/dashboard/domains");

  await expect(
    page.locator('a[href^="/dashboard/projects/"]').first(),
    "pilot account shows no project — seed it before trusting this run"
  ).toBeVisible();
  await exploreInteractions(page, testInfo, "projects-legacy-redirect");
});

test("project overview renders real scan data", async ({ page }, testInfo) => {
  const id = await projectId(page);
  const findings = await visitAsUser(page, testInfo, `/dashboard/projects/${id}`, "overview", {
    describedAs: "la puntuación GEO del último escaneo",
    anyOf: [{ text: /puntuación geo/i }, { text: /tasa de mención/i }]
  });
  assertPageIsHealthy(findings);
  await exploreInteractions(page, testInfo, "overview");

  // HEADER-FLAT-1 (log §109): la cabecera de consola nace plana y se vuelve
  // cristal al desplazar. Sin este paso el estado de cristal NO tenía ni una
  // captura en toda la evidencia — 309 imágenes y ninguna del estado que la
  // fase introduce — así que el piloto devolvió INCONCLUSIVE con razón.
  //
  // Se desplaza `.dash-content` y no la ventana a propósito: en la consola
  // `.shell` es `overflow:hidden` a `100dvh` y la ventana no scrollea nunca,
  // que es justo por lo que `ConsoleHeader` escucha a ese contenedor. Si
  // alguien cambiara esa clase, el estado de cristal dejaría de encenderse en
  // silencio; esta aserción es lo que convierte ese fallo mudo en un fallo
  // ruidoso.
  const header = page.locator(".dash-header");
  await expect(header, "la cabecera nace plana, sin la clase de cristal").not.toHaveClass(
    /is-scrolled/
  );
  await captureInteraction(page, testInfo, "overview-cabecera-plana");

  const scrolled = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".dash-content");
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 40) return false;
    scroller.scrollTop = 240;
    return true;
  });

  // Una pantalla sin contenido suficiente para desplazar no puede demostrar
  // nada; se anota y se sigue, en vez de fingir que se comprobó.
  test.skip(!scrolled, "la Visión general de esta cuenta no tiene scroll suficiente");

  await expect(header, "al desplazar `.dash-content` la cabecera se vuelve cristal").toHaveClass(
    /is-scrolled/
  );
  await captureInteraction(page, testInfo, "overview-cabecera-cristal");
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

/**
 * Second-project coverage (founder request, RECS-REDESIGN-1). Every screenshot
 * the pilot has ever produced came from whichever project sits first in the
 * list, so one domain and one data shape stood in for all of them. That hides
 * exactly the states a redesign needs judged: a project with many
 * recommendations exercises the grouping accordions, a fuller priority block
 * and the per-type counts, none of which a small project ever reaches.
 *
 * Takes the next project after the primary one, so the journey is useful on
 * any seeded account instead of being pinned to one brand. Skips — never fails
 * — when the account has only one project: absent coverage is honest, a red
 * pilot over a data-shape the account doesn't have would not be.
 *
 * **The project list comes from `discoverProjectIds`, and it has to.** This
 * used to scrape `a[href^="/dashboard/projects/"]` off `/dashboard/projects`
 * and prefer a name (PILOT_SECOND_PROJECT, "Movistar"). That route became a
 * redirect to `/dashboard/domains` in DOMAINS-ARCHIVE-RETIRE-1 (log §104), and
 * on the domains screen only the COVER project links to
 * `/dashboard/projects/<id>` — every other domain links to `?active=<id>`. So
 * the scrape returned exactly one id, always the cover one, the name could
 * never match, and `find(id => id !== primary)` was always undefined: this
 * test **skipped silently on every run** from 2026-08-15 on, while the pilot
 * table kept looking healthy. `discoverProjectIds` is the helper that already
 * handles both link shapes, written for precisely this trap.
 *
 * Still strictly read-only: it navigates and looks, exactly like the journeys
 * above.
 */
test("recommendations screen renders for a second, larger project", async ({ page }, testInfo) => {
  const ids = await discoverProjectIds(page);
  const primary = await projectId(page);
  const second = ids.find((id) => id !== primary);
  test.skip(!second, "pilot account has no second project to compare against");

  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${second}/recommendations`,
    "recommendations-second-project"
  );
  assertPageIsHealthy(findings);
  await exploreInteractions(page, testInfo, "recommendations-second-project");
});

test("domains screen renders", async ({ page }, testInfo) => {
  // DOMAINS-REDESIGN-1: «Escaneos» ya no es una pantalla de cliente. Su mitad
  // de cliente es Dominios; el historial se fue a /debug, que es interna y
  // deliberadamente NO forma parte del recorrido del piloto.
  const findings = await visitAsUser(page, testInfo, "/dashboard/domains", "domains", {
    // La portada del dominio activo, no la pastilla de estado ni la línea de
    // automatización: la primera desaparece en reposo y la segunda se oculta
    // bajo el breakpoint móvil. Misma regla que ya regía aquí — el ancla debe
    // (a) faltar en el estado vacío, para discriminar de verdad, y (b) verse
    // en los tres viewports, para no reportar un breakpoint como falta de
    // datos.
    describedAs: "la portada del dominio activo",
    anyOf: [{ selector: ".dm2-hero" }]
  });
  assertPageIsHealthy(findings);
  await exploreInteractions(page, testInfo, "domains");
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

  // Explicit tab coverage, not left to the generic sweep's luck: the
  // interaction explorer's per-screen budget (4 candidates) is spent by
  // nav/notifications/InfoTip/the already-active first tab before it ever
  // reaches Correcto or Páginas — confirmed empirically on this PR's own
  // pilot run (2026-08-03), whose only tab capture was "Problemas", the
  // default. A full ux-pilot design-fidelity review flagged this exact
  // gap: this PR's own new Correcto/Páginas tabs had never been seen with
  // real data by anything. Real proof each tab actually switches content,
  // not just that clicking it doesn't crash.
  for (const label of ["Correcto", "Páginas"] as const) {
    const tab = page.getByRole("tab", { name: label });
    await tab.click();
    await expect(tab, `clicking the "${label}" tab did not select it`).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(
      page.locator('[role="tabpanel"]:not([hidden])'),
      `"${label}" tab panel never became visible`
    ).toBeVisible();
    await captureInteraction(page, testInfo, `web-audit-tab-${label.toLowerCase()}`);
  }

  // Fase 3b's copyable fixes live INSIDE a page row, and those rows are
  // native <details>, collapsed by default. Neither the sweep (its budget is
  // spent long before) nor the tab captures above ever open one, so without
  // this the whole feature has zero visual evidence — the Páginas capture
  // just shows ten closed rows. The loop above leaves "Páginas" selected.
  const firstPageRow = page.locator('[role="tabpanel"]:not([hidden]) details.wa-details').first();
  if ((await firstPageRow.count()) > 0) {
    await firstPageRow.locator("summary").click();
    await expect(firstPageRow, "clicking a page row did not expand it").toHaveAttribute("open", "");
    await captureInteraction(page, testInfo, "web-audit-page-row-open");
  }

  // Fase 3a's generated llms.txt has the SAME problem one tab over, and it
  // bit for real: PR #319 came back PILOT PASS with web-audit ✅ on all three
  // viewports while not one capture contained the feature the PR existed for
  // — the issue rows in Problemas are collapsed <details> too, and nothing
  // ever opened the llms.txt one. A green row for a screen whose new content
  // was never on screen is exactly the 2026-08-02 empty-state incident in a
  // different costume.
  await page.getByRole("tab", { name: "Problemas" }).click();
  const llmsIssue = page
    .locator('[role="tabpanel"]:not([hidden]) details.wa-details')
    .filter({ hasText: "llms.txt" })
    .first();

  if ((await llmsIssue.count()) > 0) {
    await llmsIssue.locator("summary").click();
    await expect(llmsIssue, "clicking the llms.txt issue did not expand it").toHaveAttribute("open", "");
    // fullContent: the file block alone is taller than the fold, so a
    // viewport capture verifies the generated llms.txt and silently omits the
    // five publishing steps underneath — which are half of what this phase
    // ships. Confirmed on the first run: 800px tall, steps nowhere in it.
    await captureInteraction(page, testInfo, "web-audit-llms-txt-open", { fullContent: true });

    // El distintivo vive en la fila CERRADA, así que una captura de la fila
    // abierta no lo prueba. Se comprueba aquí, mecánicamente.
    //
    // Pero se comprueba CONDICIONADO a que la incidencia traiga solución de
    // verdad, que no siempre ocurre: `buildLlmsTxt` devuelve null cuando
    // ninguna campaña de cobertura ha verificado una página, porque se niega
    // a emitir un fichero que sería sólo marcadores de posición. En un
    // proyecto así la fila correctamente NO lleva distintivo.
    //
    // La versión anterior afirmaba "sabemos que trae solución" y sólo era
    // cierto del proyecto que el piloto elegía entonces. Sin PILOT_PROJECT_ID
    // el piloto autodescubre proyecto, así que el día que eligió uno con 0
    // páginas verificadas (Xataka, 2026-08-05) la aserción falló describiendo
    // como rota una pantalla que estaba bien. El invariante real es más
    // estrecho y no depende del proyecto: **si dentro hay solución, la fila
    // cerrada tiene que anunciarla**.
    const hasGeneratedFix = (await llmsIssue.locator(".wa2-llms").count()) > 0;
    if (hasGeneratedFix) {
      await expect(
        llmsIssue.locator(".wa2-fix-ready"),
        'la incidencia llms.txt trae solución dentro pero no muestra el distintivo "Solución disponible"'
      ).toBeVisible();
    } else {
      // Anotado, no silenciado: un salto invisible es como una pantalla vacía
      // pasa por verificada (incidente del 2026-08-02).
      testInfo.annotations.push({
        type: "skipped-assertion",
        description:
          "llms.txt sin solución generable en este proyecto (sin páginas verificadas), así que el distintivo no aplica."
      });
    }
  }

  // Misma incidencia estructural que las dos anteriores: los pasos del sitemap
  // están dentro de un <details> colapsado, y sin abrirlo la fase no tiene
  // ninguna evidencia visual. Es el tercer sitio hoy donde el mismo patrón
  // habría pasado como verde sin enseñar nada.
  const sitemapIssue = page
    .locator('[role="tabpanel"]:not([hidden]) details.wa-details')
    .filter({ hasText: "sitemap.xml" })
    .first();

  if ((await sitemapIssue.count()) > 0) {
    await sitemapIssue.locator("summary").click();
    await expect(sitemapIssue, "clicking the sitemap issue did not expand it").toHaveAttribute("open", "");
    await captureInteraction(page, testInfo, "web-audit-sitemap-open", { fullContent: true });
  }
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

  // 1b. Same check for the "Impacto de N citas" legend tooltips
  //     (.cit2-split-key) — a DIFFERENT anchor container than the KPI strip
  //     above, and the one real overflow instance (2026-08-03: 40px past a
  //     375px viewport, .cit2-split-key's own .info-tip-anchor entry) that a
  //     full ux-pilot design-fidelity review flagged as unverified: nothing
  //     in the generic interaction sweep ever reached these triggers (the
  //     KPI tooltips + nav/notifications controls already exhaust its
  //     per-screen budget), so this is the only real hover-evidence path for
  //     this specific tooltip.
  const legendTips = page.locator(".cit2-split-key .info-tip");
  const legendTipCount = await legendTips.count();
  expect(legendTipCount, "no info-tip icons found in the citations impact legend").toBeGreaterThan(0);

  for (let i = 0; i < legendTipCount; i++) {
    await legendTips.nth(i).hover();
    const bubble = page.locator(".cit2-split-key .info-tip-bubble").nth(i);
    await expect(bubble, `hovering legend info-tip #${i + 1} did not reveal its tooltip`).toBeVisible();
    await assertFullyVisible(page, `.cit2-split-key .info-tip-bubble >> nth=${i}`, `Legend tooltip #${i + 1}`);
  }
  await captureInteraction(page, testInfo, "citations-legend-tooltip-open");

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

/**
 * NOT-FOUND-ROCKET-1. El 404 de dentro de la consola
 * (`app/dashboard/not-found.tsx`).
 *
 * Existe porque `app/not-found.tsx` es el `not-found` **raíz** y sin un
 * `not-found` propio de la consola recogía también los `notFound()` de
 * `lib/project-workspace.ts`: alguien con la sesión abierta se encontraba la
 * cabecera de marketing y, tras el rediseño, la escena del cohete a pantalla
 * completa con un «Prueba gratis».
 *
 * Se pilota aquí y no en `public-pages.spec.ts` porque **necesita sesión**: sin
 * ella, `requireUser()` redirige a /login y no se llega a ver nada. Y se pilota
 * en vez de dejarlo a verificación manual porque la primera versión de esta
 * pantalla la encontró el fundador, no el piloto (log §63): reutilizaba
 * `EmptyState` y leía como un botón mal maquetado. Lo que un humano tuvo que
 * cazar una vez, lo mira una máquina a partir de ahora.
 *
 * SCOPE GUARD: sigue siendo estrictamente de lectura — navega a una URL con un
 * id que no existe y mira lo que se pinta. No crea, no borra, no escribe.
 */
const MISSING_PROJECT_ID = "00000000-0000-4000-8000-000000000000";

test("un proyecto que no existe da el 404 de la consola, no el de marketing", async ({
  page
}, testInfo) => {
  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${MISSING_PROJECT_ID}`,
    "console-not-found",
    {
      describedAs: "el 404 sobrio de la consola, con su glifo y sus dos salidas",
      anyOf: [{ selector: ".nfc" }, { text: /esta pantalla no existe/i }]
    },
    // El documento responde 404 porque el proyecto no existe: es el
    // comportamiento correcto, no un fallo de red.
    { expectDocumentStatus: 404 }
  );
  assertPageIsHealthy(findings);

  // Lo que de verdad se está protegiendo: que a alguien con sesión NO se le
  // sirva la pantalla de marketing.
  await expect(page.locator(".nf-scene")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /prueba gratis/i })).toHaveCount(0);

  // La consola sigue alrededor: el menú lateral es lo que permite salir de
  // aquí sin usar el botón de atrás del navegador.
  await expect(page.locator("aside.sb")).toBeVisible();

  // "Ver mis dominios" tiene que llevar a la puerta de entrada real de la
  // consola. El fundador cazó a mano que apuntaba a /dashboard/projects
  // (la pantalla de archivar/restaurar de antes de DOMAINS-REDESIGN-1, no la
  // actual) probando el preview — el propio test sólo comprobaba visibilidad,
  // no destino, y por eso no lo vio venir (2026-08-13).
  await expect(page.getByRole("link", { name: /ver mis dominios/i })).toHaveAttribute(
    "href",
    "/dashboard/domains"
  );
});
