# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/core-flow.spec.ts >> dashboard home renders for a logged-in user
- Location: tests/pilot/journeys/core-flow.spec.ts:40:5

# Error details

```
Error: dashboard @ tablet: session was rejected — landed on https://geo-tool-nsr7w9h1t-9v7mrc44g8-1223s-projects.vercel.app/login
Estado de sesión en ese instante: cookies de sesión presentes: sb-hrhugndkecdakzenuwly-auth-token.0 (caduca en 575995 min), sb-hrhugndkecdakzenuwly-auth-token.1 (caduca en 575995 min)
Si esto es la pérdida intermitente de sesión de log §42, ESTA línea es el dato que faltaba: dice si el contexto llegó sin cookies (el `storageState` no se aplicó) o con ellas caducadas (la sesión expiró a mitad de pasada). Son dos fallos distintos con dos arreglos distintos.

expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - img "GenScore" [ref=e5]
      - generic [ref=e9]: Bienvenido de nuevo
      - generic [ref=e10]: Accede a tu panel y sigue mejorando tu visibilidad en IA.
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: Email de trabajo
          - textbox "Email de trabajo" [ref=e14]:
            - /placeholder: nombre@empresa.com
        - generic [ref=e15]:
          - generic [ref=e16]:
            - generic [ref=e17]: Contraseña
            - link "¿Olvidaste tu contraseña?" [ref=e18] [cursor=pointer]:
              - /url: /forgot-password
          - generic [ref=e19]:
            - textbox "Contraseña" [ref=e20]
            - button "Mostrar contraseña" [ref=e21] [cursor=pointer]
        - button "Iniciar sesión" [ref=e25] [cursor=pointer]
      - generic [ref=e26]: o continúa con
      - button "Continuar con Google" [ref=e29] [cursor=pointer]
      - generic [ref=e35]:
        - text: ¿No tienes cuenta?
        - link "Regístrate" [ref=e36] [cursor=pointer]:
          - /url: /signup
      - generic [ref=e37]: Al continuar, aceptas nuestros Términos y la Política de privacidad.
  - alert [ref=e38]
```

# Test source

```ts
  689 |       ...controlAudit,
  690 |       dismissedWelcomeTour,
  691 |       documentTitle: await page.title().catch(() => ""),
  692 |       ...capture
  693 |     };
  694 | 
  695 |     recordFindings(findings);
  696 |     await testInfo.attach(attachmentName(`${label} (${testInfo.project.name})`), {
  697 |       path: screenshot,
  698 |       contentType: "image/png"
  699 |     });
  700 | 
  701 |     return findings;
  702 |   } finally {
  703 |     page.off("console", onConsole);
  704 |     page.off("response", onResponse);
  705 |   }
  706 | }
  707 | 
  708 | /**
  709 |  * Fails on the two mechanical control defects — a control that renders twice,
  710 |  * and a control nobody can read. Separate from `assertPageIsHealthy` so a
  711 |  * journey can also apply it to an OPEN state (a drawer, a modal), which is the
  712 |  * only place some of these defects exist.
  713 |  */
  714 | export function assertControlsAreHealthy(label: string, viewport: string, audit: ControlAudit): void {
  715 |   expect(
  716 |     audit.duplicateControls,
  717 |     `${label} @ ${viewport}: the same control renders more than once inside one landmark. ` +
  718 |       `Real incident (2026-08-11): moving the landing hero's CTA into a client island left the ` +
  719 |       `original behind, so "Analiza gratis" shipped twice — the capture showed it plainly and ` +
  720 |       `nothing failed, because nothing counted. If a repeat is intentional, add it to ` +
  721 |       `DUPLICATE_ALLOW_LIST in tests/pilot/support/page-audit.ts with the reason.`
  722 |   ).toEqual([]);
  723 | 
  724 |   expect(
  725 |     audit.lowContrastControls,
  726 |     `${label} @ ${viewport}: interactive text below WCAG AA against its own background. ` +
  727 |       `Real incident (2026-08-11): the mobile drawer's CTA turned grey-on-blue when its element ` +
  728 |       `changed from <button> to <a>, because .lp-mobnav a (0,1,1) beats .lp-cta (0,1,0) — see ` +
  729 |       `.claude/rules/styles.md. If a value is deliberate, add it to CONTRAST_ALLOW_LIST in ` +
  730 |       `tests/pilot/support/page-audit.ts with the reason.`
  731 |   ).toEqual([]);
  732 | }
  733 | 
  734 | /**
  735 |  * Fails the journey on the signals no screenshot review should ever have to
  736 |  * catch. Kept separate from `visitAsUser` so a journey can record a page
  737 |  * without asserting on it (useful for intermediate navigation steps).
  738 |  */
  739 | /**
  740 |  * PRELAUNCH-HARDENING-1 Fase Q5 — instrumentación de la pérdida de sesión.
  741 |  *
  742 |  * El 2026-08-09 una pasada del piloto perdió la sesión en la última anchura y
  743 |  * **no se ha vuelto a reproducir en las pasadas posteriores sobre el mismo
  744 |  * código** (log §42). Con `retries: 0` deliberado, un rojo espurio en la puerta
  745 |  * enseña a ignorar los rojos, así que hace falta cerrarlo — pero la hipótesis
  746 |  * (el `storageState` único compartido por las tres anchuras secuenciales) **no
  747 |  * está probada**, y parchear una hipótesis sin datos es cómo se arregla el
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
> 789 |   ).toBe(false);
      |     ^ Error: dashboard @ tablet: session was rejected — landed on https://geo-tool-nsr7w9h1t-9v7mrc44g8-1223s-projects.vercel.app/login
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
  848 |     ).toBe(true);
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
```