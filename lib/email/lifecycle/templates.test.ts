import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn(async (_payload: unknown) => ({ error: null }));
vi.mock("@/lib/email/resend", () => ({
  getResendClient: () => ({ emails: { send } }),
  getEmailFromAddress: () => "GenScore <soporte@genscore.es>"
}));

import {
  sendFirstScanReadyEmail,
  sendTrialD1Email,
  sendTrialD3Email,
  sendTrialD5Email,
  type PlanOffer,
  type RunSnapshot
} from "./templates";
import type { ReportModel } from "@/lib/report/report-model";

/**
 * LIFECYCLE-TRIAL-1 (log §233). What would be a real failure in an inbox:
 * a commercial email with no way out, a price that checkout would not
 * honour, a figure that was not the account's, or a competitor's name
 * injected as HTML.
 */
const USER = "11111111-2222-4333-8444-555555555555";
const TO = "cliente@ejemplo.com";

type Payload = { subject: string; html: string; headers?: Record<string, string> };
const last = () => send.mock.calls.at(-1)?.[0] as Payload;

const snapshot: RunSnapshot = {
  projectId: "p1",
  domain: "clinicaaurora.es",
  geoScore: 34,
  runDate: new Date("2026-10-04T08:00:00Z"),
  brandMentions: 6,
  answers: 45,
  topCompetitor: { name: "Clínica Sonrisa Norte", mentions: 19 },
  activeRecommendations: 6
};

const proWithPromo: PlanOffer = { planName: "Pro", price: 99, promo: { price: 69, remaining: 35, total: 38 } };
const proNoPromo: PlanOffer = { planName: "Pro", price: 99, promo: null };
const starter: PlanOffer = { planName: "Starter", price: 29, promo: { price: 20, remaining: 35, total: 38 } };
const lossRows = [{ label: "Motores de IA", pro: "3", free: "1" }];

beforeEach(() => {
  send.mockClear();
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-with-enough-entropy-000000";
});

afterEach(() => {
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
});

describe("commercial emails never go out without a working unsubscribe", () => {
  it("D1, D3 and D5 are not sent at all without the secret", async () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    expect(await sendTrialD1Email(TO, USER, { variant: "no_domain", daysLeft: 6, projectId: null, domain: null })).toBe(false);
    expect(
      await sendTrialD3Email(TO, USER, { daysLeft: 4, projectId: null, domain: null, recommendation: null, otherRecommendations: 0 })
    ).toBe(false);
    expect(
      await sendTrialD5Email(TO, USER, { trialEndsAt: new Date(), projectId: null, domain: null, report: null, pro: proWithPromo, starter, lossRows })
    ).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("with the secret they carry the lifecycle unsubscribe link and one-click headers", async () => {
    await sendTrialD1Email(TO, USER, { variant: "no_domain", daysLeft: 6, projectId: null, domain: null });
    const { html, headers } = last();
    expect(html).toContain("Darme de baja de consejos y ofertas");
    expect(headers?.["List-Unsubscribe"]).toContain("c=lifecycle");
    expect(headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("primer escaneo listo", () => {
  it("puts the account's own figures in the subject and the body", async () => {
    await sendFirstScanReadyEmail(TO, USER, snapshot);
    const { subject, html } = last();
    expect(subject).toBe("clinicaaurora.es: la IA te menciona en 6 de 45 respuestas");
    expect(html).toContain("Clínica Sonrisa Norte");
    expect(html).toContain("6 recomendaciones");
    expect(html).toContain("/dashboard/projects/p1");
  });

  it("switches to the 'todavía no te nombra' variant with zero mentions", async () => {
    await sendFirstScanReadyEmail(TO, USER, { ...snapshot, brandMentions: 0 });
    expect(last().subject).toBe("clinicaaurora.es: la IA todavía no te nombra");
  });

  it("escapes a competitor name instead of injecting it as HTML", async () => {
    await sendFirstScanReadyEmail(TO, USER, { ...snapshot, topCompetitor: { name: "<img src=x onerror=1>", mentions: 20 } });
    expect(last().html).not.toContain("<img src=x");
    expect(last().html).toContain("&lt;img src=x onerror=1&gt;");
  });
});

describe("D1 and D3 variants", () => {
  it("D1 with a domain but no scan asks to launch the scan, not to add a domain", async () => {
    await sendTrialD1Email(TO, USER, { variant: "no_scan", daysLeft: 6, projectId: "p1", domain: "clinicaaurora.es" });
    expect(last().html).toContain("Lanzar mi primer escaneo");
    expect(last().html).not.toContain("Añadir mi dominio");
  });

  it("D3 shows the real recommendation and the engines behind it", async () => {
    await sendTrialD3Email(TO, USER, {
      daysLeft: 4,
      projectId: "p1",
      domain: "clinicaaurora.es",
      recommendation: { title: "Publica tus precios", description: "La IA cita a quien publica rangos.", engines: ["ChatGPT", "Gemini"] },
      otherRecommendations: 5
    });
    const { subject, html } = last();
    expect(subject).toBe("Lo primero que cambiaríamos en clinicaaurora.es");
    expect(html).toContain("Publica tus precios");
    expect(html).toContain("Respaldada por ChatGPT y Gemini");
    expect(html).toContain("5 recomendaciones más");
  });

  it("D3 without a recommendation falls back to the no-scan copy, with no invented figure", async () => {
    await sendTrialD3Email(TO, USER, { daysLeft: 4, projectId: null, domain: null, recommendation: null, otherRecommendations: 0 });
    expect(last().subject).toBe("Tus clientes ya le preguntan a la IA por tu sector");
    expect(last().html).not.toMatch(/\d+ de \d+ respuestas/);
  });
});

describe("D5 prices", () => {
  it("quotes the founder price as forever, with the real list price and the slots left", async () => {
    await sendTrialD5Email(TO, USER, {
      trialEndsAt: new Date("2026-10-05T10:00:00Z"),
      projectId: null,
      domain: "clinicaaurora.es",
      report: null,
      pro: proWithPromo,
      starter,
      lossRows
    });
    const { subject, html } = last();
    expect(subject).toBe("Tu prueba de Pro termina el lunes");
    expect(html).toContain("Mantener Pro por 69 €/mes");
    expect(html).toContain("Para siempre, mientras mantengas tu suscripción. Precio normal: 99 €/mes.");
    expect(html).toContain("Quedan 35 cuentas con precio fundador");
    expect(html).toContain("−30%");
    // The real list price is struck through next to the founder price while
    // the coupon lasts (founder, 2026-10-09, log §243, superseding §237's
    // "no struck-through price"). Still no deadline.
    expect(html).toMatch(/line-through[^>]*>99 €</);
    expect(html).not.toMatch(/Disponible hasta|durante \d+ meses/i);
    // No testimonial in any email: the one that was here was invented (founder, 2026-10-08).
    expect(html).not.toMatch(/Nordika|Nerea|128\s?%/);
  });

  it("quotes the list price, with no discount and no deadline, once the promo is gone", async () => {
    await sendTrialD5Email(TO, USER, {
      trialEndsAt: new Date("2026-10-05T10:00:00Z"),
      projectId: null,
      domain: null,
      report: null,
      pro: proNoPromo,
      starter: { planName: "Starter", price: 29, promo: null },
      lossRows
    });
    const { html } = last();
    expect(html).toContain("Mantener Pro por 99 €/mes");
    expect(html).not.toContain("Precio fundador");
    expect(html).not.toContain("plazas");
  });
});

/**
 * TRIAL-REPORT-EMAIL-1 (log §254). The last-day email carries the report of
 * the last scan. What would be a real failure: a figure that is not a share,
 * a quote from a stored LLM answer injected as HTML, an empty block printed
 * as if it said something, or a link to the report that loses the reader at
 * the login.
 */
function reportModel(overrides: Partial<ReportModel> = {}): ReportModel {
  const gemini = { provider: "gemini", label: "Gemini", mentionShare: 0.41, bestPosition: 2, citesOwnSite: true };
  return {
    brandName: "Clínica Aurora",
    domain: "clinicaaurora.es",
    scanDate: "2026-10-04",
    geoScore: 34,
    engines: [{ provider: "openai", label: "ChatGPT", mentionShare: 0.18, bestPosition: 4, citesOwnSite: null }, gemini],
    cover: { mentionShare: 0.23 },
    summary: {
      lede: "",
      ownCitationShare: null,
      weakestEngine: gemini,
      technicalScore: null,
      findings: [
        { tone: "neg", title: "ChatGPT casi no te nombra", text: "Te menciona en el 18% de las respuestas." },
        { tone: "pos", title: "Gemini cita tu web", text: "Usa páginas de tu dominio." },
        { tone: "info", title: "Tercer hallazgo", text: "No cabe en el correo." }
      ]
    },
    matrix: { hasCoverage: false, groups: [] },
    competition: {
      bars: [
        { name: "Clínica Sonrisa Norte", isBrand: false, share: 0.62, byEngine: [] },
        { name: "Clínica Aurora", isBrand: true, share: 0.23, byEngine: [] }
      ],
      cards: [],
      cloud: []
    },
    sources: {
      columns: [],
      ownCitationShare: null,
      ownPages: [],
      topSource: null,
      brandQuotes: [
        { text: "Clínica Aurora <script>x</script> destaca por su financiación.", provider: "gemini", engineLabel: "Gemini", topic: "Implantes" }
      ]
    },
    technical: null,
    plan: [{ title: "Publica tus precios", description: "", firstStep: null, providers: [], topics: [], engineLabels: [] }],
    ...overrides
  };
}

describe("last-day email with the report", () => {
  const base = {
    trialEndsAt: new Date("2026-10-05T10:00:00Z"),
    projectId: "7b0c2c3e-1111-4222-8333-444455556666",
    domain: "clinicaaurora.es",
    pro: proWithPromo,
    starter,
    lossRows
  };

  it("shows the report's shares, the quote, two findings and the first action, then the offer", async () => {
    await sendTrialD5Email(TO, USER, { ...base, report: reportModel() });
    const { subject, html } = last();
    expect(subject).toBe("Tu informe GEO de clinicaaurora.es, antes de que termine tu prueba");
    expect(html).toContain("Último aviso de tu prueba");
    expect(html).toContain("termina el lunes 5 de octubre");
    expect(html).toContain("dónde te nombra ChatGPT y Gemini");
    expect(html).toContain("Te mencionan en el 23% de las respuestas a las preguntas principales de búsqueda");
    expect(html).toContain(">41%<");
    expect(html).toContain("Clínica Aurora (tú)");
    expect(html).toContain("ChatGPT casi no te nombra");
    expect(html).not.toContain("Tercer hallazgo");
    expect(html).toContain("Publica tus precios");
    expect(html).toContain("Mantener Pro por 69 €/mes");
    // A literal sentence of a stored answer, escaped: React escapes the printed report, nobody does here.
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>x");
    expect(html).toContain("Frase literal de una respuesta de tu escaneo.");
  });

  it("links the full report through /login, so a signed-out reader lands on it after signing in", async () => {
    await sendTrialD5Email(TO, USER, { ...base, report: reportModel() });
    expect(last().html).toContain("/login?next=%2Finforme%2F7b0c2c3e-1111-4222-8333-444455556666&utm_source=email");
  });

  it("omits a block with no data instead of printing it empty", async () => {
    await sendTrialD5Email(TO, USER, {
      ...base,
      report: reportModel({
        geoScore: null,
        sources: null,
        competition: { bars: [{ name: "Clínica Aurora", isBrand: true, share: 0.23, byEngine: [] }], cards: [], cloud: [] },
        plan: []
      })
    });
    const { html } = last();
    expect(html).not.toContain("Puntuación GEO");
    expect(html).not.toContain("Quién aparece en las respuestas");
    expect(html).not.toContain("Lo que dijo");
    expect(html).not.toContain("Tu primera acción");
    expect(html).toContain("Menciones por motor");
  });

  it("never prints an absolute count of answers or questions", async () => {
    await sendTrialD5Email(TO, USER, { ...base, report: reportModel() });
    expect(last().html).not.toMatch(/\d+ de \d+ respuestas/);
  });

  it("without a report, keeps the deadline-only email", async () => {
    await sendTrialD5Email(TO, USER, { ...base, report: null });
    expect(last().subject).toBe("Tu prueba de Pro termina el lunes");
    expect(last().html).not.toContain("informe");
  });
});
