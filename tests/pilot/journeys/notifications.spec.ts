import { expect, test } from "@playwright/test";
import { assertFullyVisible, assertPageIsHealthy, captureInteraction, visitAsUser } from "../support/journey";
import { exploreInteractions } from "../support/explore";

/**
 * NOTIF-AUTOREAD-1 — "verlas es leerlas" (log §28).
 *
 * Why this journey exists at all: the generic interaction sweep already clicks
 * the bell on every screen, but its per-screen budget (4 candidates) is spent
 * on nav/notifications/InfoTip before it can assert anything about what the
 * click *did* — the same gap that left PR #289's new audit tabs unseen
 * (`core-flow.spec.ts`, 2026-08-03). A capture of an open panel proves the
 * panel opens; it does not prove the header dot went dark, that the row dots
 * survived, or that no "Marcar leídas" button came back. Interaction-gated
 * behaviour with no assertion is "unverified", not "verified" (CLAUDE.md).
 *
 * SCOPE GUARD, and an honest exception. Every other read journey is strictly
 * read-only. This one navigates and clicks exactly like them — but since this
 * phase, opening the bell **writes**: it sets `read_at` on the pilot account's
 * own unread notifications. That write is unavoidable rather than chosen. The
 * sweep's allow-list already matches the bell (`[aria-expanded]`), so every
 * deploy pilot has been triggering it since this feature shipped, journey or
 * no journey. It is bounded and defensible — idempotent, the pilot account's
 * own rows, no LLM cost, no plan cap consumed, nothing another user can see —
 * but it is a write, and it is recorded here rather than left for someone to
 * discover. It still must never launch a scan, create a project, or submit a
 * form.
 */

test.describe.configure({ mode: "serial" });

/** The header bell and its "something is pending" dot. */
const BELL = ".header-bell";
const HEADER_DOT = ".notif-dot";
const PANEL = ".notif-panel";

test("opening the bell clears the header dot and needs no button", async ({ page }, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/dashboard", "notifications-bell", {
    describedAs: "la campana de notificaciones en la cabecera",
    anyOf: [{ selector: BELL }]
  });
  assertPageIsHealthy(findings);

  // Read BEFORE opening: this is the only moment the "pending" state exists.
  const startedWithUnread = (await page.locator(HEADER_DOT).count()) > 0;
  await captureInteraction(page, testInfo, "notifications-bell-closed");

  await page.locator(BELL).click();
  await expect(page.locator(PANEL), "el panel de notificaciones no se abrió").toBeVisible();
  await assertFullyVisible(page, PANEL, "el panel de notificaciones");
  await captureInteraction(page, testInfo, "notifications-bell-open");

  // The point of the phase: no mark-as-read control survives anywhere in the
  // panel. Matched on "marcar", not the exact old string, so a reworded
  // button ("Marcar todo", "Marcar como vistas") cannot slip back in.
  await expect(
    page.locator(PANEL).getByRole("button", { name: /marcar/i }),
    "el panel volvió a tener un botón de marcar leídas"
  ).toHaveCount(0);

  if (!startedWithUnread) {
    // Not a silent pass: with nothing unread there is no dot to watch go out,
    // and the headline behaviour of this phase is simply not observable on
    // this run. Say so where the agent reading the evidence will see it.
    testInfo.annotations.push({
      type: "coverage",
      description:
        "La cuenta del piloto no tenía notificaciones sin leer: el apagado del punto de " +
        "la cabecera al abrir la campana NO se ha verificado en esta pasada. Sólo se ha " +
        "verificado que el panel abre y que no hay botón de marcar leídas."
    });
    return;
  }

  // The header dot goes dark on open, without waiting for the server: it is
  // driven by what was dispatched, not by `read_at` coming back.
  await expect(
    page.locator(HEADER_DOT),
    "el punto de la cabecera siguió encendido después de abrir la campana"
  ).toHaveCount(0);

  // ...and the row dots do NOT, or the list would blank out under the person
  // reading it. Both halves matter; asserting only the first would pass on an
  // implementation that wiped every trace of what was new.
  await expect(
    page.locator(`${PANEL} .notif-unread-dot`).first(),
    "las filas perdieron su punto de no leída mientras el panel seguía abierto"
  ).toBeVisible();
  await captureInteraction(page, testInfo, "notifications-bell-open-dots-kept");

  // And it stays read across a full navigation — the write really landed,
  // rather than the dot being hidden client-side until the next load.
  await visitAsUser(page, testInfo, "/dashboard/domains", "notifications-after-navigate");
  const back = await visitAsUser(page, testInfo, "/dashboard", "notifications-bell-returned");
  assertPageIsHealthy(back);
  await expect(
    page.locator(HEADER_DOT),
    "el punto reapareció al volver: la escritura no persistió"
  ).toHaveCount(0);
  await captureInteraction(page, testInfo, "notifications-bell-returned");
});

test("the notifications page shows real notifications and no mark-read link", async ({
  page
}, testInfo) => {
  const findings = await visitAsUser(page, testInfo, "/dashboard/notifications", "notifications-page", {
    // A capture of "Sin notificaciones todavía." proves nothing about this
    // screen — the 2026-08-02 empty-state false PASS in one line.
    describedAs: "al menos una notificación real en la lista",
    anyOf: [{ selector: ".notif-row" }]
  });
  assertPageIsHealthy(findings);

  await expect(
    page.getByRole("button", { name: /marcar/i }),
    "la página volvió a tener un control de marcar como leídas"
  ).toHaveCount(0);

  // The "No leídas" tab, explicitly rather than left to the sweep's luck.
  // Auto-read makes its EMPTY state the common case from now on — the tab a
  // user is most likely to land on is the one nothing had ever looked at
  // (ux-pilot, 2026-08-05). Whether that reads as a resolved message or as a
  // hole in the page is a judgement call, and it needs a capture to make it.
  const unreadTab = page.getByRole("button", { name: /^no leídas/i });
  await unreadTab.click();
  await expect(
    page.locator(".notif-row, .notif-page-empty").first(),
    "la pestaña No leídas no resolvió ni a filas ni a un vacío legible"
  ).toBeVisible();
  await captureInteraction(page, testInfo, "notifications-page-unread-tab");

  await exploreInteractions(page, testInfo, "notifications-page");
});
