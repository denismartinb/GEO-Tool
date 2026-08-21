# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/recommendations-interactions.spec.ts >> recomendaciones: acordeones, filtros, detalle, tooltips y exportar responden de verdad
- Location: tests/pilot/journeys/recommendations-interactions.spec.ts:43:5

# Error details

```
TimeoutError: page.goto: Timeout 30000ms exceeded.
Call log:
  - navigating to "https://geo-tool-r1yes5r4d-9v7mrc44g8-1223s-projects.vercel.app/dashboard/projects/72b2b61e-f89c-4575-8a97-d3303e4bd55d/recommendations", waiting until "domcontentloaded"

```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - generic [ref=f2e2]:
    - complementary [ref=f2e3]:
      - generic [ref=f2e4]:
        - generic [ref=f2e5]:
          - img "GenScore" [ref=f2e6]
          - generic [ref=f2e10]: Espacio de visibilidad en IA
        - button "Cerrar menú" [ref=f2e11] [cursor=pointer]
      - link "Genscore genscore.es" [ref=f2e14] [cursor=pointer]:
        - /url: /dashboard/domains
        - generic [ref=f2e15]:
          - generic [ref=f2e16]: Genscore
          - generic [ref=f2e17]: genscore.es
      - generic [ref=f2e20]:
        - generic [ref=f2e21]: Analizar
        - link "Visión general" [ref=f2e22] [cursor=pointer]:
          - /url: /dashboard/projects/72b2b61e-f89c-4575-8a97-d3303e4bd55d
        - link "Prompts 1" [ref=f2e29] [cursor=pointer]:
          - /url: /dashboard/projects/72b2b61e-f89c-4575-8a97-d3303e4bd55d/prompts
          - generic [ref=f2e32]: Prompts
          - generic [ref=f2e33]: "1"
        - link "Competidores 8" [ref=f2e34] [cursor=pointer]:
          - /url: /dashboard/projects/72b2b61e-f89c-4575-8a97-d3303e4bd55d/competitors
          - generic [ref=f2e39]: Competidores
          - generic [ref=f2e40]: "8"
        - link "Páginas citadas" [ref=f2e41] [cursor=pointer]:
          - /url: /dashboard/projects/72b2b61e-f89c-4575-8a97-d3303e4bd55d/citations
        - link "Auditoría web" [ref=f2e48] [cursor=pointer]:
          - /url: /dashboard/projects/72b2b61e-f89c-4575-8a97-d3303e4bd55d/web-audit
        - generic [ref=f2e53]: Actuar
        - link "Recomendaciones 3" [ref=f2e54] [cursor=pointer]:
          - /url: /dashboard/projects/72b2b61e-f89c-4575-8a97-d3303e4bd55d/recommendations
          - generic [ref=f2e58]: Recomendaciones
          - generic [ref=f2e59]: "3"
      - generic [ref=f2e60]:
        - button "¿Qué es el GEO?" [ref=f2e61] [cursor=pointer]
        - link "DE de5@gmail.com Agencia" [ref=f2e65] [cursor=pointer]:
          - /url: /dashboard/settings
          - generic [ref=f2e66]: DE
          - generic [ref=f2e67]:
            - generic [ref=f2e68]: de5@gmail.com
            - generic [ref=f2e69]: Agencia
        - button "Cerrar sesión" [ref=f2e73] [cursor=pointer]
    - generic [ref=f2e78]:
      - banner [ref=f2e79]:
        - button "Abrir menú de navegación" [ref=f2e80] [cursor=pointer]
        - button "Notificaciones" [ref=f2e85] [cursor=pointer]
      - main [ref=f2e89]:
        - generic [ref=f2e91]:
          - generic [ref=f2e93]:
            - paragraph [ref=f2e94]: Espacio de trabajo
            - generic [ref=f2e95]:
              - heading "Dominios" [level=1] [ref=f2e96]
              - generic [ref=f2e97]: 11 activos
          - 'link "Eliminar dominio genscore.es Genscore genscore.es·ES·es Último escaneo: ayer, 18:31 0 Puntuación GEO El análisis GEO evalúa tu dominio en visibilidad generativa y presencia de marca. Ver visión general" [ref=f2e98] [cursor=pointer]':
            - /url: /dashboard/projects/72b2b61e-f89c-4575-8a97-d3303e4bd55d
            - button "Eliminar dominio genscore.es" [ref=f2e99]
            - generic [ref=f2e104]:
              - generic [ref=f2e105]: Genscore
              - generic [ref=f2e106]: genscore.es·ES·es
              - generic [ref=f2e107]: "Último escaneo: ayer, 18:31"
            - generic [ref=f2e112]:
              - generic [ref=f2e117]:
                - generic [ref=f2e118]: "0"
                - generic [ref=f2e119]: Puntuación GEO
              - paragraph [ref=f2e120]: El análisis GEO evalúa tu dominio en visibilidad generativa y presencia de marca.
            - generic [ref=f2e121]: Ver visión general
          - generic [ref=f2e124]:
            - link "Linkedin linkedin.com 100 ayer, 18:27" [ref=f2e125] [cursor=pointer]:
              - /url: /dashboard/domains?active=af205fad-3567-4145-8086-14913e3c3288
              - generic [ref=f2e127]:
                - generic [ref=f2e128]: Linkedin
                - generic [ref=f2e129]: linkedin.com
              - generic [ref=f2e130]:
                - generic [ref=f2e131]: "100"
                - generic [ref=f2e132]: ayer, 18:27
            - link "Hostinger hostinger.com 51 10 ago" [ref=f2e133] [cursor=pointer]:
              - /url: /dashboard/domains?active=1f02c089-0472-4502-ac35-a6268f769e3c
              - generic [ref=f2e135]:
                - generic [ref=f2e136]: Hostinger
                - generic [ref=f2e137]: hostinger.com
              - generic [ref=f2e138]:
                - generic [ref=f2e139]: "51"
                - generic [ref=f2e140]: 10 ago
            - link "Mozilla mozilla.org 48 -9 5 ago" [ref=f2e141] [cursor=pointer]:
              - /url: /dashboard/domains?active=9084390d-3fd7-4e40-ae2f-b70558da679a
              - generic [ref=f2e143]:
                - generic [ref=f2e144]: Mozilla
                - generic [ref=f2e145]: mozilla.org
              - generic [ref=f2e146]:
                - generic [ref=f2e147]: "48"
                - generic [ref=f2e148]: "-9"
                - generic [ref=f2e151]: 5 ago
            - link "Mahou mahou.es 48 9 ago" [ref=f2e152] [cursor=pointer]:
              - /url: /dashboard/domains?active=4e964f7d-8d2c-40b6-8d70-967ba4b32724
              - generic [ref=f2e154]:
                - generic [ref=f2e155]: Mahou
                - generic [ref=f2e156]: mahou.es
              - generic [ref=f2e157]:
                - generic [ref=f2e158]: "48"
                - generic [ref=f2e159]: 9 ago
            - link "Alberdiderma alberdiderma.es 6 5 ago" [ref=f2e160] [cursor=pointer]:
              - /url: /dashboard/domains?active=030a3a4d-ad6f-452f-9233-0a47f39c2d7f
              - generic [ref=f2e161]:
                - generic [ref=f2e162]: A
                - generic [ref=f2e163]:
                  - generic [ref=f2e164]: Alberdiderma
                  - generic [ref=f2e165]: alberdiderma.es
              - generic [ref=f2e166]:
                - generic [ref=f2e167]: "6"
                - generic [ref=f2e168]: 5 ago
            - link "Farmaciamunozpereira farmaciamunozpereira.com 43 30 jul" [ref=f2e169] [cursor=pointer]:
              - /url: /dashboard/domains?active=c646293d-ac19-4b7a-868b-80731734420b
              - generic [ref=f2e171]:
                - generic [ref=f2e172]: Farmaciamunozpereira
                - generic [ref=f2e173]: farmaciamunozpereira.com
              - generic [ref=f2e174]:
                - generic [ref=f2e175]: "43"
                - generic [ref=f2e176]: 30 jul
            - link "Ifinanciera ifinanciera.es 20 25 jul" [ref=f2e177] [cursor=pointer]:
              - /url: /dashboard/domains?active=dbb19e0c-8a8a-4819-8d54-ec412b32cf96
              - generic [ref=f2e179]:
                - generic [ref=f2e180]: Ifinanciera
                - generic [ref=f2e181]: ifinanciera.es
              - generic [ref=f2e182]:
                - generic [ref=f2e183]: "20"
                - generic [ref=f2e184]: 25 jul
            - link "Vodafone vodafone.es 87 7 ago" [ref=f2e185] [cursor=pointer]:
              - /url: /dashboard/domains?active=8bd0a4d7-5622-43a6-a951-abcccb750fb7
              - generic [ref=f2e187]:
                - generic [ref=f2e188]: Vodafone
                - generic [ref=f2e189]: vodafone.es
              - generic [ref=f2e190]:
                - generic [ref=f2e191]: "87"
                - generic [ref=f2e192]: 7 ago
            - link "Apple apple.es 55 5 ago" [ref=f2e193] [cursor=pointer]:
              - /url: /dashboard/domains?active=56a633a6-db3f-49ec-aece-9fe537c5fc5d
              - generic [ref=f2e195]:
                - generic [ref=f2e196]: Apple
                - generic [ref=f2e197]: apple.es
              - generic [ref=f2e198]:
                - generic [ref=f2e199]: "55"
                - generic [ref=f2e200]: 5 ago
            - link "Movistar movistar.es 80 5 ago" [ref=f2e201] [cursor=pointer]:
              - /url: /dashboard/domains?active=1f32abc4-d709-4db2-a68a-f95c8c8b11c8
              - generic [ref=f2e203]:
                - generic [ref=f2e204]: Movistar
                - generic [ref=f2e205]: movistar.es
              - generic [ref=f2e206]:
                - generic [ref=f2e207]: "80"
                - generic [ref=f2e208]: 5 ago
            - link "Añadir dominio Se escanea desde el primer día" [ref=f2e209] [cursor=pointer]:
              - /url: /dashboard/projects/new
              - generic [ref=f2e213]: Añadir dominio
              - generic [ref=f2e214]: Se escanea desde el primer día
  - alert [ref=f2e215]
```

# Test source

```ts
  486 |  * cerrar, esto tiene que fallar en vez de taparlo con una vía alternativa.
  487 |  */
  488 | export async function dismissWelcomeTour(page: Page): Promise<boolean> {
  489 |   const scrim = page.locator(WELCOME_TOUR_SCRIM);
  490 |   if ((await scrim.count()) === 0) return false;
  491 |   if (!(await scrim.first().isVisible().catch(() => false))) return false;
  492 | 
  493 |   await page.locator(`${WELCOME_TOUR_SCRIM} .pt-close`).first().click({ timeout: 5_000 });
  494 |   await scrim.first().waitFor({ state: "hidden", timeout: 5_000 });
  495 |   return true;
  496 | }
  497 | 
  498 | /**
  499 |  * Lo que una ruta puede declarar sobre sí misma antes de visitarla.
  500 |  *
  501 |  * Hoy sólo una cosa, y existe porque el harness no podía pilotar una 404
  502 |  * NUNCA (NOT-FOUND-ROCKET-1, 2026-08-12): `onResponse` marca como fallo
  503 |  * cualquier respuesta ≥400 de primera parte, y en una página de error el
  504 |  * documento principal DEBE responder ≥400. El piloto reportaba
  505 |  * "first-party requests failed" por el único comportamiento que esa pantalla
  506 |  * está obligada a tener.
  507 |  *
  508 |  * Es deliberadamente estrecho: exime **una** respuesta, la del documento de
  509 |  * la ruta visitada, y **sólo** con el código declarado. Un 500 en esa misma
  510 |  * ruta, o un 404 de un subrecurso —un CSS que no carga, una imagen rota—
  511 |  * siguen tumbando la pasada, que es justo lo que esta comprobación existe
  512 |  * para detectar. Y no debilita la garantía de que la ruta responde 404: eso
  513 |  * lo asevera su propio test con `page.request.get`, aparte de esto.
  514 |  */
  515 | export interface VisitOptions {
  516 |   /** El documento de esta ruta responde con este código, y eso es correcto. */
  517 |   expectDocumentStatus?: number;
  518 | }
  519 | 
  520 | export async function visitAsUser(
  521 |   page: Page,
  522 |   testInfo: TestInfo,
  523 |   path: string,
  524 |   label: string,
  525 |   expectation?: ContentExpectation,
  526 |   options?: VisitOptions
  527 | ): Promise<PageFindings> {
  528 |   const expectedDocStatus = options?.expectDocumentStatus;
  529 |   const visitedPath = path.split("?")[0].split("#")[0];
  530 |   /** ¿Es esta respuesta la del documento de la propia ruta que se visita? */
  531 |   const isVisitedDocument = (url: string): boolean => {
  532 |     try {
  533 |       return new URL(url).pathname.replace(/\/$/, "") === visitedPath.replace(/\/$/, "");
  534 |     } catch {
  535 |       return false;
  536 |     }
  537 |   };
  538 |   const consoleErrors: string[] = [];
  539 |   const failedRequests: string[] = [];
  540 |   const thirdPartyFailures: string[] = [];
  541 | 
  542 |   const onConsole = (message: {
  543 |     type: () => string;
  544 |     text: () => string;
  545 |     location: () => { url?: string };
  546 |   }) => {
  547 |     if (message.type() !== "error") return;
  548 |     // Chromium reports failed subresources as a bare "Failed to load resource:
  549 |     // 404" with the URL only in `location()`. Without it the noise filters below
  550 |     // can never match, and the reported error tells a reviewer nothing.
  551 |     const sourceUrl = message.location()?.url ?? "";
  552 |     const text = sourceUrl ? `${message.text()} (${sourceUrl})` : message.text();
  553 |     if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return;
  554 |     // Chromium también registra el status del documento como error de consola
  555 |     // ("Failed to load resource: ... 404"). Es el mismo hecho ya eximido
  556 |     // arriba, no un segundo problema: filtrarlo aquí evita que una sola 404
  557 |     // esperada cuente dos veces.
  558 |     if (
  559 |       expectedDocStatus !== undefined &&
  560 |       text.includes(String(expectedDocStatus)) &&
  561 |       isVisitedDocument(sourceUrl)
  562 |     ) {
  563 |       return;
  564 |     }
  565 |     consoleErrors.push(redact(text));
  566 |   };
  567 | 
  568 |   const onResponse = (response: { status: () => number; url: () => string }) => {
  569 |     const status = response.status();
  570 |     if (status < 400) return;
  571 |     if (expectedDocStatus !== undefined && status === expectedDocStatus && isVisitedDocument(response.url())) {
  572 |       return;
  573 |     }
  574 |     const entry = `${status} ${redact(response.url())}`;
  575 |     if (THIRD_PARTY_HOSTS.test(response.url())) thirdPartyFailures.push(entry);
  576 |     else failedRequests.push(entry);
  577 |   };
  578 | 
  579 |   page.on("console", onConsole);
  580 |   page.on("response", onResponse);
  581 | 
  582 |   try {
  583 |     await page.goto(path, { waitUntil: "networkidle" }).catch(async () => {
  584 |       // networkidle can never settle on a page with long-polling; fall back to
  585 |       // the weaker guarantee rather than failing the whole journey.
> 586 |       await page.goto(path, { waitUntil: "domcontentloaded" });
      |                  ^ TimeoutError: page.goto: Timeout 30000ms exceeded.
  587 |     });
  588 | 
  589 |     // Give client components a beat to hydrate before measuring layout.
  590 |     await page.waitForTimeout(1_000);
  591 | 
  592 |     // El tour de bienvenida (ONBOARDING-TOUR-1) salta solo la primera vez que
  593 |     // se entra en la consola, y el piloto estrena navegador en cada pasada, así
  594 |     // que se lo encuentra abierto. Se cierra igual que haría una persona: es un
  595 |     // modal, tapa la pantalla entera y bloquea cualquier hover o clic detrás.
  596 |     // Sin esto, el 2026-08-07 tumbó seis pruebas —el tooltip de Páginas citadas
  597 |     // y la campana, en las tres anchuras— por `Timeout exceeded` contra
  598 |     // elementos que estaban perfectamente bien, sólo tapados.
  599 |     //
  600 |     // Cerrarlo no lo deja sin mirar: `onboarding-tour.spec.ts` es una pasada
  601 |     // dedicada que lo abre, comprueba que trae contenido de verdad y lo
  602 |     // fotografía antes de cerrarlo. Aquí sólo se quita de en medio.
  603 |     const dismissedWelcomeTour = await dismissWelcomeTour(page);
  604 | 
  605 |     const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  606 |     // `.dash-content` (see the horizontal-overflow note above), not
  607 |     // document.documentElement — on a dashboard screen the document never
  608 |     // overflows, `.dash-content` does, on its own independent axis. Still
  609 |     // check the document too: non-console pages (/login) have no
  610 |     // `.dash-content` and scroll normally.
  611 |     const scrollWidth = await page.evaluate(() => {
  612 |       const content = document.querySelector<HTMLElement>(".dash-content");
  613 |       return Math.max(document.documentElement.scrollWidth, content?.scrollWidth ?? 0);
  614 |     });
  615 |     const finalUrl = page.url();
  616 |     const bouncedToLogin = /\/login/.test(finalUrl) && !path.includes("/login");
  617 |     // 2px of slack absorbs sub-pixel rounding without hiding a real overflow.
  618 |     const horizontalOverflow = scrollWidth > viewport.width + 2;
  619 | 
  620 |     // Checked BEFORE the screenshot so a failure and its evidence describe the
  621 |     // same moment.
  622 |     let renderedRealContent: boolean | null = null;
  623 |     if (expectation) {
  624 |       renderedRealContent = false;
  625 |       for (const anchor of expectation.anyOf) {
  626 |         if (anchor.selector) {
  627 |           const hit = await page.locator(anchor.selector).first().isVisible().catch(() => false);
  628 |           if (hit) {
  629 |             renderedRealContent = true;
  630 |             break;
  631 |           }
  632 |         }
  633 |         if (anchor.text) {
  634 |           const hit = await page.getByText(anchor.text).first().isVisible().catch(() => false);
  635 |           if (hit) {
  636 |             renderedRealContent = true;
  637 |             break;
  638 |           }
  639 |         }
  640 |       }
  641 |     }
  642 | 
  643 |     const headerInteractiveControls = await page.evaluate(() => {
  644 |       const header = document.querySelector(".ov-sticky-header");
  645 |       if (!header) return [];
  646 |       const controls = header.querySelectorAll("button, a[href], input, select, textarea");
  647 |       return Array.from(controls).map((el) => {
  648 |         const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  649 |         return `${el.tagName.toLowerCase()}${text ? `:"${text}"` : ""}`;
  650 |       });
  651 |     });
  652 | 
  653 |     // Same reason as the culprits below: `captureFullContent` resizes the
  654 |     // viewport, and both of these checks are viewport-dependent — the drawer
  655 |     // CTA regression only exists below 900px, and a responsive layout can
  656 |     // legitimately show one control at one width and two at another.
  657 |     const controlAudit = await auditControls(page);
  658 | 
  659 |     // Culprits are measured BEFORE the capture, while the viewport is still
  660 |     // the one under test — captureFullContent resizes it and puts it back.
  661 |     const overflowCulprits = horizontalOverflow ? await findOverflowCulprits(page, viewport.width) : [];
  662 | 
  663 |     // Sólo cuando hay rebote: leer cookies en cada visita sana es coste sin
  664 |     // información.
  665 |     const authDiagnostics = bouncedToLogin ? await describeAuthState(page) : null;
  666 | 
  667 |     const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
  668 |     mkdirSync(SCREENS_DIR, { recursive: true });
  669 |     const capture = await captureFullContent(page, screenshot);
  670 | 
  671 |     const findings: PageFindings = {
  672 |       label,
  673 |       path,
  674 |       viewport: testInfo.project.name,
  675 |       finalUrl: redact(finalUrl),
  676 |       scrollWidth,
  677 |       viewportWidth: viewport.width,
  678 |       horizontalOverflow,
  679 |       overflowCulprits,
  680 |       consoleErrors,
  681 |       failedRequests,
  682 |       thirdPartyFailures,
  683 |       bouncedToLogin,
  684 |       authDiagnostics,
  685 |       screenshot,
  686 |       renderedRealContent,
```