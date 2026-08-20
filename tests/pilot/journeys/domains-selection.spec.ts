import { expect, test } from "@playwright/test";
import { assertPageIsHealthy, captureInteraction, visitAsUser } from "../support/journey";

/**
 * DOMAINS-LIVE-SELECT-1 — proof that selecting a domain card propagates to
 * the rest of the console.
 *
 * The generic explorer (`exploreInteractions`) cannot reach this: it treats
 * any control with a real `href` as "navigates away" and skips it
 * (`tests/pilot/support/explore.ts`), and every `.dm2-card` in the grid has
 * one — `/dashboard/domains?active=<id>` — even though it stays on the same
 * screen (DOMAINS-REDESIGN-1, 2026-08-05: the card selects, it does not
 * navigate). Confirmed the hard way: the automated pilot run on PR #443
 * reported PILOT PASS on `domains` across all three viewports with zero
 * captures or assertions touching this behaviour at all — the pilot's own
 * "never report PASS for something you did not see" rule caught the gap only
 * because a human reviewer went looking, not because anything failed.
 *
 * So this screen's core new behaviour gets an explicit journey instead: click
 * a real card and ASSERT the sidebar changed, rather than trusting that the
 * DOM updated.
 *
 * SCOPE GUARD — read-only, same as core-flow.spec.ts. Selecting a domain card
 * is a query-param change on the same route; nothing here launches a scan,
 * writes to Supabase, or submits a form.
 */

test.describe.configure({ mode: "serial" });

test("seleccionar otro dominio en la rejilla propaga al sidebar sin pulsar \"Ver visión general\"", async ({
  page
}, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/dashboard/domains", "domains-before", {
    describedAs: "la portada del dominio activo",
    anyOf: [{ selector: ".dm2-hero" }]
  });
  assertPageIsHealthy(findings);

  const cards = page.locator(".dm2-card");
  const cardCount = await cards.count();
  test.skip(cardCount === 0, "la cuenta piloto sólo tiene un dominio — no hay otra tarjeta que seleccionar");

  const heroNameBefore = (await page.locator(".dm2-hero .dm2-name").first().textContent())?.trim();
  const target = cards.first();
  const targetName = (await target.locator(".dm2-card-name").textContent())?.trim();
  expect(targetName, "la tarjeta objetivo no tiene nombre").toBeTruthy();
  expect(targetName, "la tarjeta objetivo es el mismo dominio ya activo").not.toBe(heroNameBefore);

  await target.click();
  // La selección es un cambio de query param en la misma ruta (Next.js Link,
  // no un POST): esperar la URL en vez de una navegación completa evita una
  // condición de carrera con el re-render de React.
  await page.waitForURL(/\/dashboard\/domains\?active=/);
  await page.waitForTimeout(500);

  // --- 1 · La portada cambia (comportamiento ya existente) -----------------
  await expect(page.locator(".dm2-hero .dm2-name").first(), "la portada no cambió al dominio seleccionado").toHaveText(
    targetName!
  );

  // --- 2 · El sidebar también cambia, SIN pulsar "Ver visión general" ------
  // Esto es el comportamiento nuevo de DOMAINS-LIVE-SELECT-1: antes, el
  // conmutador de arriba del menú (`.proj-switch`) seguía mostrando el
  // dominio anterior hasta entrar de verdad al proyecto.
  await expect(
    page.locator(".proj-switch .proj-name"),
    "el conmutador del sidebar no se actualizó tras seleccionar la tarjeta"
  ).toHaveText(targetName!);

  // --- 3 · Los enlaces de Analizar/Actuar apuntan al proyecto nuevo --------
  const activeId = new URL(page.url()).searchParams.get("active");
  expect(activeId, "la URL no lleva ?active= tras seleccionar").toBeTruthy();

  const promptsHref = await page.locator('.nav-item[href*="/prompts"]').first().getAttribute("href");
  expect(
    promptsHref,
    `el enlace de Prompts del sidebar no apunta al proyecto seleccionado (${activeId})`
  ).toContain(activeId!);

  await captureInteraction(page, testInfo, "domains-after-select");
});
