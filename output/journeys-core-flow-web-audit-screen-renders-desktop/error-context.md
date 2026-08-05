# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/core-flow.spec.ts >> web audit screen renders
- Location: tests/pilot/journeys/core-flow.spec.ts:152:5

# Error details

```
Error: la incidencia llms.txt no muestra el distintivo "Solución disponible"

expect(locator).toBeVisible() failed

Locator: locator('[role="tabpanel"]:not([hidden]) details.wa-details').filter({ hasText: 'llms.txt' }).first().locator('.wa2-fix-ready')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - la incidencia llms.txt no muestra el distintivo "Solución disponible" with timeout 15000ms
  - waiting for locator('[role="tabpanel"]:not([hidden]) details.wa-details').filter({ hasText: 'llms.txt' }).first().locator('.wa2-fix-ready')

```

```yaml
- complementary:
  - img "Genscore"
  - text: Espacio de visibilidad en IA
  - link "Xataka xataka.com":
    - /url: /dashboard/projects/0b8bb24f-d6c6-44a5-959f-1e508b02ce2b/runs
  - text: Analizar
  - link "Visión general":
    - /url: /dashboard/projects/0b8bb24f-d6c6-44a5-959f-1e508b02ce2b
  - link "Prompts 4":
    - /url: /dashboard/projects/0b8bb24f-d6c6-44a5-959f-1e508b02ce2b/prompts
  - link "Competidores 5":
    - /url: /dashboard/projects/0b8bb24f-d6c6-44a5-959f-1e508b02ce2b/competitors
  - link "Páginas citadas":
    - /url: /dashboard/projects/0b8bb24f-d6c6-44a5-959f-1e508b02ce2b/citations
  - link "Auditoría web":
    - /url: /dashboard/projects/0b8bb24f-d6c6-44a5-959f-1e508b02ce2b/web-audit
  - text: Actuar
  - link "Recomendaciones 13":
    - /url: /dashboard/projects/0b8bb24f-d6c6-44a5-959f-1e508b02ce2b/recommendations
  - link "¿Qué es el GEO?":
    - /url: /geo
  - link "DE de5@gmail.com Agencia":
    - /url: /dashboard/settings/profile
- banner:
  - text: Completado
  - button "Notificaciones"
  - button "Cerrar sesión"
- text: Tu análisis de hoy no se repetirá. Activa el seguimiento diario para ver cómo evoluciona tu visibilidad frente a tus competidores.
- button "Activar seguimiento diario"
- main:
  - paragraph: Auditoría web
  - text: "Xataka xataka.com PRO Última auditoría: 5 ago 2026 Diagnóstico general"
  - note "Lo preparada que está tu web para que la IA te cite como fuente. Sube al cubrir los temas que te importan, al conseguir que la IA te mencione en ellos y al dejar tus páginas legibles para los motores."
  - img
  - text: 39 / 100 Media de 2 señales disponibles — audita el resto para completarla. Contenido 0 / 4 Temas con contenido propio verificado Implementado — De tus temas con contenido, cuántos cita la IA Salud técnica 78 / 100 Media de 3 páginas clave
  - tablist "Secciones de la auditoría":
    - tab "Problemas" [selected]
    - tab "Correcto"
    - tab "Páginas"
  - tabpanel:
    - text: Si arreglas los 7 problemas técnicos 78 100 calculado Salud técnica
    - paragraph: Es una valoración técnica. Que la IA acabe citándote depende también de otros factores de GEO, que trabajas en Recomendaciones.
    - text: Problemas técnicos -2 pt desde la auditoría anterior Críticos 3 Avisos 4
    - group: Crítico Datos estructurados 1 de 3 páginas +5,7 pt
    - group: Crítico Intro respuesta-primero 3 de 3 páginas +5,3 pt
    - group: Crítico Hreflang 3 de 3 páginas +5,3 pt
    - group: Aviso Título con longitud válida 2 de 3 páginas +3,3 pt
    - group: Aviso Etiquetas Open Graph 1 de 3 páginas +2,0 pt
    - group: Aviso Contenido actualizado 1 de 3 páginas
    - group:
      - text: Aviso llms.txt No encontrado
      - paragraph: Publica un fichero llms.txt en la raíz de tu dominio con una guía de lectura para los modelos de IA.
    - text: Historial de auditorías Una entrada por escaneo auditado (máx. las 8 más recientes). 5 ago 2026 Cobertura 0% (0/4) Implementado — 5 ago 2026 Cobertura 25% (1/4) Implementado 0% (0/1)
  - link "Escaneos":
    - /url: /dashboard/projects/0b8bb24f-d6c6-44a5-959f-1e508b02ce2b/runs
  - link "Recomendaciones":
    - /url: /dashboard/projects/0b8bb24f-d6c6-44a5-959f-1e508b02ce2b/recommendations
- alert
```

# Test source

```ts
  134 | });
  135 | 
  136 | test("citations screen renders", async ({ page }, testInfo) => {
  137 |   const id = await projectId(page);
  138 |   const findings = await visitAsUser(
  139 |     page,
  140 |     testInfo,
  141 |     `/dashboard/projects/${id}/citations`,
  142 |     "citations",
  143 |     {
  144 |       describedAs: "la lista de páginas citadas",
  145 |       anyOf: [{ selector: ".cit2-page" }, { selector: ".cit2-row" }]
  146 |     }
  147 |   );
  148 |   assertPageIsHealthy(findings);
  149 |   await exploreInteractions(page, testInfo, "citations");
  150 | });
  151 | 
  152 | test("web audit screen renders", async ({ page }, testInfo) => {
  153 |   const id = await projectId(page);
  154 |   const findings = await visitAsUser(
  155 |     page,
  156 |     testInfo,
  157 |     `/dashboard/projects/${id}/web-audit`,
  158 |     "web-audit",
  159 |     {
  160 |       // The tabs only exist once `summary` does — i.e. once the project has a
  161 |       // real coverage audit. Anchoring here is exactly what would have turned
  162 |       // the 2026-08-02 false PASS into a loud failure: every capture that day
  163 |       // showed the "Todavía no has auditado tu web" card instead of these.
  164 |       describedAs: "las pestañas de la auditoría (Problemas · Correcto · Páginas)",
  165 |       anyOf: [{ selector: '[role="tablist"]' }, { text: /problemas técnicos/i }]
  166 |     }
  167 |   );
  168 |   assertPageIsHealthy(findings);
  169 |   await exploreInteractions(page, testInfo, "web-audit");
  170 | 
  171 |   // Explicit tab coverage, not left to the generic sweep's luck: the
  172 |   // interaction explorer's per-screen budget (4 candidates) is spent by
  173 |   // nav/notifications/InfoTip/the already-active first tab before it ever
  174 |   // reaches Correcto or Páginas — confirmed empirically on this PR's own
  175 |   // pilot run (2026-08-03), whose only tab capture was "Problemas", the
  176 |   // default. A full ux-pilot design-fidelity review flagged this exact
  177 |   // gap: this PR's own new Correcto/Páginas tabs had never been seen with
  178 |   // real data by anything. Real proof each tab actually switches content,
  179 |   // not just that clicking it doesn't crash.
  180 |   for (const label of ["Correcto", "Páginas"] as const) {
  181 |     const tab = page.getByRole("tab", { name: label });
  182 |     await tab.click();
  183 |     await expect(tab, `clicking the "${label}" tab did not select it`).toHaveAttribute(
  184 |       "aria-selected",
  185 |       "true"
  186 |     );
  187 |     await expect(
  188 |       page.locator('[role="tabpanel"]:not([hidden])'),
  189 |       `"${label}" tab panel never became visible`
  190 |     ).toBeVisible();
  191 |     await captureInteraction(page, testInfo, `web-audit-tab-${label.toLowerCase()}`);
  192 |   }
  193 | 
  194 |   // Fase 3b's copyable fixes live INSIDE a page row, and those rows are
  195 |   // native <details>, collapsed by default. Neither the sweep (its budget is
  196 |   // spent long before) nor the tab captures above ever open one, so without
  197 |   // this the whole feature has zero visual evidence — the Páginas capture
  198 |   // just shows ten closed rows. The loop above leaves "Páginas" selected.
  199 |   const firstPageRow = page.locator('[role="tabpanel"]:not([hidden]) details.wa-details').first();
  200 |   if ((await firstPageRow.count()) > 0) {
  201 |     await firstPageRow.locator("summary").click();
  202 |     await expect(firstPageRow, "clicking a page row did not expand it").toHaveAttribute("open", "");
  203 |     await captureInteraction(page, testInfo, "web-audit-page-row-open");
  204 |   }
  205 | 
  206 |   // Fase 3a's generated llms.txt has the SAME problem one tab over, and it
  207 |   // bit for real: PR #319 came back PILOT PASS with web-audit ✅ on all three
  208 |   // viewports while not one capture contained the feature the PR existed for
  209 |   // — the issue rows in Problemas are collapsed <details> too, and nothing
  210 |   // ever opened the llms.txt one. A green row for a screen whose new content
  211 |   // was never on screen is exactly the 2026-08-02 empty-state incident in a
  212 |   // different costume.
  213 |   await page.getByRole("tab", { name: "Problemas" }).click();
  214 |   const llmsIssue = page
  215 |     .locator('[role="tabpanel"]:not([hidden]) details.wa-details')
  216 |     .filter({ hasText: "llms.txt" })
  217 |     .first();
  218 | 
  219 |   if ((await llmsIssue.count()) > 0) {
  220 |     await llmsIssue.locator("summary").click();
  221 |     await expect(llmsIssue, "clicking the llms.txt issue did not expand it").toHaveAttribute("open", "");
  222 |     // fullContent: the file block alone is taller than the fold, so a
  223 |     // viewport capture verifies the generated llms.txt and silently omits the
  224 |     // five publishing steps underneath — which are half of what this phase
  225 |     // ships. Confirmed on the first run: 800px tall, steps nowhere in it.
  226 |     await captureInteraction(page, testInfo, "web-audit-llms-txt-open", { fullContent: true });
  227 | 
  228 |     // El distintivo vive en la fila CERRADA, así que una captura de la fila
  229 |     // abierta no lo prueba. Se comprueba aquí, mecánicamente, sobre la propia
  230 |     // incidencia que sabemos que trae solución.
  231 |     await expect(
  232 |       llmsIssue.locator(".wa2-fix-ready"),
  233 |       'la incidencia llms.txt no muestra el distintivo "Solución disponible"'
> 234 |     ).toBeVisible();
      |       ^ Error: la incidencia llms.txt no muestra el distintivo "Solución disponible"
  235 |   }
  236 | 
  237 |   // Misma incidencia estructural que las dos anteriores: los pasos del sitemap
  238 |   // están dentro de un <details> colapsado, y sin abrirlo la fase no tiene
  239 |   // ninguna evidencia visual. Es el tercer sitio hoy donde el mismo patrón
  240 |   // habría pasado como verde sin enseñar nada.
  241 |   const sitemapIssue = page
  242 |     .locator('[role="tabpanel"]:not([hidden]) details.wa-details')
  243 |     .filter({ hasText: "sitemap.xml" })
  244 |     .first();
  245 | 
  246 |   if ((await sitemapIssue.count()) > 0) {
  247 |     await sitemapIssue.locator("summary").click();
  248 |     await expect(sitemapIssue, "clicking the sitemap issue did not expand it").toHaveAttribute("open", "");
  249 |     await captureInteraction(page, testInfo, "web-audit-sitemap-open", { fullContent: true });
  250 |   }
  251 | });
  252 | 
  253 | /**
  254 |  * Real proof, not a claim: hovers/clicks and ASSERTS the revealed element
  255 |  * appears (Playwright fails the test otherwise), then captures that exact
  256 |  * mid-interaction state — a tooltip bubble and an expanded evidence panel
  257 |  * that a plain page-load screenshot can never show. Added 2026-08-02 after
  258 |  * the founder asked for evidence the click-to-expand/tooltip behavior
  259 |  * actually works, not just that the trigger icons render.
  260 |  */
  261 | test("citations KPI tooltip and row expand actually work, not just render their triggers", async ({
  262 |   page
  263 | }, testInfo) => {
  264 |   const id = await projectId(page);
  265 |   const findings = await visitAsUser(
  266 |     page,
  267 |     testInfo,
  268 |     `/dashboard/projects/${id}/citations`,
  269 |     "citations"
  270 |   );
  271 |   assertPageIsHealthy(findings);
  272 | 
  273 |   // 1. KPI tooltips: hover reveals the bubble (pure CSS :hover, no JS), and
  274 |   //    the bubble must be legible — not clipped by its card, not running off
  275 |   //    the viewport. EVERY tip is checked, not just the first: the last KPI's
  276 |   //    bubble is the one most likely to overflow the right edge on a narrow
  277 |   //    viewport, so testing only `.first()` would have missed exactly the
  278 |   //    case worth catching.
  279 |   const infoTips = page.locator(".cit2-kpis .info-tip");
  280 |   const tipCount = await infoTips.count();
  281 |   expect(tipCount, "no info-tip icons found next to the KPI strip").toBeGreaterThan(0);
  282 | 
  283 |   for (let i = 0; i < tipCount; i++) {
  284 |     await infoTips.nth(i).hover();
  285 |     const bubble = page.locator(".cit2-kpis .info-tip-bubble").nth(i);
  286 |     await expect(bubble, `hovering KPI info-tip #${i + 1} did not reveal its tooltip`).toBeVisible();
  287 |     await assertFullyVisible(page, `.cit2-kpis .info-tip-bubble >> nth=${i}`, `KPI tooltip #${i + 1}`);
  288 |     if (i === 0) await captureInteraction(page, testInfo, "citations-tooltip-open");
  289 |   }
  290 | 
  291 |   // 1b. Same check for the "Impacto de N citas" legend tooltips
  292 |   //     (.cit2-split-key) — a DIFFERENT anchor container than the KPI strip
  293 |   //     above, and the one real overflow instance (2026-08-03: 40px past a
  294 |   //     375px viewport, .cit2-split-key's own .info-tip-anchor entry) that a
  295 |   //     full ux-pilot design-fidelity review flagged as unverified: nothing
  296 |   //     in the generic interaction sweep ever reached these triggers (the
  297 |   //     KPI tooltips + nav/notifications controls already exhaust its
  298 |   //     per-screen budget), so this is the only real hover-evidence path for
  299 |   //     this specific tooltip.
  300 |   const legendTips = page.locator(".cit2-split-key .info-tip");
  301 |   const legendTipCount = await legendTips.count();
  302 |   expect(legendTipCount, "no info-tip icons found in the citations impact legend").toBeGreaterThan(0);
  303 | 
  304 |   for (let i = 0; i < legendTipCount; i++) {
  305 |     await legendTips.nth(i).hover();
  306 |     const bubble = page.locator(".cit2-split-key .info-tip-bubble").nth(i);
  307 |     await expect(bubble, `hovering legend info-tip #${i + 1} did not reveal its tooltip`).toBeVisible();
  308 |     await assertFullyVisible(page, `.cit2-split-key .info-tip-bubble >> nth=${i}`, `Legend tooltip #${i + 1}`);
  309 |   }
  310 |   await captureInteraction(page, testInfo, "citations-legend-tooltip-open");
  311 | 
  312 |   // 2. Full list row expands to show the prompt/evidence panel on click.
  313 |   const firstRow = page.locator(".cit2-rowmain").first();
  314 |   await expect(firstRow, "full citation list is empty — cannot verify row expand").toBeVisible();
  315 |   await firstRow.click();
  316 |   await expect(
  317 |     page.locator(".cit2-row.open .cit2-detail").first(),
  318 |     "clicking a citation row did not open its detail panel"
  319 |   ).toBeVisible();
  320 |   await captureInteraction(page, testInfo, "citations-row-expanded");
  321 | 
  322 |   // 3. Opportunities row must behave identically (founder request,
  323 |   //    2026-08-01) — same click, same panel, on the other table.
  324 |   const firstOppRow = page.locator(".cit2-opp-row").first();
  325 |   if ((await firstOppRow.count()) > 0) {
  326 |     await firstOppRow.click();
  327 |     await expect(
  328 |       page.locator(".cit2-opp-item.open .cit2-detail").first(),
  329 |       "clicking an opportunities row did not open its detail panel"
  330 |     ).toBeVisible();
  331 |     await captureInteraction(page, testInfo, "citations-opportunity-expanded");
  332 |   }
  333 | 
  334 |   // 4. Search narrows the list AND says how many rows matched (founder
```