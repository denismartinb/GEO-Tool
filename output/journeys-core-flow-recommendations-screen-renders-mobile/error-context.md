# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/core-flow.spec.ts >> recommendations screen renders
- Location: tests/pilot/journeys/core-flow.spec.ts:98:5

# Error details

```
Error: recommendations @ mobile: the page loaded without errors but never rendered el backlog de acciones generado por el último escaneo — this is an empty state, a plan gate, or an unresolved skeleton, NOT the screen this journey exists to verify. Reporting it as passing would certify a placeholder (real incident, 2026-08-02: a full-screen redesign shipped with a green pilot because every capture showed "Todavía no has auditado tu web"). Fix by seeding the pilot account with real data — run the "Agentic User Pilot (write)" workflow, whose seed journey creates a project, scans it and audits it. See docs/agentic-user-pilot.md § "Datos reales".

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - img "Genscore" [ref=e6]
          - generic [ref=e10]: Espacio de visibilidad en IA
        - button "Cerrar menú" [ref=e11] [cursor=pointer]
      - link "Mozilla mozilla.org" [ref=e14] [cursor=pointer]:
        - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/runs
        - generic [ref=e15]:
          - generic [ref=e16]: Mozilla
          - generic [ref=e17]: mozilla.org
      - generic [ref=e20]:
        - generic [ref=e21]: Analizar
        - link "Visión general" [ref=e22] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a
        - link "Prompts 6" [ref=e29] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/prompts
          - generic [ref=e32]: Prompts
          - generic [ref=e33]: "6"
        - link "Competidores 7" [ref=e34] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/competitors
          - generic [ref=e39]: Competidores
          - generic [ref=e40]: "7"
        - link "Páginas citadas" [ref=e41] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/citations
        - link "Auditoría web" [ref=e48] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/web-audit
        - generic [ref=e53]: Actuar
        - link "Recomendaciones 13" [ref=e54] [cursor=pointer]:
          - /url: /dashboard/projects/9084390d-3fd7-4e40-ae2f-b70558da679a/recommendations
          - generic [ref=e58]: Recomendaciones
          - generic [ref=e59]: "13"
      - generic [ref=e60]:
        - link "¿Qué es el GEO?" [ref=e61] [cursor=pointer]:
          - /url: /geo
        - link "DE de5@gmail.com Agencia" [ref=e65] [cursor=pointer]:
          - /url: /dashboard/settings/profile
          - generic [ref=e66]: DE
          - generic [ref=e67]:
            - generic [ref=e68]: de5@gmail.com
            - generic [ref=e69]: Agencia
        - button "Cerrar sesión" [ref=e73] [cursor=pointer]
    - generic [ref=e78]:
      - banner [ref=e79]:
        - button "Abrir menú de navegación" [ref=e80] [cursor=pointer]
        - button "Notificaciones" [ref=e85] [cursor=pointer]
      - main [ref=e90]:
        - generic [ref=e91]:
          - generic [ref=e92]:
            - generic [ref=e93]:
              - generic [ref=e94]: Actuar
              - generic [ref=e96]: mozilla.org
              - generic [ref=e97]: 13 acciones
            - generic [ref=e98]: Escaneado 5 ago 2026
          - generic [ref=e101]:
            - generic [ref=e104]: Escaneo de visibilidad en curso
            - generic [ref=e105]: Esto suele tardar un par de minutos. Puedes salir de esta página — seguiremos trabajando.
            - generic [ref=e107]: 0% · 0 de 6
  - alert [ref=e108]
```

# Test source

```ts
  353 |       const controls = header.querySelectorAll("button, a[href], input, select, textarea");
  354 |       return Array.from(controls).map((el) => {
  355 |         const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  356 |         return `${el.tagName.toLowerCase()}${text ? `:"${text}"` : ""}`;
  357 |       });
  358 |     });
  359 | 
  360 |     // Culprits are measured BEFORE the capture, while the viewport is still
  361 |     // the one under test — captureFullContent resizes it and puts it back.
  362 |     const overflowCulprits = horizontalOverflow ? await findOverflowCulprits(page, viewport.width) : [];
  363 | 
  364 |     const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
  365 |     mkdirSync(SCREENS_DIR, { recursive: true });
  366 |     const capture = await captureFullContent(page, screenshot);
  367 | 
  368 |     const findings: PageFindings = {
  369 |       label,
  370 |       path,
  371 |       viewport: testInfo.project.name,
  372 |       finalUrl: redact(finalUrl),
  373 |       scrollWidth,
  374 |       viewportWidth: viewport.width,
  375 |       horizontalOverflow,
  376 |       overflowCulprits,
  377 |       consoleErrors,
  378 |       failedRequests,
  379 |       thirdPartyFailures,
  380 |       bouncedToLogin,
  381 |       screenshot,
  382 |       renderedRealContent,
  383 |       expectedContent: expectation?.describedAs ?? null,
  384 |       headerInteractiveControls,
  385 |       ...capture
  386 |     };
  387 | 
  388 |     recordFindings(findings);
  389 |     await testInfo.attach(attachmentName(`${label} (${testInfo.project.name})`), {
  390 |       path: screenshot,
  391 |       contentType: "image/png"
  392 |     });
  393 | 
  394 |     return findings;
  395 |   } finally {
  396 |     page.off("console", onConsole);
  397 |     page.off("response", onResponse);
  398 |   }
  399 | }
  400 | 
  401 | /**
  402 |  * Fails the journey on the signals no screenshot review should ever have to
  403 |  * catch. Kept separate from `visitAsUser` so a journey can record a page
  404 |  * without asserting on it (useful for intermediate navigation steps).
  405 |  */
  406 | export function assertPageIsHealthy(findings: PageFindings): void {
  407 |   expect(
  408 |     findings.bouncedToLogin,
  409 |     `${findings.label}: session was rejected — landed on ${findings.finalUrl}`
  410 |   ).toBe(false);
  411 | 
  412 |   expect(
  413 |     findings.horizontalOverflow,
  414 |     `${findings.label} @ ${findings.viewport}: horizontal overflow — ` +
  415 |       `scrollWidth ${findings.scrollWidth}px > viewport ${findings.viewportWidth}px` +
  416 |       (findings.overflowCulprits.length
  417 |         ? `\nCulprit(s):\n  ${findings.overflowCulprits.join("\n  ")}`
  418 |         : "")
  419 |   ).toBe(false);
  420 | 
  421 |   expect(
  422 |     findings.failedRequests,
  423 |     `${findings.label}: first-party requests failed`
  424 |   ).toEqual([]);
  425 | 
  426 |   expect(
  427 |     findings.consoleErrors,
  428 |     `${findings.label}: console errors`
  429 |   ).toEqual([]);
  430 | 
  431 |   expect(
  432 |     findings.headerInteractiveControls,
  433 |     `${findings.label}: the shared sticky header must stay purely informational ` +
  434 |       `(badges/pills only) — docs/brand/design-decisions-log.md §3. Found interactive ` +
  435 |       `control(s) inside .ov-sticky-header, which belong in the page body instead.`
  436 |   ).toEqual([]);
  437 | 
  438 |   // Deliberately the LAST assertion: the ones above describe a broken screen,
  439 |   // this one describes a screen the pilot never got to judge. Both fail the
  440 |   // run, but only this one is fixed by seeding data rather than by changing
  441 |   // product code, so it should not mask a real defect above it.
  442 |   if (findings.renderedRealContent !== null) {
  443 |     expect(
  444 |       findings.renderedRealContent,
  445 |       `${findings.label} @ ${findings.viewport}: the page loaded without errors but never ` +
  446 |         `rendered ${findings.expectedContent} — this is an empty state, a plan gate, or an ` +
  447 |         `unresolved skeleton, NOT the screen this journey exists to verify. Reporting it as ` +
  448 |         `passing would certify a placeholder (real incident, 2026-08-02: a full-screen redesign ` +
  449 |         `shipped with a green pilot because every capture showed "Todavía no has auditado tu web"). ` +
  450 |         `Fix by seeding the pilot account with real data — run the "Agentic User Pilot (write)" ` +
  451 |         `workflow, whose seed journey creates a project, scans it and audits it. ` +
  452 |         `See docs/agentic-user-pilot.md § "Datos reales".`
> 453 |     ).toBe(true);
      |       ^ Error: recommendations @ mobile: the page loaded without errors but never rendered el backlog de acciones generado por el último escaneo — this is an empty state, a plan gate, or an unresolved skeleton, NOT the screen this journey exists to verify. Reporting it as passing would certify a placeholder (real incident, 2026-08-02: a full-screen redesign shipped with a green pilot because every capture showed "Todavía no has auditado tu web"). Fix by seeding the pilot account with real data — run the "Agentic User Pilot (write)" workflow, whose seed journey creates a project, scans it and audits it. See docs/agentic-user-pilot.md § "Datos reales".
  454 |   }
  455 | }
  456 | 
  457 | /**
  458 |  * Captures the CURRENT page state — mid-interaction, no navigation — as
  459 |  * real evidence rather than a claim. Use this after a hover/click that
  460 |  * reveals something a plain page-load screenshot can never show (a tooltip
  461 |  * bubble, an expanded detail panel): pair it with a Playwright `expect(...)
  462 |  * .toBeVisible()` on the revealed element first, so the test actually FAILS
  463 |  * if the interaction doesn't work, instead of silently screenshotting a
  464 |  * closed state and letting it pass for "verified" (founder request,
  465 |  * 2026-08-02: "quiero la evidencia de que verificaste el click").
  466 |  *
  467 |  * Deliberately viewport-sized, unlike `visitAsUser`: growing the viewport to
  468 |  * capture a whole screen reflows the page, which would move an element out
  469 |  * from under the cursor and dismiss the very `:hover` state being captured.
  470 |  * The revealed element has already been scrolled into view, so the viewport is
  471 |  * where it is.
  472 |  */
  473 | export async function captureInteraction(
  474 |   page: Page,
  475 |   testInfo: TestInfo,
  476 |   label: string,
  477 |   opts: {
  478 |     /**
  479 |      * Capture the whole content instead of the viewport. Off by default,
  480 |      * because for a REVEAL the viewport is the point: a tooltip that renders
  481 |      * clipped or off-screen is the finding, and growing the viewport would
  482 |      * hide exactly that.
  483 |      *
  484 |      * Turn it on when the interaction reveals something TALLER than the fold,
  485 |      * where the viewport frame cuts off the very thing being verified — e.g.
  486 |      * the generated llms.txt, whose five publishing steps sit below the file
  487 |      * block and were invisible in every capture of the first run.
  488 |      */
  489 |     fullContent?: boolean;
  490 |   } = {}
  491 | ): Promise<string> {
  492 |   const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
  493 |   mkdirSync(SCREENS_DIR, { recursive: true });
  494 |   if (opts.fullContent) await captureFullContent(page, screenshot);
  495 |   else await page.screenshot({ path: screenshot });
  496 |   await testInfo.attach(attachmentName(`${label} (${testInfo.project.name})`), {
  497 |     path: screenshot,
  498 |     contentType: "image/png"
  499 |   });
  500 |   return screenshot;
  501 | }
  502 | 
  503 | /**
  504 |  * Asserts a revealed element is not just "visible" to Playwright but actually
  505 |  * legible to a human: fully inside the viewport horizontally, and not clipped
  506 |  * by an ancestor's `overflow: hidden`.
  507 |  *
  508 |  * Why this exists: `expect(bubble).toBeVisible()` passed for a KPI tooltip
  509 |  * that was rendering half-cut behind its own card (`overflow: hidden` on the
  510 |  * parent). The assertion was green and the UX was broken — only looking at
  511 |  * the capture caught it (founder, 2026-08-02: "no solo pruebe que sale, sino
  512 |  * que sale bien"). That class of defect is mechanically detectable, so it
  513 |  * belongs in an assertion rather than in a human's judgement.
  514 |  */
  515 | export async function assertFullyVisible(
  516 |   page: Page,
  517 |   selector: string,
  518 |   description: string
  519 | ): Promise<void> {
  520 |   const geometry = await page.locator(selector).first().evaluate((node: Element) => {
  521 |     const rect = node.getBoundingClientRect();
  522 |     let clippedBy: string | null = null;
  523 |     for (let parent = node.parentElement; parent; parent = parent.parentElement) {
  524 |       const style = window.getComputedStyle(parent);
  525 |       if (style.overflow === "visible" && style.overflowX === "visible" && style.overflowY === "visible") continue;
  526 |       const parentRect = parent.getBoundingClientRect();
  527 |       const escapes =
  528 |         rect.top < parentRect.top - 1 ||
  529 |         rect.bottom > parentRect.bottom + 1 ||
  530 |         rect.left < parentRect.left - 1 ||
  531 |         rect.right > parentRect.right + 1;
  532 |       if (escapes) {
  533 |         clippedBy = `${parent.tagName.toLowerCase()}.${parent.className || "(no class)"}`.slice(0, 80);
  534 |         break;
  535 |       }
  536 |     }
  537 |     return {
  538 |       left: rect.left,
  539 |       right: rect.right,
  540 |       width: rect.width,
  541 |       height: rect.height,
  542 |       viewportWidth: window.innerWidth,
  543 |       clippedBy
  544 |     };
  545 |   });
  546 | 
  547 |   expect(
  548 |     geometry.width > 0 && geometry.height > 0,
  549 |     `${description}: revealed element has zero size — nothing actually appeared`
  550 |   ).toBe(true);
  551 | 
  552 |   expect(
  553 |     geometry.clippedBy,
```