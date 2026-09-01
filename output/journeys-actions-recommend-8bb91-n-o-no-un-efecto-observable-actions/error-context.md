# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/actions/recommendation-actions.spec.ts >> las acciones de Recomendaciones producen (o no) un efecto observable
- Location: tests/pilot/journeys/actions/recommendation-actions.spec.ts:58:5

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('.rec-card').first().getByRole('button', { name: /marcar como hecho/i })
    - locator resolved to <button type="button" class="btn btn-ghost btn-sm">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div class="rec-card rec2-priority">…</div> intercepts pointer events
  - retrying click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div>…</div> from <div tabindex="0" role="button" class="rec-main" aria-expanded="false">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div class="rec-card rec2-priority">…</div> intercepts pointer events
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div tabindex="0" role="button" class="rec-main" aria-expanded="false">…</div> from <div class="rec-card rec2-priority">…</div> subtree intercepts pointer events
  7 × retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div>…</div> from <div tabindex="0" role="button" class="rec-main" aria-expanded="false">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="rec-card rec2-priority">…</div> intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div tabindex="0" role="button" class="rec-main" aria-expanded="false">…</div> from <div class="rec-card rec2-priority">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div tabindex="0" role="button" class="rec-main" aria-expanded="false">…</div> from <div class="rec-card rec2-priority">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms

```

# Test source

```ts
  106 |         evidence: "todas las recomendaciones activas ya tenían una propuesta generada — no hay botón que pulsar"
  107 |       };
  108 |       return;
  109 |     }
  110 | 
  111 |     await card.click(); // abre la tarjeta
  112 |     const generateButton = card.getByRole("button", { name: /^Generar/ });
  113 |     const ctaLabel = (await generateButton.textContent())?.trim() ?? "Generar";
  114 |     await captureStep(page, "generate-before");
  115 | 
  116 |     const start = Date.now();
  117 |     await generateButton.click();
  118 | 
  119 |     const succeeded = await card
  120 |       .getByText(/propuesta generada/i)
  121 |       .waitFor({ state: "visible", timeout: 30_000 })
  122 |       .then(() => true)
  123 |       .catch(() => false);
  124 |     const elapsedMs = Date.now() - start;
  125 | 
  126 |     await captureStep(page, "generate-after");
  127 | 
  128 |     if (succeeded) {
  129 |       verdicts[`generar (${ctaLabel})`] = {
  130 |         verdict: "real",
  131 |         evidence: `la insignia "Propuesta generada" apareció en ${elapsedMs}ms`
  132 |       };
  133 |       return;
  134 |     }
  135 | 
  136 |     const errorVisible = await card
  137 |       .locator(".feedback.error")
  138 |       .isVisible()
  139 |       .catch(() => false);
  140 |     if (errorVisible) {
  141 |       const errorText = await card.locator(".feedback.error").textContent();
  142 |       verdicts[`generar (${ctaLabel})`] = {
  143 |         verdict: "real",
  144 |         evidence: `terminó en error visible tras ${elapsedMs}ms: "${errorText?.trim()}"`
  145 |       };
  146 |       return;
  147 |     }
  148 | 
  149 |     verdicts[`generar (${ctaLabel})`] = {
  150 |       verdict: "invisible",
  151 |       evidence: `sin insignia de éxito ni error visible ${elapsedMs}ms después del clic — el hallazgo del auditor se reproduce`
  152 |     };
  153 |   });
  154 | 
  155 |   await test.step("acción 2 — exportar plan", async () => {
  156 |     const exportButton = page.getByRole("button", { name: /exportar plan/i });
  157 |     await expect(exportButton).toBeVisible();
  158 | 
  159 |     const start = Date.now();
  160 |     const download = await Promise.race([
  161 |       page.waitForEvent("download", { timeout: 10_000 }).then((d) => d),
  162 |       exportButton.click().then(() => null)
  163 |     ]).catch(() => null);
  164 |     // Si `waitForEvent` gana la carrera antes de que el `click` resuelva,
  165 |     // `download` ya está poblado; si pierde, esperamos el evento explícito
  166 |     // tras el clic, con el mismo margen.
  167 |     const resolved =
  168 |       download ??
  169 |       (await page.waitForEvent("download", { timeout: 10_000 }).catch(() => null));
  170 |     const elapsedMs = Date.now() - start;
  171 | 
  172 |     if (resolved) {
  173 |       verdicts["exportar plan"] = {
  174 |         verdict: "real",
  175 |         evidence: `descarga "${resolved.suggestedFilename()}" iniciada en ${elapsedMs}ms`
  176 |       };
  177 |     } else {
  178 |       // El componente crea un blob y simula el clic en un <a download>. Si el
  179 |       // navegador (headless, en un runner de Actions) lo bloquea en silencio,
  180 |       // es EXACTAMENTE el caso 3 que la Fase 0 predijo: falso positivo del
  181 |       // entorno de auditoría, real para cualquier usuario con el mismo
  182 |       // bloqueo — así que no se descarta como "no aplica", se documenta.
  183 |       verdicts["exportar plan"] = {
  184 |         verdict: "entorno",
  185 |         evidence: `ningún evento de descarga en ${elapsedMs}ms — o el botón no produce efecto, o el navegador headless bloquea la descarga silenciosamente; no se puede distinguir desde aquí`
  186 |       };
  187 |     }
  188 |     await captureStep(page, "export-attempted");
  189 |   });
  190 | 
  191 |   await test.step("acción 3 — marcar como hecho (DESTRUCTIVO — decisión del fundador 2026-08-27)", async () => {
  192 |     const card = page.locator(".rec-card").first();
  193 |     const activeCountBefore = await page.locator(".rec-card").count();
  194 | 
  195 |     const dismissButton = card.getByRole("button", { name: /marcar como hecho/i });
  196 |     const isVisible = await dismissButton.isVisible().catch(() => false);
  197 |     if (!isVisible) {
  198 |       verdicts["marcar como hecho"] = {
  199 |         verdict: "invisible",
  200 |         evidence: "no se encontró el botón «Marcar como hecho» en la primera tarjeta activa"
  201 |       };
  202 |       return;
  203 |     }
  204 | 
  205 |     const start = Date.now();
> 206 |     await dismissButton.click();
      |                         ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  207 | 
  208 |     const disappeared = await expect(card)
  209 |       .toBeHidden({ timeout: 15_000 })
  210 |       .then(() => true)
  211 |       .catch(() => false);
  212 |     const elapsedMs = Date.now() - start;
  213 | 
  214 |     // No hay retry ni reintento del clic: si `disappeared` es falso, el CTA
  215 |     // sigue en su forma anterior (nunca en un estado a medias) y no hay
  216 |     // segunda escritura sobre la recomendación.
  217 |     if (disappeared) {
  218 |       const activeCountAfter = await page.locator(".rec-card").count();
  219 |       verdicts["marcar como hecho"] = {
  220 |         verdict: "real",
  221 |         evidence:
  222 |           `la tarjeta desapareció de la lista activa en ${elapsedMs}ms ` +
  223 |           `(${activeCountBefore} → ${activeCountAfter} tarjetas activas). ` +
  224 |           "Coste aceptado: 1 recomendación del proyecto reservado, sin deshacer hasta el próximo escaneo (Fase 4 lo añade)."
  225 |       };
  226 |     } else {
  227 |       const errorVisible = await card
  228 |         .locator(".feedback.error")
  229 |         .isVisible()
  230 |         .catch(() => false);
  231 |       verdicts["marcar como hecho"] = {
  232 |         verdict: "real",
  233 |         evidence: errorVisible
  234 |           ? `terminó en error visible tras ${elapsedMs}ms`
  235 |           : `la tarjeta siguió visible ${elapsedMs}ms después del clic, sin error visible — el hallazgo del auditor se reproduce`
  236 |       };
  237 |     }
  238 |     await captureStep(page, "dismiss-attempted");
  239 |   });
  240 | 
  241 |   await test.step("acción 4 — activar seguimiento diario (data-maturity-banner, Overview)", async () => {
  242 |     // Vive en otra pantalla y depende de `recurring_scans_enabled`, que
  243 |     // PROJECT-DEFAULTS-BY-ACCOUNT-1 (2026-08-27) enciende solo tras el primer
  244 |     // escaneo completado de una cuenta real no excluida. El proyecto de
  245 |     // escritura corre bajo la cuenta piloto, que no está en la lista de
  246 |     // cuentas internas de prueba — así que este banner puede llevar semanas
  247 |     // sin poder reproducirse aquí, y NO es un fallo si no aparece: es la
  248 |     // fase anterior habiendo resuelto ya la mitad de este hallazgo (P0-08).
  249 |     await page.goto(`/dashboard/projects/${projectId}`, { waitUntil: "domcontentloaded" });
  250 |     await waitForContent(page, [
  251 |       () => page.getByText(/puntuación geo/i).first().isVisible(),
  252 |       () => page.getByText(/todavía no hay puntuación/i).isVisible()
  253 |     ]);
  254 | 
  255 |     const activateButton = page.getByRole("button", { name: /activar seguimiento diario/i });
  256 |     const bannerVisible = await activateButton.isVisible().catch(() => false);
  257 | 
  258 |     if (!bannerVisible) {
  259 |       verdicts["activar seguimiento diario"] = {
  260 |         verdict: "invisible",
  261 |         evidence:
  262 |           "el banner «Tu análisis de hoy no se repetirá» no está presente — " +
  263 |           "coherente con que PROJECT-DEFAULTS-BY-ACCOUNT-1 ya activó el seguimiento tras el primer escaneo; no reproducible en su forma original"
  264 |       };
  265 |       return;
  266 |     }
  267 | 
  268 |     await captureStep(page, "recurring-before");
  269 |     const start = Date.now();
  270 |     await activateButton.click();
  271 | 
  272 |     const bannerGone = await expect(activateButton)
  273 |       .toBeHidden({ timeout: 15_000 })
  274 |       .then(() => true)
  275 |       .catch(() => false);
  276 |     const elapsedMs = Date.now() - start;
  277 | 
  278 |     await captureStep(page, "recurring-after");
  279 |     verdicts["activar seguimiento diario"] = {
  280 |       verdict: "real",
  281 |       evidence: bannerGone
  282 |         ? `el banner desapareció en ${elapsedMs}ms (server action \`setRecurringScans\`)`
  283 |         : `el banner siguió visible ${elapsedMs}ms después del clic — el hallazgo del auditor se reproduce`
  284 |     };
  285 |   });
  286 | 
  287 |   // Las seis acciones del informe se reparten en cuatro pasos de arriba: la
  288 |   // generación cubre FAQ/brief/comparativa como UN handler con etiqueta
  289 |   // variable (ver acción 1), no tres botones separados — el `verdicts`
  290 |   // impreso en `afterAll` deja constancia de cuál se ejecutó realmente.
  291 |   expect(Object.keys(verdicts).length, "toda acción alcanzada debe llevar veredicto").toBeGreaterThan(0);
  292 | });
  293 | 
```