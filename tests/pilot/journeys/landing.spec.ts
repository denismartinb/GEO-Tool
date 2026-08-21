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

    const burger = page.locator(".lp-burger").first();
    await expect(burger, "no se encontró el botón de menú en la anchura móvil").toBeVisible();

    const drawer = page.locator(".lp-mobnav");

    /**
     * El clic se reintenta hasta que el cajón aparece, en vez de pulsar una vez
     * tras una espera fija.
     *
     * `MarketingMobileNav` es un componente cliente: el botón se pinta en el
     * HTML del servidor pero su `onClick` no existe hasta que React hidrata, y
     * `.lp-mobnav` no está en el DOM hasta que ese estado se abre. Un clic
     * anterior a la hidratación no se encola: se pierde. Con
     * `waitForTimeout(1_000)` el test apostaba a que un preview frío hidrata en
     * menos de un segundo, y el 2026-08-20 perdió esa apuesta en `/pricing`
     * mientras `/` pasaba en la misma corrida (PR #446).
     *
     * Esto no afloja la comprobación —si el cajón no abre nunca, sigue fallando
     * al agotarse el plazo— y es seguro repetirlo porque el botón hace
     * `setOpen(true)`, no un alternar: un segundo clic sobre un cajón ya
     * abierto no lo cierra.
     */
    await expect(async () => {
      await burger.click();
      await expect(drawer).toBeVisible({ timeout: 2_000 });
    }, "el cajón no se abrió al pulsar el menú").toPass({ timeout: 20_000 });
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
