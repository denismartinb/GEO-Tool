import { expect, test } from "@playwright/test";
import {
  WELCOME_TOUR_SCRIM,
  assertPageIsHealthy,
  captureInteraction,
  dismissWelcomeTour,
  visitAsUser
} from "../support/journey";

/**
 * ONBOARDING-TOUR-1 — el tour «Aprende cómo funciona» (log §40).
 *
 * Por qué existe esta pasada. `visitAsUser` cierra el popup nada más llegar,
 * porque es un modal que tapa la pantalla y bloquea todo lo que hay detrás
 * (2026-08-07: tumbó seis pruebas por `Timeout` contra elementos sanos). Pero
 * cerrar algo sin mirarlo lo deja **sin verificar**, y ésa es exactamente la
 * trampa que el CLAUDE.md documenta del 2026-08-02: una tabla de ✅ que
 * certifica una pantalla que el piloto nunca vio de verdad. Así que aquí se
 * abre, se comprueba que trae contenido real —no un lienzo vacío—, se
 * fotografía y se cierra.
 *
 * ONBOARDING-TOUR-PERSIST-1 (2026-08-25) movió la escena de «sale solo en el
 * primer acceso y no vuelve tras recargar» a
 * `journeys/write/onboarding-tour-first-run.spec.ts`. Antes esta pasada podía
 * forzar «no visto» borrando `localStorage`, una escritura inocua sobre el
 * navegador desechable de cada test. Ahora la marca vive en `profiles` — una
 * fila real, compartida por TODAS las pasadas de esta misma cuenta— así que
 * forzarla a «no visto» es una escritura de producto, y el piloto siempre-on
 * (cada preview deploy) está prohibido de escribir por convención de código,
 * no sólo de estilo (CLAUDE.md, "Pilot write scope"). Esa escena pasa a
 * `--journeys write`, igual que cualquier otra siembra de estado.
 *
 * Lo que SÍ sigue siendo determinista sin ninguna escritura: reabrir el tour
 * desde «¿Qué es el GEO?» funciona pase lo que pase con la marca de «ya
 * visto» — es la vía que existe precisamente para volver a verlo. Esta
 * pasada verifica esa vía, siempre.
 *
 * SCOPE GUARD: estrictamente de lectura. Navega, pulsa el botón del menú que
 * reabre el tour y los propios controles del tour (Siguiente, la X). No
 * lanza escaneos, no crea proyectos, no envía formularios, no escribe nada.
 */

const TITLE = "Aprende cómo funciona";

test("«¿Qué es el GEO?» reabre el tour con contenido real, avanza y cierra", async ({ page }, testInfo) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1_500);

  // Si el popup salió solo (primer acceso real de esta cuenta en esta
  // pasada), se cierra sin verificarlo aquí — eso es lo que el journey de
  // escritura comprueba a propósito, con la marca reseteada. Reabrir desde el
  // menú tiene que funcionar en cualquiera de los dos estados de partida.
  await dismissWelcomeTour(page);

  const burger = page.getByRole("button", { name: "Abrir menú de navegación" });
  if (await burger.isVisible().catch(() => false)) {
    await burger.click();
    await page.waitForTimeout(400);
  }

  const reopen = page.getByRole("button", { name: /Qué es el GEO/i });
  await expect(reopen, "«¿Qué es el GEO?» desapareció del menú lateral").toBeVisible();
  await reopen.click();

  const scrim = page.locator(WELCOME_TOUR_SCRIM);
  await expect(scrim, "«¿Qué es el GEO?» del menú no reabrió el tour").toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();

  // Contenido real, no un lienzo en blanco. El paso 1 teclea el dominio; si el
  // reloj no ha corrido, `[data-pt=typed]` sigue vacío y la captura no probaría
  // nada — un popup que carga vacío es tan poco verificado como uno que no sale.
  await expect
    .poll(
      async () => (await page.locator("[data-pt=typed]").first().textContent())?.trim().length ?? 0,
      {
        message: "el paso 1 nunca llegó a escribir el dominio: el tour no arrancó",
        timeout: 15_000
      }
    )
    .toBeGreaterThan(0);
  await captureInteraction(page, testInfo, "onboarding-tour-reabierto-desde-el-menu");

  // Siguiente cambia de paso de verdad — un control muerto es un hallazgo.
  await page.getByRole("button", { name: /Siguiente/ }).click();
  await expect(page.locator(".pt-dot").nth(1), "«Siguiente» no avanzó al paso 2").toHaveClass(
    /is-on/,
    { timeout: 5_000 }
  );
  await captureInteraction(page, testInfo, "onboarding-tour-paso-2");

  // El enlace del pie es la puerta a /geo que el fundador pidió conservar.
  await expect(
    page.locator(`${WELCOME_TOUR_SCRIM} a[href="/geo"]`),
    "el popup perdió el enlace «¿Qué es el GEO?»"
  ).toBeVisible();

  // Se cierra con su propia X, no con Escape ni con un clic fuera: si la X deja
  // de cerrar, esto tiene que fallar en vez de taparlo con una vía alternativa.
  expect(await dismissWelcomeTour(page), "el popup no se pudo cerrar con su X").toBe(true);
  await expect(scrim).toBeHidden();
});

/**
 * El mismo tour, en su otra superficie: el hero de la landing pública.
 *
 * Existe porque el piloto **no visitaba `/`** — cubre el blog, /geo, docs,
 * comparativas y las legales, pero no la portada. Media fase vive ahí (la
 * captura estática del hero se sustituyó por el tour), así que un PILOT PASS
 * sin esta pasada estaba certificando sólo la mitad. Es exactamente el hueco
 * que el CLAUDE.md manda declarar en vez de dar por bueno.
 *
 * SCOPE GUARD: página pública, sólo navegación y los controles del propio
 * tour. No envía nada.
 */
test("el tour del hero arranca al verse entero y para en el paso 1", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/", "landing-hero-tour", {
    describedAs: "el tour dentro del marco del hero de la landing",
    anyOf: [{ selector: ".ptour--hero .pt-stage" }]
  });
  assertPageIsHealthy(findings);

  // NO se comprueba aquí que el tour espere a verse entero antes de arrancar.
  // Se intentó y sería mentira: `visitAsUser` redimensiona el viewport para
  // capturar la página completa, con lo que el lienzo pasa a verse entero y el
  // tour arranca durante la propia captura. La comprobación pasaría siempre sin
  // demostrar nada, que es peor que no tenerla. Ese arranque está verificado con
  // Playwright contra el build de producción en local (log §40); aquí se
  // verifica lo que esta pasada sí puede ver.
  const typed = page.locator("[data-pt=typed]").first();
  await page.evaluate(() => {
    document.querySelector(".ptour--hero .pt-stage")?.scrollIntoView({ block: "center" });
  });
  await expect
    .poll(async () => (await typed.textContent())?.trim().length ?? 0, {
      message: "el tour del hero no arrancó ni viéndose entero",
      timeout: 15_000
    })
    .toBeGreaterThan(0);

  // La pista de «Siguiente» arranca con el paso 1, no al detenerse (fundador,
  // 2026-08-08) — se comprueba una vez el tour ya está parado, que es el
  // instante en que más importa que siga puesta.
  await page.waitForTimeout(7_000);
  await expect(
    page.locator(".ptour--hero .pt-dot").first(),
    "el tour del hero siguió solo más allá del paso 1"
  ).toHaveClass(/is-on/);
  await expect(
    page.locator(".ptour--hero .pt-foot .pt-primary"),
    "el botón «Siguiente» no llamó la atención al detenerse el tour"
  ).toHaveClass(/pt-hint/);
  await captureInteraction(page, testInfo, "landing-hero-tour-paso-1");

  // Y avanza a mano, un paso por clic.
  await page.locator(".ptour--hero").getByRole("button", { name: /Siguiente/ }).click();
  await expect(
    page.locator(".ptour--hero .pt-dot").nth(1),
    "«Siguiente» no avanzó al paso 2 en la landing"
  ).toHaveClass(/is-on/, { timeout: 5_000 });
  await captureInteraction(page, testInfo, "landing-hero-tour-paso-2");
});
