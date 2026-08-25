# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: support/auth.setup.ts >> authenticate as the pilot user
- Location: tests/pilot/support/auth.setup.ts:46:6

# Error details

```
Error: El login del piloto falló. URL final: https://geo-tool-c9bgih5xv-9v7mrc44g8-1223s-projects.vercel.app/login?error=Email%20o%20contrase%C3%B1a%20incorrectos. | título: "Iniciar sesión — GenScore" | texto: "Bienvenido de nuevo Accede a tu panel y sigue mejorando tu visibilidad en IA. Email de trabajo Contraseña ¿Olvidaste tu contraseña? Email o contraseña incorrectos. Iniciar sesión o continúa con Contin" | error del formulario: "Email o contraseña incorrectos."
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
  1   | import { mkdirSync, writeFileSync } from "node:fs";
  2   | import { expect, type Page, test as setup } from "@playwright/test";
  3   | import { TOUR_SEEN_STORAGE_KEY } from "../../../lib/onboarding/tour-steps";
  4   | import { readPilotEnv, redact } from "./env";
  5   | 
  6   | const AUTH_STATE_PATH = ".pilot/auth.json";
  7   | 
  8   | /**
  9   |  * Captures what the browser is actually looking at, into the same directory the
  10  |  * evidence branch publishes.
  11  |  *
  12  |  * This exists because a login failure is the one case where a remote agent
  13  |  * session is completely blind: Actions artifacts AND job logs are both served
  14  |  * from hosts an agent sandbox cannot reach, so the PR comment is the only
  15  |  * channel left. Without the page's title and URL in the failure message, a
  16  |  * Vercel protection wall and a genuinely broken login page look identical.
  17  |  */
  18  | async function describeCurrentPage(page: Page, label: string): Promise<string> {
  19  |   mkdirSync(".pilot/screens", { recursive: true });
  20  |   await page
  21  |     .screenshot({ path: `.pilot/screens/auth--${label}.png`, fullPage: true })
  22  |     .catch(() => undefined);
  23  | 
  24  |   const title = await page.title().catch(() => "(sin título)");
  25  |   const bodyText = await page
  26  |     .locator("body")
  27  |     .innerText()
  28  |     .catch(() => "");
  29  |   const excerpt = bodyText.replace(/\s+/g, " ").trim().slice(0, 200);
  30  | 
  31  |   return redact(
  32  |     `URL final: ${page.url()} | título: "${title}" | texto: "${excerpt}"`
  33  |   );
  34  | }
  35  | 
  36  | /**
  37  |  * Logs the pilot account in once and persists the Supabase session cookies, so
  38  |  * the per-viewport journeys start already authenticated instead of paying the
  39  |  * login round trip three times.
  40  |  *
  41  |  * Uses the real email/password form (`app/login/actions.ts` →
  42  |  * `signInWithPassword`). It deliberately does NOT shortcut auth by minting a
  43  |  * token directly against Supabase: a broken login page is exactly the kind of
  44  |  * P0 the pilot exists to catch, and a shortcut would hide it.
  45  |  */
  46  | setup("authenticate as the pilot user", async ({ page }) => {
  47  |   const env = readPilotEnv();
  48  | 
  49  |   await page.goto("/login");
  50  | 
  51  |   const emailField = page.locator("#email");
  52  |   if (!(await emailField.isVisible().catch(() => false))) {
  53  |     const seen = await describeCurrentPage(page, "login-not-rendered");
  54  |     throw new Error(
  55  |       `El formulario de login no renderizó. ${seen}\n` +
  56  |         "Si el título o el texto mencionan Vercel/Authentication, es la " +
  57  |         "Deployment Protection del preview, no un fallo del producto: " +
  58  |         "desactívala para Preview o define PILOT_VERCEL_BYPASS."
  59  |     );
  60  |   }
  61  | 
  62  |   await page.locator("#email").fill(env.email);
  63  |   await page.locator("#password").fill(env.password);
  64  |   await page.getByRole("button", { name: /iniciar sesión/i }).click();
  65  | 
  66  |   // A successful login server action redirects to /dashboard. A failed one
  67  |   // re-renders /login with `?error=`, which must fail loudly here rather than
  68  |   // letting every downstream journey report a confusing "redirected to login".
  69  |   await page.waitForURL(/\/dashboard(\/|$|\?)/, { timeout: 30_000 }).catch(() => {
  70  |     // fall through to the assertion below for a readable failure message
  71  |   });
  72  | 
  73  |   const currentUrl = page.url();
  74  |   if (!/\/dashboard(\/|$|\?)/.test(currentUrl)) {
  75  |     const feedback = await page.locator(".feedback.error").first().textContent().catch(() => null);
  76  |     const seen = await describeCurrentPage(page, "login-rejected");
> 77  |     throw new Error(
      |           ^ Error: El login del piloto falló. URL final: https://geo-tool-c9bgih5xv-9v7mrc44g8-1223s-projects.vercel.app/login?error=Email%20o%20contrase%C3%B1a%20incorrectos. | título: "Iniciar sesión — GenScore" | texto: "Bienvenido de nuevo Accede a tu panel y sigue mejorando tu visibilidad en IA. Email de trabajo Contraseña ¿Olvidaste tu contraseña? Email o contraseña incorrectos. Iniciar sesión o continúa con Contin" | error del formulario: "Email o contraseña incorrectos."
  78  |       redact(
  79  |         `El login del piloto falló. ${seen}` +
  80  |           (feedback ? ` | error del formulario: "${feedback.trim()}"` : " | sin error en el formulario.")
  81  |       )
  82  |     );
  83  |   }
  84  | 
  85  |   // `storageState()` persiste también el `localStorage`, y el login aterriza en
  86  |   // /dashboard, donde el tour de bienvenida salta y se marca como visto. Sin
  87  |   // quitar esa marca, el estado compartido llegaría a TODAS las pasadas
  88  |   // diciendo «este navegador ya lo vio» y el popup no volvería a salir jamás
  89  |   // — es decir, el piloto no podría verlo nunca, que es justo la trampa que el
  90  |   // CLAUDE.md documenta del 2026-08-02: dar por verificado lo que no se miró.
  91  |   //
  92  |   // Se filtra del estado ya capturado, NO con un `removeItem` sobre la página.
  93  |   // Borrarlo en la página es una carrera que se pierde: `waitForURL` resuelve
  94  |   // al navegar, antes de que React hidrate, así que el borrado se adelanta al
  95  |   // efecto que escribe la marca y el efecto la vuelve a poner justo a tiempo de
  96  |   // que `storageState()` la capture. Pasó exactamente eso (2026-08-07): el
  97  |   // popup no salió en ninguna de las tres anchuras y la consola se veía
  98  |   // impecable detrás. Filtrar el objeto no depende de ningún instante.
  99  |   const state = await page.context().storageState();
  100 |   for (const origin of state.origins ?? []) {
  101 |     origin.localStorage = (origin.localStorage ?? []).filter(
  102 |       (entry) => entry.name !== TOUR_SEEN_STORAGE_KEY
  103 |     );
  104 |   }
  105 |   mkdirSync(".pilot", { recursive: true });
  106 |   writeFileSync(AUTH_STATE_PATH, JSON.stringify(state, null, 2));
  107 | });
  108 | 
```