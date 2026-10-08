# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys/auth-pages.spec.ts >> /signup renders the sign-up form for a signed-out visitor
- Location: tests/pilot/journeys/auth-pages.spec.ts:45:5

# Error details

```
Error: signup @ desktop: interactive text below WCAG AA against its own background. Real incident (2026-08-11): the mobile drawer's CTA turned grey-on-blue when its element changed from <button> to <a>, because .lp-mobnav a (0,1,1) beats .lp-cta (0,1,0) — see .claude/rules/styles.md. If a value is deliberate, add it to CONTRAST_ALLOW_LIST in tests/pilot/support/page-audit.ts with the reason.

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 4

- Array []
+ Array [
+   "a \"Política de privacidad\" — rgb(152,160,176) on rgb(255,255,255) is 2.63:1, below the 4.5:1 minimum",
+   "a \"Términos\" — rgb(152,160,176) on rgb(255,255,255) is 2.63:1, below the 4.5:1 minimum",
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - img "GenScore" [ref=e5]
      - heading "Crea tu cuenta" [level=1] [ref=e9]
      - paragraph [ref=e10]: 7 días de prueba gratis de Pro, sin tarjeta.
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: Email de trabajo
          - textbox "Email de trabajo" [ref=e14]:
            - /placeholder: nombre@empresa.com
        - generic [ref=e15]:
          - generic [ref=e16]: Contraseña
          - textbox "Contraseña" [ref=e17]
        - generic [ref=e18]:
          - generic [ref=e19]: Repite la contraseña
          - textbox "Repite la contraseña" [ref=e20]
        - button "Crear cuenta gratis" [ref=e21] [cursor=pointer]
      - generic [ref=e22]: o regístrate con
      - button "Continuar con Google" [ref=e25]
      - paragraph [ref=e31]:
        - text: ¿Ya tienes cuenta?
        - link "Inicia sesión" [ref=e32] [cursor=pointer]:
          - /url: /login
      - paragraph [ref=e33]:
        - text: Al continuar, aceptas los
        - link "Términos" [ref=e34] [cursor=pointer]:
          - /url: /terminos
        - text: y la
        - link "Política de privacidad" [ref=e35] [cursor=pointer]:
          - /url: /privacidad
        - text: . Te enviaremos emails sobre tu cuenta y, como cliente, consejos para sacarle partido y ofertas de GenScore. Puedes darte de baja cuando quieras en Ajustes o desde cualquier email.
  - alert [ref=e36]
```

# Test source

```ts
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
  687 |       expectedContent: expectation?.describedAs ?? null,
  688 |       headerInteractiveControls,
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
> 731 |   ).toEqual([]);
      |     ^ Error: signup @ desktop: interactive text below WCAG AA against its own background. Real incident (2026-08-11): the mobile drawer's CTA turned grey-on-blue when its element changed from <button> to <a>, because .lp-mobnav a (0,1,1) beats .lp-cta (0,1,0) — see .claude/rules/styles.md. If a value is deliberate, add it to CONTRAST_ALLOW_LIST in tests/pilot/support/page-audit.ts with the reason.
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
```