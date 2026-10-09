# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/write/add-prompt-and-scan.spec.ts >> adding one manual prompt launches a scan restricted to it, and the founder sees real data
- Location: tests/pilot/journeys/write/add-prompt-and-scan.spec.ts:37:5

# Error details

```
Error: expected to clean up at least the prompt this run just created

expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [active] [ref=f16e1]:
  - generic [ref=f16e2]:
    - complementary [ref=f16e3]:
      - generic [ref=f16e5]:
        - img "GenScore" [ref=f16e6]
        - generic [ref=f16e10]: Espacio de visibilidad en IA
      - link "Mozilla mozilla.org" [ref=f16e11] [cursor=pointer]:
        - /url: /dashboard/domains
        - generic [ref=f16e12]:
          - generic [ref=f16e13]: Mozilla
          - generic [ref=f16e14]: mozilla.org
      - generic [ref=f16e17]:
        - generic [ref=f16e18]: Analizar
        - link "Visión general" [ref=f16e19] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a
        - link "Prompts 8" [ref=f16e26] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/prompts
          - generic [ref=f16e29]: Prompts
          - generic [ref=f16e30]: "8"
        - link "Competidores 7" [ref=f16e31] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/competitors
          - generic [ref=f16e36]: Competidores
          - generic [ref=f16e37]: "7"
        - link "Páginas citadas" [ref=f16e38] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/citations
        - link "Auditoría web" [ref=f16e45] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/web-audit
        - generic [ref=f16e50]: Actuar
        - link "Recomendaciones 20" [ref=f16e51] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/recommendations
          - generic [ref=f16e55]: Recomendaciones
          - generic [ref=f16e56]: "20"
        - generic [ref=f16e57]: Aprender
        - link "Manuales GEO" [ref=f16e58] [cursor=pointer]:
          - /url: /blog
      - generic [ref=f16e64]:
        - button "¿Qué es el GEO?" [ref=f16e65] [cursor=pointer]
        - link "DE de5@gmail.com Agencia" [ref=f16e69] [cursor=pointer]:
          - /url: /dashboard/settings
          - generic [ref=f16e70]: DE
          - generic [ref=f16e71]:
            - generic [ref=f16e72]: de5@gmail.com
            - generic [ref=f16e73]: Agencia
    - generic [ref=f16e76]:
      - banner [ref=f16e77]:
        - generic [ref=f16e78]: Completado
        - generic [ref=f16e80]:
          - button "Notificaciones" [ref=f16e82] [cursor=pointer]
          - button "Cerrar sesión" [ref=f16e88] [cursor=pointer]
      - main [ref=f16e92]:
        - generic [ref=f16e93]:
          - generic [ref=f16e94]:
            - generic [ref=f16e96]:
              - paragraph [ref=f16e97]: Prompts
              - generic [ref=f16e98]:
                - generic [ref=f16e99]: Mozilla
                - generic [ref=f16e100]: mozilla.org
                - generic [ref=f16e101]: ES/es
            - generic [ref=f16e102]: Escaneado 9 oct 2026
          - generic [ref=f16e105]:
            - paragraph [ref=f16e112]:
              - text: GenScore monitoriza
              - generic [ref=f16e113]: 8 prompts
              - text: en
              - generic [ref=f16e114]: 3 temas
              - text: . Tu marca aparece en
              - generic [ref=f16e115]: 4 de 8
              - text: (50%). Fuerte en
              - generic [ref=f16e116]: «Comparación»
              - text: (39%), floja en
              - generic [ref=f16e117]: «Privacidad de correo»
              - text: (0%).
            - generic [ref=f16e118]:
              - generic [ref=f16e120]:
                - generic [ref=f16e121]:
                  - generic [ref=f16e122]: Visibilidad del conjunto
                  - generic [ref=f16e123]: 50%
                - generic [ref=f16e127]:
                  - generic [ref=f16e128]: 4 con visibilidad
                  - generic [ref=f16e130]: 4 sin visibilidad
              - generic [ref=f16e132]:
                - generic [ref=f16e133]:
                  - generic [ref=f16e134]: Temas
                  - generic [ref=f16e135]:
                    - textbox "Buscar prompt" [ref=f16e140]:
                      - /placeholder: Buscar prompt…
                    - button "Añadir prompts" [ref=f16e142] [cursor=pointer]
                - generic [ref=f16e145]:
                  - button "39 Comparación 6 prompts Positivo 7 menciones" [ref=f16e146] [cursor=pointer]:
                    - generic [ref=f16e147]: "39"
                    - generic [ref=f16e155]:
                      - generic [ref=f16e156]: Comparación
                      - generic [ref=f16e160]:
                        - text: 6 prompts
                        - generic [ref=f16e162]: Positivo
                    - generic [ref=f16e163]:
                      - generic [ref=f16e164]: "7"
                      - generic [ref=f16e165]: menciones
                  - button "33 Seguridad de datos 1 prompt Neutral 1 menciones" [ref=f16e166] [cursor=pointer]:
                    - generic [ref=f16e167]: "33"
                    - generic [ref=f16e175]:
                      - generic [ref=f16e176]: Seguridad de datos
                      - generic [ref=f16e180]:
                        - text: 1 prompt
                        - generic [ref=f16e182]: Neutral
                    - generic [ref=f16e183]:
                      - generic [ref=f16e184]: "1"
                      - generic [ref=f16e185]: menciones
                  - button "0 Privacidad de correo 1 prompt Sin sentimiento 0 menciones" [ref=f16e186] [cursor=pointer]:
                    - generic [ref=f16e187]: "0"
                    - generic [ref=f16e194]:
                      - generic [ref=f16e195]: Privacidad de correo
                      - generic [ref=f16e199]:
                        - text: 1 prompt
                        - generic [ref=f16e201]: Sin sentimiento
                    - generic [ref=f16e202]:
                      - generic [ref=f16e203]: "0"
                      - generic [ref=f16e204]: menciones
  - alert [ref=f16e205]
```

# Test source

```ts
  88  |   await captureStep(page, "prompts-before");
  89  | 
  90  |   await test.step("open the add-prompts modal and switch to manual mode", async () => {
  91  |     await addButton.click();
  92  |     await expect(page.getByRole("dialog")).toBeVisible();
  93  |     await captureStep(page, "add-prompts-methods");
  94  |     await page.getByText("Manual", { exact: true }).click();
  95  |   });
  96  | 
  97  |   await test.step("draft exactly one prompt", async () => {
  98  |     await page.locator("#add-prompts-manual-input").fill(promptText);
  99  |     await page.getByRole("button", { name: /^añadir$/i }).click();
  100 | 
  101 |     const draftCount = await page.locator(".add-prompts-manual-item").count();
  102 |     assertSingleManualPromptDraft(draftCount);
  103 |     await captureStep(page, "manual-prompt-drafted");
  104 |   });
  105 | 
  106 |   await test.step("submit — this synchronously runs a real, scoped scan", async () => {
  107 |     const submit = page.getByRole("button", { name: /añadir 1 prompt/i });
  108 |     await expect(submit).toBeEnabled();
  109 | 
  110 |     // The server action executes the scan in-request (ENABLE_SYNC_SCAN_EXECUTION)
  111 |     // before redirecting, bounded by Vercel's maxDuration=60. A timeout here is
  112 |     // the pipeline being slow, not this journey finding a UI bug — classified as
  113 |     // INCONCLUSIVE (see UNREACHABLE_SIGNATURES in scripts/pilot.mjs).
  114 |     try {
  115 |       await Promise.all([
  116 |         page.waitForURL(/promptsAdded=1/, { timeout: 70_000 }),
  117 |         submit.click()
  118 |       ]);
  119 |     } catch {
  120 |       throw new Error(
  121 |         "SCAN_TIMEOUT_NOT_PRODUCT_BUG: el escaneo restringido al prompt nuevo no " +
  122 |           "terminó en 70s. Esto es un problema de rendimiento del pipeline, no " +
  123 |           "necesariamente del producto — no se reporta como FAIL de UI."
  124 |       );
  125 |     }
  126 |   });
  127 | 
  128 |   await test.step("verify the founder-visible confirmation names the scoped scan", async () => {
  129 |     const banner = page.getByText(/se ha añadido 1 prompt nuevo/i);
  130 |     await expect(banner).toBeVisible();
  131 | 
  132 |     const url = new URL(page.url());
  133 |     const scanLaunched = url.searchParams.get("scanLaunched");
  134 | 
  135 |     if (scanLaunched !== "true") {
  136 |       const warning = url.searchParams.get("scanWarning");
  137 |       throw new Error(
  138 |         "SCAN_TIMEOUT_NOT_PRODUCT_BUG: el prompt se creó pero el escaneo no se " +
  139 |           `lanzó (scanWarning=${warning ?? "(vacío)"}). No es un fallo de UI.`
  140 |       );
  141 |     }
  142 | 
  143 |     await expect(
  144 |       page.getByText(/se ha lanzado un escaneo restringido a estos prompts nuevos/i),
  145 |       "el copy de confirmación no confirma que el escaneo se restringió al prompt nuevo — " +
  146 |         "sin esta frase no hay garantía textual de que el coste se limitó a 1 prompt"
  147 |     ).toBeVisible();
  148 | 
  149 |     await captureStep(page, "scan-confirmed-on-prompts");
  150 |   });
  151 | 
  152 |   await test.step("verify the scan's result reached the founder-facing screens", async () => {
  153 |     // The point of the whole journey: a scan that completes but never shows up
  154 |     // in the product is still a broken product. These two screens are where a
  155 |     // founder would look for the new data.
  156 |     //
  157 |     // Each capture waits for real content first. Screenshotting straight after
  158 |     // `goto` photographs the route's loading skeleton — which is what the first
  159 |     // passing run did, producing an "overview-after-scan" image showing nothing
  160 |     // but grey placeholders. Evidence that cannot be read is not evidence.
  161 |     // DOMAINS-REDESIGN-1: el progreso del escaneo se mira (y se conduce) en
  162 |     // Visión general; /runs ya sólo redirige a la pantalla interna.
  163 |     await page.goto(`/dashboard/projects/${projectId}`, { waitUntil: "domcontentloaded" });
  164 |     await waitForContent(page, [
  165 |       () => page.getByText(/completado|en curso|pendiente|fallido/i).first().isVisible()
  166 |     ]);
  167 |     await captureStep(page, "runs-after-scan");
  168 | 
  169 |     await page.goto(`/dashboard/projects/${projectId}`, { waitUntil: "domcontentloaded" });
  170 |     await waitForContent(page, [
  171 |       () => page.getByText(/puntuación geo/i).first().isVisible(),
  172 |       () => page.getByText(/tasa de mención/i).first().isVisible()
  173 |     ]);
  174 |     await expect(
  175 |       page.getByText(/puntuación geo/i).first(),
  176 |       "Visión general no mostró la puntuación GEO tras el escaneo"
  177 |     ).toBeVisible();
  178 |     await captureStep(page, "overview-after-scan");
  179 |   });
  180 | 
  181 |   await test.step("cleanup: remove the prompt this run created", async () => {
  182 |     // The prompt list (and with it the search box the sweep drives) is replaced
  183 |     // by ScanInProgress while a run is active, so settle first — otherwise
  184 |     // cleanup would silently find nothing and leave its own prompt behind.
  185 |     await waitForNoActiveRun(page, projectId);
  186 | 
  187 |     const swept = await sweepTestPrompts(page, projectId);
> 188 |     expect(swept, "expected to clean up at least the prompt this run just created").toBeGreaterThan(0);
      |                                                                                     ^ Error: expected to clean up at least the prompt this run just created
  189 | 
  190 |     // The real invariant: the project's ACTIVE prompt count — the number that
  191 |     // consumes plan.caps.prompts — is back where it started. Counting rendered
  192 |     // rows would measure the wrong thing, since a deleted prompt keeps its row
  193 |     // until a later scan drops it.
  194 |     const afterCleanup = await readActivePromptCount(page, projectId);
  195 |     expect(
  196 |       afterCleanup,
  197 |       `la limpieza no devolvió el cupo de prompts activos a su valor inicial ` +
  198 |         `(${baselinePromptCount}); cada pasada que deja residuo consume cupo del plan`
  199 |     ).toBe(baselinePromptCount);
  200 | 
  201 |     await captureStep(page, "prompts-after-cleanup");
  202 |   });
  203 | });
  204 | 
```