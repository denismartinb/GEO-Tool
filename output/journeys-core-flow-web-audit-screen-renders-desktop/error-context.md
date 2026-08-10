# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/core-flow.spec.ts >> web audit screen renders
- Location: tests/pilot/journeys/core-flow.spec.ts:148:5

# Error details

```
Error: web-audit @ desktop: the page loaded without errors but never rendered las pestañas de la auditoría (Problemas · Correcto · Páginas) — this is an empty state, a plan gate, or an unresolved skeleton, NOT the screen this journey exists to verify. Reporting it as passing would certify a placeholder (real incident, 2026-08-02: a full-screen redesign shipped with a green pilot because every capture showed "Todavía no has auditado tu web"). Fix by seeding the pilot account with real data — run the "Agentic User Pilot (write)" workflow, whose seed journey creates a project, scans it and audits it. See docs/agentic-user-pilot.md § "Datos reales".

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - generic [ref=e5]:
        - img "Genscore" [ref=e6]
        - generic [ref=e10]: Espacio de visibilidad en IA
      - link "Genscore genscore.es" [ref=e11] [cursor=pointer]:
        - /url: /dashboard/domains
        - generic [ref=e12]:
          - generic [ref=e13]: Genscore
          - generic [ref=e14]: genscore.es
      - generic [ref=e17]:
        - generic [ref=e18]: Analizar
        - link "Visión general" [ref=e19] [cursor=pointer]:
          - /url: /dashboard/projects/77ee53cf-643c-4b89-ac27-d46483694d27
        - link "Prompts 12" [ref=e26] [cursor=pointer]:
          - /url: /dashboard/projects/77ee53cf-643c-4b89-ac27-d46483694d27/prompts
          - generic [ref=e29]: Prompts
          - generic [ref=e30]: "12"
        - link "Competidores 5" [ref=e31] [cursor=pointer]:
          - /url: /dashboard/projects/77ee53cf-643c-4b89-ac27-d46483694d27/competitors
          - generic [ref=e36]: Competidores
          - generic [ref=e37]: "5"
        - link "Páginas citadas" [ref=e38] [cursor=pointer]:
          - /url: /dashboard/projects/77ee53cf-643c-4b89-ac27-d46483694d27/citations
        - link "Auditoría web" [ref=e45] [cursor=pointer]:
          - /url: /dashboard/projects/77ee53cf-643c-4b89-ac27-d46483694d27/web-audit
        - generic [ref=e50]: Actuar
        - link "Recomendaciones 21" [ref=e51] [cursor=pointer]:
          - /url: /dashboard/projects/77ee53cf-643c-4b89-ac27-d46483694d27/recommendations
          - generic [ref=e55]: Recomendaciones
          - generic [ref=e56]: "21"
      - generic [ref=e57]:
        - button "¿Qué es el GEO?" [ref=e58] [cursor=pointer]
        - link "DE de5@gmail.com Agencia" [ref=e62] [cursor=pointer]:
          - /url: /dashboard/settings
          - generic [ref=e63]: DE
          - generic [ref=e64]:
            - generic [ref=e65]: de5@gmail.com
            - generic [ref=e66]: Agencia
    - generic [ref=e69]:
      - banner [ref=e70]:
        - generic [ref=e71]: Completado
        - generic [ref=e73]:
          - button "Notificaciones" [ref=e75] [cursor=pointer]
          - button "Cerrar sesión" [ref=e80] [cursor=pointer]
      - generic [ref=e84]:
        - generic [ref=e89]: Tu análisis de hoy no se repetirá. Activa el seguimiento diario para ver cómo evoluciona tu visibilidad frente a tus competidores.
        - button "Activar seguimiento diario" [ref=e91] [cursor=pointer]
      - main [ref=e92]:
        - generic [ref=e93]:
          - generic [ref=e96]:
            - paragraph [ref=e97]: Auditoría web
            - generic [ref=e98]:
              - generic [ref=e99]: Genscore
              - generic [ref=e100]: genscore.es
              - generic [ref=e101]: PRO
          - generic [ref=e102]:
            - generic [ref=e103]:
              - generic [ref=e104]: Todavía no has auditado tu web
              - paragraph [ref=e105]: "Tu dominio visto como lo ve la IA: la auditoría comprueba, tema a tema, si tu dominio publica contenido que Google encuentra, y lo cruza con las citas de tu último escaneo."
              - paragraph [ref=e106]: Hasta 5 auditorías al día por proyecto.
            - generic [ref=e107]:
              - link "Dominios" [ref=e108] [cursor=pointer]:
                - /url: /dashboard/domains
              - link "Recomendaciones" [ref=e112] [cursor=pointer]:
                - /url: /dashboard/projects/77ee53cf-643c-4b89-ac27-d46483694d27/recommendations
  - alert [ref=e116]
```

# Test source

```ts
  392 |       return Array.from(controls).map((el) => {
  393 |         const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  394 |         return `${el.tagName.toLowerCase()}${text ? `:"${text}"` : ""}`;
  395 |       });
  396 |     });
  397 | 
  398 |     // Culprits are measured BEFORE the capture, while the viewport is still
  399 |     // the one under test — captureFullContent resizes it and puts it back.
  400 |     const overflowCulprits = horizontalOverflow ? await findOverflowCulprits(page, viewport.width) : [];
  401 | 
  402 |     const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
  403 |     mkdirSync(SCREENS_DIR, { recursive: true });
  404 |     const capture = await captureFullContent(page, screenshot);
  405 | 
  406 |     const findings: PageFindings = {
  407 |       label,
  408 |       path,
  409 |       viewport: testInfo.project.name,
  410 |       finalUrl: redact(finalUrl),
  411 |       scrollWidth,
  412 |       viewportWidth: viewport.width,
  413 |       horizontalOverflow,
  414 |       overflowCulprits,
  415 |       consoleErrors,
  416 |       failedRequests,
  417 |       thirdPartyFailures,
  418 |       bouncedToLogin,
  419 |       screenshot,
  420 |       renderedRealContent,
  421 |       expectedContent: expectation?.describedAs ?? null,
  422 |       headerInteractiveControls,
  423 |       dismissedWelcomeTour,
  424 |       ...capture
  425 |     };
  426 | 
  427 |     recordFindings(findings);
  428 |     await testInfo.attach(attachmentName(`${label} (${testInfo.project.name})`), {
  429 |       path: screenshot,
  430 |       contentType: "image/png"
  431 |     });
  432 | 
  433 |     return findings;
  434 |   } finally {
  435 |     page.off("console", onConsole);
  436 |     page.off("response", onResponse);
  437 |   }
  438 | }
  439 | 
  440 | /**
  441 |  * Fails the journey on the signals no screenshot review should ever have to
  442 |  * catch. Kept separate from `visitAsUser` so a journey can record a page
  443 |  * without asserting on it (useful for intermediate navigation steps).
  444 |  */
  445 | export function assertPageIsHealthy(findings: PageFindings): void {
  446 |   expect(
  447 |     findings.bouncedToLogin,
  448 |     `${findings.label}: session was rejected — landed on ${findings.finalUrl}`
  449 |   ).toBe(false);
  450 | 
  451 |   expect(
  452 |     findings.horizontalOverflow,
  453 |     `${findings.label} @ ${findings.viewport}: horizontal overflow — ` +
  454 |       `scrollWidth ${findings.scrollWidth}px > viewport ${findings.viewportWidth}px` +
  455 |       (findings.overflowCulprits.length
  456 |         ? `\nCulprit(s):\n  ${findings.overflowCulprits.join("\n  ")}`
  457 |         : "")
  458 |   ).toBe(false);
  459 | 
  460 |   expect(
  461 |     findings.failedRequests,
  462 |     `${findings.label}: first-party requests failed`
  463 |   ).toEqual([]);
  464 | 
  465 |   expect(
  466 |     findings.consoleErrors,
  467 |     `${findings.label}: console errors`
  468 |   ).toEqual([]);
  469 | 
  470 |   expect(
  471 |     findings.headerInteractiveControls,
  472 |     `${findings.label}: the shared sticky header must stay purely informational ` +
  473 |       `(badges/pills only) — docs/brand/design-decisions-log.md §3. Found interactive ` +
  474 |       `control(s) inside .ov-sticky-header, which belong in the page body instead.`
  475 |   ).toEqual([]);
  476 | 
  477 |   // Deliberately the LAST assertion: the ones above describe a broken screen,
  478 |   // this one describes a screen the pilot never got to judge. Both fail the
  479 |   // run, but only this one is fixed by seeding data rather than by changing
  480 |   // product code, so it should not mask a real defect above it.
  481 |   if (findings.renderedRealContent !== null) {
  482 |     expect(
  483 |       findings.renderedRealContent,
  484 |       `${findings.label} @ ${findings.viewport}: the page loaded without errors but never ` +
  485 |         `rendered ${findings.expectedContent} — this is an empty state, a plan gate, or an ` +
  486 |         `unresolved skeleton, NOT the screen this journey exists to verify. Reporting it as ` +
  487 |         `passing would certify a placeholder (real incident, 2026-08-02: a full-screen redesign ` +
  488 |         `shipped with a green pilot because every capture showed "Todavía no has auditado tu web"). ` +
  489 |         `Fix by seeding the pilot account with real data — run the "Agentic User Pilot (write)" ` +
  490 |         `workflow, whose seed journey creates a project, scans it and audits it. ` +
  491 |         `See docs/agentic-user-pilot.md § "Datos reales".`
> 492 |     ).toBe(true);
      |       ^ Error: web-audit @ desktop: the page loaded without errors but never rendered las pestañas de la auditoría (Problemas · Correcto · Páginas) — this is an empty state, a plan gate, or an unresolved skeleton, NOT the screen this journey exists to verify. Reporting it as passing would certify a placeholder (real incident, 2026-08-02: a full-screen redesign shipped with a green pilot because every capture showed "Todavía no has auditado tu web"). Fix by seeding the pilot account with real data — run the "Agentic User Pilot (write)" workflow, whose seed journey creates a project, scans it and audits it. See docs/agentic-user-pilot.md § "Datos reales".
  493 |   }
  494 | }
  495 | 
  496 | /**
  497 |  * Captures the CURRENT page state — mid-interaction, no navigation — as
  498 |  * real evidence rather than a claim. Use this after a hover/click that
  499 |  * reveals something a plain page-load screenshot can never show (a tooltip
  500 |  * bubble, an expanded detail panel): pair it with a Playwright `expect(...)
  501 |  * .toBeVisible()` on the revealed element first, so the test actually FAILS
  502 |  * if the interaction doesn't work, instead of silently screenshotting a
  503 |  * closed state and letting it pass for "verified" (founder request,
  504 |  * 2026-08-02: "quiero la evidencia de que verificaste el click").
  505 |  *
  506 |  * Deliberately viewport-sized, unlike `visitAsUser`: growing the viewport to
  507 |  * capture a whole screen reflows the page, which would move an element out
  508 |  * from under the cursor and dismiss the very `:hover` state being captured.
  509 |  * The revealed element has already been scrolled into view, so the viewport is
  510 |  * where it is.
  511 |  */
  512 | export async function captureInteraction(
  513 |   page: Page,
  514 |   testInfo: TestInfo,
  515 |   label: string,
  516 |   opts: {
  517 |     /**
  518 |      * Capture the whole content instead of the viewport. Off by default,
  519 |      * because for a REVEAL the viewport is the point: a tooltip that renders
  520 |      * clipped or off-screen is the finding, and growing the viewport would
  521 |      * hide exactly that.
  522 |      *
  523 |      * Turn it on when the interaction reveals something TALLER than the fold,
  524 |      * where the viewport frame cuts off the very thing being verified — e.g.
  525 |      * the generated llms.txt, whose five publishing steps sit below the file
  526 |      * block and were invisible in every capture of the first run.
  527 |      */
  528 |     fullContent?: boolean;
  529 |   } = {}
  530 | ): Promise<string> {
  531 |   const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
  532 |   mkdirSync(SCREENS_DIR, { recursive: true });
  533 |   if (opts.fullContent) await captureFullContent(page, screenshot);
  534 |   // `animations: "disabled"` finishes running CSS animations and pins them to
  535 |   // their end state. Without it a capture taken right after a reveal catches
  536 |   // the element mid-fade: the notifications panel (`menuIn`, opacity 0→1 over
  537 |   // 140ms) was photographed half-transparent with the page bleeding through,
  538 |   // and a reviewing agent read that as a real rendering defect (2026-08-05).
  539 |   // Every popover, menu and drawer in the suite was subject to the same lie.
  540 |   else await page.screenshot({ path: screenshot, animations: "disabled" });
  541 |   await testInfo.attach(attachmentName(`${label} (${testInfo.project.name})`), {
  542 |     path: screenshot,
  543 |     contentType: "image/png"
  544 |   });
  545 |   return screenshot;
  546 | }
  547 | 
  548 | /**
  549 |  * Asserts a revealed element is not just "visible" to Playwright but actually
  550 |  * legible to a human: fully inside the viewport horizontally, and not clipped
  551 |  * by an ancestor's `overflow: hidden`.
  552 |  *
  553 |  * Why this exists: `expect(bubble).toBeVisible()` passed for a KPI tooltip
  554 |  * that was rendering half-cut behind its own card (`overflow: hidden` on the
  555 |  * parent). The assertion was green and the UX was broken — only looking at
  556 |  * the capture caught it (founder, 2026-08-02: "no solo pruebe que sale, sino
  557 |  * que sale bien"). That class of defect is mechanically detectable, so it
  558 |  * belongs in an assertion rather than in a human's judgement.
  559 |  */
  560 | export async function assertFullyVisible(
  561 |   page: Page,
  562 |   selector: string,
  563 |   description: string
  564 | ): Promise<void> {
  565 |   const geometry = await page.locator(selector).first().evaluate((node: Element) => {
  566 |     const rect = node.getBoundingClientRect();
  567 |     let clippedBy: string | null = null;
  568 |     for (let parent = node.parentElement; parent; parent = parent.parentElement) {
  569 |       const style = window.getComputedStyle(parent);
  570 |       if (style.overflow === "visible" && style.overflowX === "visible" && style.overflowY === "visible") continue;
  571 |       const parentRect = parent.getBoundingClientRect();
  572 |       const escapes =
  573 |         rect.top < parentRect.top - 1 ||
  574 |         rect.bottom > parentRect.bottom + 1 ||
  575 |         rect.left < parentRect.left - 1 ||
  576 |         rect.right > parentRect.right + 1;
  577 |       if (escapes) {
  578 |         clippedBy = `${parent.tagName.toLowerCase()}.${parent.className || "(no class)"}`.slice(0, 80);
  579 |         break;
  580 |       }
  581 |     }
  582 |     return {
  583 |       left: rect.left,
  584 |       right: rect.right,
  585 |       width: rect.width,
  586 |       height: rect.height,
  587 |       viewportWidth: window.innerWidth,
  588 |       clippedBy
  589 |     };
  590 |   });
  591 | 
  592 |   expect(
```