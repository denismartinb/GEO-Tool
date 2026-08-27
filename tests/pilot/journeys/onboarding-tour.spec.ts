import { expect, test, type Page } from "@playwright/test";
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

  const reopen = page.getByRole("button", { name: /Qué es el GEO/i });

  // PILOT-DRAWER-VIEWPORT-1 (2026-08-27, log §176). Bajo 760px la barra
  // lateral es un cajón `position: fixed` que vive en `translateX(-100%)`
  // hasta que la clase `mobnav-open` lo trae; sus botones están en el DOM y
  // pintados TODO el tiempo, sólo que fuera de pantalla por la izquierda. Para
  // Playwright eso es «visible» —caja no vacía, sin `visibility: hidden`—, así
  // que `toBeVisible()` no distingue el cajón abierto del cerrado y pasaba
  // igual con el menú cerrado; el fallo aparecía un renglón más abajo, en el
  // clic, como «element is outside of the viewport» tras 15s. La aserción que
  // sí sabe la diferencia es `toBeInViewport()`, y es la que va aquí.
  //
  // Así que la condición ya no es «¿hay hamburguesa?» —que en un preview frío
  // se preguntaba antes de que la cabecera pintara y se contestaba que no— sino
  // «¿se alcanza la entrada del menú?». Si no, hay cajón que abrir, lo diga el
  // ancho o lo diga la hidratación.
  await expect(reopen, "«¿Qué es el GEO?» desapareció del menú lateral").toBeVisible();
  const needsDrawer = await expect(reopen)
    .toBeInViewport({ timeout: 1_000 })
    .then(
      () => false,
      () => true
    );

  if (needsDrawer) {
    // El clic se reintenta hasta que el cajón llega de verdad, sin espera fija
    // — mismo remedio y misma razón que PILOT-HYDRATION-CLICK-1 (log §136): el
    // `onClick` no existe hasta que React hidrata y un clic anterior no se
    // encola, se pierde. Repetirlo es seguro porque el botón hace
    // `setMobileNavOpen(true)`, no un alternar (`components/workspace-topbar.tsx`).
    const burger = page.getByRole("button", { name: "Abrir menú de navegación" });
    await expect(async () => {
      await burger.click();
      await expect(reopen).toBeInViewport();
    }, "el cajón de navegación móvil no llegó a traer «¿Qué es el GEO?» a la pantalla").toPass({
      timeout: 15_000
    });
  }

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
/**
 * Cada escena declara a qué elemento apunta su cursor. Está aquí y no
 * importado del componente a propósito: si alguien renombra un `id` en el
 * marcado, esta pasada tiene que ROMPERSE, no seguirle la corriente.
 */
const DIANA_POR_ESCENA = ["hx-foco", "hx-dial-1", "hx-fila-tuya", "hx-generar", "hx-evo"] as const;

/**
 * Las animaciones de una escena son CSS con `fill: both` y a los ~2,5 s dejan
 * un fotograma final estable — es el contrato que hace determinista lo que se
 * fotografía (`.claude/rules/onboarding.md`, «Un solo reloj»). Sin esta espera
 * la captura salía a mitad de camino: el 2026-08-23 las tres capturas del
 * cursor lo enseñaban EN VUELO, a 85px de lo que señalaba, porque
 * `captureInteraction` corría en cuanto la clase `on` aparecía.
 */
async function asentarEscena(page: Page) {
  await page.waitForTimeout(2_600);
}

/**
 * El cursor apunta a ELEMENTOS, no a coordenadas — el invariante que el tour ya
 * documenta y que la demo hereda. Se comprueba midiendo: el centro de la diana
 * contra la traslación real del cursor, con holgura para el último fotograma de
 * la animación de entrada. Un `id` mal escrito deja el cursor en reposo (fuera
 * del marco) y eso lo caza esta distancia, no una captura que nadie abre.
 */
async function esperarCursorEn(page: Page, id: string) {
  const medida = await page.evaluate((diana) => {
    const caja = document.querySelector("#lp-hx");
    const cursor = document.querySelector(".lp-hx-cur");
    const meta = document.getElementById(diana);
    if (!caja || !cursor || !meta) return { falta: { caja: !caja, cursor: !cursor, meta: !meta } };
    const c = caja.getBoundingClientRect();
    const m = meta.getBoundingClientRect();
    const t = new DOMMatrix(getComputedStyle(cursor).transform);
    return {
      activo: cursor.classList.contains("activo"),
      dx: Math.abs(t.m41 - (m.left - c.left + m.width / 2)),
      dy: Math.abs(t.m42 - (m.top - c.top + m.height / 2))
    };
  }, id);

  expect(medida.falta, `no se pudo medir el cursor contra #${id}`).toBeUndefined();
  expect(medida.activo, `el cursor sigue en reposo en vez de señalar #${id}`).toBe(true);
  // 12px, no 24: medido en 375/768/1280 la distancia real es 0-1px, así que la
  // holgura es para el redondeo de un runner, no para tapar un desajuste.
  expect(medida.dx, `el cursor está a ${Math.round(medida.dx!)}px de #${id} en horizontal`).toBeLessThan(12);
  expect(medida.dy, `el cursor está a ${Math.round(medida.dy!)}px de #${id} en vertical`).toBeLessThan(12);
}

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
  await asentarEscena(page);
  await esperarCursorEn(page, "hx-foco");
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
    await asentarEscena(page);
    await esperarCursorEn(page, DIANA_POR_ESCENA[n]);
    await captureInteraction(page, testInfo, `landing-hero-demo-escena-${n + 1}`);
  }

  // Tocar el raíl apaga la reproducción automática PARA SIEMPRE: quien elige una
  // escena la está leyendo, y que se la lleve el reloj es lo que hace que una
  // demo se sienta un anuncio (log §157). Seis segundos es más de un paso
  // (4,6 s), así que si el reloj siguiera vivo esto lo cazaría.
  await page.waitForTimeout(6_000);
  await expect(
    page.locator("#hx-sc-4"),
    "la reproducción automática siguió después de tocar el raíl"
  ).toHaveClass(/on/);
});
