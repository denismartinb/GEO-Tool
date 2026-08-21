import { expect, test } from "@playwright/test";
import { assertPageIsHealthy, captureInteraction, pickProjectShowing, visitAsUser } from "../support/journey";

/**
 * RECS-REDESIGN-1 — interaction proof for the Recomendaciones screen.
 *
 * The generic explorer (`exploreInteractions`) cannot cover this screen: it
 * stops after 4 controls per screen (a timeout budget), and the menu, the
 * notification bell and two tooltips consume that budget before it ever
 * reaches the list. The filter tabs are not in its allow-list either, and the
 * "Añadir bloque de cita" accordion is refused by the destructive-text guard
 * because of the "añad" stem — a false positive, but the guard is deliberately
 * over-matching and must stay that way.
 *
 * So the screen this PR rebuilds gets an explicit journey instead: it clicks
 * the real controls and ASSERTS the consequence, rather than reporting "the
 * DOM changed". Runs against the first project of the account that actually
 * has priority actions to click on — picked by looking, not by name; see
 * `pickProjectWithPriorityActions` for why the name-based pick rotted.
 *
 * SCOPE GUARD — read-only, same as core-flow.spec.ts. Every control touched
 * here is a local state toggle or a client-side download. It never launches a
 * scan, never writes to Supabase, never submits a form.
 */

test.describe.configure({ mode: "serial" });

/**
 * El proyecto que este journey necesita es **uno que tenga acciones
 * prioritarias**, y la única forma honesta de saber cuál es abrirlo y mirar.
 * La elección vive en `pickProjectShowing` (`../support/journey`), compartida
 * con `core-flow.spec.ts`, porque el fallo era el mismo en los dos sitios y dos
 * copias se arreglan una vez y media.
 *
 * Antes se buscaba por nombre (`PILOT_SECOND_PROJECT`, "Movistar") sobre los
 * enlaces de `/dashboard/projects`. Esa ruta pasó a ser una redirección a
 * `/dashboard/domains` (DOMAINS-ARCHIVE-RETIRE-1, log §104) y allí **sólo el
 * proyecto de portada enlaza a `/dashboard/projects/<id>`**; los demás enlazan
 * a `?active=<id>`. La lista quedó con un único elemento, el filtro por nombre
 * no podía casar con nada, y el journey llevaba desde el 2026-08-15 midiendo lo
 * que hubiera delante en cada anchura (log §132).
 */
const PRIORITY_CARD = ".rec-card.rec2-priority";

test("recomendaciones: acordeones, filtros, detalle, tooltips y exportar responden de verdad", async ({
  page
}, testInfo) => {
  const id = await pickProjectShowing(page, testInfo, {
    path: (projectIdToVisit) => `/dashboard/projects/${projectIdToVisit}/recommendations`,
    contentSelector: PRIORITY_CARD
  });
  test.skip(
    !id,
    "ningún proyecto de la cuenta piloto tiene acciones prioritarias: no hay nada que este " +
      "journey pueda comprobar. Siembra un proyecto con recomendaciones."
  );

  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${id}/recommendations`,
    "recs-interactions"
  );
  assertPageIsHealthy(findings);

  // --- 1 · Las acciones prioritarias existen y son de tipos distintos -------
  const priority = page.locator(PRIORITY_CARD);
  const priorityCount = await priority.count();
  expect(priorityCount, "no se han renderizado acciones prioritarias").toBeGreaterThan(0);
  const priorityTitles = await priority.locator(".rec-title").allTextContents();
  expect(
    new Set(priorityTitles.map((t) => t.trim())).size,
    `las prioritarias se repiten: ${priorityTitles.join(" | ")}`
  ).toBe(priorityTitles.length);

  // El primer paso ("Empieza por aquí") solo vive en filas generadas por el
  // motor ACTUAL: se persiste en recommendations.evidence_json al escanear.
  //
  // La cuenta piloto comparte base de datos con producción, así que un escaneo
  // lanzado desde otro despliegue las regenera con el motor de esa rama —sin
  // ese campo— y puede hacerlo incluso a mitad de esta corrida: la primera
  // versión de este test pasó en móvil (datos del escaneo del 3 ago, con
  // primer paso) y falló en tablet y escritorio, que ya leyeron un reescaneo
  // del 4 ago hecho por main.
  //
  // Que el motor SIEMPRE emita un primer paso se fija donde corresponde, en su
  // test unitario ("gives every recommendation a bounded first step"). Aquí,
  // que es lo único que el pilotaje puede saber de verdad, se comprueba que
  // cuando el dato existe la tarjeta lo pinta bien.
  const steps = priority.locator(".rec2-step");
  const stepCount = await steps.count();
  for (let i = 0; i < stepCount; i++) {
    await expect(steps.nth(i), "el bloque de primer paso se renderiza sin su rótulo").toContainText(
      "Empieza por aquí"
    );
  }

  // --- 2 · Tooltips de los pilares: se revelan y caben en pantalla ----------
  const tips = page.locator(".rec2-pillars .info-tip");
  const tipCount = await tips.count();
  expect(tipCount, "los pilares no tienen tooltip").toBeGreaterThan(0);
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  for (let i = 0; i < tipCount; i++) {
    await tips.nth(i).hover();
    const bubble = page.locator(".rec2-pillars .info-tip-bubble").nth(i);
    await expect(bubble, `el tooltip ${i + 1} no se revela`).toBeVisible();
    const box = await bubble.boundingBox();
    expect(box, `el tooltip ${i + 1} no tiene caja`).not.toBeNull();
    expect(box!.x, `el tooltip ${i + 1} se sale por la izquierda`).toBeGreaterThanOrEqual(-1);
    expect(
      box!.x + box!.width,
      `el tooltip ${i + 1} se sale por la derecha (viewport ${viewport.width}px)`
    ).toBeLessThanOrEqual(viewport.width + 1);
  }
  await captureInteraction(page, testInfo, "recs-tooltip-pilar");

  // --- 3 · Acordeón: abre y muestra sus tarjetas ---------------------------
  const groups = page.locator(".rec2-group");
  const groupCount = await groups.count();
  test.skip(groupCount === 0, "este proyecto no tiene suficientes recomendaciones para agrupar");

  const firstGroup = groups.first();
  await expect(firstGroup.locator(".rec2-group-body"), "el acordeón nace abierto").toHaveCount(0);
  await firstGroup.locator(".rec2-group-h").click();
  await expect(firstGroup.locator(".rec2-group-body"), "el acordeón no abre al pulsarlo").toBeVisible();
  expect(
    await firstGroup.locator(".rec-card").count(),
    "el acordeón abre vacío"
  ).toBeGreaterThan(0);
  await captureInteraction(page, testInfo, "recs-acordeon-abierto");

  // Y vuelve a cerrarse.
  await firstGroup.locator(".rec2-group-h").click();
  await expect(firstGroup.locator(".rec2-group-body"), "el acordeón no cierra").toHaveCount(0);

  // --- 4 · Filtros: cambian la lista y "Todas" lo incluye todo -------------
  const tabs = page.locator(".filters .seg button");
  const tabLabels = (await tabs.allTextContents()).map((t) => t.trim());
  expect(tabLabels[0], "el primer filtro debería ser 'Todas'").toContain("Todas");

  const groupsUnderTodas = await page.locator(".rec2-group").count();

  // "Alta prioridad" debe devolver EXACTAMENTE las mismas acciones del bloque
  // de arriba — repetidas, no una selección distinta — y sin acordeones: una
  // vista filtrada ya viene acotada y nombrada.
  const highTab = tabs.filter({ hasText: "Alta prioridad" });
  if (await highTab.count()) {
    await highTab.first().click();
    expect(
      await page.locator(".rec2-group").count(),
      "'Alta prioridad' no debería agrupar en acordeones"
    ).toBe(0);
    expect(
      await page.locator(".rec-card").count(),
      "'Alta prioridad' debería repetir las mismas acciones prioritarias de arriba"
    ).toBe(priorityCount * 2);
    await captureInteraction(page, testInfo, "recs-filtro-alta-prioridad");

    await tabs.first().click();
    expect(
      await page.locator(".rec2-group").count(),
      "volver a 'Todas' no restaura la lista completa"
    ).toBe(groupsUnderTodas);
  }

  // "Técnico" lista sus acciones directamente: la categoría ya está en la
  // pestaña, no hace falta volver a elegirla en un acordeón.
  const techTab = tabs.filter({ hasText: "Técnico" });
  if (await techTab.count()) {
    await techTab.first().click();
    expect(
      await page.locator(".rec2-group").count(),
      "'Técnico' no debería agrupar en acordeones"
    ).toBe(0);
    const cards = await page.locator(".rec-card").count();
    const empty = await page.locator(".section-empty").count();
    expect(cards + empty, "'Técnico' deja la pantalla en blanco").toBeGreaterThan(0);
    await captureInteraction(page, testInfo, "recs-filtro-tecnico");
    await tabs.first().click();
  }

  // --- 5 · "Ver más": el detalle de una prioritaria se abre ----------------
  await priority.first().locator(".rec-main").click();
  await expect(
    priority.first().locator(".rec-detail-inner"),
    "el detalle de la tarjeta no se abre"
  ).toBeVisible();
  await captureInteraction(page, testInfo, "recs-detalle-abierto");

  // --- 6 · Exportar plan: descarga de verdad ------------------------------
  const exportBtn = page.getByRole("button", { name: /exportar plan/i });
  if (await exportBtn.count()) {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10_000 }),
      exportBtn.first().click()
    ]);
    expect(download.suggestedFilename(), "el plan exportado no es un .md").toMatch(/\.md$/);
  }
});
