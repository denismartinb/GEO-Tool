import { expect, test } from "@playwright/test";
import { assertPageIsHealthy, captureInteraction, resolveProjectId, visitAsUser } from "../support/journey";

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
 * DOM changed". Runs against the SECOND project (Movistar by default), which
 * is the only one with enough recommendations to have accordions at all.
 *
 * SCOPE GUARD — read-only, same as core-flow.spec.ts. Every control touched
 * here is a local state toggle or a client-side download. It never launches a
 * scan, never writes to Supabase, never submits a form.
 */

test.describe.configure({ mode: "serial" });

async function largestProjectId(page: Parameters<typeof resolveProjectId>[0]): Promise<string | null> {
  await page.goto("/dashboard/projects", { waitUntil: "domcontentloaded" });
  const wanted = (process.env.PILOT_SECOND_PROJECT ?? "Movistar").trim();
  const links = page.locator('a[href^="/dashboard/projects/"]').filter({ hasNotText: /nuevo|new/i });
  const ids: string[] = [];
  for (const link of await links.all()) {
    const href = await link.getAttribute("href");
    const text = (await link.textContent()) ?? "";
    const match = href?.match(/^\/dashboard\/projects\/([^/?#]+)$/);
    if (!match || match[1] === "new") continue;
    if (new RegExp(wanted, "i").test(text)) ids.unshift(match[1]);
    else ids.push(match[1]);
  }
  return ids[0] ?? null;
}

test("recomendaciones: acordeones, filtros, detalle, tooltips y exportar responden de verdad", async ({
  page
}, testInfo) => {
  const id = await largestProjectId(page);
  test.skip(!id, "la cuenta piloto no tiene ningún proyecto");

  const findings = await visitAsUser(
    page,
    testInfo,
    `/dashboard/projects/${id}/recommendations`,
    "recs-interactions"
  );
  assertPageIsHealthy(findings);

  // --- 1 · Las acciones prioritarias existen y son de tipos distintos -------
  const priority = page.locator(".rec-card.rec2-priority");
  const priorityCount = await priority.count();
  expect(priorityCount, "no se han renderizado acciones prioritarias").toBeGreaterThan(0);
  const priorityTitles = await priority.locator(".rec-title").allTextContents();
  expect(
    new Set(priorityTitles.map((t) => t.trim())).size,
    `las prioritarias se repiten: ${priorityTitles.join(" | ")}`
  ).toBe(priorityTitles.length);

  // Cada prioritaria debe traer su primer paso acotado.
  expect(
    await priority.locator(".rec2-step").count(),
    "alguna acción prioritaria no muestra 'Empieza por aquí'"
  ).toBe(priorityCount);

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
  const highTab = tabs.filter({ hasText: "Alta prioridad" });
  if (await highTab.count()) {
    await highTab.first().click();
    // La vista filtrada debe seguir renderizando algo (grupo o vacío honesto).
    const filteredGroups = await page.locator(".rec2-group").count();
    const emptyState = await page.locator(".section-empty").count();
    expect(
      filteredGroups + emptyState,
      "el filtro 'Alta prioridad' deja la pantalla en blanco"
    ).toBeGreaterThan(0);
    await captureInteraction(page, testInfo, "recs-filtro-alta-prioridad");

    await tabs.first().click();
    expect(
      await page.locator(".rec2-group").count(),
      "volver a 'Todas' no restaura la lista completa"
    ).toBe(groupsUnderTodas);
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
