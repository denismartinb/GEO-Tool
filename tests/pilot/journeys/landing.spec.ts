import { expect, test } from "@playwright/test";
import {
  assertControlsAreHealthy,
  assertPageIsHealthy,
  auditControls,
  captureInteraction,
  visitAsUser
} from "../support/journey";

/**
 * Las dos páginas comerciales — `/` y `/pricing` — y el cajón de navegación
 * móvil que las dos comparten.
 *
 * Por qué existe (2026-08-11, log §55). El piloto **no visitaba `/pricing`** y
 * de `/` sólo tenía la pasada del tour del hero, que mira el tour. Y, sobre
 * todo: de las 560 capturas de la última pasada, **ninguna tenía el cajón
 * abierto**. El cajón sólo existe por debajo de 900 px y sólo después de un
 * clic, así que un fallo que vive ahí dentro —el CTA gris sobre azul que el
 * fundador encontró a ojo— era literalmente invisible para el piloto. Mirar
 * más fuerte no lo arregla: había que abrirlo.
 *
 * SCOPE GUARD: páginas públicas, estrictamente de lectura. Navega y abre/cierra
 * el cajón. No envía ningún formulario, no escribe en el campo del hero, no
 * crea nada.
 */

const MOBILE_PROJECTS = new Set(["mobile"]);

test("la portada carga con su hero real", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/", "landing", {
    describedAs: "el hero de la portada con su campo de dominio y su CTA",
    anyOf: [{ selector: ".lp-hero-form" }, { selector: ".lp-hero h1" }]
  });
  assertPageIsHealthy(findings);
});

test("/pricing carga con sus planes reales", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/pricing", "pricing", {
    describedAs: "las tarjetas de plan de la página de precios",
    anyOf: [{ selector: ".price-card" }, { text: /Starter/ }]
  });
  assertPageIsHealthy(findings);
});

/**
 * El cajón, abierto de verdad y juzgado abierto.
 *
 * Sólo corre en la anchura móvil: por encima de 900 px `.lp-burger` está
 * `display: none` y no hay cajón que abrir. Se **salta ruidosamente** en las
 * otras dos en vez de pasar en silencio — un test que no comprueba nada y
 * reporta verde es justo lo que produjo el incidente que lo motiva.
 */
for (const path of ["/", "/pricing"]) {
  const label = path === "/" ? "landing" : "pricing";

  test(`el cajón de navegación móvil de ${label} abre y sus botones se leen`, async ({ page }, testInfo) => {
    test.skip(
      !MOBILE_PROJECTS.has(testInfo.project.name),
      `.lp-burger sólo existe en móvil; en ${testInfo.project.name} no hay cajón que abrir`
    );

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_000);

    const burger = page.locator(".lp-burger").first();
    await expect(burger, "no se encontró el botón de menú en la anchura móvil").toBeVisible();
    await burger.click();

    const drawer = page.locator(".lp-mobnav");
    await expect(drawer, "el cajón no se abrió al pulsar el menú").toBeVisible();
    // Un cajón que abre pero deja sus enlaces fuera de la ventana es tan
    // inservible como uno que no abre; que el primero sea visible lo demuestra.
    await expect(drawer.locator("a").first()).toBeVisible();

    // Aquí es donde se gana lo que 560 capturas no dieron: los mismos dos
    // chequeos mecánicos que corren al cargar, pero contra el estado ABIERTO.
    assertControlsAreHealthy(`${label} — cajón móvil abierto`, testInfo.project.name, await auditControls(page));

    await captureInteraction(page, testInfo, `${label}-cajon-movil-abierto`);

    // Y cierra, porque un cajón que no cierra atrapa al usuario en él.
    await page.locator(".lp-mobnav-close").click();
    await expect(drawer, "el cajón no se cerró con su propia X").toHaveCount(0);
  });
}
