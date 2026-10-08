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

const proWithPromo: PlanOffer = { planName: "Pro", price: 179, cadence: "diario", promo: { price: 59, months: 6, endsLabel: "31 de octubre" } };
const proNoPromo: PlanOffer = { planName: "Pro", price: 179, cadence: "diario", promo: null };
const starter: PlanOffer = { planName: "Starter", price: 45, cadence: "semanal", promo: { price: 19, months: 6, endsLabel: "31 de octubre" } };
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
      await sendTrialD5Email(TO, USER, { trialEndsAt: new Date(), domain: null, pro: proWithPromo, starter, lossRows })
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
  it("quotes the launch price, its duration and its real end date while the promo is live", async () => {
    await sendTrialD5Email(TO, USER, {
      trialEndsAt: new Date("2026-10-05T10:00:00Z"),
      domain: "clinicaaurora.es",
      pro: proWithPromo,
      starter,
      lossRows
    });
    const { subject, html } = last();
    expect(subject).toBe("Tu prueba de Pro termina el lunes");
    expect(html).toContain("Mantener Pro por 59 €/mes");
    expect(html).toContain("Durante 6 meses. Después, 179 €/mes.");
    expect(html).toContain("Disponible hasta el 31 de octubre");
    expect(html).toContain("−67%");
    expect(html).toContain("Nordika Home");
  });

  it("CONTRACT-99: says Pro scans weekly and drops the Starter 'weekly' upsell when both are weekly", async () => {
    await sendTrialD5Email(TO, USER, {
      trialEndsAt: new Date("2026-10-05T10:00:00Z"),
      domain: null,
      pro: { planName: "Pro", price: 99, cadence: "semanal", promo: null },
      starter,
      lossRows
    });
    const { html } = last();
    expect(html).toContain("dejará de escanearse cada semana");
    expect(html).not.toContain("a diario");
    // Starter is weekly too, so "¿Te basta con un escaneo semanal?" would be a false contrast.
    expect(html).not.toContain("¿Te basta con un escaneo semanal?");
  });

  it("keeps the daily wording and the Starter upsell when Pro would be daily and Starter weekly", async () => {
    await sendTrialD5Email(TO, USER, {
      trialEndsAt: new Date("2026-10-05T10:00:00Z"),
      domain: null,
      pro: proNoPromo,
      starter,
      lossRows
    });
    const { html } = last();
    expect(html).toContain("dejará de escanearse a diario");
    expect(html).toContain("¿Te basta con un escaneo semanal?");
  });

  it("quotes the list price, with no discount and no deadline, once the promo is gone", async () => {
    await sendTrialD5Email(TO, USER, {
      trialEndsAt: new Date("2026-10-05T10:00:00Z"),
      domain: null,
      pro: proNoPromo,
      starter: { planName: "Starter", price: 45, cadence: "semanal", promo: null },
      lossRows
    });
    const { html } = last();
    expect(html).toContain("Mantener Pro por 179 €/mes");
    expect(html).not.toContain("Precio de lanzamiento");
    expect(html).not.toContain("Disponible hasta");
  });
});
