import { expect, test } from "@playwright/test";
import { assertPageIsHealthy, visitAsUser } from "../support/journey";

/**
 * PRELAUNCH-HARDENING-1 Fase P2 — las dos pantallas de autenticación que el
 * piloto nunca había abierto: `/signup` y `/forgot-password`.
 *
 * **Por qué necesitan su propio contexto, sin sesión.** Cada proyecto del
 * arnés (`mobile`/`tablet`/`desktop`) monta con `storageState: .pilot/auth.json`
 * — la cuenta piloto entra siempre autenticada, que es lo correcto para las
 * pantallas de consola. Pero `app/signup/page.tsx` hace
 * `if (user) redirect("/dashboard")`: visitarla con esa sesión no enseña el
 * formulario de alta, enseña el dashboard con otro nombre. `visitAsUser` no lo
 * distinguiría como fallo por sí solo —`bouncedToLogin` sólo vigila `/login`—,
 * así que la comprobación real recae en `ContentExpectation`: sin el
 * formulario visible, `renderedRealContent` sale `false` y
 * `assertPageIsHealthy` lo rechaza. Aun así, un contexto de verdad sin sesión
 * es lo honesto: es exactamente el visitante que estas dos pantallas sirven.
 *
 * `test.use` aquí abajo sustituye el `storageState` del proyecto SÓLO para
 * este fichero — el resto del arnés sigue entrando con la cuenta piloto.
 *
 * SCOPE GUARD: sólo navegación GET. Nunca se envía el formulario — ni el alta
 * ni el envío del código de recuperación tocan Supabase Auth ni mandan correo.
 * Es la misma frontera que ya respeta el resto del set de lectura.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/** Ambas declaran `robots: { index: false, follow: true }` (SEO-POS-1 T10) — nunca lo había verificado el piloto. */
async function assertNoindexFollow(page: import("@playwright/test").Page, label: string): Promise<void> {
  const contents = await page
    .locator('meta[name="robots"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("content") ?? ""));
  expect(contents.length, `${label}: no declara ninguna meta robots`).toBeGreaterThan(0);
  expect(
    contents.some((c) => c.includes("noindex")),
    `${label}: ninguna meta robots dice noindex`
  ).toBe(true);
  expect(
    contents.some((c) => c.includes("nofollow")),
    `${label}: una meta robots dice nofollow — sus enlaces dejarían de repartir autoridad`
  ).toBe(false);
}

test("/signup renders the sign-up form for a signed-out visitor", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/signup", "signup", {
    describedAs: "el formulario de alta (email, contraseña, confirmar contraseña)",
    anyOf: [{ selector: "form" }, { text: /Crea tu cuenta/i }]
  });
  assertPageIsHealthy(findings);

  await expect(page.getByRole("heading", { name: /Crea tu cuenta/i })).toBeVisible();
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.locator("#confirmPassword")).toBeVisible();

  await assertNoindexFollow(page, "/signup");
});

test("/forgot-password renders the reset-request step for a signed-out visitor", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/forgot-password", "forgot-password", {
    describedAs: "el formulario de recuperación (email + botón de envío del código)",
    anyOf: [{ text: /¿Olvidaste tu contraseña\?/i }]
  });
  assertPageIsHealthy(findings);

  await expect(page.getByText(/¿Olvidaste tu contraseña\?/i)).toBeVisible();
  await expect(page.locator("#reset-email")).toBeVisible();
  await expect(page.getByRole("button", { name: /Enviar código de recuperación/i })).toBeVisible();

  await assertNoindexFollow(page, "/forgot-password");
});
