import { expect, test } from "@playwright/test";
import { assertPageIsHealthy, resolveProjectId, visitAsUser } from "../support/journey";

/**
 * TRUST-METRICS-1 (docs/external-audit-2026-08.md, Fase 1) — Corrección B.
 *
 * The external audit's headline finding (P0-01): the same scan showed 6/100
 * on Overview and "2 Puntuación GEO" on Domains. `lib/metrics/run-metrics.ts`
 * fixes the SOURCE of that divergence — one function, `resolveGeoScore`, now
 * feeds both screens. This journey is the check that a source-level fix does
 * not guarantee: it reads the number a real browser actually painted on both
 * screens, for the SAME project, in the SAME pilot run, and fails if they
 * disagree. `tests/metric-contract.test.ts` proves the code calls the right
 * function; this proves the two screens still say the same thing once React,
 * caching and real Supabase data are all in the loop — the exact gap between
 * "the module is correct" and "the screens agree" that no unit test can close.
 *
 * SCOPE GUARD — read-only. Visits Overview and Domains for the pilot's own
 * project; no scan launched, nothing written.
 */

test.describe.configure({ mode: "serial" });

function readGaugeNumber(text: string | null, screen: string): number {
  const trimmed = (text ?? "").trim();
  expect(trimmed, `${screen}: la cifra del medidor está vacía`).not.toBe("");
  const value = Number(trimmed);
  expect(Number.isFinite(value), `${screen}: "${trimmed}" no es un número`).toBe(true);
  return value;
}

test("la Puntuación GEO de Visión general coincide con la de Dominios, para el mismo proyecto", async ({
  page
}, testInfo) => {
  const id = await resolveProjectId(page);

  const overviewFindings = await visitAsUser(page, testInfo, `/dashboard/projects/${id}`, "geo-score-overview", {
    describedAs: "el medidor de Puntuación GEO",
    anyOf: [{ selector: ".ov2-gauge-ring .gauge-num" }]
  });
  assertPageIsHealthy(overviewFindings);
  const overviewText = await page.locator(".ov2-gauge-ring .gauge-num").first().textContent();
  const overviewScore = readGaugeNumber(overviewText, "Visión general");

  const domainsFindings = await visitAsUser(page, testInfo, `/dashboard/domains?active=${id}`, "geo-score-domains", {
    describedAs: "el medidor de Puntuación GEO de la portada del dominio",
    anyOf: [{ selector: ".dm2-score .gauge-num" }, { selector: ".dm2-score-empty" }]
  });
  assertPageIsHealthy(domainsFindings);

  const emptyState = page.locator(".dm2-score-empty");
  test.skip(
    await emptyState.isVisible().catch(() => false),
    "el proyecto piloto no tiene puntuación todavía (dm2-score-empty) — nada que comparar"
  );

  const domainsText = await page.locator(".dm2-score .gauge-num").first().textContent();
  const domainsScore = readGaugeNumber(domainsText, "Dominios");

  expect(
    domainsScore,
    `Puntuación GEO: Visión general dice ${overviewScore}, Dominios dice ${domainsScore}, mismo proyecto (${id}). ` +
      "Es exactamente la divergencia P0-01 que la auditoría externa encontró (6 contra 2) — si esto falla, TRUST-METRICS-1 " +
      "se ha roto en algún punto entre lib/metrics/run-metrics.ts y una de las dos pantallas."
  ).toBe(overviewScore);
});
