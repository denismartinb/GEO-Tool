# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: support/auth.setup.ts >> authenticate as the pilot user
- Location: tests/pilot/support/auth.setup.ts:45:6

# Error details

```
Error: El login del piloto falló. URL final: https://geo-tool-9n5ihzdk3-9v7mrc44g8-1223s-projects.vercel.app/login?error=Email%20o%20contrase%C3%B1a%20incorrectos. | título: "Iniciar sesión — GenScore" | texto: "Bienvenido de nuevo Accede a tu panel y sigue mejorando tu visibilidad en IA. Email de trabajo Contraseña ¿Olvidaste tu contraseña? Email o contraseña incorrectos. Iniciar sesión o continúa con Contin" | error del formulario: "Email o contraseña incorrectos."
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]
  - main [ref=e3]:
    - generic [ref=e4]:
      - img "GenScore" [ref=e6]
      - generic [ref=e10]: Bienvenido de nuevo
      - generic [ref=e11]: Accede a tu panel y sigue mejorando tu visibilidad en IA.
      - generic [ref=e12]:
        - generic [ref=e13]:
          - generic [ref=e14]: Email de trabajo
          - textbox "Email de trabajo" [ref=e15]:
            - /placeholder: nombre@empresa.com
        - generic [ref=e16]:
          - generic [ref=e17]:
            - generic [ref=e18]: Contraseña
            - link "¿Olvidaste tu contraseña?" [ref=e19] [cursor=pointer]:
              - /url: /forgot-password
          - generic [ref=e20]:
            - textbox "Contraseña" [ref=e21]
            - button "Mostrar contraseña" [ref=e22] [cursor=pointer]
        - paragraph [ref=e26]: Email o contraseña incorrectos.
        - button "Iniciar sesión" [ref=e27] [cursor=pointer]
      - generic [ref=e28]: o continúa con
      - button "Continuar con Google" [ref=e31] [cursor=pointer]
      - generic [ref=e37]:
        - text: ¿No tienes cuenta?
        - link "Regístrate" [ref=e38] [cursor=pointer]:
          - /url: /signup
      - generic [ref=e39]: Al continuar, aceptas nuestros Términos y la Política de privacidad.
```

# Test source

```ts
  1  | import { mkdirSync, writeFileSync } from "node:fs";
  2  | import { expect, type Page, test as setup } from "@playwright/test";
  3  | import { readPilotEnv, redact } from "./env";
  4  | 
  5  | const AUTH_STATE_PATH = ".pilot/auth.json";
  6  | 
  7  | /**
  8  |  * Captures what the browser is actually looking at, into the same directory the
  9  |  * evidence branch publishes.
  10 |  *
  11 |  * This exists because a login failure is the one case where a remote agent
  12 |  * session is completely blind: Actions artifacts AND job logs are both served
  13 |  * from hosts an agent sandbox cannot reach, so the PR comment is the only
  14 |  * channel left. Without the page's title and URL in the failure message, a
  15 |  * Vercel protection wall and a genuinely broken login page look identical.
  16 |  */
  17 | async function describeCurrentPage(page: Page, label: string): Promise<string> {
  18 |   mkdirSync(".pilot/screens", { recursive: true });
  19 |   await page
  20 |     .screenshot({ path: `.pilot/screens/auth--${label}.png`, fullPage: true })
  21 |     .catch(() => undefined);
  22 | 
  23 |   const title = await page.title().catch(() => "(sin título)");
  24 |   const bodyText = await page
  25 |     .locator("body")
  26 |     .innerText()
  27 |     .catch(() => "");
  28 |   const excerpt = bodyText.replace(/\s+/g, " ").trim().slice(0, 200);
  29 | 
  30 |   return redact(
  31 |     `URL final: ${page.url()} | título: "${title}" | texto: "${excerpt}"`
  32 |   );
  33 | }
  34 | 
  35 | /**
  36 |  * Logs the pilot account in once and persists the Supabase session cookies, so
  37 |  * the per-viewport journeys start already authenticated instead of paying the
  38 |  * login round trip three times.
  39 |  *
  40 |  * Uses the real email/password form (`app/login/actions.ts` →
  41 |  * `signInWithPassword`). It deliberately does NOT shortcut auth by minting a
  42 |  * token directly against Supabase: a broken login page is exactly the kind of
  43 |  * P0 the pilot exists to catch, and a shortcut would hide it.
  44 |  */
  45 | setup("authenticate as the pilot user", async ({ page }) => {
  46 |   const env = readPilotEnv();
  47 | 
  48 |   await page.goto("/login");
  49 | 
  50 |   const emailField = page.locator("#email");
  51 |   if (!(await emailField.isVisible().catch(() => false))) {
  52 |     const seen = await describeCurrentPage(page, "login-not-rendered");
  53 |     throw new Error(
  54 |       `El formulario de login no renderizó. ${seen}\n` +
  55 |         "Si el título o el texto mencionan Vercel/Authentication, es la " +
  56 |         "Deployment Protection del preview, no un fallo del producto: " +
  57 |         "desactívala para Preview o define PILOT_VERCEL_BYPASS."
  58 |     );
  59 |   }
  60 | 
  61 |   await page.locator("#email").fill(env.email);
  62 |   await page.locator("#password").fill(env.password);
  63 |   await page.getByRole("button", { name: /iniciar sesión/i }).click();
  64 | 
  65 |   // A successful login server action redirects to /dashboard. A failed one
  66 |   // re-renders /login with `?error=`, which must fail loudly here rather than
  67 |   // letting every downstream journey report a confusing "redirected to login".
  68 |   await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 30_000 }).catch(() => {
  69 |     // fall through to the assertion below for a readable failure message
  70 |   });
  71 | 
  72 |   const currentUrl = page.url();
  73 |   if (!/\/dashboard(\/|$|\?)/.test(currentUrl)) {
  74 |     const feedback = await page.locator(".feedback.error").first().textContent().catch(() => null);
  75 |     const seen = await describeCurrentPage(page, "login-rejected");
> 76 |     throw new Error(
     |           ^ Error: El login del piloto falló. URL final: https://geo-tool-9n5ihzdk3-9v7mrc44g8-1223s-projects.vercel.app/login?error=Email%20o%20contrase%C3%B1a%20incorrectos. | título: "Iniciar sesión — GenScore" | texto: "Bienvenido de nuevo Accede a tu panel y sigue mejorando tu visibilidad en IA. Email de trabajo Contraseña ¿Olvidaste tu contraseña? Email o contraseña incorrectos. Iniciar sesión o continúa con Contin" | error del formulario: "Email o contraseña incorrectos."
  77 |       redact(
  78 |         `El login del piloto falló. ${seen}` +
  79 |           (feedback ? ` | error del formulario: "${feedback.trim()}"` : " | sin error en el formulario.")
  80 |       )
  81 |     );
  82 |   }
  83 | 
  84 |   // La marca de «ya visto» del tour de bienvenida vive en `profiles`
  85 |   // (ONBOARDING-TOUR-PERSIST-1) y no en `localStorage`, así que ya no es
  86 |   // parte de este `storageState` y no hay nada que filtrar aquí. Es una
  87 |   // marca por CUENTA, no por navegador/contexto: `onboarding-tour.spec.ts` es
  88 |   // quien necesita verla "no vista" y es quien la resetea, justo antes de
  89 |   // comprobarlo, vía `POST /api/account/onboarding-tour/reset` — resetear
  90 |   // aquí, una vez, no bastaría, porque cualquier otra pasada que visite
  91 |   // /dashboard antes consumiría la marca real del producto primero.
  92 |   const state = await page.context().storageState();
  93 |   mkdirSync(".pilot", { recursive: true });
  94 |   writeFileSync(AUTH_STATE_PATH, JSON.stringify(state, null, 2));
  95 | });
  96 | 
```