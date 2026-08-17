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
 * Va todo en UNA prueba a propósito. El popup se muestra una vez por navegador
 * y Playwright estrena contexto en cada `test`, así que «ya no vuelve a
 * saltar» sólo se puede comprobar sin salir de la misma sesión.
 *
 * SCOPE GUARD: estrictamente de lectura. Navega, pulsa los propios controles
 * del tour (Siguiente, la X) y el botón del menú que lo reabre. No lanza
 * escaneos, no crea proyectos, no envía formularios. Lo único que escribe es
 * la marca de «ya visto» en el `localStorage` del navegador desechable de esta
 * pasada.
 */

const TITLE = "Aprende cómo funciona";

test("el tour de bienvenida sale solo, se lee, se cierra y no vuelve", async ({ page }, testInfo) => {
  // Se entra por `/dashboard` A PROPÓSITO, que es donde aterriza un primer
  // login de verdad. Esa ruta no pinta nada: redirige al proyecto más reciente.
  // Justo ahí se rompía (2026-08-07): el popup se montaba en la ruta puente,
  // escribía la marca de «visto», y la redirección se lo llevaba por delante,
  // de modo que el tour no salía nunca en el único momento para el que se hizo.
  // Entrar por la pantalla final ocultaría exactamente ese fallo.
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_500);

  const scrim = page.locator(WELCOME_TOUR_SCRIM);
  await expect(scrim, "el popup de bienvenida no salió solo en el primer acceso").toBeVisible({
    timeout: 10_000
  });
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
  await captureInteraction(page, testInfo, "onboarding-tour-paso-1");

  // Sólo el primer paso se reproduce solo (log §40). Comprobado midiendo, no
  // asumido: pasados varios segundos el paso activo tiene que seguir siendo el
  // primero. Si alguien devuelve la reproducción encadenada, esto lo caza.
  await page.waitForTimeout(6_000);
  await expect(
    page.locator(".pt-dot").first(),
    "el tour siguió solo más allá del paso 1: la reproducción automática debe pararse ahí"
  ).toHaveClass(/is-on/);

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

  // Y ya no vuelve. Es la regresión concreta que el piloto encontró el
  // 2026-08-07: la marca de «visto» se escribía al cerrar, así que el popup
  // reaparecía en cada carga y tapaba la consola indefinidamente.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1_500);
  await expect(
    page.locator(WELCOME_TOUR_SCRIM),
    "el popup volvió a saltar tras haberse visto: «primer acceso» se convierte en «cada carga»"
  ).toHaveCount(0);

  // Pero sigue habiendo puerta de vuelta desde el menú lateral. En móvil ese
  // menú es un cajón, así que primero hay que abrirlo, igual que haría
  // cualquiera.
  const burger = page.getByRole("button", { name: "Abrir menú de navegación" });
  if (await burger.isVisible().catch(() => false)) {
    await burger.click();
    await page.waitForTimeout(400);
  }

  const reopen = page.getByRole("button", { name: /Qué es el GEO/i });
  await expect(reopen, "«¿Qué es el GEO?» desapareció del menú lateral").toBeVisible();
  await reopen.click();
  await expect(
    page.locator(WELCOME_TOUR_SCRIM),
    "«¿Qué es el GEO?» del menú no reabrió el tour"
  ).toBeVisible({ timeout: 5_000 });
  await captureInteraction(page, testInfo, "onboarding-tour-reabierto-desde-el-menu");

  await dismissWelcomeTour(page);
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
