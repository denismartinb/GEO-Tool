# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/core-flow.spec.ts >> recommendations screen renders
- Location: tests/pilot/journeys/core-flow.spec.ts:146:5

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
          - img "GenScore" [ref=e6]
          - generic [ref=e10]: Espacio de visibilidad en IA
        - button "Cerrar menú" [ref=e11] [cursor=pointer]
      - link "Amazon amazon.es" [ref=e14] [cursor=pointer]:
        - /url: /dashboard/domains
        - generic [ref=e15]:
          - generic [ref=e16]: Amazon
          - generic [ref=e17]: amazon.es
      - generic [ref=e20]:
        - generic [ref=e21]: Analizar
        - link "Visión general" [ref=e22] [cursor=pointer]:
          - /url: /dashboard/projects/c46597c1-f7f3-4aa6-a436-15ab240e897d
        - link "Prompts 1" [ref=e29] [cursor=pointer]:
          - /url: /dashboard/projects/c46597c1-f7f3-4aa6-a436-15ab240e897d/prompts
          - generic [ref=e32]: Prompts
          - generic [ref=e33]: "1"
        - link "Competidores 2" [ref=e34] [cursor=pointer]:
          - /url: /dashboard/projects/c46597c1-f7f3-4aa6-a436-15ab240e897d/competitors
          - generic [ref=e39]: Competidores
          - generic [ref=e40]: "2"
        - link "Páginas citadas" [ref=e41] [cursor=pointer]:
          - /url: /dashboard/projects/c46597c1-f7f3-4aa6-a436-15ab240e897d/citations
        - link "Auditoría web" [ref=e48] [cursor=pointer]:
          - /url: /dashboard/projects/c46597c1-f7f3-4aa6-a436-15ab240e897d/web-audit
        - generic [ref=e53]: Actuar
        - link "Recomendaciones" [ref=e54] [cursor=pointer]:
          - /url: /dashboard/projects/c46597c1-f7f3-4aa6-a436-15ab240e897d/recommendations
      - generic [ref=e59]:
        - button "¿Qué es el GEO?" [ref=e60] [cursor=pointer]
        - link "DE de5@gmail.com Agencia" [ref=e64] [cursor=pointer]:
          - /url: /dashboard/settings
          - generic [ref=e65]: DE
          - generic [ref=e66]:
            - generic [ref=e67]: de5@gmail.com
            - generic [ref=e68]: Agencia
        - button "Cerrar sesión" [ref=e72] [cursor=pointer]
    - generic [ref=e77]:
      - banner [ref=e78]:
        - button "Abrir menú de navegación" [ref=e79] [cursor=pointer]
        - button "Notificaciones" [ref=e84] [cursor=pointer]
      - generic [ref=e88]:
        - generic [ref=e93]: Tu análisis de hoy no se repetirá. Activa el seguimiento diario para ver cómo evoluciona tu visibilidad frente a tus competidores.
        - button "Activar seguimiento diario" [ref=e95] [cursor=pointer]
      - main [ref=e96]:
        - generic [ref=e97]:
          - generic [ref=e98]:
            - generic [ref=e100]:
              - paragraph [ref=e101]: Recomendaciones
              - generic [ref=e102]: Amazon
            - generic [ref=e104]: Escaneado 21 ago 2026
          - generic [ref=e106]:
            - generic [ref=e113]:
              - generic [ref=e114]: Tu web bloquea a GPTBot y OAI-SearchBot y 3 más
              - generic [ref=e115]:
                - text: Esos motores no pueden leer tu contenido, así que no pueden citarte.
                - link "Ver cómo arreglarlo" [ref=e116] [cursor=pointer]:
                  - /url: /dashboard/projects/c46597c1-f7f3-4aa6-a436-15ab240e897d/web-audit
            - generic [ref=e117]:
              - generic [ref=e118]:
                - generic [ref=e119]:
                  - text: Presencia
                  - note "En cuántas de tus consultas te nombra la IA. Si no te nombra, no te pueden elegir." [ref=e120]:
                    - generic: i
                - generic [ref=e121]: "100"
              - generic [ref=e124]:
                - generic [ref=e125]:
                  - text: Cuota de voz
                  - note "Cuánto espacio ocupas tú frente a tus competidores en el total de menciones." [ref=e126]:
                    - generic: i
                - generic [ref=e127]: "50"
              - generic [ref=e130]:
                - generic [ref=e131]:
                  - text: Autoridad
                  - note "Con qué frecuencia la IA usa tu web como fuente y te cita, en vez de citar a otros." [ref=e132]:
                    - generic: i
                - generic [ref=e133]: "0"
            - generic [ref=e135]:
              - generic [ref=e136]: Nada que corregir ahora mismo
              - generic [ref=e137]: Este escaneo no ha encontrado ningún hueco accionable. Vuelve tras el próximo.
              - link "Ver detalle del escaneo" [ref=e138] [cursor=pointer]:
                - /url: /dashboard/projects/c46597c1-f7f3-4aa6-a436-15ab240e897d/runs/e27221b0-9b6b-4dfd-9019-442304f56053
  - alert [ref=e141]
```

# Test source

```ts
  748 |  * síntoma equivocado. Lo primero es que, cuando vuelva a pasar, el fallo diga
  749 |  * algo.
  750 |  *
  751 |  * **Nombres, nunca valores.** Una cookie de sesión de Supabase ES la sesión:
  752 |  * volcar su valor al log de un run público sería regalar la cuenta del piloto.
  753 |  * Lo que se necesita para diagnosticar es si las cookies estaban, no qué
  754 |  * contenían.
  755 |  */
  756 | async function describeAuthState(page: Page): Promise<string> {
  757 |   try {
  758 |     const cookies = await page.context().cookies();
  759 |     if (cookies.length === 0) return "el contexto no tenía NINGUNA cookie";
  760 | 
  761 |     const authCookies = cookies.filter((cookie) => /^sb-|supabase/i.test(cookie.name));
  762 |     const nowSeconds = Date.now() / 1000;
  763 |     const described = authCookies.map((cookie) => {
  764 |       const expiry =
  765 |         cookie.expires && cookie.expires > 0
  766 |           ? cookie.expires < nowSeconds
  767 |             ? "CADUCADA"
  768 |             : `caduca en ${Math.round((cookie.expires - nowSeconds) / 60)} min`
  769 |           : "de sesión";
  770 |       return `${cookie.name} (${expiry})`;
  771 |     });
  772 | 
  773 |     return authCookies.length === 0
  774 |       ? `${cookies.length} cookie(s) en el contexto, ninguna de sesión de Supabase`
  775 |       : `cookies de sesión presentes: ${described.join(", ")}`;
  776 |   } catch (error) {
  777 |     return `no se pudo leer el estado de cookies: ${error instanceof Error ? error.message : String(error)}`;
  778 |   }
  779 | }
  780 | 
  781 | export function assertPageIsHealthy(findings: PageFindings): void {
  782 |   expect(
  783 |     findings.bouncedToLogin,
  784 |     `${findings.label} @ ${findings.viewport}: session was rejected — landed on ${findings.finalUrl}\n` +
  785 |       `Estado de sesión en ese instante: ${findings.authDiagnostics ?? "(sin diagnóstico)"}\n` +
  786 |       "Si esto es la pérdida intermitente de sesión de log §42, ESTA línea es el dato que faltaba: " +
  787 |       "dice si el contexto llegó sin cookies (el `storageState` no se aplicó) o con ellas caducadas " +
  788 |       "(la sesión expiró a mitad de pasada). Son dos fallos distintos con dos arreglos distintos."
  789 |   ).toBe(false);
  790 | 
  791 |   expect(
  792 |     findings.horizontalOverflow,
  793 |     `${findings.label} @ ${findings.viewport}: horizontal overflow — ` +
  794 |       `scrollWidth ${findings.scrollWidth}px > viewport ${findings.viewportWidth}px` +
  795 |       (findings.overflowCulprits.length
  796 |         ? `\nCulprit(s):\n  ${findings.overflowCulprits.join("\n  ")}`
  797 |         : "")
  798 |   ).toBe(false);
  799 | 
  800 |   expect(
  801 |     findings.failedRequests,
  802 |     `${findings.label}: first-party requests failed`
  803 |   ).toEqual([]);
  804 | 
  805 |   expect(
  806 |     findings.consoleErrors,
  807 |     `${findings.label}: console errors`
  808 |   ).toEqual([]);
  809 | 
  810 |   expect(
  811 |     findings.headerInteractiveControls,
  812 |     `${findings.label}: the shared sticky header must stay purely informational ` +
  813 |       `(badges/pills only) — docs/brand/design-decisions-log.md §3. Found interactive ` +
  814 |       `control(s) inside .ov-sticky-header, which belong in the page body instead.`
  815 |   ).toEqual([]);
  816 | 
  817 |   // ROOT-METADATA-1 (log §103). Una pantalla sin `metadata` propia hereda el
  818 |   // `title` del layout raíz, que es la marca a secas. No rompe nada, no se ve
  819 |   // en la captura y no lo nota nadie — así llegaron a ser quince pantallas
  820 |   // indistinguibles entre sí. Comparar contra la marca exacta es a propósito:
  821 |   // un título que EMPIEZA por «GenScore» puede ser legítimo
  822 |   // («GenScore vs Otterly …»); el fallo es que sea sólo eso.
  823 |   expect(
  824 |     findings.documentTitle.trim(),
  825 |     `${findings.label} @ ${findings.viewport}: la pestaña dice sólo «GenScore», así que esta ` +
  826 |       "pantalla no declara `metadata` propia y hereda la del layout raíz. Con dos pantallas " +
  827 |       "abiertas son dos pestañas idénticas. Añade `consoleMetadata(\"…\")` o " +
  828 |       "`generateMetadata` con `projectScreenMetadata` (`lib/seo/console-metadata.ts`)."
  829 |   ).not.toBe("GenScore");
  830 | 
  831 |   assertControlsAreHealthy(findings.label, findings.viewport, findings);
  832 | 
  833 |   // Deliberately the LAST assertion: the ones above describe a broken screen,
  834 |   // this one describes a screen the pilot never got to judge. Both fail the
  835 |   // run, but only this one is fixed by seeding data rather than by changing
  836 |   // product code, so it should not mask a real defect above it.
  837 |   if (findings.renderedRealContent !== null) {
  838 |     expect(
  839 |       findings.renderedRealContent,
  840 |       `${findings.label} @ ${findings.viewport}: the page loaded without errors but never ` +
  841 |         `rendered ${findings.expectedContent} — this is an empty state, a plan gate, or an ` +
  842 |         `unresolved skeleton, NOT the screen this journey exists to verify. Reporting it as ` +
  843 |         `passing would certify a placeholder (real incident, 2026-08-02: a full-screen redesign ` +
  844 |         `shipped with a green pilot because every capture showed "Todavía no has auditado tu web"). ` +
  845 |         `Fix by seeding the pilot account with real data — run the "Agentic User Pilot (write)" ` +
  846 |         `workflow, whose seed journey creates a project, scans it and audits it. ` +
  847 |         `See docs/agentic-user-pilot.md § "Datos reales".`
> 848 |     ).toBe(true);
      |       ^ Error: recommendations @ mobile: the page loaded without errors but never rendered el backlog de acciones generado por el último escaneo — this is an empty state, a plan gate, or an unresolved skeleton, NOT the screen this journey exists to verify. Reporting it as passing would certify a placeholder (real incident, 2026-08-02: a full-screen redesign shipped with a green pilot because every capture showed "Todavía no has auditado tu web"). Fix by seeding the pilot account with real data — run the "Agentic User Pilot (write)" workflow, whose seed journey creates a project, scans it and audits it. See docs/agentic-user-pilot.md § "Datos reales".
  849 |   }
  850 | }
  851 | 
  852 | /**
  853 |  * Captures the CURRENT page state — mid-interaction, no navigation — as
  854 |  * real evidence rather than a claim. Use this after a hover/click that
  855 |  * reveals something a plain page-load screenshot can never show (a tooltip
  856 |  * bubble, an expanded detail panel): pair it with a Playwright `expect(...)
  857 |  * .toBeVisible()` on the revealed element first, so the test actually FAILS
  858 |  * if the interaction doesn't work, instead of silently screenshotting a
  859 |  * closed state and letting it pass for "verified" (founder request,
  860 |  * 2026-08-02: "quiero la evidencia de que verificaste el click").
  861 |  *
  862 |  * Deliberately viewport-sized, unlike `visitAsUser`: growing the viewport to
  863 |  * capture a whole screen reflows the page, which would move an element out
  864 |  * from under the cursor and dismiss the very `:hover` state being captured.
  865 |  * The revealed element has already been scrolled into view, so the viewport is
  866 |  * where it is.
  867 |  */
  868 | export async function captureInteraction(
  869 |   page: Page,
  870 |   testInfo: TestInfo,
  871 |   label: string,
  872 |   opts: {
  873 |     /**
  874 |      * Capture the whole content instead of the viewport. Off by default,
  875 |      * because for a REVEAL the viewport is the point: a tooltip that renders
  876 |      * clipped or off-screen is the finding, and growing the viewport would
  877 |      * hide exactly that.
  878 |      *
  879 |      * Turn it on when the interaction reveals something TALLER than the fold,
  880 |      * where the viewport frame cuts off the very thing being verified — e.g.
  881 |      * the generated llms.txt, whose five publishing steps sit below the file
  882 |      * block and were invisible in every capture of the first run.
  883 |      */
  884 |     fullContent?: boolean;
  885 |   } = {}
  886 | ): Promise<string> {
  887 |   const screenshot = `${SCREENS_DIR}/${slug(testInfo.project.name)}--${slug(label)}.png`;
  888 |   mkdirSync(SCREENS_DIR, { recursive: true });
  889 |   if (opts.fullContent) await captureFullContent(page, screenshot);
  890 |   // `animations: "disabled"` finishes running CSS animations and pins them to
  891 |   // their end state. Without it a capture taken right after a reveal catches
  892 |   // the element mid-fade: the notifications panel (`menuIn`, opacity 0→1 over
  893 |   // 140ms) was photographed half-transparent with the page bleeding through,
  894 |   // and a reviewing agent read that as a real rendering defect (2026-08-05).
  895 |   // Every popover, menu and drawer in the suite was subject to the same lie.
  896 |   else await page.screenshot({ path: screenshot, animations: "disabled" });
  897 |   await testInfo.attach(attachmentName(`${label} (${testInfo.project.name})`), {
  898 |     path: screenshot,
  899 |     contentType: "image/png"
  900 |   });
  901 |   return screenshot;
  902 | }
  903 | 
  904 | /**
  905 |  * Asserts a revealed element is not just "visible" to Playwright but actually
  906 |  * legible to a human: fully inside the viewport horizontally, and not clipped
  907 |  * by an ancestor's `overflow: hidden`.
  908 |  *
  909 |  * Why this exists: `expect(bubble).toBeVisible()` passed for a KPI tooltip
  910 |  * that was rendering half-cut behind its own card (`overflow: hidden` on the
  911 |  * parent). The assertion was green and the UX was broken — only looking at
  912 |  * the capture caught it (founder, 2026-08-02: "no solo pruebe que sale, sino
  913 |  * que sale bien"). That class of defect is mechanically detectable, so it
  914 |  * belongs in an assertion rather than in a human's judgement.
  915 |  */
  916 | export async function assertFullyVisible(
  917 |   page: Page,
  918 |   selector: string,
  919 |   description: string
  920 | ): Promise<void> {
  921 |   const geometry = await page.locator(selector).first().evaluate((node: Element) => {
  922 |     const rect = node.getBoundingClientRect();
  923 |     let clippedBy: string | null = null;
  924 |     for (let parent = node.parentElement; parent; parent = parent.parentElement) {
  925 |       const style = window.getComputedStyle(parent);
  926 |       if (style.overflow === "visible" && style.overflowX === "visible" && style.overflowY === "visible") continue;
  927 |       const parentRect = parent.getBoundingClientRect();
  928 |       const escapes =
  929 |         rect.top < parentRect.top - 1 ||
  930 |         rect.bottom > parentRect.bottom + 1 ||
  931 |         rect.left < parentRect.left - 1 ||
  932 |         rect.right > parentRect.right + 1;
  933 |       if (escapes) {
  934 |         clippedBy = `${parent.tagName.toLowerCase()}.${parent.className || "(no class)"}`.slice(0, 80);
  935 |         break;
  936 |       }
  937 |     }
  938 |     return {
  939 |       left: rect.left,
  940 |       right: rect.right,
  941 |       width: rect.width,
  942 |       height: rect.height,
  943 |       viewportWidth: window.innerWidth,
  944 |       clippedBy
  945 |     };
  946 |   });
  947 | 
  948 |   expect(
```