import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn(async (_payload: unknown) => ({ error: null }));
vi.mock("@/lib/email/resend", () => ({
  getResendClient: () => ({ emails: { send } }),
  getEmailFromAddress: () => "GenScore <soporte@genscore.es>"
}));

import { sendTrialEndedOfferEmail, sendWinbackD10Email, sendWinbackD3Email, type PlanOffer, type RunSnapshot } from "./templates";

/**
 * LIFECYCLE-WINBACK-1 (log §238). The post-trial emails: no way out means
 * no email, prices follow the plan data, the account's own figures or none,
 * and outside text never reaches the HTML unescaped.
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
const proWithPromo: PlanOffer = { planName: "Pro", price: 99, promo: { price: 69, remaining: 47, total: 50 } };
const proNoPromo: PlanOffer = { planName: "Pro", price: 99, promo: null };
const starter: PlanOffer = { planName: "Starter", price: 29, promo: null };
const END = new Date("2026-10-05T10:00:00Z");

beforeEach(() => {
  send.mockClear();
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-with-enough-entropy-000000";
});
afterEach(() => {
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
});

describe("fin de prueba", () => {
  it("is not sent without a working unsubscribe", async () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    expect(await sendTrialEndedOfferEmail(TO, USER, { late: false, trialEndsAt: END, snapshot, pro: proWithPromo, starter })).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("quotes the last real scan, the live promo and the one-click unsubscribe", async () => {
    expect(await sendTrialEndedOfferEmail(TO, USER, { late: false, trialEndsAt: END, snapshot, pro: proWithPromo, starter })).toBe(true);
    const mail = last();
    expect(mail.subject).toBe("Tu prueba ha terminado. Tus datos de clinicaaurora.es siguen aquí");
    expect(mail.html).toContain("6 de 45");
    expect(mail.html).toContain("Volver a Pro por 69 €/mes");
    expect(mail.html).toContain("Quedan 47 de 50 plazas");
    expect(mail.html).not.toMatch(/Disponible hasta|durante \d+ meses|line-through/i);
    expect(mail.html).toContain("openPlan=pro");
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("the «tardía» version says it is late and dates the real end", async () => {
    await sendTrialEndedOfferEmail(TO, USER, { late: true, trialEndsAt: END, snapshot, pro: proWithPromo, starter });
    expect(last().subject).toBe("Tu prueba de Pro terminó el 5 de octubre (y no te avisamos)");
    expect(last().html).toContain("no lo hicimos");
    expect(last().html).toContain("mientras queden plazas");
  });

  it("without a founder offer: plain price, no slots", async () => {
    await sendTrialEndedOfferEmail(TO, USER, { late: true, trialEndsAt: END, snapshot, pro: proNoPromo, starter });
    expect(last().html).toContain("Volver a Pro por 99 €/mes");
    expect(last().html).not.toContain("Precio fundador");
    expect(last().html).not.toContain("plazas");
  });

  it("without a scan: no figures at all", async () => {
    await sendTrialEndedOfferEmail(TO, USER, { late: false, trialEndsAt: END, snapshot: null, pro: proWithPromo, starter });
    expect(last().html).not.toContain("Tu último escaneo");
    expect(last().subject).toBe("Tu prueba ha terminado. Tus datos siguen aquí");
  });
});

describe("D+3", () => {
  it("leads with the real gap to the most-mentioned rival", async () => {
    await sendWinbackD3Email(TO, USER, { snapshot, pro: proWithPromo, starter });
    expect(last().subject).toBe("Clínica Sonrisa Norte aparece 3 veces más que tú en la IA");
  });

  it("switches to «vas por delante» when the customer leads", async () => {
    await sendWinbackD3Email(TO, USER, { snapshot: { ...snapshot, brandMentions: 25 }, pro: proWithPromo, starter });
    expect(last().subject).toBe("Vas por delante en la IA. ¿Sigues por delante?");
  });

  it("never claims a multiple it cannot compute", async () => {
    await sendWinbackD3Email(TO, USER, { snapshot: { ...snapshot, brandMentions: 0 }, pro: proWithPromo, starter });
    expect(last().subject).toBe("Clínica Sonrisa Norte aparece en más respuestas que tú en la IA");
  });

  it("escapes a competitor's name", async () => {
    await sendWinbackD3Email(TO, USER, {
      snapshot: { ...snapshot, topCompetitor: { name: "<img src=x>", mentions: 19 } },
      pro: proWithPromo,
      starter
    });
    expect(last().html).not.toContain("<img src=x>");
  });
});

describe("D+10", () => {
  it("is never sent without a founder offer", async () => {
    expect(await sendWinbackD10Email(TO, USER, { domain: "clinicaaurora.es", pro: proNoPromo })).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("quotes the founder price as forever and the real slots left, with no calendar deadline", async () => {
    await sendWinbackD10Email(TO, USER, { domain: "clinicaaurora.es", pro: proWithPromo });
    expect(last().subject).toBe("Quedan 47 plazas: Pro a 69 €/mes para siempre");
    expect(last().html).toContain("en lugar de 99 €");
    expect(last().html).not.toMatch(/Últimos días|hasta el \d/);
  });
});
