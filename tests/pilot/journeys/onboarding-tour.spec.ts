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
 * La DEMO del hero de la portada (HOME-2026-08 Fase A2).
 *
 * **Sustituye a la pasada del tour en la landing, que ya no existe ahí.** El
 * artboard aprobado pone en ese hueco una historia de cinco escenas, no el
 * tour; el tour sigue vivo y sigue cubierto por la pasada de arriba, en su
 * sitio de verdad — el popup de bienvenida de la consola. Lo que cambia es que
 * la portada estrena una pieza y no puede quedarse sin mirar: media Fase A2
 * vive ahí, y un PILOT PASS sin esto certificaría la mitad.
 *
 * **Lo que se comprueba es lo que esta pasada PUEDE ver.** No se comprueba que
 * la reproducción automática espere a que la demo entre en pantalla:
 * `visitAsUser` redimensiona el viewport para capturar la página entera, con lo
 * que la demo pasa a verse y arranca durante la propia captura — la
 * comprobación pasaría siempre sin demostrar nada, que es peor que no tenerla.
 * Es la misma limitación declarada que tenía la pasada del tour.
 *
 * SCOPE GUARD: página pública, sólo navegación y el raíl de la propia demo.
 * No envía nada.
 */
test("la demo del hero enseña sus cinco escenas y el raíl las gobierna", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/", "landing-hero-demo", {
    describedAs: "la demo de cinco escenas del hero de la portada",
    // Contenido real, no un contenedor vacío: si la respuesta de ChatGPT no
    // está, lo fotografiado es un marco de navegador y nada más.
    anyOf: [{ selector: "#hx-sc-0 .lp-hx-texto", text: /Maisons du Monde/ }]
  });
  assertPageIsHealthy(findings);

  // «La escena 0 se sirve puesta» se comprueba EN EL HTML SERVIDO, no en el DOM
  // vivo. Es donde vive el invariante —lo primero que se ve no puede depender
  // de hidratar— y además es lo único estable: la demo avanza sola cada 4,6 s,
  // así que en la página viva la escena 0 ya no está puesta cuando el aserto
  // llega. Afirmarlo contra el DOM daba un PILOT FAIL que no era del producto
  // sino del aserto (2026-08-23).
  const servido = await page.request.get("/");
  const html = await servido.text();
  const escena0 = html.match(/<div[^>]*id="hx-sc-0"[^>]*>/)?.[0] ?? "";
  expect(escena0, "la escena 0 no está en el HTML servido").not.toBe("");
  expect(escena0, "la escena 0 no se sirve con la clase `on`").toMatch(/class="[^"]*\bon\b/);
  expect(html, "el golpe de la escena 0 no está en el HTML servido").toContain("IKEA no aparece");

  // El raíl existe, lo pinta la isla y tiene una parada por escena.
  const pasos = page.locator(".lp-hx-step");
  await expect(pasos, "el raíl no tiene sus cinco escenas").toHaveCount(5);

  // A partir de aquí se manda a mano: el primer clic apaga la reproducción
  // automática, y sin eso cualquier aserto sobre «qué escena está puesta» es
  // una carrera contra el reloj de la demo.
  await pasos.nth(0).click();
  await expect(page.locator("#hx-sc-0"), "el raíl no volvió a la escena 0").toHaveClass(/on/, {
    timeout: 5_000
  });
  await expect(
    page.locator("#hx-foco"),
    "el golpe de la escena 0 —que la marca no aparece— no está"
  ).toContainText("no aparece");
  await captureInteraction(page, testInfo, "landing-hero-demo-escena-1");

  // Cada parada abre SU escena, y sólo una está puesta a la vez. Es la
  // comprobación que impide que un raíl con cinco botones abra un marco vacío,
  // igual que en «Cinco pantallas».
  for (const [n, id] of [[2, "hx-sc-2"], [4, "hx-sc-4"]] as const) {
    await pasos.nth(n).click();
    await expect(page.locator(`#${id}`), `la escena ${n} no se abrió`).toHaveClass(/on/, {
      timeout: 5_000
    });
    await expect(
      page.locator(".lp-hx-sc.on"),
      "hay más de una escena puesta a la vez"
    ).toHaveCount(1);
    await captureInteraction(page, testInfo, `landing-hero-demo-escena-${n + 1}`);
  }

  // Tocar el raíl apaga la reproducción automática PARA SIEMPRE: quien elige una
  // escena la está leyendo, y que se la lleve el reloj es lo que hace que una
  // demo se sienta un anuncio (log §149). Seis segundos es más de un paso
  // (4,6 s), así que si el reloj siguiera vivo esto lo cazaría.
  await page.waitForTimeout(6_000);
  await expect(
    page.locator("#hx-sc-4"),
    "la reproducción automática siguió después de tocar el raíl"
  ).toHaveClass(/on/);
});
