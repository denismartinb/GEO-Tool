import { expect, test } from "@playwright/test";
import { assertFullyVisible, assertPageIsHealthy, captureInteraction, visitAsUser } from "../support/journey";

/**
 * CONSOLE-REDESIGN-1 — Ajustes, one page with three sections.
 *
 * Why this journey exists at all: it did not, and nothing noticed. The pilot
 * run on PR #357 swept 44 screens at three viewports and `/dashboard/settings`
 * was in none of them, because no read journey ever visited it. Shipping this
 * redesign without adding one would mean no pilot ever sees the screen.
 *
 * Ajustes is a form screen, so it always "renders" whether or not the account
 * has data — a clean load proves nothing on its own. The content expectations
 * below demand the pilot account's real email and its real plan name, which is
 * the whole lesson of the 2026-08-02 Auditoría web incident: a screen that
 * loads an empty state has not been seen.
 *
 * SCOPE: strictly read-only. It fills in no field, saves nothing, and never
 * touches the delete-account flow — it only asserts that block is present,
 * quiet and last.
 */

// Deliberately NOT serial, unlike the notifications journey: every test here
// does its own `visitAsUser` and shares no state, so a failure in one has no
// bearing on the next. Serial mode cost real information on the 0fe3845 run —
// one desktop failure skipped the two tests after it, and their verdict was
// exactly what would have said whether the problem was broad or local.
// The runner is still sequential (workers: 1 in playwright.config.ts).

const INDEX = ".set-idx";
// Two twin folds now live in Cuenta, so `.set-fold-h` alone is ambiguous.
// aria-controls is the exact, behaviour-carrying handle for each.
const COMPANY_FOLD_TRIGGER = '[aria-controls="company-fold-body"]';
const COMPANY_FOLD_BODY = "#company-fold-body";
const BILLING_FOLD_TRIGGER = '[aria-controls="billing-fold-body"]';
const BILLING_FOLD_BODY = "#billing-fold-body";
const DELETE_BLOCK = ".set-end";

test("Ajustes shows the real account, not an empty form", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/dashboard/settings", "settings", {
    describedAs: "el email real de la cuenta piloto en el campo Email",
    anyOf: [{ selector: "#profile-email" }, { selector: ".set-idmail" }]
  });

  assertPageIsHealthy(findings);

  // The old four screens are gone; anything that still paints a tab bar means
  // the fold-into-one-page did not actually happen.
  await expect(page.locator(".set-tabs"), "la barra de pestañas sigue en el DOM").toHaveCount(0);

  const emailField = page.locator("#profile-email");
  await expect(emailField, "el campo Email no lleva el email real de la cuenta").toHaveValue(/@/);

  await expect(page.locator("h1.set-title"), "falta el titular de la pantalla").toHaveText(/ajustes/i);
});

test("the three sections are all present and in order", async ({ page }, testInfo) => {
  await visitAsUser(page, testInfo, "/dashboard/settings", "settings-sections", {
    describedAs: "los títulos de sección Cuenta y Avisos",
    anyOf: [{ selector: "#cuenta" }]
  });

  await expect(page.locator("#cuenta"), "falta la sección Cuenta").toBeVisible();
  await expect(page.locator("#avisos"), "falta la sección Avisos").toBeVisible();

  // Plan is admin-only. The pilot account is an admin, so its absence is a
  // finding rather than an accepted branch — but say which one failed.
  await expect(page.locator("#plan"), "falta la sección Plan en una cuenta admin").toBeVisible();

  const order = await page
    .locator("h2.set-sech")
    .evaluateAll((nodes) => nodes.map((node) => node.id).filter(Boolean));
  expect(order, "las secciones no van en el orden Cuenta → Avisos → Plan").toEqual([
    "cuenta",
    "avisos",
    "plan"
  ]);
});

test("both optional folds open, and their content is not clipped", async ({ page }, testInfo) => {
  await visitAsUser(page, testInfo, "/dashboard/settings", "settings-folds-closed", {
    describedAs: "los dos plegables opcionales de Cuenta",
    anyOf: [{ selector: COMPANY_FOLD_TRIGGER }]
  });

  // Both are twins in Cuenta, one under the other (founder, 2026-08-06). Razón
  // social lives in the second one, NOT in the Plan section.
  const company = page.locator(COMPANY_FOLD_TRIGGER);
  const billing = page.locator(BILLING_FOLD_TRIGGER);

  await expect(company, "el plegable de empresa nace abierto").toHaveAttribute("aria-expanded", "false");
  await expect(billing, "el plegable de facturación nace abierto").toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(COMPANY_FOLD_BODY), "el cuerpo del plegable se ve cerrado").toHaveCount(0);
  await expect(page.locator(BILLING_FOLD_BODY), "el cuerpo del plegable se ve cerrado").toHaveCount(0);

  await company.click();
  await expect(company, "el plegable de empresa no se abrió").toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(COMPANY_FOLD_BODY)).toBeVisible();
  // A reveal that renders half-cut behind its own container is green to an
  // assertion and broken to a person (founder, 2026-08-02).
  await assertFullyVisible(page, "#company-name", "el campo Nombre del plegable de empresa");

  await billing.click();
  await expect(billing, "el plegable de facturación no se abrió").toHaveAttribute("aria-expanded", "true");

  // Scroll it into view BEFORE asserting. `.dash-content` is the page's scroll
  // container (`overflow-y: auto`), and assertFullyVisible flags anything whose
  // rect escapes an ancestor that is not `overflow: visible` — for a scroll
  // container that fires on anything merely below the fold, which is not a
  // defect. Scrolled into view, the assertion measures what it exists to
  // measure: whether the field is cut off by the fold's own `overflow: hidden`.
  await page.locator("#billing-legal-name").scrollIntoViewIfNeeded();
  await assertFullyVisible(page, "#billing-legal-name", "el campo Razón social");

  // fullContent: both folds open are taller than the 375px viewport frame, so
  // the very thing being verified would be cut off.
  await captureInteraction(page, testInfo, "settings-folds-open", { fullContent: true });
});

test("«Eliminar cuenta» closes the page and is never in the index", async ({ page }, testInfo) => {
  await visitAsUser(page, testInfo, "/dashboard/settings", "settings-delete-block", {
    describedAs: "el bloque de eliminar cuenta al pie de la página",
    anyOf: [{ selector: DELETE_BLOCK }]
  });

  await expect(page.locator(DELETE_BLOCK), "falta el bloque de eliminar cuenta").toBeVisible();
  await expect(
    page.locator(`${DELETE_BLOCK} .set-end-d`),
    "el aviso de irreversibilidad no dice lo aprobado"
  ).toHaveText(/irreversible/i);

  // Reaching an irreversible action takes scrolling, not one click — so it
  // must not be reachable from the spine at any viewport.
  await expect(
    page.locator(`${INDEX} a`).filter({ hasText: /eliminar/i }),
    "«Eliminar cuenta» aparece en el índice"
  ).toHaveCount(0);

  // It is also the LAST thing on the page: if a section ever lands below it,
  // the block stops being the quiet foot it was designed as.
  const deleteIsLast = await page.evaluate(() => {
    const block = document.querySelector(".set-end");
    const sections = Array.from(document.querySelectorAll("h2.set-sech"));
    if (!block || !sections.length) return false;
    const blockTop = block.getBoundingClientRect().top;
    return sections.every((section) => section.getBoundingClientRect().top < blockTop);
  });
  expect(deleteIsLast, "hay una sección por debajo del bloque de eliminar cuenta").toBe(true);
});

test("mobile is one scroll: no index, no chips, nothing sticky", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/dashboard/settings", "settings-no-section-nav", {
    describedAs: "la página de ajustes con sus secciones",
    anyOf: [{ selector: "#cuenta" }]
  });

  const width = page.viewportSize()?.width ?? 0;

  if (width <= 899) {
    await expect(page.locator(INDEX), "el índice sigue visible en móvil").toBeHidden();

    // The point is not just that the index is gone — it is that NOTHING of the
    // page's own navigation stays pinned. `.topbar` is the app shell and is
    // allowed; anything else sticky inside the page is a finding.
    //
    // Only RENDERED elements count. `.set-idx` keeps `position: sticky` in its
    // computed style while `display: none` hides it below 900px, and an element
    // the user cannot see is not pinned to anything — counting it reported a
    // defect that does not exist. `getClientRects()` is empty exactly when the
    // element generates no boxes, which is the property that matters here
    // (`offsetParent` would be wrong: it is null for `position: fixed` too, so
    // it would silently excuse the very thing this guards against).
    const stickyInsidePage = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".page *"))
        .filter((node) => {
          const position = window.getComputedStyle(node).position;
          if (position !== "sticky" && position !== "fixed") return false;
          return node.getClientRects().length > 0;
        })
        .map((node) => node.className?.toString?.() ?? "")
    );
    expect(stickyInsidePage, `elementos pegajosos dentro de la página: ${stickyInsidePage.join(", ")}`).toEqual(
      []
    );
  } else {
    await expect(page.locator(INDEX), "falta el índice en escritorio").toBeVisible();
    await expect(page.locator(`${INDEX} a`), "el índice no tiene tres entradas").toHaveCount(3);
  }

  // Nothing scrolls sideways at any viewport.
  expect(findings.scrollWidth, "la página desborda en horizontal").toBeLessThanOrEqual(width);
});
