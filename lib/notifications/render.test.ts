import { describe, expect, it } from "vitest";
import { renderNotification, dayLabel, groupByDay } from "./render";

const PROJECT_ID = "project-1";
const DOMAINS = { [PROJECT_ID]: "acme.com" };

describe("renderNotification", () => {
  it("renders scan_completed with score, positive delta and both clauses", () => {
    const r = renderNotification(
      {
        type: "scan_completed",
        severity: "success",
        project_id: PROJECT_ID,
        payload_json: {
          runId: "run-1",
          promptsProcessed: 20,
          providers: ["gemini"],
          visibilityScore: 64,
          visibilityDelta: 6,
          newRecommendations: 5,
          resolvedGaps: 2
        }
      },
      DOMAINS
    );

    expect(r.title).toBe("Escaneo completado");
    expect(r.body).toBe("Visibilidad 64 (+6). 5 acciones nuevas y 2 brechas cerradas.");
    expect(r.targetLabel).toBe("acme.com · 20 prompts");
    expect(r.icon).toBe("trendUp");
    expect(r.tone).toBe("pos");
  });

  it("rounds a floating-point visibility delta instead of printing it raw", () => {
    // Caught by the pilot on PR #336: the bell showed "(+2.780000000000001)".
    const r = renderNotification(
      {
        type: "scan_completed",
        severity: "success",
        project_id: PROJECT_ID,
        payload_json: {
          runId: "run-1",
          promptsProcessed: 6,
          providers: ["gemini"],
          visibilityScore: 75,
          visibilityDelta: 2.780000000000001,
          newRecommendations: 13,
          resolvedGaps: 6
        }
      },
      DOMAINS
    );

    expect(r.body).toBe("Visibilidad 75 (+3). 13 acciones nuevas y 6 brechas cerradas.");
  });

  it("drops the parenthetical entirely for a sub-point delta rather than printing '(+0)'", () => {
    const r = renderNotification(
      {
        type: "scan_completed",
        severity: "success",
        project_id: PROJECT_ID,
        payload_json: {
          runId: "run-1",
          promptsProcessed: 6,
          providers: ["gemini"],
          visibilityScore: 75,
          visibilityDelta: 0.4,
          newRecommendations: 0,
          resolvedGaps: 0
        }
      },
      DOMAINS
    );

    expect(r.body).toBe("Visibilidad 75.");
  });

  it("renders scan_completed with a negative delta as trendDown/neg", () => {
    const r = renderNotification(
      {
        type: "scan_completed",
        severity: "success",
        project_id: PROJECT_ID,
        payload_json: {
          runId: "run-1",
          promptsProcessed: 10,
          providers: ["gemini"],
          visibilityScore: 40,
          visibilityDelta: -8,
          newRecommendations: 0,
          resolvedGaps: 0
        }
      },
      DOMAINS
    );

    expect(r.body).toBe("Visibilidad 40 (-8).");
    expect(r.icon).toBe("trendDown");
    expect(r.tone).toBe("neg");
  });

  it("omits the delta parenthetical and the new/resolved clauses when they're null or zero", () => {
    const r = renderNotification(
      {
        type: "scan_completed",
        severity: "success",
        project_id: PROJECT_ID,
        payload_json: {
          runId: "run-1",
          promptsProcessed: 5,
          providers: ["gemini"],
          visibilityScore: 70,
          visibilityDelta: null,
          newRecommendations: 0,
          resolvedGaps: 0
        }
      },
      DOMAINS
    );

    expect(r.body).toBe("Visibilidad 70.");
  });

  it("uses singular wording for exactly one new recommendation", () => {
    const r = renderNotification(
      {
        type: "scan_completed",
        severity: "success",
        project_id: PROJECT_ID,
        payload_json: {
          runId: "run-1",
          promptsProcessed: 5,
          providers: ["gemini"],
          visibilityScore: 70,
          visibilityDelta: null,
          newRecommendations: 1,
          resolvedGaps: 0
        }
      },
      DOMAINS
    );

    expect(r.body).toBe("Visibilidad 70. 1 acción nueva.");
  });

  it("renders scan_failed with the sanitized error summary", () => {
    const r = renderNotification(
      {
        type: "scan_failed",
        severity: "critical",
        project_id: PROJECT_ID,
        payload_json: { runId: "run-1", errorSummary: "No se pudo completar la ejecución del escaneo." }
      },
      DOMAINS
    );

    expect(r.title).toBe("Escaneo fallido");
    expect(r.body).toBe("No se pudo completar la ejecución del escaneo.");
    expect(r.icon).toBe("alertCircle");
    expect(r.tone).toBe("neg");
  });

  it("renders gap_resolved with the first sample title and a 'y N más' tail when count > 1", () => {
    const r = renderNotification(
      {
        type: "gap_resolved",
        severity: "success",
        project_id: PROJECT_ID,
        payload_json: { runId: "run-1", count: 3, sampleTitles: ["Cierra brecha A", "Cierra brecha B"] }
      },
      DOMAINS
    );

    expect(r.title).toBe("3 brechas cerradas");
    expect(r.body).toBe("Cierra brecha A y 2 más.");
    expect(r.href).toBe(`/dashboard/projects/${PROJECT_ID}/recommendations`);
  });

  it("renders gap_resolved singular with no tail when count === 1", () => {
    const r = renderNotification(
      {
        type: "gap_resolved",
        severity: "success",
        project_id: PROJECT_ID,
        payload_json: { runId: "run-1", count: 1, sampleTitles: ["Cierra brecha A"] }
      },
      DOMAINS
    );

    expect(r.title).toBe("Brecha cerrada");
    expect(r.body).toBe("Cierra brecha A.");
  });

  it("renders gap_pending with the recommendation title and consecutive run count", () => {
    const r = renderNotification(
      {
        type: "gap_pending",
        severity: "warning",
        project_id: PROJECT_ID,
        payload_json: { recommendationTitle: "Recupera terreno frente a Orange", consecutiveRuns: 3, impact: "high" }
      },
      DOMAINS
    );

    expect(r.title).toBe("Brecha pendiente de resolver");
    expect(r.body).toBe("«Recupera terreno frente a Orange» sigue abierta 3 escaneos después.");
    expect(r.icon).toBe("hourglass");
    expect(r.tone).toBe("warm");
  });

  it("renders emerging_competitor", () => {
    const r = renderNotification(
      {
        type: "emerging_competitor",
        severity: "info",
        project_id: PROJECT_ID,
        payload_json: { competitor: "Digi", promptCount: 4 }
      },
      DOMAINS
    );

    expect(r.title).toBe("Marca emergente en tus respuestas");
    expect(r.body).toBe("La IA menciona a Digi en 4 consultas y no la monitorizas.");
    expect(r.icon).toBe("resonance");
    expect(r.tone).toBe("cyan");
  });

  it("renders ai_bot_blocked with the agent name in the title", () => {
    const r = renderNotification(
      {
        type: "ai_bot_blocked",
        severity: "critical",
        project_id: PROJECT_ID,
        payload_json: { agent: "GPTBot", snapshotId: "snap-1" }
      },
      DOMAINS
    );

    expect(r.title).toBe("GPTBot no puede acceder a tu web");
    expect(r.icon).toBe("robot");
  });

  it("renders audit_completed, falling back to a dash when readinessScore is null", () => {
    const r = renderNotification(
      { type: "audit_completed", severity: "info", project_id: PROJECT_ID, payload_json: { snapshotId: "s1", readinessScore: null, pagesAnalyzed: 0 } },
      DOMAINS
    );

    expect(r.body).toBe("Preparación técnica —/100.");
  });

  // --- WEB-AUDIT-ALERTS-1: audit-to-audit regressions --------------------

  it("renders coverage_dropped in the singular, naming the topic", () => {
    const r = renderNotification(
      {
        type: "coverage_dropped",
        severity: "warning",
        project_id: PROJECT_ID,
        payload_json: { scanId: "scan-1", count: 1, sampleTopics: ["precios"] }
      },
      DOMAINS
    );

    expect(r.title).toBe("Un tema ha perdido cobertura");
    expect(r.body).toBe("Ya no encontramos contenido publicado en tu dominio sobre este tema. «precios».");
    expect(r.href).toBe(`/dashboard/projects/${PROJECT_ID}/web-audit`);
    expect(r.tone).toBe("warm");
  });

  it("renders coverage_dropped in the plural with a 'y N más' tail", () => {
    const r = renderNotification(
      {
        type: "coverage_dropped",
        severity: "warning",
        project_id: PROJECT_ID,
        payload_json: { scanId: "scan-1", count: 4, sampleTopics: ["precios", "envíos", "garantía"] }
      },
      DOMAINS
    );

    expect(r.title).toBe("4 temas han perdido cobertura");
    expect(r.body).toContain("«precios» y 3 más.");
  });

  it("renders surfacing_dropped without leaving a dangling space when there is no sample", () => {
    const r = renderNotification(
      {
        type: "surfacing_dropped",
        severity: "warning",
        project_id: PROJECT_ID,
        payload_json: { scanId: "scan-1", count: 2, sampleTopics: [] }
      },
      DOMAINS
    );

    expect(r.title).toBe("La IA ha dejado de citar tus páginas");
    expect(r.body).toBe("Tienes contenido sobre 2 temas que la IA ya no cita.");
    expect(r.tone).toBe("neg");
  });

  it("renders llms_txt_lost and sitemap_lost pointing at Auditoría web", () => {
    const llms = renderNotification(
      { type: "llms_txt_lost", severity: "critical", project_id: PROJECT_ID, payload_json: { snapshotId: "s1" } },
      DOMAINS
    );
    const sitemap = renderNotification(
      { type: "sitemap_lost", severity: "warning", project_id: PROJECT_ID, payload_json: { snapshotId: "s1" } },
      DOMAINS
    );

    expect(llms.title).toBe("Tu llms.txt ha desaparecido");
    expect(llms.body.length).toBeGreaterThan(0);
    expect(llms.href).toBe(`/dashboard/projects/${PROJECT_ID}/web-audit`);
    expect(sitemap.title).toBe("Tu sitemap.xml ha desaparecido");
    expect(sitemap.targetLabel).toBe("acme.com");
  });

  it("renders page_unreachable, singular and plural", () => {
    const one = renderNotification(
      {
        type: "page_unreachable",
        severity: "warning",
        project_id: PROJECT_ID,
        payload_json: { snapshotId: "s1", count: 1, sampleUrls: ["https://acme.com/precios"] }
      },
      DOMAINS
    );
    const many = renderNotification(
      {
        type: "page_unreachable",
        severity: "warning",
        project_id: PROJECT_ID,
        payload_json: { snapshotId: "s1", count: 3, sampleUrls: ["https://acme.com/precios"] }
      },
      DOMAINS
    );

    expect(one.title).toBe("Una página tuya ha dejado de responder");
    expect(one.body).toBe("En la auditoría anterior se analizó correctamente y ahora no. https://acme.com/precios.");
    expect(many.title).toBe("3 páginas tuyas han dejado de responder");
    expect(many.body).toContain("https://acme.com/precios y 2 más.");
  });

  it("never prints a raw null or NaN when a regression payload is malformed", () => {
    for (const type of ["coverage_dropped", "surfacing_dropped", "page_unreachable"]) {
      const r = renderNotification({ type, severity: "warning", project_id: PROJECT_ID, payload_json: {} }, DOMAINS);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.body).not.toMatch(/null|NaN|undefined/);
    }
  });

  it("renders trial_ending with no project target", () => {
    const r = renderNotification(
      { type: "trial_ending", severity: "warning", project_id: null, payload_json: { daysLeft: 3, trialEndsAt: "2026-08-01T00:00:00Z" } },
      DOMAINS
    );

    expect(r.title).toBe("Tu prueba termina pronto");
    expect(r.body).toBe("Quedan 3 días. Después pasarás al plan Free.");
    expect(r.targetLabel).toBeNull();
    expect(r.href).toBe("/dashboard/settings/billing");
  });

  it("degrades to a generic, harmless render for an unknown type instead of throwing", () => {
    const r = renderNotification(
      { type: "something_from_the_future", severity: "info", project_id: PROJECT_ID, payload_json: { whatever: true } },
      DOMAINS
    );

    expect(r.title).toBe("Notificación");
    expect(r.body).toBe("");
  });

  it("degrades gracefully when payload_json is malformed (not an object)", () => {
    const r = renderNotification(
      { type: "scan_completed", severity: "success", project_id: PROJECT_ID, payload_json: "not an object" },
      DOMAINS
    );

    expect(r.body).toBe("El escaneo ha finalizado con éxito.");
  });

  it("falls back to null targetLabel when the project isn't in the domain map", () => {
    const r = renderNotification(
      { type: "scan_failed", severity: "critical", project_id: "unknown-project", payload_json: { runId: "r1", errorSummary: "x" } },
      DOMAINS
    );

    expect(r.targetLabel).toBeNull();
  });
});

describe("dayLabel / groupByDay", () => {
  function isoDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(10, 0, 0, 0);
    return d.toISOString();
  }

  it("labels today as 'Hoy' and yesterday as 'Ayer'", () => {
    expect(dayLabel(isoDaysAgo(0))).toBe("Hoy");
    expect(dayLabel(isoDaysAgo(1))).toBe("Ayer");
  });

  it("labels anything older with a calendar date, not a relative count", () => {
    const label = dayLabel(isoDaysAgo(5));
    expect(label).not.toBe("Hoy");
    expect(label).not.toBe("Ayer");
  });

  it("groups consecutive same-day items into one bucket, in order", () => {
    const items = [
      { id: "a", createdAt: isoDaysAgo(0) },
      { id: "b", createdAt: isoDaysAgo(0) },
      { id: "c", createdAt: isoDaysAgo(1) }
    ];

    const groups = groupByDay(items);

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("Hoy");
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(groups[1].label).toBe("Ayer");
    expect(groups[1].items.map((i) => i.id)).toEqual(["c"]);
  });
});
