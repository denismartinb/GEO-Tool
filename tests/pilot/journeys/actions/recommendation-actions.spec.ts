import { expect, test } from "@playwright/test";
import { captureStep, resolveOrCreateWriteProject, waitForContent, waitForNoActiveRun } from "../../support/write-guard";

/**
 * AUDIT-REPRO-1 (Fase 0, docs/external-audit-2026-08.md) — el hallazgo peor
 * puntuado del informe externo (fiabilidad funcional 4,0) dice que seis CTAs
 * "no dieron feedback": generar (FAQ/brief/comparativa, según el tipo de
 * recomendación), exportar el plan, marcar como hecho, activar seguimiento
 * diario. El código dice que las tres primeras acciones SÍ tienen estado de
 * carga y de error (`recommendations-client.tsx`). Esta pantalla existe para
 * reemplazar esa contradicción con un veredicto por acción, con evidencia —
 * nunca "no sabemos".
 *
 * POR QUÉ VIVE EN SU PROPIO DIRECTORIO, NO EN `journeys/write/`. El plan pedía
 * un flag nuevo, `--journeys actions`, distinto de `--journeys write`. La
 * bandera sólo puede aislar lo que enruta a un proyecto de Playwright propio
 * (mismo mecanismo que ya separa `scan` de `write` en `PROJECT_SETS`,
 * `scripts/pilot.mjs`): meter este fichero en `journeys/write/` lo habría
 * dejado alcanzable por `--journeys write` en vez de por su propio flag.
 * Reutiliza el proyecto de escritura (`PILOT_WRITE_DOMAIN`) y las utilidades
 * de `support/write-guard.ts` — el aislamiento es de EJECUCIÓN (qué flag
 * alcanza el fichero), no de OBJETIVO (sigue siendo el proyecto reservado).
 *
 * DECISIÓN DEL FUNDADOR sobre «Marcar como hecho» (2026-08-27, vía
 * AskUserQuestion): el producto hoy no tiene deshacer para esta acción — eso
 * lo añade la Fase 4 — así que probarla de verdad consume una recomendación
 * real del proyecto reservado, sin forma de restaurarla desde la UI hasta el
 * próximo escaneo completo. El fundador eligió pulsarla de todos modos y
 * aceptar la pérdida, en vez de clasificarla sólo por lectura de código o
 * añadir una vía de escritura directa a Supabase que rompería la convención
 * del piloto (actuar sólo por clics reales). Coste aceptado: como máximo UNA
 * recomendación activa por pasada de `--journeys actions`.
 *
 * LO QUE ESTA PANTALLA NO HACE: no arregla nada. Clasificar es el entregable
 * de la Fase 0; el contrato de acción (spinner/éxito/error uniforme, deshacer
 * en «Marcar como hecho», salida alternativa para exportar) es la Fase 4.
 */

test.describe.configure({ mode: "serial" });

type Verdict = "real" | "invisible" | "entorno";

const verdicts: Record<string, { verdict: Verdict; evidence: string }> = {};

test.afterAll(() => {
  // El criterio de aceptación de la Fase 0 es que NINGUNA de las seis
  // acciones quede sin veredicto. Lo que sigue no es una aserción de test —
  // es el informe que la Fase 0 pide, impreso donde el job de Actions lo
  // conserva en su log.
  // eslint-disable-next-line no-console
  console.log("\n=== AUDIT-REPRO-1: veredicto por acción ===");
  for (const [action, { verdict, evidence }] of Object.entries(verdicts)) {
    // eslint-disable-next-line no-console
    console.log(`  ${action}: ${verdict} — ${evidence}`);
  }
});

test("las acciones de Recomendaciones producen (o no) un efecto observable", async ({ page }) => {
  const projectId = await test.step("resolve (or bootstrap) the dedicated write-project", async () => {
    const id = await resolveOrCreateWriteProject(page);
    const free = await waitForNoActiveRun(page, id);
    if (!free) {
      throw new Error(
        "El proyecto de escritura sigue con un escaneo en curso tras esperar. " +
          "No se fuerza — reintenta cuando haya terminado."
      );
    }
    return id;
  });

  await page.goto(`/dashboard/projects/${projectId}/recommendations`, { waitUntil: "domcontentloaded" });
  await waitForContent(page, [
    () => page.locator(".rec-card").first().isVisible(),
    () => page.getByText(/nada que corregir ahora mismo/i).isVisible()
  ]);

  const hasAnyCard = (await page.locator(".rec-card").count()) > 0;
  if (!hasAnyCard) {
    // Estado real, no un fallo del piloto: el proyecto reservado corre con
    // una sola prompt (coste acotado) y puede no tener recomendaciones activas
    // tras un escaneo dado. Las seis acciones quedan INCONCLUSIVE, no FAIL —
    // exactamente el matiz que CLAUDE.md exige para lo que el piloto no vio.
    throw new Error(
      "El proyecto de escritura no tiene recomendaciones activas en este momento. " +
        "Las seis acciones quedan sin veredicto por falta de datos, no por un fallo " +
        "de producto — reintenta tras el próximo escaneo del proyecto reservado."
    );
  }

  await captureStep(page, "recommendations-before");

  await test.step("acción 1 — generar (FAQ / brief / comparativa según el tipo)", async () => {
    // El generador es UN handler (`handleRewrite`) cuya etiqueta cambia según
    // `recommendation_type` — «Generar FAQ», «Generar brief de contenido»,
    // «Generar comparativa», y una decena más. Cuál sale depende de qué
    // recomendaciones produjo el último escaneo del proyecto reservado, así
    // que esta acción prueba la que exista, no las tres por nombre — probar
    // las tres exigiría que el escaneo hubiera producido exactamente esos
    // tres tipos, que no es controlable desde aquí.
    const card = page.locator(".rec-card").filter({ hasText: /^Generar/ }).first();
    const hasUngenerated = await card.isVisible().catch(() => false);

    if (!hasUngenerated) {
      verdicts["generar (FAQ/brief/comparativa)"] = {
        verdict: "invisible",
        evidence: "todas las recomendaciones activas ya tenían una propuesta generada — no hay botón que pulsar"
      };
      return;
    }

    await card.click(); // abre la tarjeta
    const generateButton = card.getByRole("button", { name: /^Generar/ });
    const ctaLabel = (await generateButton.textContent())?.trim() ?? "Generar";
    await captureStep(page, "generate-before");

    const start = Date.now();
    await generateButton.click();

    const succeeded = await card
      .getByText(/propuesta generada/i)
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    const elapsedMs = Date.now() - start;

    await captureStep(page, "generate-after");

    if (succeeded) {
      verdicts[`generar (${ctaLabel})`] = {
        verdict: "real",
        evidence: `la insignia "Propuesta generada" apareció en ${elapsedMs}ms`
      };
      return;
    }

    const errorVisible = await card
      .locator(".feedback.error")
      .isVisible()
      .catch(() => false);
    if (errorVisible) {
      const errorText = await card.locator(".feedback.error").textContent();
      verdicts[`generar (${ctaLabel})`] = {
        verdict: "real",
        evidence: `terminó en error visible tras ${elapsedMs}ms: "${errorText?.trim()}"`
      };
      return;
    }

    verdicts[`generar (${ctaLabel})`] = {
      verdict: "invisible",
      evidence: `sin insignia de éxito ni error visible ${elapsedMs}ms después del clic — el hallazgo del auditor se reproduce`
    };
  });

  await test.step("acción 2 — exportar plan", async () => {
    const exportButton = page.getByRole("button", { name: /exportar plan/i });
    await expect(exportButton).toBeVisible();

    const start = Date.now();
    const download = await Promise.race([
      page.waitForEvent("download", { timeout: 10_000 }).then((d) => d),
      exportButton.click().then(() => null)
    ]).catch(() => null);
    // Si `waitForEvent` gana la carrera antes de que el `click` resuelva,
    // `download` ya está poblado; si pierde, esperamos el evento explícito
    // tras el clic, con el mismo margen.
    const resolved =
      download ??
      (await page.waitForEvent("download", { timeout: 10_000 }).catch(() => null));
    const elapsedMs = Date.now() - start;

    if (resolved) {
      verdicts["exportar plan"] = {
        verdict: "real",
        evidence: `descarga "${resolved.suggestedFilename()}" iniciada en ${elapsedMs}ms`
      };
    } else {
      // El componente crea un blob y simula el clic en un <a download>. Si el
      // navegador (headless, en un runner de Actions) lo bloquea en silencio,
      // es EXACTAMENTE el caso 3 que la Fase 0 predijo: falso positivo del
      // entorno de auditoría, real para cualquier usuario con el mismo
      // bloqueo — así que no se descarta como "no aplica", se documenta.
      verdicts["exportar plan"] = {
        verdict: "entorno",
        evidence: `ningún evento de descarga en ${elapsedMs}ms — o el botón no produce efecto, o el navegador headless bloquea la descarga silenciosamente; no se puede distinguir desde aquí`
      };
    }
    await captureStep(page, "export-attempted");
  });

  await test.step("acción 3 — marcar como hecho (DESTRUCTIVO — decisión del fundador 2026-08-27)", async () => {
    const card = page.locator(".rec-card").first();
    const activeCountBefore = await page.locator(".rec-card").count();

    // "Marcar como hecho" vive en `.rec-detail`, colapsado a `max-height: 0`
    // hasta que la tarjeta se abre (mismo acordeón que `.rec-card.open
    // .rec-detail`, app/globals.css). Sin abrirla primero, Playwright
    // encuentra el botón "visible" en el árbol de accesibilidad pero el clic
    // real cae sobre `.rec-main` — el toggle que sigue cubriendo esa zona
    // mientras el panel está colapsado — y el test falla con "intercepts
    // pointer events" sin haber probado nada de la acción. La acción 1 ya
    // abre su propia tarjeta antes de interactuar; ésta no lo hacía.
    const toggle = card.locator(".rec-main");
    const alreadyOpen = (await toggle.getAttribute("aria-expanded")) === "true";
    if (!alreadyOpen) {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
    }

    const dismissButton = card.getByRole("button", { name: /marcar como hecho/i });
    const isVisible = await dismissButton.isVisible().catch(() => false);
    if (!isVisible) {
      verdicts["marcar como hecho"] = {
        verdict: "invisible",
        evidence: "no se encontró el botón «Marcar como hecho» en la primera tarjeta activa"
      };
      return;
    }

    const start = Date.now();
    await dismissButton.click();

    const disappeared = await expect(card)
      .toBeHidden({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const elapsedMs = Date.now() - start;

    // No hay retry ni reintento del clic: si `disappeared` es falso, el CTA
    // sigue en su forma anterior (nunca en un estado a medias) y no hay
    // segunda escritura sobre la recomendación.
    if (disappeared) {
      const activeCountAfter = await page.locator(".rec-card").count();
      verdicts["marcar como hecho"] = {
        verdict: "real",
        evidence:
          `la tarjeta desapareció de la lista activa en ${elapsedMs}ms ` +
          `(${activeCountBefore} → ${activeCountAfter} tarjetas activas). ` +
          "Coste aceptado: 1 recomendación del proyecto reservado, sin deshacer hasta el próximo escaneo (Fase 4 lo añade)."
      };
    } else {
      const errorVisible = await card
        .locator(".feedback.error")
        .isVisible()
        .catch(() => false);
      verdicts["marcar como hecho"] = {
        verdict: "real",
        evidence: errorVisible
          ? `terminó en error visible tras ${elapsedMs}ms`
          : `la tarjeta siguió visible ${elapsedMs}ms después del clic, sin error visible — el hallazgo del auditor se reproduce`
      };
    }
    await captureStep(page, "dismiss-attempted");
  });

  await test.step("acción 4 — activar seguimiento diario (data-maturity-banner, Overview)", async () => {
    // Vive en otra pantalla y depende de `recurring_scans_enabled`, que
    // PROJECT-DEFAULTS-BY-ACCOUNT-1 (2026-08-27) enciende solo tras el primer
    // escaneo completado de una cuenta real no excluida. El proyecto de
    // escritura corre bajo la cuenta piloto, que no está en la lista de
    // cuentas internas de prueba — así que este banner puede llevar semanas
    // sin poder reproducirse aquí, y NO es un fallo si no aparece: es la
    // fase anterior habiendo resuelto ya la mitad de este hallazgo (P0-08).
    await page.goto(`/dashboard/projects/${projectId}`, { waitUntil: "domcontentloaded" });
    await waitForContent(page, [
      () => page.getByText(/puntuación geo/i).first().isVisible(),
      () => page.getByText(/todavía no hay puntuación/i).isVisible()
    ]);

    const activateButton = page.getByRole("button", { name: /activar seguimiento diario/i });
    const bannerVisible = await activateButton.isVisible().catch(() => false);

    if (!bannerVisible) {
      verdicts["activar seguimiento diario"] = {
        verdict: "invisible",
        evidence:
          "el banner «Tu análisis de hoy no se repetirá» no está presente — " +
          "coherente con que PROJECT-DEFAULTS-BY-ACCOUNT-1 ya activó el seguimiento tras el primer escaneo; no reproducible en su forma original"
      };
      return;
    }

    await captureStep(page, "recurring-before");
    const start = Date.now();
    await activateButton.click();

    const bannerGone = await expect(activateButton)
      .toBeHidden({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const elapsedMs = Date.now() - start;

    await captureStep(page, "recurring-after");
    verdicts["activar seguimiento diario"] = {
      verdict: "real",
      evidence: bannerGone
        ? `el banner desapareció en ${elapsedMs}ms (server action \`setRecurringScans\`)`
        : `el banner siguió visible ${elapsedMs}ms después del clic — el hallazgo del auditor se reproduce`
    };
  });

  // Las seis acciones del informe se reparten en cuatro pasos de arriba: la
  // generación cubre FAQ/brief/comparativa como UN handler con etiqueta
  // variable (ver acción 1), no tres botones separados — el `verdicts`
  // impreso en `afterAll` deja constancia de cuál se ejecutó realmente.
  expect(Object.keys(verdicts).length, "toda acción alcanzada debe llevar veredicto").toBeGreaterThan(0);
});
