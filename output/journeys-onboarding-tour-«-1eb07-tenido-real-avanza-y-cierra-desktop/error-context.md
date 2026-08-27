# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/onboarding-tour.spec.ts >> «¿Qué es el GEO?» reabre el tour con contenido real, avanza y cierra
- Location: tests/pilot/journeys/onboarding-tour.spec.ts:45:5

# Error details

```
Error: «¿Qué es el GEO?» desapareció del menú lateral

expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /Qué es el GEO/i })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - «¿Qué es el GEO?» desapareció del menú lateral with timeout 15000ms
  - waiting for getByRole('button', { name: /Qué es el GEO/i })

```

```yaml
- main:
  - img "GenScore"
  - text: Bienvenido de nuevo Accede a tu panel y sigue mejorando tu visibilidad en IA. Email de trabajo
  - textbox "Email de trabajo":
    - /placeholder: nombre@empresa.com
  - text: Contraseña
  - link "¿Olvidaste tu contraseña?":
    - /url: /forgot-password
  - textbox "Contraseña"
  - button "Mostrar contraseña"
  - button "Iniciar sesión"
  - text: o continúa con
  - button "Continuar con Google"
  - text: ¿No tienes cuenta?
  - link "Regístrate":
    - /url: /signup
  - text: Al continuar, aceptas nuestros Términos y la Política de privacidad.
- alert
```

# Test source

```ts
  1   | import { expect, test, type Page } from "@playwright/test";
  2   | import {
  3   |   WELCOME_TOUR_SCRIM,
  4   |   assertPageIsHealthy,
  5   |   captureInteraction,
  6   |   dismissWelcomeTour,
  7   |   visitAsUser
  8   | } from "../support/journey";
  9   | 
  10  | /**
  11  |  * ONBOARDING-TOUR-1 — el tour «Aprende cómo funciona» (log §40).
  12  |  *
  13  |  * Por qué existe esta pasada. `visitAsUser` cierra el popup nada más llegar,
  14  |  * porque es un modal que tapa la pantalla y bloquea todo lo que hay detrás
  15  |  * (2026-08-07: tumbó seis pruebas por `Timeout` contra elementos sanos). Pero
  16  |  * cerrar algo sin mirarlo lo deja **sin verificar**, y ésa es exactamente la
  17  |  * trampa que el CLAUDE.md documenta del 2026-08-02: una tabla de ✅ que
  18  |  * certifica una pantalla que el piloto nunca vio de verdad. Así que aquí se
  19  |  * abre, se comprueba que trae contenido real —no un lienzo vacío—, se
  20  |  * fotografía y se cierra.
  21  |  *
  22  |  * ONBOARDING-TOUR-PERSIST-1 (2026-08-25) movió la escena de «sale solo en el
  23  |  * primer acceso y no vuelve tras recargar» a
  24  |  * `journeys/write/onboarding-tour-first-run.spec.ts`. Antes esta pasada podía
  25  |  * forzar «no visto» borrando `localStorage`, una escritura inocua sobre el
  26  |  * navegador desechable de cada test. Ahora la marca vive en `profiles` — una
  27  |  * fila real, compartida por TODAS las pasadas de esta misma cuenta— así que
  28  |  * forzarla a «no visto» es una escritura de producto, y el piloto siempre-on
  29  |  * (cada preview deploy) está prohibido de escribir por convención de código,
  30  |  * no sólo de estilo (CLAUDE.md, "Pilot write scope"). Esa escena pasa a
  31  |  * `--journeys write`, igual que cualquier otra siembra de estado.
  32  |  *
  33  |  * Lo que SÍ sigue siendo determinista sin ninguna escritura: reabrir el tour
  34  |  * desde «¿Qué es el GEO?» funciona pase lo que pase con la marca de «ya
  35  |  * visto» — es la vía que existe precisamente para volver a verlo. Esta
  36  |  * pasada verifica esa vía, siempre.
  37  |  *
  38  |  * SCOPE GUARD: estrictamente de lectura. Navega, pulsa el botón del menú que
  39  |  * reabre el tour y los propios controles del tour (Siguiente, la X). No
  40  |  * lanza escaneos, no crea proyectos, no envía formularios, no escribe nada.
  41  |  */
  42  | 
  43  | const TITLE = "Aprende cómo funciona";
  44  | 
  45  | test("«¿Qué es el GEO?» reabre el tour con contenido real, avanza y cierra", async ({ page }, testInfo) => {
  46  |   await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  47  |   await page.waitForTimeout(1_500);
  48  | 
  49  |   // Si el popup salió solo (primer acceso real de esta cuenta en esta
  50  |   // pasada), se cierra sin verificarlo aquí — eso es lo que el journey de
  51  |   // escritura comprueba a propósito, con la marca reseteada. Reabrir desde el
  52  |   // menú tiene que funcionar en cualquiera de los dos estados de partida.
  53  |   await dismissWelcomeTour(page);
  54  | 
  55  |   const burger = page.getByRole("button", { name: "Abrir menú de navegación" });
  56  |   if (await burger.isVisible().catch(() => false)) {
  57  |     await burger.click();
  58  |     await page.waitForTimeout(400);
  59  |   }
  60  | 
  61  |   const reopen = page.getByRole("button", { name: /Qué es el GEO/i });
> 62  |   await expect(reopen, "«¿Qué es el GEO?» desapareció del menú lateral").toBeVisible();
      |                                                                          ^ Error: «¿Qué es el GEO?» desapareció del menú lateral
  63  |   await reopen.click();
  64  | 
  65  |   const scrim = page.locator(WELCOME_TOUR_SCRIM);
  66  |   await expect(scrim, "«¿Qué es el GEO?» del menú no reabrió el tour").toBeVisible({ timeout: 5_000 });
  67  |   await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  68  | 
  69  |   // Contenido real, no un lienzo en blanco. El paso 1 teclea el dominio; si el
  70  |   // reloj no ha corrido, `[data-pt=typed]` sigue vacío y la captura no probaría
  71  |   // nada — un popup que carga vacío es tan poco verificado como uno que no sale.
  72  |   await expect
  73  |     .poll(
  74  |       async () => (await page.locator("[data-pt=typed]").first().textContent())?.trim().length ?? 0,
  75  |       {
  76  |         message: "el paso 1 nunca llegó a escribir el dominio: el tour no arrancó",
  77  |         timeout: 15_000
  78  |       }
  79  |     )
  80  |     .toBeGreaterThan(0);
  81  |   await captureInteraction(page, testInfo, "onboarding-tour-reabierto-desde-el-menu");
  82  | 
  83  |   // Siguiente cambia de paso de verdad — un control muerto es un hallazgo.
  84  |   await page.getByRole("button", { name: /Siguiente/ }).click();
  85  |   await expect(page.locator(".pt-dot").nth(1), "«Siguiente» no avanzó al paso 2").toHaveClass(
  86  |     /is-on/,
  87  |     { timeout: 5_000 }
  88  |   );
  89  |   await captureInteraction(page, testInfo, "onboarding-tour-paso-2");
  90  | 
  91  |   // El enlace del pie es la puerta a /geo que el fundador pidió conservar.
  92  |   await expect(
  93  |     page.locator(`${WELCOME_TOUR_SCRIM} a[href="/geo"]`),
  94  |     "el popup perdió el enlace «¿Qué es el GEO?»"
  95  |   ).toBeVisible();
  96  | 
  97  |   // Se cierra con su propia X, no con Escape ni con un clic fuera: si la X deja
  98  |   // de cerrar, esto tiene que fallar en vez de taparlo con una vía alternativa.
  99  |   expect(await dismissWelcomeTour(page), "el popup no se pudo cerrar con su X").toBe(true);
  100 |   await expect(scrim).toBeHidden();
  101 | });
  102 | 
  103 | /**
  104 |  * La DEMO del hero de la portada (HOME-2026-08 Fase A2).
  105 |  *
  106 |  * **Sustituye a la pasada del tour en la landing, que ya no existe ahí.** El
  107 |  * artboard aprobado pone en ese hueco una historia de cinco escenas, no el
  108 |  * tour; el tour sigue vivo y sigue cubierto por la pasada de arriba, en su
  109 |  * sitio de verdad — el popup de bienvenida de la consola. Lo que cambia es que
  110 |  * la portada estrena una pieza y no puede quedarse sin mirar: media Fase A2
  111 |  * vive ahí, y un PILOT PASS sin esto certificaría la mitad.
  112 |  *
  113 |  * **Lo que se comprueba es lo que esta pasada PUEDE ver.** No se comprueba que
  114 |  * la reproducción automática espere a que la demo entre en pantalla:
  115 |  * `visitAsUser` redimensiona el viewport para capturar la página entera, con lo
  116 |  * que la demo pasa a verse y arranca durante la propia captura — la
  117 |  * comprobación pasaría siempre sin demostrar nada, que es peor que no tenerla.
  118 |  * Es la misma limitación declarada que tenía la pasada del tour.
  119 |  *
  120 |  * SCOPE GUARD: página pública, sólo navegación y el raíl de la propia demo.
  121 |  * No envía nada.
  122 |  */
  123 | /**
  124 |  * Cada escena declara a qué elemento apunta su cursor. Está aquí y no
  125 |  * importado del componente a propósito: si alguien renombra un `id` en el
  126 |  * marcado, esta pasada tiene que ROMPERSE, no seguirle la corriente.
  127 |  */
  128 | const DIANA_POR_ESCENA = ["hx-foco", "hx-dial-1", "hx-fila-tuya", "hx-generar", "hx-evo"] as const;
  129 | 
  130 | /**
  131 |  * Las animaciones de una escena son CSS con `fill: both` y a los ~2,5 s dejan
  132 |  * un fotograma final estable — es el contrato que hace determinista lo que se
  133 |  * fotografía (`.claude/rules/onboarding.md`, «Un solo reloj»). Sin esta espera
  134 |  * la captura salía a mitad de camino: el 2026-08-23 las tres capturas del
  135 |  * cursor lo enseñaban EN VUELO, a 85px de lo que señalaba, porque
  136 |  * `captureInteraction` corría en cuanto la clase `on` aparecía.
  137 |  */
  138 | async function asentarEscena(page: Page) {
  139 |   await page.waitForTimeout(2_600);
  140 | }
  141 | 
  142 | /**
  143 |  * El cursor apunta a ELEMENTOS, no a coordenadas — el invariante que el tour ya
  144 |  * documenta y que la demo hereda. Se comprueba midiendo: el centro de la diana
  145 |  * contra la traslación real del cursor, con holgura para el último fotograma de
  146 |  * la animación de entrada. Un `id` mal escrito deja el cursor en reposo (fuera
  147 |  * del marco) y eso lo caza esta distancia, no una captura que nadie abre.
  148 |  */
  149 | async function esperarCursorEn(page: Page, id: string) {
  150 |   const medida = await page.evaluate((diana) => {
  151 |     const caja = document.querySelector("#lp-hx");
  152 |     const cursor = document.querySelector(".lp-hx-cur");
  153 |     const meta = document.getElementById(diana);
  154 |     if (!caja || !cursor || !meta) return { falta: { caja: !caja, cursor: !cursor, meta: !meta } };
  155 |     const c = caja.getBoundingClientRect();
  156 |     const m = meta.getBoundingClientRect();
  157 |     const t = new DOMMatrix(getComputedStyle(cursor).transform);
  158 |     return {
  159 |       activo: cursor.classList.contains("activo"),
  160 |       dx: Math.abs(t.m41 - (m.left - c.left + m.width / 2)),
  161 |       dy: Math.abs(t.m42 - (m.top - c.top + m.height / 2))
  162 |     };
```