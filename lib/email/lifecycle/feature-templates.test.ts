import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn(async (_payload: unknown) => ({ error: null }));
vi.mock("@/lib/email/resend", () => ({
  getResendClient: () => ({ emails: { send } }),
  getEmailFromAddress: () => "GenScore <soporte@genscore.es>"
}));

import {
  agenticEmailParts,
  extensionEmailParts,
  extensionLaunchEmailParts,
  gscEmailParts,
  sendFeatureEmail
} from "./feature-templates";

/**
 * FEATURE-EMAILS-1 (log §417). The approved texts reach the inbox with the
 * GenScore header and footer, a working way out, the account's own domain
 * escaped, and no absolute counts.
 */
const USER = "11111111-2222-4333-8444-555555555555";
type Payload = { subject: string; html: string; headers?: Record<string, string> };
const last = () => send.mock.calls.at(-1)?.[0] as Payload;

beforeEach(() => {
  send.mockClear();
  process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-with-enough-entropy-000000";
});
afterEach(() => {
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
});

const ALL = [
  gscEmailParts({ projectId: "p1", domain: "tuweb.es" }),
  extensionEmailParts({ domain: "tuweb.es" }),
  agenticEmailParts({ variant: "result", projectId: "p1", domain: "tuweb.es", score: 58, firstFix: "Publicar el precio" }),
  agenticEmailParts({ variant: "upgrade", domain: "tuweb.es" }),
  extensionLaunchEmailParts()
];

describe("feature emails", () => {
  it("go out with the GenScore header, the unsubscribe footer and its headers", async () => {
    for (const parts of ALL) {
      expect(await sendFeatureEmail("cliente@ejemplo.com", USER, parts)).toBe("sent");
      const payload = last();
      expect(payload.subject).toBe(parts.subject);
      expect(payload.html).toContain("genscore-email-header.png");
      expect(payload.html).toContain("Darme de baja");
      expect(payload.headers?.["List-Unsubscribe"]).toBeTruthy();
    }
  });

  it("are not sent without a way out", async () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    expect(await sendFeatureEmail("cliente@ejemplo.com", USER, ALL[0])).toBe("not_sent");
    expect(send).not.toHaveBeenCalled();
  });

  it("link where each one promises, tagged as email", () => {
    expect(ALL[0].body).toMatch(/\/api\/search-console\/connect\?projectId=p1&(amp;)?utm_source=email/);
    expect(ALL[1].body).toContain("chromewebstore.google.com");
    expect(ALL[1].body).toContain("utm_campaign=feature_extension");
    expect(ALL[2].body).toContain("/dashboard/projects/p1/agentic-audit?utm_source=email");
    expect(ALL[3].body).toContain("/dashboard/settings#plan");
    for (const parts of ALL) expect(parts.body).toContain("utm_medium=lifecycle");
  });

  it("show the account's own score and first fix, clamped and escaped", () => {
    const html = agenticEmailParts({
      variant: "result",
      projectId: "p1",
      domain: "<b>x</b>.es",
      score: 140,
      firstFix: "<script>"
    }).body;
    expect(html).toContain("100<span");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>x</b>.es");
    const noFix = agenticEmailParts({ variant: "result", projectId: "p1", domain: "tuweb.es", score: 50, firstFix: null }).body;
    expect(noFix).not.toContain("Lo primero que arreglaríamos");
  });

  it("never use long dashes", () => {
    for (const parts of ALL) {
      expect(`${parts.subject}${parts.preheader}${parts.body}`).not.toContain("—");
    }
  });
});

describe("EXT-REACH-1 (log §436): the extension announcement", () => {
  it("links the store and the article, tagged, and carries its own Resend kind", async () => {
    const parts = extensionLaunchEmailParts();
    expect(parts.kind).toBe("extension_launch");
    expect(await sendFeatureEmail("cliente@ejemplo.com", USER, parts)).toBe("sent");
    const { html } = last();
    expect(html).toContain("chromewebstore.google.com/detail/");
    expect(html).toContain("utm_campaign=extension_launch");
    expect(html).toContain("/blog/extension-de-chrome-de-genscore?utm_source=email");
    expect(html).toContain("/email/extension-chrome.jpg");
  });
});
