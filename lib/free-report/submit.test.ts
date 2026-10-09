import { describe, expect, it, vi } from "vitest";
import {
  createRequestLimiter,
  DISPOSABLE_EMAIL_DOMAINS,
  FIELD_ERROR_MESSAGES,
  MIN_FILL_MS,
  parseFreeReportForm,
  readSource
} from "@/lib/free-report/request";
import { submitFreeReportCore, SUBMIT_MESSAGES, type FreeReportDeps } from "@/lib/free-report/submit";

const NOW = Date.parse("2026-10-09T18:00:00Z");

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields: Record<string, string> = {
    domain: "https://www.TuEmpresa.es/contacto",
    email: "Nombre@TuEmpresa.es",
    business: "Reformas de cocinas\n en Valencia",
    website: "",
    rendered_at: String(NOW - 20_000),
    ...overrides
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function deps(overrides: Partial<FreeReportDeps> = {}): FreeReportDeps {
  return {
    now: () => NOW,
    ipHash: "hash-1",
    source: null,
    limiter: createRequestLimiter(),
    sendOps: vi.fn(async () => true),
    sendConfirmation: vi.fn(async () => true),
    ...overrides
  };
}

describe("parseFreeReportForm", () => {
  it("normalizes the domain, the email and the description", () => {
    const result = parseFreeReportForm(form(), NOW);
    expect(result).toEqual({
      ok: true,
      request: {
        domain: "tuempresa.es",
        email: "nombre@tuempresa.es",
        business: "Reformas de cocinas en Valencia",
        marketingConsent: false
      }
    });
  });

  it("reads marketing consent only from a ticked box (unticked by default)", () => {
    const data = form();
    data.set("marketing", "on");
    const result = parseFreeReportForm(data, NOW);
    expect(result.ok && result.request.marketingConsent).toBe(true);
  });

  it.each([
    ["domain", { domain: "no es una web" }],
    ["email", { email: "nombre@" }],
    ["business", { business: "x" }]
  ])("flags the %s field", (field, overrides) => {
    expect(parseFreeReportForm(form(overrides), NOW)).toEqual({ ok: false, kind: "invalid", field });
  });

  it("rejects a disposable inbox with its own message", () => {
    expect(DISPOSABLE_EMAIL_DOMAINS.has("mailinator.com")).toBe(true);
    expect(parseFreeReportForm(form({ email: "prueba@mailinator.com" }), NOW)).toEqual({
      ok: false,
      kind: "invalid",
      field: "email_disposable"
    });
    expect(FIELD_ERROR_MESSAGES.email_disposable).toMatch(/temporal/);
  });

  it("treats a filled honeypot, a missing timestamp or a too-fast submit as a bot", () => {
    expect(parseFreeReportForm(form({ website: "https://spam.example" }), NOW)).toEqual({ ok: false, kind: "bot" });
    expect(parseFreeReportForm(form({ rendered_at: "0" }), NOW)).toEqual({ ok: false, kind: "bot" });
    expect(parseFreeReportForm(form({ rendered_at: String(NOW - MIN_FILL_MS + 1) }), NOW)).toEqual({
      ok: false,
      kind: "bot"
    });
  });
});

describe("readSource", () => {
  it("keeps a UTM pair and strips characters outside a safe set", () => {
    const data = new FormData();
    data.set("source", "linkedin / <b>otoño</b>-2026");
    expect(readSource(data)).toBe("linkedin / botoo/b-2026");
    data.set("source", "");
    expect(readSource(data)).toBeNull();
  });
});

describe("createRequestLimiter", () => {
  it("allows one request per domain a day, then again after 24 h", () => {
    const limiter = createRequestLimiter();
    const input = { ipHash: "h", domain: "a.es", email: "x@a.es" };
    expect(limiter.take(input, NOW)).toBe(true);
    expect(limiter.take({ ...input, email: "y@a.es" }, NOW + 1000)).toBe(false);
    expect(limiter.take(input, NOW + 24 * 60 * 60 * 1000 + 1)).toBe(true);
  });

  it("caps requests per IP across different domains", () => {
    const limiter = createRequestLimiter({ perIpPerDay: 2, perDomainPerDay: 1, perEmailPerDay: 5 });
    expect(limiter.take({ ipHash: "h", domain: "a.es", email: "x@a.es" }, NOW)).toBe(true);
    expect(limiter.take({ ipHash: "h", domain: "b.es", email: "x@b.es" }, NOW)).toBe(true);
    expect(limiter.take({ ipHash: "h", domain: "c.es", email: "x@c.es" }, NOW)).toBe(false);
    // Without an IP hash only the domain and email limits apply.
    expect(limiter.take({ ipHash: null, domain: "c.es", email: "x@c.es" }, NOW)).toBe(true);
  });

  it("does not record a denied attempt", () => {
    const limiter = createRequestLimiter({ perIpPerDay: 5, perDomainPerDay: 1, perEmailPerDay: 1 });
    expect(limiter.take({ ipHash: "h", domain: "a.es", email: "x@a.es" }, NOW)).toBe(true);
    expect(limiter.take({ ipHash: "h", domain: "a.es", email: "z@z.es" }, NOW)).toBe(false);
    // z@z.es was not recorded by the denied attempt above.
    expect(limiter.take({ ipHash: "h", domain: "b.es", email: "z@z.es" }, NOW)).toBe(true);
  });
});

describe("submitFreeReportCore", () => {
  it("emails the operator, then the requester, and reports success", async () => {
    const d = deps({ source: "linkedin / octubre" });
    const state = await submitFreeReportCore(form(), d);
    expect(state).toEqual({ status: "ok", domain: "tuempresa.es", email: "nombre@tuempresa.es" });
    expect(d.sendOps).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "tuempresa.es" }),
      { requestedAt: new Date(NOW), source: "linkedin / octubre" }
    );
    expect(d.sendConfirmation).toHaveBeenCalledTimes(1);
  });

  it("never shows success when the operator email was not accepted", async () => {
    const d = deps({ sendOps: vi.fn(async () => false) });
    const state = await submitFreeReportCore(form(), d);
    expect(state).toEqual({ status: "error", message: SUBMIT_MESSAGES.unavailable });
    expect(d.sendConfirmation).not.toHaveBeenCalled();
  });

  it("still succeeds when only the confirmation fails: the operator has the request", async () => {
    const log = vi.fn();
    const d = deps({ sendConfirmation: vi.fn(async () => false), log });
    const state = await submitFreeReportCore(form(), d);
    expect(state.status).toBe("ok");
    expect(log).toHaveBeenCalledWith("confirmation_not_accepted", { domain: "tuempresa.es" });
  });

  it("answers a bot like a person and sends nothing", async () => {
    const d = deps();
    const state = await submitFreeReportCore(form({ website: "x" }), d);
    expect(state.status).toBe("ok");
    expect(d.sendOps).not.toHaveBeenCalled();
    expect(d.sendConfirmation).not.toHaveBeenCalled();
  });

  it("returns the field error and sends nothing on invalid input", async () => {
    const d = deps();
    const state = await submitFreeReportCore(form({ email: "mal" }), d);
    expect(state).toEqual({ status: "error", field: "email", message: FIELD_ERROR_MESSAGES.email });
    expect(d.sendOps).not.toHaveBeenCalled();
  });

  it("refuses a second request for the same domain without sending", async () => {
    const d = deps();
    await submitFreeReportCore(form(), d);
    const second = await submitFreeReportCore(form({ email: "otra@tuempresa.es" }), d);
    expect(second).toEqual({ status: "error", message: SUBMIT_MESSAGES.limited });
    expect(d.sendOps).toHaveBeenCalledTimes(1);
  });
});
