import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { addWorkingHours, buildConfirmationEmail, buildOpsEmail } from "@/lib/free-report/emails";

const REQUEST = {
  domain: "tuempresa.es",
  email: "nombre@tuempresa.es",
  business: "Reformas <script>alert(1)</script> en Valencia",
  marketingConsent: true
};

/** Public-copy rules (founder, 2026-10-09): no counts, no model versions. */
const FORBIDDEN = [/\b\d+\s+(preguntas|respuestas|escaneos|pasadas)\b/i, /gpt-|gemini-\d|haiku|sonnet/i];

describe("free report emails", () => {
  it("escapes everything the visitor typed", () => {
    for (const { html } of [buildOpsEmail(REQUEST, { requestedAt: new Date(), source: "<x>" }), buildConfirmationEmail(REQUEST)]) {
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    }
  });

  it("records the marketing consent for the operator", () => {
    const { html } = buildOpsEmail(REQUEST, { requestedAt: new Date("2026-10-09T18:00:00Z"), source: null });
    expect(html).toContain("marcó la casilla");
    const { html: noConsent } = buildOpsEmail({ ...REQUEST, marketingConsent: false }, { requestedAt: new Date(), source: null });
    expect(noConsent).toContain("sólo el informe");
  });

  it("promises 48 working hours and keeps the public copy rules", () => {
    const { subject, html } = buildConfirmationEmail(REQUEST);
    expect(subject).toContain("tuempresa.es");
    expect(html).toContain("48 h laborables");
    expect(html).toContain("preguntas principales de búsqueda");
    for (const pattern of FORBIDDEN) expect(html).not.toMatch(pattern);
  });

  it("is signed by the team, not by a person (no personal contact, log §238)", () => {
    const { html } = buildConfirmationEmail(REQUEST);
    expect(html).toContain("El equipo de GenScore");
    expect(html).not.toMatch(/Denis/);
  });
});

describe("addWorkingHours", () => {
  it("skips the weekend", () => {
    // Friday 18:00 UTC + 48 working hours → Tuesday 18:00 UTC.
    const friday = new Date("2026-10-09T18:00:00Z");
    expect(addWorkingHours(friday, 48).toISOString()).toBe("2026-10-13T18:00:00.000Z");
  });

  it("is two calendar days mid-week", () => {
    const monday = new Date("2026-10-05T10:00:00Z");
    expect(addWorkingHours(monday, 48).toISOString()).toBe("2026-10-07T10:00:00.000Z");
  });
});
