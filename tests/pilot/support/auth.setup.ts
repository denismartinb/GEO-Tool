import { mkdirSync, writeFileSync } from "node:fs";
import { expect, type Page, test as setup } from "@playwright/test";
import { TOUR_SEEN_STORAGE_KEY } from "../../../lib/onboarding/tour-steps";
import { readPilotEnv, redact } from "./env";

const AUTH_STATE_PATH = ".pilot/auth.json";

/**
 * Captures what the browser is actually looking at, into the same directory the
 * evidence branch publishes.
 *
 * This exists because a login failure is the one case where a remote agent
 * session is completely blind: Actions artifacts AND job logs are both served
 * from hosts an agent sandbox cannot reach, so the PR comment is the only
 * channel left. Without the page's title and URL in the failure message, a
 * Vercel protection wall and a genuinely broken login page look identical.
 */
async function describeCurrentPage(page: Page, label: string): Promise<string> {
  mkdirSync(".pilot/screens", { recursive: true });
  await page
    .screenshot({ path: `.pilot/screens/auth--${label}.png`, fullPage: true })
    .catch(() => undefined);

  const title = await page.title().catch(() => "(sin título)");
  const bodyText = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  const excerpt = bodyText.replace(/\s+/g, " ").trim().slice(0, 200);

  return redact(
    `URL final: ${page.url()} | título: "${title}" | texto: "${excerpt}"`
  );
}

/**
 * Logs the pilot account in once and persists the Supabase session cookies, so
 * the per-viewport journeys start already authenticated instead of paying the
 * login round trip three times.
 *
 * Uses the real email/password form (`app/login/actions.ts` →
 * `signInWithPassword`). It deliberately does NOT shortcut auth by minting a
 * token directly against Supabase: a broken login page is exactly the kind of
 * P0 the pilot exists to catch, and a shortcut would hide it.
 */
setup("authenticate as the pilot user", async ({ page }) => {
  const env = readPilotEnv();

  await page.goto("/login");

  const emailField = page.locator("#email");
  if (!(await emailField.isVisible().catch(() => false))) {
    const seen = await describeCurrentPage(page, "login-not-rendered");
    throw new Error(
      `El formulario de login no renderizó. ${seen}\n` +
        "Si el título o el texto mencionan Vercel/Authentication, es la " +
        "Deployment Protection del preview, no un fallo del producto: " +
        "desactívala para Preview o define PILOT_VERCEL_BYPASS."
    );
  }

  await page.locator("#email").fill(env.email);
  await page.locator("#password").fill(env.password);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();

  // A successful login server action redirects to /dashboard. A failed one
  // re-renders /login with `?error=`, which must fail loudly here rather than
  // letting every downstream journey report a confusing "redirected to login".
  await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 30_000 }).catch(() => {
    // fall through to the assertion below for a readable failure message
  });

  const currentUrl = page.url();
  if (!/\/dashboard(\/|$|\?)/.test(currentUrl)) {
    const feedback = await page.locator(".feedback.error").first().textContent().catch(() => null);
    const seen = await describeCurrentPage(page, "login-rejected");
    throw new Error(
      redact(
        `El login del piloto falló. ${seen}` +
          (feedback ? ` | error del formulario: "${feedback.trim()}"` : " | sin error en el formulario.")
      )
    );
  }

  // `storageState()` persiste también el `localStorage`, y el login aterriza en
  // /dashboard, donde el tour de bienvenida salta y se marca como visto. Sin
  // quitar esa marca, el estado compartido llegaría a TODAS las pasadas
  // diciendo «este navegador ya lo vio» y el popup no volvería a salir jamás
  // — es decir, el piloto no podría verlo nunca, que es justo la trampa que el
  // CLAUDE.md documenta del 2026-08-02: dar por verificado lo que no se miró.
  //
  // Se filtra del estado ya capturado, NO con un `removeItem` sobre la página.
  // Borrarlo en la página es una carrera que se pierde: `waitForURL` resuelve
  // al navegar, antes de que React hidrate, así que el borrado se adelanta al
  // efecto que escribe la marca y el efecto la vuelve a poner justo a tiempo de
  // que `storageState()` la capture. Pasó exactamente eso (2026-08-07): el
  // popup no salió en ninguna de las tres anchuras y la consola se veía
  // impecable detrás. Filtrar el objeto no depende de ningún instante.
  const state = await page.context().storageState();
  for (const origin of state.origins ?? []) {
    origin.localStorage = (origin.localStorage ?? []).filter(
      (entry) => entry.name !== TOUR_SEEN_STORAGE_KEY
    );
  }
  mkdirSync(".pilot", { recursive: true });
  writeFileSync(AUTH_STATE_PATH, JSON.stringify(state, null, 2));
});
