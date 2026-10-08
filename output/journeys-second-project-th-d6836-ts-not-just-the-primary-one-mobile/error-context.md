# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/second-project.spec.ts >> the position screens render on other projects, not just the primary one
- Location: tests/pilot/journeys/second-project.spec.ts:45:5

# Error details

```
Error: p3-overview @ mobile: horizontal overflow — scrollWidth 423px > viewport 375px
Culprit(s):
  div — right:423px left:20px, parent:div
  p.kicker — right:423px left:20px, parent:div
  div — right:423px left:20px, parent:div
  span.badge.badge-neutral — right:383px left:197px, parent:div
  span.meta-pill — right:423px left:391px, parent:div

expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

# Page snapshot

```yaml
- generic [active] [ref=f8e1]:
  - generic [ref=f8e2]:
    - complementary [ref=f8e3]:
      - generic [ref=f8e4]:
        - generic [ref=f8e5]:
          - img "GenScore" [ref=f8e6]
          - generic [ref=f8e10]: Espacio de visibilidad en IA
        - button "Cerrar menú" [ref=f8e11] [cursor=pointer]
      - link "Farmaciamunozpereira farmaciamunozpereira.com" [ref=f8e14] [cursor=pointer]:
        - /url: /dashboard/domains
        - generic [ref=f8e15]:
          - generic [ref=f8e16]: Farmaciamunozpereira
          - generic [ref=f8e17]: farmaciamunozpereira.com
      - generic [ref=f8e20]:
        - generic [ref=f8e21]: Analizar
        - link "Visión general" [ref=f8e22] [cursor=pointer]:
          - /url: /dashboard/projects/c646293d-ac19-4b7a-868b-80731734420b
        - link "Prompts 10" [ref=f8e29] [cursor=pointer]:
          - /url: /dashboard/projects/c646293d-ac19-4b7a-868b-80731734420b/prompts
          - generic [ref=f8e32]: Prompts
          - generic [ref=f8e33]: "10"
        - link "Competidores 5" [ref=f8e34] [cursor=pointer]:
          - /url: /dashboard/projects/c646293d-ac19-4b7a-868b-80731734420b/competitors
          - generic [ref=f8e39]: Competidores
          - generic [ref=f8e40]: "5"
        - link "Páginas citadas" [ref=f8e41] [cursor=pointer]:
          - /url: /dashboard/projects/c646293d-ac19-4b7a-868b-80731734420b/citations
        - link "Auditoría web" [ref=f8e48] [cursor=pointer]:
          - /url: /dashboard/projects/c646293d-ac19-4b7a-868b-80731734420b/web-audit
        - generic [ref=f8e53]: Actuar
        - link "Recomendaciones 24" [ref=f8e54] [cursor=pointer]:
          - /url: /dashboard/projects/c646293d-ac19-4b7a-868b-80731734420b/recommendations
          - generic [ref=f8e58]: Recomendaciones
          - generic [ref=f8e59]: "24"
        - generic [ref=f8e60]: Aprender
        - link "Manuales GEO" [ref=f8e61] [cursor=pointer]:
          - /url: /blog
      - generic [ref=f8e67]:
        - button "¿Qué es el GEO?" [ref=f8e68] [cursor=pointer]
        - link "DE de5@gmail.com Agencia" [ref=f8e72] [cursor=pointer]:
          - /url: /dashboard/settings
          - generic [ref=f8e73]: DE
          - generic [ref=f8e74]:
            - generic [ref=f8e75]: de5@gmail.com
            - generic [ref=f8e76]: Agencia
        - button "Cerrar sesión" [ref=f8e80] [cursor=pointer]
    - generic [ref=f8e85]:
      - banner [ref=f8e86]:
        - button "Abrir menú de navegación" [ref=f8e87] [cursor=pointer]
        - button "Notificaciones" [ref=f8e92] [cursor=pointer]
      - main [ref=f8e96]:
        - generic [ref=f8e97]:
          - generic [ref=f8e98]:
            - generic [ref=f8e100]:
              - paragraph [ref=f8e101]: Visión general
              - generic [ref=f8e102]:
                - generic [ref=f8e103]: Farmaciamunozpereira
                - generic [ref=f8e104]: farmaciamunozpereira.com
                - generic [ref=f8e105]: ES/es
            - generic [ref=f8e106]: Escaneado 30 jul 2026
          - generic [ref=f8e108]:
            - paragraph [ref=f8e115]:
              - text: GenScore detectó que Farmaciamunozpereira aparece en
              - generic [ref=f8e116]: 13 de 30 respuestas de IA
              - text: (43%). Hoy mantienes la mayor visibilidad frente a tus competidores. GenScore ha priorizado
              - generic [ref=f8e117]: 2 acciones de alta prioridad
              - text: para mejorar tu presencia en las respuestas de IA.
            - generic [ref=f8e118]:
              - generic [ref=f8e120]:
                - generic [ref=f8e127]:
                  - generic [ref=f8e128]: "41"
                  - generic [ref=f8e129]: / 100
                - generic [ref=f8e130]:
                  - generic [ref=f8e131]: Puntuación GEO
                  - generic [ref=f8e132]: Franja «emergente»
                  - generic [ref=f8e134]: "Sin mediana ni variación: uno de los escaneos no registró con qué preguntas, modelo y búsqueda web se midió. Esta es la puntuación de tu último escaneo."
              - generic [ref=f8e135]:
                - generic [ref=f8e136]: Indicadores clave
                - generic [ref=f8e137]:
                  - generic [ref=f8e138]:
                    - generic [ref=f8e139]: Tasa de mención
                    - generic [ref=f8e140]:
                      - text: "43"
                      - generic [ref=f8e141]: "%"
                  - generic [ref=f8e142]:
                    - generic [ref=f8e143]: Cuota de Citas
                    - generic [ref=f8e144]:
                      - text: "19"
                      - generic [ref=f8e145]: "%"
                    - generic [ref=f8e146]: Medio
                  - generic [ref=f8e148]:
                    - generic [ref=f8e149]: Presión competitiva
                    - generic [ref=f8e150]:
                      - text: "16.67"
                      - generic [ref=f8e151]: "%"
                    - generic [ref=f8e152]: Baja
                  - generic [ref=f8e154]:
                    - generic [ref=f8e155]: Sentimiento de marca
                    - generic [ref=f8e156]: Positivo
                    - generic [ref=f8e160]: 58% · 12 resp.
            - generic [ref=f8e161]:
              - generic [ref=f8e162]:
                - group [ref=f8e163]:
                  - generic "Base de esta medición" [ref=f8e164] [cursor=pointer]
                - generic [ref=f8e165]:
                  - text: Desglose del GEO Score
                  - generic [ref=f8e166]: 41/100
                - generic [ref=f8e167]:
                  - generic [ref=f8e168]:
                    - generic [ref=f8e173]:
                      - generic [ref=f8e174]: Presencia
                      - generic [ref=f8e175]: Menciones de tu marca en las respuestas de IA.
                    - generic [ref=f8e176]: 43/100
                  - generic [ref=f8e181]:
                    - generic [ref=f8e185]:
                      - generic [ref=f8e186]: Prominencia
                      - generic [ref=f8e187]: No disponible para este escaneo.
                    - generic [ref=f8e188]: No disponible
                  - generic [ref=f8e193]:
                    - generic [ref=f8e201]:
                      - generic [ref=f8e202]: Cuota de voz
                      - generic [ref=f8e203]: No disponible para este escaneo.
                    - generic [ref=f8e204]: No disponible
                  - generic [ref=f8e209]:
                    - generic [ref=f8e214]:
                      - generic [ref=f8e215]: Autoridad
                      - generic [ref=f8e216]: Citas de la IA a páginas de tu propio dominio.
                    - generic [ref=f8e217]: 35/100
                  - generic [ref=f8e222]:
                    - generic [ref=f8e226]:
                      - generic [ref=f8e227]: Diagnóstico técnico
                      - generic [ref=f8e228]: Este escaneo es anterior a que la salud técnica entrara en el GEO Score. Se incluirá en tu próximo escaneo.
                    - generic [ref=f8e229]: No disponible
              - generic [ref=f8e234]:
                - generic [ref=f8e235]: Posicionamiento por motores de IA
                - generic [ref=f8e236]:
                  - generic [ref=f8e237]:
                    - generic [ref=f8e238]: Gemini
                    - generic [ref=f8e244]: 70%
                  - generic [ref=f8e245]:
                    - generic [ref=f8e246]: ChatGPT
                    - generic [ref=f8e257]: 60%
                  - generic [ref=f8e258]:
                    - generic [ref=f8e259]: Claude
                    - generic [ref=f8e264]: 0%
            - generic [ref=f8e265]:
              - generic [ref=f8e266]:
                - generic [ref=f8e267]:
                  - text: Panorámica competitiva
                  - link "Ver todo" [ref=f8e268] [cursor=pointer]:
                    - /url: /dashboard/projects/c646293d-ac19-4b7a-868b-80731734420b/competitors
                - generic [ref=f8e269]:
                  - generic [ref=f8e270]:
                    - generic [ref=f8e271]: Último escaneo
                    - generic [ref=f8e272]: Mención
                  - generic [ref=f8e273]:
                    - generic [ref=f8e275]:
                      - text: Farmaciamunozpereira
                      - generic [ref=f8e276]: Tú
                    - generic [ref=f8e277]: 43%
                  - generic [ref=f8e281]:
                    - generic [ref=f8e282]: VeraFarmacia
                    - generic [ref=f8e284]: 27%
                  - generic [ref=f8e288]:
                    - generic [ref=f8e289]: Farmacia Moctezuma
                    - generic [ref=f8e291]: 20%
                  - generic [ref=f8e295]:
                    - generic [ref=f8e296]: F
                    - generic [ref=f8e297]: Farmacia Hernández Óptica Moctezuma
                    - generic [ref=f8e299]: 10%
                  - generic [ref=f8e303]:
                    - generic [ref=f8e304]: Farmacia Fontán
                    - generic [ref=f8e306]: 10%
                  - generic [ref=f8e310]:
                    - generic [ref=f8e311]: F
                    - generic [ref=f8e312]: Farmacia Josefina Becerra Muñoz
                    - generic [ref=f8e314]: 3%
              - generic [ref=f8e318]:
                - generic [ref=f8e319]:
                  - text: Oportunidades
                  - link "Ver todo" [ref=f8e320] [cursor=pointer]:
                    - /url: /dashboard/projects/c646293d-ac19-4b7a-868b-80731734420b/recommendations
                - generic [ref=f8e323]:
                  - generic [ref=f8e324]:
                    - generic [ref=f8e325]:
                      - generic [ref=f8e326]: "24"
                      - generic [ref=f8e327]: Recomendaciones
                    - generic [ref=f8e328]:
                      - generic [ref=f8e329]: 2 acciones de alta prioridad
                      - generic [ref=f8e330]: Ordenadas por impacto en tu visibilidad en las respuestas de IA.
                  - generic [ref=f8e331]:
                    - generic [ref=f8e332]:
                      - generic [ref=f8e334]: Añade contenido comparativo para los prompts competitivos
                      - generic [ref=f8e336]: Impacto alto
                    - generic [ref=f8e338]:
                      - generic [ref=f8e340]:
                        - generic [ref=f8e341]: Replica el patrón que ya funciona en 12 consultas
                        - generic [ref=f8e342]: rápida
                      - generic [ref=f8e343]: Impacto medio
                    - generic [ref=f8e345]:
                      - generic [ref=f8e347]: Consigue que las fuentes que cita la IA también te citen a ti
                      - generic [ref=f8e349]: Impacto alto
                  - link "Ver todas las recomendaciones" [ref=f8e351] [cursor=pointer]:
                    - /url: /dashboard/projects/c646293d-ac19-4b7a-868b-80731734420b/recommendations
  - alert [ref=f8e354]
```

# Test source

```ts
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
  789 |   ).toBe(false);
  790 | 
  791 |   expect(
  792 |     findings.horizontalOverflow,
  793 |     `${findings.label} @ ${findings.viewport}: horizontal overflow — ` +
  794 |       `scrollWidth ${findings.scrollWidth}px > viewport ${findings.viewportWidth}px` +
  795 |       (findings.overflowCulprits.length
  796 |         ? `\nCulprit(s):\n  ${findings.overflowCulprits.join("\n  ")}`
  797 |         : "")
> 798 |   ).toBe(false);
      |     ^ Error: p3-overview @ mobile: horizontal overflow — scrollWidth 423px > viewport 375px
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
  890 |   // `animations: "disabled"` finishes running CSS animations and pins them to
  891 |   // their end state. Without it a capture taken right after a reveal catches
  892 |   // the element mid-fade: the notifications panel (`menuIn`, opacity 0→1 over
  893 |   // 140ms) was photographed half-transparent with the page bleeding through,
  894 |   // and a reviewing agent read that as a real rendering defect (2026-08-05).
  895 |   // Every popover, menu and drawer in the suite was subject to the same lie.
  896 |   else await page.screenshot({ path: screenshot, animations: "disabled" });
  897 |   await testInfo.attach(attachmentName(`${label} (${testInfo.project.name})`), {
  898 |     path: screenshot,
```