import { expect, test } from "@playwright/test";
import { WELCOME_TOUR_SCRIM, dismissWelcomeTour } from "../../support/journey";
import { captureStep } from "../../support/write-guard";

/**
 * ONBOARDING-TOUR-PERSIST-1 (2026-08-25) — la escena de «primer acceso» del
 * tour de bienvenida, movida aquí desde `journeys/onboarding-tour.spec.ts`.
 *
 * POR QUÉ ES UN JOURNEY DE ESCRITURA Y NO DE LECTURA
 * ----------------------------------------------------
 * La marca de «ya lo he visto» vivía en `localStorage`: forzarla a «no
 * visto» era borrar un valor del navegador desechable de cada test, sin
 * tocar nada real. Desde esta fase vive en `profiles.onboarding_tour_seen_at`
 * — una fila real, compartida por TODAS las pasadas de esta misma cuenta
 * piloto — así que forzarla es una escritura de producto (aunque sea sobre
 * un booleano de UI, no sobre datos de negocio). El piloto siempre-on (cada
 * preview deploy) es estrictamente de lectura por convención de código, no
 * de estilo (CLAUDE.md, "Pilot write scope"), así que esta escena sólo puede
 * vivir bajo `--journeys write`.
 *
 * COST GUARD
 * ----------
 * Un único `UPDATE` sobre la propia fila de `profiles` de la cuenta piloto
 * (`POST /api/account/onboarding-tour/reset`, owner-scoped por sesión) — cero
 * llamadas a un LLM, cero coste. Dedicado a la propia cuenta piloto por
 * construcción: no hay `projectId` ni dominio que resolver, así que no puede
 * alcanzar ningún proyecto real de un cliente. Idempotente: cada pasada
 * resetea antes de comprobar, así que el orden respecto a otras pasadas del
 * mismo run no importa.
 *
 * SCOPE GUARD: el único escrito es ese reset. El resto es lectura — navega, y
 * pulsa los propios controles del tour (Siguiente, la X).
 */

const TITLE = "Aprende cómo funciona";

test("el tour de bienvenida sale solo en el primer acceso y no vuelve tras recargar", async ({
  page
}) => {
  const reset = await page.request.post("/api/account/onboarding-tour/reset");
  expect(reset.ok(), "no se pudo resetear la marca de «ya visto» antes de la prueba").toBe(true);

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

  // Contenido real, no un lienzo en blanco.
  await expect
    .poll(
      async () => (await page.locator("[data-pt=typed]").first().textContent())?.trim().length ?? 0,
      {
        message: "el paso 1 nunca llegó a escribir el dominio: el tour no arrancó",
        timeout: 15_000
      }
    )
    .toBeGreaterThan(0);
  await captureStep(page, "onboarding-tour-primer-acceso");

  // Sólo el primer paso se reproduce solo (log §40). Comprobado midiendo, no
  // asumido: pasados varios segundos el paso activo tiene que seguir siendo el
  // primero. Si alguien devuelve la reproducción encadenada, esto lo caza.
  await page.waitForTimeout(6_000);
  await expect(
    page.locator(".pt-dot").first(),
    "el tour siguió solo más allá del paso 1: la reproducción automática debe pararse ahí"
  ).toHaveClass(/is-on/);

  // Se cierra con su propia X — no hace falta repetir aquí el resto de la
  // mecánica del tour (Siguiente, el enlace a /geo): eso ya lo verifica
  // `journeys/onboarding-tour.spec.ts` reabriéndolo desde el menú, en cada
  // pasada de lectura. Lo único que esta prueba puede verificar y la de
  // lectura no puede es justo el «sale solo» + «no vuelve».
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
  await captureStep(page, "onboarding-tour-no-vuelve-tras-recargar");
});
