# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/core-flow.spec.ts >> web audit screen renders
- Location: tests/pilot/journeys/core-flow.spec.ts:118:5

# Error details

```
Error: ENAMETOOLONG: name too long, copyfile '.pilot/screens/desktop--web-audit--x3-media-simple-de-tus-se-ales-disponibles-cobertura-de-temas-t.png' -> '/home/runner/work/GEO-Tool/GEO-Tool/.pilot/output/journeys-core-flow-web-audit-screen-renders-desktop/attachments/web-audit-→-Media-simple-de-tus-señales-disponibles-cobertura-de-temas-temas-implementados-citados-por-la-IA-y-salud-técnica-Cada-componente-se-muestra-al-lado-—-un-componente-sin-auditar-no-cuenta-como-0-simplemente-no-entra-en-la-media-desktop--9ecbaf82a0c94545a0b204e1e5155dff722b2ddd.png'
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - generic [ref=e5]:
        - img "Genscore" [ref=e6]
        - generic [ref=e10]: Espacio de visibilidad en IA
      - link "Mozilla mozilla.org" [ref=e11] [cursor=pointer]:
        - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/runs
        - generic [ref=e12]:
          - generic [ref=e13]: Mozilla
          - generic [ref=e14]: mozilla.org
      - generic [ref=e17]:
        - generic [ref=e18]: Analizar
        - link "Visión general" [ref=e19] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a
        - link "Prompts 1" [ref=e26] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/prompts
          - generic [ref=e29]: Prompts
          - generic [ref=e30]: "1"
        - link "Competidores 5" [ref=e31] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/competitors
          - generic [ref=e36]: Competidores
          - generic [ref=e37]: "5"
        - link "Páginas citadas" [ref=e38] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/citations
        - link "Auditoría web" [ref=e45] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/web-audit
        - generic [ref=e50]: Actuar
        - link "Recomendaciones 7" [ref=e51] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/recommendations
          - generic [ref=e55]: Recomendaciones
          - generic [ref=e56]: "7"
      - generic [ref=e57]:
        - link "¿Qué es el GEO?" [ref=e58] [cursor=pointer]:
          - /url: /geo
        - link "DE de5@gmail.com Agencia" [ref=e62] [cursor=pointer]:
          - /url: /dashboard/settings/profile
          - generic [ref=e63]: DE
          - generic [ref=e64]:
            - generic [ref=e65]: de5@gmail.com
            - generic [ref=e66]: Agencia
    - generic [ref=e69]:
      - banner [ref=e70]:
        - generic [ref=e71]: Completado
        - generic [ref=e73]:
          - button "Notificaciones" [ref=e75] [cursor=pointer]
          - button "Cerrar sesión" [ref=e81] [cursor=pointer]
      - main [ref=e85]:
        - generic [ref=e86]:
          - generic [ref=e87]:
            - generic [ref=e89]:
              - paragraph [ref=e90]: Auditoría web
              - generic [ref=e91]:
                - generic [ref=e92]: Mozilla
                - generic [ref=e93]: mozilla.org
                - generic [ref=e94]: PRO
            - generic [ref=e95]:
              - generic [ref=e96]: "Última auditoría: 2 ago 2026 · sobre el escaneo del 2 ago 2026"
              - button "Auditar ahora" [ref=e98] [cursor=pointer]
          - generic [ref=e103]:
            - img "Preparación GEO 51 de 100" [ref=e104]:
              - generic [ref=e107]: "51"
              - generic [ref=e108]: / 100
            - generic [ref=e109]:
              - generic [ref=e110]:
                - text: Diagnóstico general
                - 'note "Media simple de tus señales disponibles: cobertura de temas, temas implementados (citados por la IA) y salud técnica. Cada componente se muestra al lado — un componente sin auditar no cuenta como 0, simplemente no entra en la media." [active] [ref=e111]':
                  - generic: i
              - generic [ref=e112]:
                - generic [ref=e113]:
                  - generic [ref=e114]: Contenido
                  - generic [ref=e116]: 1 / 1
                  - generic [ref=e120]: temas con contenido propio verificado
                - generic [ref=e121]:
                  - generic [ref=e122]: Implementado
                  - generic [ref=e124]: 0 / 1
                  - generic [ref=e127]: "palanca rápida: 1 tema aún sin citar"
                - generic [ref=e128]:
                  - generic [ref=e129]: Salud técnica
                  - generic [ref=e131]: 53 / 100
                  - generic [ref=e135]: media de 3 páginas clave
          - tablist "Secciones de la auditoría" [ref=e137]:
            - tab "Plan de acción" [selected] [ref=e138] [cursor=pointer]
            - tab "Salud técnica" [ref=e139] [cursor=pointer]
            - tab "Evolución" [ref=e140] [cursor=pointer]
          - tabpanel [ref=e141]:
            - generic [ref=e142]:
              - generic [ref=e143]:
                - generic [ref=e144]: Plan de acción
                - generic [ref=e145]: Las acciones de mayor palanca según la matriz, de más a menos urgentes.
              - generic [ref=e146]:
                - generic [ref=e147]:
                  - button "Todas" [pressed] [ref=e148] [cursor=pointer]
                  - button "Optimizar página · 1" [ref=e149] [cursor=pointer]:
                    - text: Optimizar página
                    - generic [ref=e150]: · 1
                - generic [ref=e152]:
                  - generic [ref=e153]:
                    - generic [ref=e154]: "1"
                    - generic [ref=e155]: Optimizar página existente
                  - generic [ref=e156]:
                    - button "2 Prioridad Media Añadir bloque de cita Baja confianza Abierto desde hace 2 escaneos Te mencionan pero no citan tu dominio en \"¿Qué navegador web ofrece la mejor protección de privacidad para us…\" La IA menciona tu marca en esta consulta pero no cita tu dominio como fuente. Añade un bloque factual y citable que la IA pueda referenciar directamente. Impacto Esfuerzo Confianza Baja Ver recomendación" [ref=e157] [cursor=pointer]:
                      - generic [ref=e158]: "2"
                      - generic [ref=e159]:
                        - generic [ref=e160]:
                          - generic [ref=e161]: Prioridad Media
                          - generic [ref=e162]: Añadir bloque de cita
                          - generic [ref=e163]: Baja confianza
                          - generic [ref=e166]: Abierto desde hace 2 escaneos
                        - generic [ref=e167]: Te mencionan pero no citan tu dominio en "¿Qué navegador web ofrece la mejor protección de privacidad para us…"
                        - generic [ref=e168]: La IA menciona tu marca en esta consulta pero no cita tu dominio como fuente. Añade un bloque factual y citable que la IA pueda referenciar directamente.
                      - generic [ref=e169]:
                        - generic [ref=e170]:
                          - generic [ref=e171]: Impacto
                          - generic [ref=e180]: Esfuerzo
                          - generic [ref=e189]:
                            - generic [ref=e190]: Confianza
                            - generic [ref=e191]: Baja
                        - button "Ver recomendación" [ref=e193]
                    - generic [ref=e197]:
                      - generic [ref=e198]:
                        - generic [ref=e199]:
                          - generic [ref=e200]: Por qué importa
                          - paragraph [ref=e201]: Que te mencionen sin citar tu dominio limita tu autoridad como fuente en esta consulta.
                          - generic [ref=e202]:
                            - generic [ref=e203]: 1 prompt afectado
                            - list [ref=e204]:
                              - listitem [ref=e205]:
                                - generic [ref=e206]: ¿Qué navegador web ofrece la mejor protección de privacidad para usuarios en España?
                          - paragraph [ref=e207]: "Supuestos: Una mención sin cita indica contenido que la IA conoce pero no referencia como fuente."
                        - generic [ref=e208]:
                          - generic [ref=e209]: Evidencia
                          - paragraph [ref=e210]: Sin fragmentos de evidencia disponibles.
                      - generic [ref=e211]:
                        - button "Generar propuesta con IA" [ref=e212] [cursor=pointer]
                        - button "Marcar como hecho" [ref=e217] [cursor=pointer]
            - generic [ref=e220]:
              - generic [ref=e221]:
                - generic [ref=e222]:
                  - text: Matriz de oportunidad
                  - 'note "Cruza dos señales que sí controlas: contenido propio que Google indexa, y citas verificadas a tu dominio en las respuestas de la IA. No mide si la IA menciona tu marca por lo que ya sabe de ella — puedes salir en ''Hueco de contenido'' aunque la IA te nombre primero; revisa el Plan de acción para verlo." [ref=e223]':
                    - generic: i
                - generic [ref=e224]: Cada tema de tus prompts, cruzando contenido propio verificado × citas en el último escaneo. Toca un cuadrante para filtrar el plan de acción.
              - generic [ref=e226]:
                - generic [ref=e227]: Con contenido propio
                - button "⚠ Invisible para la IA 1 Tienes página, pero la IA no la cita → optimizar Ver plan de acción →" [ref=e228] [cursor=pointer]:
                  - generic [ref=e229]:
                    - generic [ref=e230]: ⚠ Invisible para la IA
                    - generic [ref=e231]: "1"
                  - generic [ref=e232]: Tienes página, pero la IA no la cita → optimizar
                  - generic [ref=e233]: Ver plan de acción →
                - button "✓ Rindiendo 0 Contenido propio citado por la IA → mantener Ver qué funciona →" [ref=e234] [cursor=pointer]:
                  - generic [ref=e235]:
                    - generic [ref=e236]: ✓ Rindiendo
                    - generic [ref=e237]: "0"
                  - generic [ref=e238]: Contenido propio citado por la IA → mantener
                  - generic [ref=e239]: Ver qué funciona →
                - button "✕ Sin contenido propio 0 Sin página propia y sin citas → crear contenido Ver plan de acción →" [ref=e240] [cursor=pointer]:
                  - generic [ref=e241]:
                    - generic [ref=e242]: ✕ Sin contenido propio
                    - generic [ref=e243]: "0"
                  - generic [ref=e244]: Sin página propia y sin citas → crear contenido
                  - generic [ref=e245]: Ver plan de acción →
                - button "◌ Citado sin contenido verificado 0 La IA te cita por otra vía, sin página verificada → capturar Ver plan de acción →" [ref=e246] [cursor=pointer]:
                  - generic [ref=e247]:
                    - generic [ref=e248]: ◌ Citado sin contenido verificado
                    - generic [ref=e249]: "0"
                  - generic [ref=e250]: La IA te cita por otra vía, sin página verificada → capturar
                  - generic [ref=e251]: Ver plan de acción →
                - generic [ref=e252]: La IA no te cita → sí te cita
            - generic [ref=e254]:
              - generic [ref=e255]:
                - generic [ref=e256]: Salud técnica
                - generic [ref=e257]: 53 / 100 · media de 3 páginas clave · 2 ago 2026
                - button "Ver detalle →" [ref=e258] [cursor=pointer]
              - generic [ref=e259]:
                - generic [ref=e260]: Bots de IA
                - generic [ref=e261]: 7 / 7 con acceso · llms.txt no encontrado
                - button "Ver detalle →" [ref=e262] [cursor=pointer]
          - generic [ref=e263]:
            - link "Escaneos" [ref=e264] [cursor=pointer]:
              - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/runs
            - link "Recomendaciones" [ref=e267] [cursor=pointer]:
              - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/recommendations
  - alert [ref=e271]
```

# Test source

```ts
  195 |   if (info.inForm) return "inside a form — could write to Supabase";
  196 |   if (info.isSubmit) return "submit button — could write to Supabase";
  197 |   // A same-page anchor (#hash) is fine; anything else navigates away and would
  198 |   // take the explorer off the screen it is supposed to be exercising.
  199 |   if (info.href && !info.href.startsWith("#")) return `navigates away (${info.href})`;
  200 | 
  201 |   // The text check only applies to something that reads like an ACTION LABEL.
  202 |   // A real destructive control is labelled "Eliminar", not with a paragraph —
  203 |   // and matching long prose produced three pure false refusals on the first
  204 |   // clean run (2026-08-02): a prompt whose own text ends "seguro de borrar",
  205 |   // a recommendation card titled "Añadir bloque de…", and the "Citas totales"
  206 |   // tooltip, refused for containing "escaneados". Each cost real coverage.
  207 |   // Above this length the element is content, not a command, and the
  208 |   // structural guards above — which are the actual safety net — still apply.
  209 |   const ACTION_LABEL_MAX = 60;
  210 |   const looksLikeActionLabel = info.name.length > 0 && info.name.length <= ACTION_LABEL_MAX;
  211 |   if (looksLikeActionLabel && DESTRUCTIVE_TEXT.test(info.name)) {
  212 |     return `destructive/write-looking label: "${info.name.slice(0, 40)}"`;
  213 |   }
  214 |   return null;
  215 | }
  216 | 
  217 | /**
  218 |  * Exercises every safe in-page control on the current screen and records what
  219 |  * each one did. Returns the findings so a journey can assert on them.
  220 |  *
  221 |  * Does NOT throw on a dead control: the pilot reports, the agent judges, and a
  222 |  * dead control on one screen should not abort the sweep of the rest. Journeys
  223 |  * that care can assert on the returned findings.
  224 |  */
  225 | export async function exploreInteractions(
  226 |   page: Page,
  227 |   testInfo: TestInfo,
  228 |   screen: string
  229 | ): Promise<InteractionFinding[]> {
  230 |   const findings: InteractionFinding[] = [];
  231 |   const consoleErrors: string[] = [];
  232 |   const onConsole = (message: { type: () => string; text: () => string }) => {
  233 |     if (message.type() === "error") consoleErrors.push(redact(message.text()));
  234 |   };
  235 |   page.on("console", onConsole);
  236 | 
  237 |   const startedAt = Date.now();
  238 | 
  239 |   try {
  240 |     const candidates = page.locator(EXPLORABLE);
  241 |     const total = Math.min(await candidates.count(), MAX_INTERACTIONS_PER_SCREEN);
  242 | 
  243 |     for (let i = 0; i < total; i++) {
  244 |       if (Date.now() - startedAt > SWEEP_BUDGET_MS) break;
  245 |       const el = candidates.nth(i);
  246 |       if (!(await el.isVisible().catch(() => false))) continue;
  247 | 
  248 |       const control =
  249 |         (await el.getAttribute("aria-label")) ||
  250 |         ((await el.textContent()) ?? "").trim().slice(0, 60) ||
  251 |         `${screen} control #${i + 1}`;
  252 | 
  253 |       const refusal = await refuseReason(el).catch(() => "could not inspect element");
  254 |       if (refusal) {
  255 |         const finding: InteractionFinding = {
  256 |           screen,
  257 |           viewport: testInfo.project.name,
  258 |           control,
  259 |           outcome: "skipped",
  260 |           skippedReason: refusal,
  261 |           introducedOverflow: false,
  262 |           consoleErrors: []
  263 |         };
  264 |         findings.push(finding);
  265 |         record(finding);
  266 |         continue;
  267 |       }
  268 | 
  269 |       const overflowBefore = await hasHorizontalOverflow(page);
  270 |       const before = await domSignature(page);
  271 |       consoleErrors.length = 0;
  272 | 
  273 |       await el.scrollIntoViewIfNeeded().catch(() => undefined);
  274 |       // Hover first so pure-CSS reveals (`.info-tip`) are exercised too, then
  275 |       // click for the JS-driven ones. Harmless for controls that only respond
  276 |       // to one of the two.
  277 |       await el.hover({ timeout: 5_000 }).catch(() => undefined);
  278 |       await el.click({ timeout: 5_000 }).catch(() => undefined);
  279 |       await page.waitForTimeout(350);
  280 | 
  281 |       const after = await domSignature(page);
  282 |       const changed = before !== after;
  283 |       const introducedOverflow = !overflowBefore && (await hasHorizontalOverflow(page));
  284 | 
  285 |       let screenshot: string | undefined;
  286 |       if (changed || introducedOverflow) {
  287 |         screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(screen)}--x${i + 1}-${slug(control)}.png`;
  288 |         mkdirSync(SCREENS_DIR, { recursive: true });
  289 |         // Viewport-sized, NOT fullPage: the control was scrolled into view
  290 |         // above, so the revealed state is on screen, and a full-page capture
  291 |         // of a very tall mobile list is what pushed the first real run past
  292 |         // its timeout. The page-level captures (visitAsUser) stay fullPage —
  293 |         // those are for judging the whole screen.
  294 |         await page.screenshot({ path: screenshot });
> 295 |         await testInfo.attach(`${screen} → ${control} (${testInfo.project.name})`, {
      |         ^ Error: ENAMETOOLONG: name too long, copyfile '.pilot/screens/desktop--web-audit--x3-media-simple-de-tus-se-ales-disponibles-cobertura-de-temas-t.png' -> '/home/runner/work/GEO-Tool/GEO-Tool/.pilot/output/journeys-core-flow-web-audit-screen-renders-desktop/attachments/web-audit-→-Media-simple-de-tus-señales-disponibles-cobertura-de-temas-temas-implementados-citados-por-la-IA-y-salud-técnica-Cada-componente-se-muestra-al-lado-—-un-componente-sin-auditar-no-cuenta-como-0-simplemente-no-entra-en-la-media-desktop--9ecbaf82a0c94545a0b204e1e5155dff722b2ddd.png'
  296 |           path: screenshot,
  297 |           contentType: "image/png"
  298 |         });
  299 |       }
  300 | 
  301 |       const finding: InteractionFinding = {
  302 |         screen,
  303 |         viewport: testInfo.project.name,
  304 |         control,
  305 |         outcome: changed ? "changed" : "dead",
  306 |         introducedOverflow,
  307 |         consoleErrors: [...consoleErrors],
  308 |         ...(screenshot ? { screenshot } : {})
  309 |       };
  310 |       findings.push(finding);
  311 |       record(finding);
  312 | 
  313 |       // Restore the baseline before the next candidate, ESCAPE FIRST.
  314 |       //
  315 |       // The obvious "click it again to toggle it back" is not enough, and
  316 |       // assuming it was cost a second round of false findings: the mobile nav
  317 |       // trigger is open-only (`setMobileNavOpen(true)`, not a toggle), so
  318 |       // clicking it again re-opened the drawer instead of closing it, leaving
  319 |       // its full-screen scrim to swallow every later click on that screen —
  320 |       // the notification bell then reported dead on all 9 screens, at mobile
  321 |       // only, which read exactly like a real product bug and wasn't
  322 |       // (2026-08-02).
  323 |       //
  324 |       // Escape is the reliable restore: drawers, popovers and dialogs all
  325 |       // listen for it. The re-click is kept only as a fallback for controls
  326 |       // that are genuine toggles and ignore Escape, and only when the page
  327 |       // has not already returned to its baseline.
  328 |       if (Date.now() - startedAt <= SWEEP_BUDGET_MS) {
  329 |         await page.keyboard.press("Escape").catch(() => undefined);
  330 |         await page.waitForTimeout(150);
  331 |         if (changed && (await domSignature(page)) !== before) {
  332 |           await el.click({ timeout: 5_000 }).catch(() => undefined);
  333 |           await page.waitForTimeout(150);
  334 |         }
  335 |       }
  336 |     }
  337 |   } finally {
  338 |     page.off("console", onConsole);
  339 |   }
  340 | 
  341 |   return findings;
  342 | }
  343 | 
  344 | /**
  345 |  * The subset of findings worth a human's attention. Kept separate from the
  346 |  * sweep itself so a journey decides whether to fail on them — the explorer's
  347 |  * job is to observe, not to police.
  348 |  */
  349 | export function interactionProblems(findings: InteractionFinding[]): InteractionFinding[] {
  350 |   return findings.filter(
  351 |     (f) =>
  352 |       (f.outcome === "dead" && !f.skippedReason) ||
  353 |       f.introducedOverflow ||
  354 |       f.consoleErrors.length > 0
  355 |   );
  356 | }
  357 | 
```