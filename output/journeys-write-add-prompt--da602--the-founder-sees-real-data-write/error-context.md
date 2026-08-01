# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/write/add-prompt-and-scan.spec.ts >> adding one manual prompt launches a scan restricted to it, and the founder sees real data
- Location: tests/pilot/journeys/write/add-prompt-and-scan.spec.ts:35:5

# Error details

```
TimeoutError: locator.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for getByLabel('Buscar prompt').first()
    - locator resolved to <input value="" type="text" aria-label="Buscar prompt" placeholder="Buscar prompt…"/>
    - fill("[PILOT-TEST]")
  - attempting fill action
    2 × waiting for element to be visible, enabled and editable
      - element is not visible
    - retrying fill action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and editable
      - element is not visible
    - retrying fill action
      - waiting 100ms
    30 × waiting for element to be visible, enabled and editable
       - element is not visible
     - retrying fill action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [active] [ref=f8e1]:
  - generic [ref=f8e2]:
    - complementary [ref=f8e3]:
      - generic [ref=f8e5]:
        - img "Genscore" [ref=f8e6]
        - generic [ref=f8e10]: Espacio de visibilidad en IA
      - link "Mozilla mozilla.org" [ref=f8e11] [cursor=pointer]:
        - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/runs
        - generic [ref=f8e12]:
          - generic [ref=f8e13]: Mozilla
          - generic [ref=f8e14]: mozilla.org
      - generic [ref=f8e17]:
        - generic [ref=f8e18]: Analizar
        - link "Visión general" [ref=f8e19] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a
        - link "Prompts 1" [ref=f8e26] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/prompts
          - generic [ref=f8e29]: Prompts
          - generic [ref=f8e30]: "1"
        - link "Competidores 5" [ref=f8e31] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/competitors
          - generic [ref=f8e36]: Competidores
          - generic [ref=f8e37]: "5"
        - link "Páginas citadas" [ref=f8e38] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/citations
        - link "Auditoría web" [ref=f8e45] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/web-audit
        - generic [ref=f8e50]: Actuar
        - link "Recomendaciones 3" [ref=f8e51] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/recommendations
          - generic [ref=f8e55]: Recomendaciones
          - generic [ref=f8e56]: "3"
      - generic [ref=f8e57]:
        - link "¿Qué es el GEO?" [ref=f8e58] [cursor=pointer]:
          - /url: /geo
        - link "DE de5@gmail.com Agencia" [ref=f8e62] [cursor=pointer]:
          - /url: /dashboard/settings/profile
          - generic [ref=f8e63]: DE
          - generic [ref=f8e64]:
            - generic [ref=f8e65]: de5@gmail.com
            - generic [ref=f8e66]: Agencia
    - generic [ref=f8e69]:
      - banner [ref=f8e70]:
        - generic [ref=f8e71]: Completado
        - generic [ref=f8e73]:
          - button "Notificaciones" [ref=f8e75] [cursor=pointer]
          - button "Cerrar sesión" [ref=f8e81] [cursor=pointer]
      - generic [ref=f8e85]:
        - generic [ref=f8e90]: Tu análisis de hoy no se repetirá. Activa el seguimiento diario para ver cómo evoluciona tu visibilidad frente a tus competidores.
        - button "Activar seguimiento diario" [ref=f8e92] [cursor=pointer]
      - main [ref=f8e93]:
        - generic [ref=f8e94]:
          - generic [ref=f8e95]:
            - generic [ref=f8e97]:
              - paragraph [ref=f8e98]: Prompts
              - generic [ref=f8e99]:
                - generic [ref=f8e100]: Mozilla
                - generic [ref=f8e101]: mozilla.org
                - generic [ref=f8e102]: ES/es
            - generic [ref=f8e103]: Escaneado 1 ago 2026
          - generic [ref=f8e106]:
            - paragraph [ref=f8e113]:
              - text: GenScore monitoriza
              - generic [ref=f8e114]: 1 prompt
              - text: . Tu marca aparece en
              - generic [ref=f8e115]: 1 de 1
              - text: (100%).
            - generic [ref=f8e116]:
              - generic [ref=f8e118]:
                - generic [ref=f8e119]:
                  - generic [ref=f8e120]: Visibilidad del conjunto
                  - generic [ref=f8e121]: 100%
                - generic [ref=f8e124]:
                  - generic [ref=f8e125]: 1 con visibilidad
                  - generic [ref=f8e127]: 0 sin visibilidad
              - generic [ref=f8e129]:
                - generic [ref=f8e130]: Tus prompts no tienen topics asignados todavía. Cuando GenScore genere topics automáticamente, aparecerán agrupados aquí.
                - generic [ref=f8e131]:
                  - generic [ref=f8e132]: Prompts
                  - generic [ref=f8e133]:
                    - textbox "Buscar prompt" [ref=f8e138]:
                      - /placeholder: Buscar prompt…
                    - button "Añadir prompts" [ref=f8e140] [cursor=pointer]
                - generic [ref=f8e144] [cursor=pointer]:
                  - generic [ref=f8e145]:
                    - generic [ref=f8e146]: ¿Qué navegador web ofrece la mejor protección de privacidad para usuarios en España?
                    - generic [ref=f8e147]:
                      - generic [ref=f8e148]: Mencionada
                      - generic [ref=f8e149]: Positivo
                      - generic [ref=f8e155]: 3 competidores · 9 citas
                  - generic [ref=f8e156]:
                    - 'generic "Claude: marca mencionada" [ref=f8e157]': Claude
                    - 'generic "Gemini: marca mencionada" [ref=f8e161]': Gemini
                    - 'generic "ChatGPT: marca mencionada" [ref=f8e165]': ChatGPT
  - alert [ref=f8e174]
```

# Test source

```ts
  109 | 
  110 |   await domainField.fill(PILOT_WRITE_DOMAIN);
  111 |   await captureStep(page, "wizard-domain");
  112 |   await page.getByRole("button", { name: /^continuar$/i }).click();
  113 | 
  114 |   // Step 1 (competitors) appears only after the grounded suggestion call
  115 |   // returns — that call fetches the homepage and runs Gemini, so it is slow.
  116 |   await expect(
  117 |     page.getByRole("button", { name: /continuar a prompts/i }),
  118 |     "el asistente no llegó al paso de competidores — la sugerencia de Gemini falló o tardó demasiado"
  119 |   ).toBeVisible({ timeout: 90_000 });
  120 |   // Real Gemini output, worth seeing: this is the product's actual competitor
  121 |   // suggestion for a domain it has never analysed before.
  122 |   await captureStep(page, "wizard-competitors-suggested");
  123 |   await page.getByRole("button", { name: /continuar a prompts/i }).click();
  124 | 
  125 |   await captureStep(page, "wizard-prompts-suggested");
  126 | 
  127 |   // Trim to a single prompt: creation scans every prompt that survives here,
  128 |   // and this is the only place that cost is bounded.
  129 |   const removeButtons = page.getByRole("button", { name: /^quitar$/i });
  130 |   for (let guard = 0; guard < 40; guard += 1) {
  131 |     const count = await removeButtons.count();
  132 |     if (count <= 1) break;
  133 |     await removeButtons.last().click();
  134 |   }
  135 | 
  136 |   const remaining = await page.getByRole("button", { name: /^quitar$/i }).count();
  137 |   if (remaining !== 1) {
  138 |     throw new Error(
  139 |       `Refusing to create the project: expected exactly 1 prompt left, found ${remaining}. ` +
  140 |         "Creation scans every remaining prompt, so this is the cost cap for bootstrap."
  141 |     );
  142 |   }
  143 | 
  144 |   await captureStep(page, "wizard-trimmed-to-one-prompt");
  145 |   await page.getByRole("button", { name: /crear dominio y escanear/i }).click();
  146 | 
  147 |   await page.waitForURL(/\/dashboard\/projects\/[^/]+\/runs/, { timeout: 90_000 }).catch(() => undefined);
  148 | 
  149 |   await captureStep(page, "project-created-runs-page");
  150 | 
  151 |   const created = page.url().match(/\/dashboard\/projects\/([^/?#]+)\/runs/)?.[1];
  152 |   if (!created) {
  153 |     throw new Error(
  154 |       `El alta de dominio no terminó en la pantalla de escaneos. URL final: ${page.url()}`
  155 |     );
  156 |   }
  157 | 
  158 |   return created;
  159 | }
  160 | 
  161 | /** Finds the project whose row links to a project and matches the reserved domain. */
  162 | async function findProjectIdByDomain(page: Page): Promise<string | undefined> {
  163 |   const links = page.locator('a[href^="/dashboard/projects/"]');
  164 |   const count = await links.count();
  165 | 
  166 |   for (let i = 0; i < count; i += 1) {
  167 |     const link = links.nth(i);
  168 |     const href = await link.getAttribute("href");
  169 |     const id = href?.match(/\/dashboard\/projects\/([^/?#]+)$/)?.[1];
  170 |     if (!id || id === "new") continue;
  171 | 
  172 |     // The domain is rendered as a sibling of the project-name link, so check
  173 |     // the enclosing row rather than the link's own text.
  174 |     const rowText = await link.locator("xpath=ancestor::*[self::li or self::tr or self::div][1]")
  175 |       .innerText()
  176 |       .catch(() => "");
  177 |     if (rowText.includes(PILOT_WRITE_DOMAIN)) return id;
  178 |   }
  179 | 
  180 |   return undefined;
  181 | }
  182 | 
  183 | export function buildTestPromptText(runId: string): string {
  184 |   return (
  185 |     `${PILOT_TEST_PROMPT_MARKER} Comparativa de opciones para comprar online (${runId}) — ` +
  186 |     "prompt de prueba del piloto agéntico, seguro de borrar."
  187 |   );
  188 | }
  189 | 
  190 | /**
  191 |  * Removes every prompt carrying the pilot's marker from the write-project,
  192 |  * including ones a previous run left behind because it crashed before its own
  193 |  * cleanup ran. This is what makes the journey self-healing: a failed run does
  194 |  * not permanently eat into the project's prompt-count limit
  195 |  * (`plan.caps.prompts`), which would otherwise silently block every future
  196 |  * write-pilot run once the cap is hit.
  197 |  *
  198 |  * Bounded to a fixed number of iterations — a real bug that keeps recreating
  199 |  * matching rows must not turn this into an infinite loop.
  200 |  */
  201 | export async function sweepTestPrompts(page: Page, projectId: string): Promise<number> {
  202 |   const MAX_SWEEPS = 10;
  203 |   let deleted = 0;
  204 | 
  205 |   for (let i = 0; i < MAX_SWEEPS; i += 1) {
  206 |     await page.goto(`/dashboard/projects/${projectId}/prompts`, { waitUntil: "domcontentloaded" });
  207 | 
  208 |     const search = page.getByLabel("Buscar prompt").first();
> 209 |     await search.fill(PILOT_TEST_PROMPT_MARKER);
      |                  ^ TimeoutError: locator.fill: Timeout 15000ms exceeded.
  210 |     // The list filters client-side with no loading state to await; give React
  211 |     // a beat to re-render before reading the result.
  212 |     await page.waitForTimeout(300);
  213 | 
  214 |     const row = page.getByText(PILOT_TEST_PROMPT_MARKER, { exact: false }).first();
  215 |     if (!(await row.isVisible().catch(() => false))) break;
  216 | 
  217 |     await row.click();
  218 |     const drawer = page.getByRole("dialog");
  219 |     await expect(drawer, "prompt drawer did not open for a matched test prompt").toBeVisible();
  220 | 
  221 |     await drawer.getByLabel("Borrar prompt").click();
  222 |     await page.getByRole("button", { name: /^borrar prompt$/i }).click();
  223 | 
  224 |     // DeletePromptButton's onDeleted closes the drawer; wait for that instead
  225 |     // of a fixed sleep so the next iteration starts from a settled list.
  226 |     await expect(drawer).toBeHidden({ timeout: 10_000 });
  227 |     deleted += 1;
  228 |   }
  229 | 
  230 |   return deleted;
  231 | }
  232 | 
  233 | /**
  234 |  * Hard safety assertions the write journey checks immediately before the one
  235 |  * irreversible-ish action it takes (submitting the new prompt, which
  236 |  * synchronously launches a real scan). Centralised here so every write
  237 |  * journey added later goes through the same gate instead of re-deriving it.
  238 |  */
  239 | export function assertSingleManualPromptDraft(draftCount: number): void {
  240 |   if (draftCount !== 1) {
  241 |     throw new Error(
  242 |       `Refusing to submit: expected exactly 1 draft prompt, found ${draftCount}. ` +
  243 |         "The entire cost cap for this journey depends on adding exactly one " +
  244 |         "prompt at a time (add-prompts-button.tsx launches a scan scoped to " +
  245 |         "only the newly-created prompts) — never raise this without redesigning " +
  246 |         "the cost guard first."
  247 |     );
  248 |   }
  249 | }
  250 | 
```