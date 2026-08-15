import { test } from "@playwright/test";
import { assertPageIsHealthy, discoverProjectIds, resolveProjectId, visitAsUser } from "../support/journey";
import { exploreInteractions } from "../support/explore";

/**
 * UX-PILOT-1d — the same read-only screens, on a *different* project.
 *
 * The core-flow journey walks one project, so it only ever sees one shape of
 * data. Whole branches of these screens are unreachable from it: a brand the
 * AI never named, a project with fewer than two scans carrying position data,
 * a ranking where most entities have no rank at all. Those are not edge cases
 * — the second one is the state of every project on the day a scoring change
 * ships — and no amount of looking harder at the first project reveals them.
 *
 * Founder, 2026-08-03: *"En la misma cuenta, si cambias de proyecto escaneado,
 * por ejemplo Movistar, ahí puedes probar otras casuísticas."*
 *
 * Scope is deliberately narrow: only the two screens whose content is derived
 * per project and per scan. The rest of the surface does not vary by project
 * in a way a second pass would reveal, and every extra page multiplies by
 * three viewports against a real deployment.
 *
 * SCOPE GUARD — read-only, exactly as core-flow.spec.ts: navigate by URL,
 * assert on what renders, never launch a scan or write anything.
 *
 * PRELAUNCH-HARDENING-1 Fase Q5 (2026-08-15): **las dos pantallas declaran
 * `ContentExpectation`**, que es lo único que las separa de pasar en verde
 * sobre dos proyectos vacíos. Sin ella este journey afirmaba «se ven bien en
 * otro proyecto» cuando lo único comprobado era que la ruta respondía 200 — el
 * mismo fallo del 2026-08-02 que hizo nacer `ContentExpectation`: un rediseño
 * entero de Auditoría web pasó con ✅ en tres anchuras porque la cuenta del
 * piloto no tenía datos y todas las capturas enseñaban un estado vacío.
 *
 * Que este journey en concreto lo arrastrara es peor que la media: existe
 * justamente para alcanzar formas de datos que el proyecto principal no puede
 * producir, así que un proyecto secundario sin datos es exactamente el caso
 * que más fácil pasaba desapercibido.
 */

test.describe.configure({ mode: "serial" });

/** Secondary projects to walk, beyond the primary one. Bounded on purpose. */
const MAX_SECONDARY_PROJECTS = 2;

test("the position screens render on other projects, not just the primary one", async ({
  page
}, testInfo) => {
  const primary = await resolveProjectId(page);
  const all = await discoverProjectIds(page);
  const secondary = all.filter((id) => id !== primary).slice(0, MAX_SECONDARY_PROJECTS);

  test.skip(
    secondary.length === 0,
    "pilot account has only one project — nothing to compare against. Add a " +
      "second scanned project to reach data shapes the primary one cannot produce."
  );

  // Not a silent cap: say what was left out, so "not covered" can never be
  // read as "covered and fine".
  const skipped = all.length - 1 - secondary.length;
  if (skipped > 0) {
    testInfo.annotations.push({
      type: "coverage",
      description: `${skipped} further project(s) on the account were not walked (cap: ${MAX_SECONDARY_PROJECTS}).`
    });
  }

  for (const [index, id] of secondary.entries()) {
    const tag = `p${index + 2}`;

    const overview = await visitAsUser(page, testInfo, `/dashboard/projects/${id}`, `${tag}-overview`, {
      describedAs: "la puntuación GEO del último escaneo de este otro proyecto",
      anyOf: [{ text: /puntuación geo/i }, { text: /tasa de mención/i }]
    });
    assertPageIsHealthy(overview);
    await exploreInteractions(page, testInfo, `${tag}-overview`);

    const competitors = await visitAsUser(
      page,
      testInfo,
      `/dashboard/projects/${id}/competitors`,
      `${tag}-competitors`,
      {
        describedAs: "la tabla de competidores con datos del escaneo de este otro proyecto",
        anyOf: [{ selector: ".tbl" }, { text: /cuota de voz|share of voice/i }]
      }
    );
    assertPageIsHealthy(competitors);
    await exploreInteractions(page, testInfo, `${tag}-competitors`);
  }
});
