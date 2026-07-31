import { expect, test as setup } from "@playwright/test";
import { readPilotEnv, redact } from "./env";

const AUTH_STATE_PATH = ".pilot/auth.json";

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

  await expect(
    page.locator("#email"),
    "login form did not render — the deployment may be unreachable or gated"
  ).toBeVisible();

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
    throw new Error(
      redact(
        `Pilot login failed. Landed on ${currentUrl}. ` +
          (feedback ? `Form error: ${feedback.trim()}` : "No form error shown.")
      )
    );
  }

  await page.context().storageState({ path: AUTH_STATE_PATH });
});
