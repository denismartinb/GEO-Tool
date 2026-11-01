import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmailCapture } from "@/app/admin/crm/email-capture";
import type { EmailSection } from "@/lib/admin/kpi/email";
import { buildContacts, buildSending, buildUnsubscribes } from "@/lib/admin/kpi/email-model";
import { panelWindow } from "@/lib/admin/kpi/period";

const now = new Date("2026-11-01T16:00:00Z");
const window = panelWindow("7d", now);
const users = [
  { id: "a", email: "ana@example.com", createdAt: "2026-09-01T10:00:00Z" },
  { id: "b", email: "bea@example.com", createdAt: "2026-10-29T10:00:00Z" }
];

function section(overrides: Partial<Extract<EmailSection, { kind: "ready" }>> = {}): EmailSection {
  return {
    kind: "ready",
    contacts: buildContacts({ users, unsubscribes: [], window, now }),
    lifecycleSubscribed: 2,
    unsubscribes: buildUnsubscribes([], window),
    sending: {
      kind: "ready",
      truncated: false,
      ...buildSending({
        emails: [{ id: "em_1", to: ["ana@example.com"], createdAt: "2026-10-30T10:00:00Z", lastEvent: "delivered", subject: "Hola" }],
        users,
        sends: [],
        window,
        now,
        domainTracking: null
      })
    },
    authUsersTruncated: false,
    ...overrides
  };
}

describe("EmailCapture", () => {
  it("shows contacts and the five email groups", () => {
    const html = renderToStaticMarkup(<EmailCapture email={section()} periodLabel="7 días" />);
    expect(html).toContain("Captación de email · 7 días");
    expect(html).toContain("Secuencia de la prueba");
    expect(html).toContain("Avisos y cuenta");
    expect(html).toContain("100 %");
  });

  it("never shows an open rate when tracking is not proven on", () => {
    const html = renderToStaticMarkup(<EmailCapture email={section()} periodLabel="7 días" />);
    expect(html).toContain("el seguimiento puede estar apagado en Resend");
    expect(html).not.toMatch(/0 % · 0 %/);
  });

  it("says why Resend could not be read instead of showing zeros", () => {
    const html = renderToStaticMarkup(
      <EmailCapture email={section({ sending: { kind: "restricted" } })} periodLabel="7 días" />
    );
    expect(html).toContain("solo puede enviar");
    const missing = renderToStaticMarkup(
      <EmailCapture email={section({ unsubscribes: null, lifecycleSubscribed: null })} periodLabel="7 días" />
    );
    expect(missing).toContain("No se pudo leer el registro de bajas");
    expect(missing).toContain("no se pudo leer");
  });

  it("falls back to one notice when the accounts are unreadable", () => {
    const html = renderToStaticMarkup(<EmailCapture email={{ kind: "error" }} periodLabel="28 días" />);
    expect(html).toContain("No se pudieron leer las cuentas");
  });
});
