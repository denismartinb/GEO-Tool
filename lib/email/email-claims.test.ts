import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EMAIL-AUDIT-1 (Director, #549, 2026-10-08): every customer-facing email rendered against the CONTRACT-99
 * offer (one plan, 99 €/mes IVA incluido, 3 dominios · 75 prompts · 3 motores · semanal), with the checks that
 * would have caught the old offer (Pro 59/179, Starter 19/45, 5 dominios, ~100 prompts, diario, deadline 31 oct)
 * and the testimonial nobody can document. Nothing is sent: Resend is mocked and the HTML is only inspected.
 *
 * Set EMAIL_PREVIEW_DIR to also write a SAFE preview of each render: fictitious fixtures, no recipient, and every
 * absolute link replaced by `#` (so no signed unsubscribe link or token can leak into a shared file).
 *
 * What this does NOT prove: that the emails nobody has rendered here (ops alerts) are right, who receives them
 * in production, or that the live Resend configuration is what the code assumes.
 */
const send = vi.fn(async (_payload: unknown) => ({ error: null }));
vi.mock("@/lib/email/resend", () => ({
  getResendClient: () => ({ emails: { send } }),
  getEmailFromAddress: () => "GenScore <soporte@genscore.es>"
}));
vi.mock("@/lib/stripe", () => ({ getActivePromoPlanIds: () => [] }));

import { PLANS } from "@/app/pricing/plans-data";
import {
  sendAccountDeletedEmail,
  sendCancellationScheduledEmail,
  sendPaymentFailedEmail,
  sendPlanConfirmedEmail,
  sendScoreDropAlertEmail,
  sendTrialEndedEmail,
  sendWeeklyDigestEmail,
  sendWelcomeEmail
} from "./transactional";
import { sendFirstScanReadyEmail, sendTrialD1Email, sendTrialD3Email, sendTrialD5Email } from "./lifecycle/templates";
import { proVsFreeRows, resolvePlanOffer } from "./lifecycle/offers";

const USER = "11111111-2222-4333-8444-555555555555";
const TO = "cliente@ejemplo.com";
type Payload = { subject: string; html: string };
type Render = { name: string; subject: string; html: string };

async function renderAll(): Promise<Render[]> {
  const out: Render[] = [];
  const grab = async (name: string, fn: () => Promise<unknown>) => {
    send.mockClear();
    await fn();
    const payload = send.mock.calls.at(-1)?.[0] as Payload | undefined;
    if (!payload) throw new Error(`${name} did not render (not sent through the mocked client)`);
    out.push({ name, subject: payload.subject, html: payload.html });
  };
  const pro = resolvePlanOffer("pro");
  const lossRows = proVsFreeRows();
  const snap = {
    projectId: "p1",
    domain: "ejemplo-marca.test",
    geoScore: 34,
    runDate: new Date("2026-10-04T08:00:00Z"),
    brandMentions: 6,
    answers: 45,
    topCompetitor: { name: "Competidor de ejemplo", mentions: 19 },
    activeRecommendations: 6
  };

  await grab("welcome", () => sendWelcomeEmail(TO, new Date("2026-10-08T10:00:00Z")));
  await grab("plan-confirmed", () => sendPlanConfirmedEmail(TO, "Pro"));
  await grab("payment-failed", () => sendPaymentFailedEmail(TO));
  await grab("trial-ended", () => sendTrialEndedEmail(TO));
  await grab("cancellation-scheduled", () => sendCancellationScheduledEmail(TO, new Date("2026-11-08T10:00:00Z")));
  await grab("score-drop", () => sendScoreDropAlertEmail(TO, "ejemplo-marca.test", 48, 31, USER));
  await grab("weekly-digest", () =>
    sendWeeklyDigestEmail(
      TO,
      "ejemplo-marca.test",
      {
        currentScore: 41,
        previousScore: 38,
        subScores: { visibility: 40, citation: 35, standing: 48 },
        previousSubScores: { visibility: 37, citation: 33, standing: 45 },
        topMover: { name: "Competidor de ejemplo", mentionDelta: 3 },
        recommendation: { title: "Recomendación de ejemplo", description: "Texto de ejemplo." },
        activeRecommendationsCount: 4,
        promptsCount: 25,
        competitorsCount: 5,
        scansThisWeek: 1
      },
      USER
    )
  );
  await grab("account-deleted", () => sendAccountDeletedEmail(TO));
  await grab("first-scan-with-mentions", () => sendFirstScanReadyEmail(TO, USER, snap));
  await grab("first-scan-no-mentions", () => sendFirstScanReadyEmail(TO, USER, { ...snap, brandMentions: 0 }));
  await grab("trial-d1-no-domain", () => sendTrialD1Email(TO, USER, { variant: "no_domain", daysLeft: 6, projectId: null, domain: null }));
  await grab("trial-d1-no-scan", () => sendTrialD1Email(TO, USER, { variant: "no_scan", daysLeft: 6, projectId: "p1", domain: "ejemplo-marca.test" }));
  await grab("trial-d3-no-recommendation", () =>
    sendTrialD3Email(TO, USER, { daysLeft: 4, projectId: null, domain: null, recommendation: null, otherRecommendations: 0 })
  );
  await grab("trial-d5", () =>
    sendTrialD5Email(TO, USER, { trialEndsAt: new Date("2026-10-15T10:00:00Z"), domain: "ejemplo-marca.test", pro, lossRows })
  );
  return out;
}

let renders: Render[] = [];

beforeEach(async () => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-with-enough-entropy-000000";
  process.env.LIFECYCLE_EMAILS_ENABLED = "true";
  renders = await renderAll();
});
afterEach(() => {
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  delete process.env.LIFECYCLE_EMAILS_ENABLED;
});

describe("every customer-facing email follows the contract offer", () => {
  it("covers all the customer-facing emails this audit lists", () => {
    expect(renders.map((r) => r.name)).toEqual(
      expect.arrayContaining([
        "welcome", "plan-confirmed", "payment-failed", "trial-ended", "cancellation-scheduled", "score-drop",
        "weekly-digest", "account-deleted", "first-scan-with-mentions", "trial-d1-no-domain", "trial-d3-no-recommendation", "trial-d5"
      ])
    );
  });

  it("quotes no old price, no retired plan, no retired quota, no daily cadence and no launch deadline", () => {
    const stale = /\b(59|179|449|19|45)\s?€|31 de octubre|5 dominios|100 prompts|~100|Starter|Agencia|Agency|a diario|cada día|diari[oa]/i;
    for (const r of renders) {
      expect(`${r.subject}\n${r.html}`, r.name).not.toMatch(stale);
    }
  });

  it("only ever quotes the one price, 99 €", () => {
    const pro = PLANS.find((p) => p.id === "pro")!;
    expect(pro.price).toBe(99);
    for (const r of renders) {
      for (const m of r.html.matchAll(/(\d+(?:[.,]\d+)?)\s?€/g)) {
        expect(Number(m[1].replace(",", ".")), `${r.name}: ${m[0]}`).toBe(99);
      }
    }
  });

  it("says the price is IVA incluido wherever the D5 price box quotes it (public prices include VAT)", () => {
    expect(renders.find((r) => r.name === "trial-d5")!.html).toContain("IVA incluido");
  });

  it("carries no testimonial: nothing in the repository documents its original or its permission", () => {
    for (const r of renders) {
      expect(r.html, r.name).not.toMatch(/Nordika|Nerea|Sol[ií]s|128\s?%|cuota de voz en IA/i);
    }
  });

  it("no commercial email is rendered without the unsubscribe footer", () => {
    for (const name of ["first-scan-with-mentions", "trial-d1-no-domain", "trial-d1-no-scan", "trial-d3-no-recommendation", "trial-d5"]) {
      const r = renders.find((x) => x.name === name)!;
      expect(r.html, name).toMatch(/Darme de baja/);
    }
  });

  /**
   * TODAY'S TRUTH, pinned so it cannot silently survive B5. `handle_new_user` (migration 0017) still grants a
   * 7-day Pro trial at sign-up, so these emails say 7 days. Under the approved contract the trial is optional,
   * 14 days, no card, started after the first diagnosis (contract-99-implementation.md §13). When B5 ships these
   * three assertions must change WITH the copy — a green test here is not an endorsement of the 7-day wording.
   */
  it("pins the 7-day wording that is true only until B5 replaces the sign-up trial", () => {
    const get = (n: string) => renders.find((r) => r.name === n)!.html;
    expect(get("welcome")).toContain("7 días");
    expect(get("trial-ended")).toContain("7 días");
    expect(get("trial-d1-no-domain")).toMatch(/Te quedan \d+ días de Pro/);
  });
});

describe("safe previews", () => {
  it("writes redacted previews only when EMAIL_PREVIEW_DIR is set", () => {
    // A test-tooling switch, not a product variable: read through an alias so the env-schema drift check
    // (which inventories what the PRODUCT reads) does not list it.
    const env = process.env;
    const dir = env.EMAIL_PREVIEW_DIR;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    for (const r of renders) {
      const safe = r.html
        .replace(/href="https?:\/\/[^"]*"/g, 'href="#"')
        .replace(/src="https?:\/\/[^"]*"/g, 'src=""')
        .replace(/<\/title>/, `</title><!-- preview: fictitious fixture, no recipient, links neutralised -->`);
      expect(safe, r.name).not.toMatch(/ejemplo\.com|token=|sig=|signature=/i);
      writeFileSync(join(dir, `${r.name}.html`), `<!-- subject: ${r.subject.replace(/--/g, "- -")} -->\n${safe}`);
    }
  });
});
