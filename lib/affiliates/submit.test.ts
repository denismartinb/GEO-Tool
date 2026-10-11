import { describe, expect, it, vi } from "vitest";
import { createRequestLimiter } from "@/lib/free-report/request";
import {
  AFFILIATE_FIELD_ERROR_MESSAGES,
  AFFILIATE_REQUEST_LIMITS,
  parseAffiliateForm,
  suggestAffiliateCode
} from "@/lib/affiliates/request";
import {
  AFFILIATE_SUBMIT_MESSAGES,
  submitAffiliateApplicationCore,
  type AffiliateApplyDeps
} from "@/lib/affiliates/submit";

const NOW = Date.parse("2026-10-10T10:00:00Z");

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields: Record<string, string> = {
    name: "  Ana   García ",
    email: "Ana@Agencia.es",
    channel: "https://www.campamentoweb.es/\nnewsletter",
    website: "",
    rendered_at: String(NOW - 20_000),
    ...overrides
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function deps(overrides: Partial<AffiliateApplyDeps> = {}): AffiliateApplyDeps {
  return {
    now: () => NOW,
    ipHash: "hash-1",
    source: null,
    limiter: createRequestLimiter(AFFILIATE_REQUEST_LIMITS),
    sendOps: vi.fn(async () => true),
    sendConfirmation: vi.fn(async () => true),
    ...overrides
  };
}

describe("parseAffiliateForm", () => {
  it("normalizes the three fields to one line each", () => {
    expect(parseAffiliateForm(form(), NOW)).toEqual({
      ok: true,
      application: { name: "Ana García", email: "ana@agencia.es", channel: "https://www.campamentoweb.es/ newsletter" }
    });
  });

  it.each([
    ["name", { name: "A" }],
    ["email", { email: "ana@" }],
    ["channel", { channel: "x" }]
  ])("flags the %s field", (field, overrides) => {
    expect(parseAffiliateForm(form(overrides), NOW)).toEqual({ ok: false, kind: "invalid", field });
  });

  it("rejects a disposable inbox", () => {
    expect(parseAffiliateForm(form({ email: "ana@mailinator.com" }), NOW)).toEqual({
      ok: false,
      kind: "invalid",
      field: "email_disposable"
    });
  });

  it("treats a filled honeypot as a bot, before validating anything", () => {
    expect(parseAffiliateForm(form({ website: "spam", email: "x" }), NOW)).toEqual({ ok: false, kind: "bot" });
  });

  it("treats a missing or too-recent render time as too fast", () => {
    expect(parseAffiliateForm(form({ rendered_at: "0" }), NOW)).toEqual({ ok: false, kind: "too_fast" });
    expect(parseAffiliateForm(form({ rendered_at: String(NOW - 200) }), NOW)).toEqual({ ok: false, kind: "too_fast" });
  });
});

describe("suggestAffiliateCode", () => {
  it("prefers the channel's host, else the name", () => {
    expect(suggestAffiliateCode({ name: "Ana", channel: "https://www.campamentoweb.es/blog" })).toBe("campamentoweb");
    expect(suggestAffiliateCode({ name: "La Newsletter SEO", channel: "@newsletterseo en LinkedIn" })).toBe("la-newsletter-seo");
    expect(suggestAffiliateCode({ name: "Óscar Peña", channel: "mi perfil" })).toBe("oscar-pena");
  });
});

describe("submitAffiliateApplicationCore", () => {
  it("emails the operator, then the applicant, and confirms", async () => {
    const d = deps();
    const result = await submitAffiliateApplicationCore(form(), d);
    expect(result).toEqual({ status: "ok", name: "Ana García", email: "ana@agencia.es" });
    expect(d.sendOps).toHaveBeenCalledWith(
      { name: "Ana García", email: "ana@agencia.es", channel: "https://www.campamentoweb.es/ newsletter" },
      { requestedAt: new Date(NOW), source: null }
    );
    expect(d.sendConfirmation).toHaveBeenCalledTimes(1);
  });

  it("never confirms when the operator email is not accepted (no fake success)", async () => {
    const d = deps({ sendOps: vi.fn(async () => false) });
    const result = await submitAffiliateApplicationCore(form(), d);
    expect(result).toEqual({ status: "error", message: AFFILIATE_SUBMIT_MESSAGES.unavailable });
    expect(d.sendConfirmation).not.toHaveBeenCalled();
    // And the failed attempt is not counted against the retry.
    const retry = await submitAffiliateApplicationCore(form(), { ...d, sendOps: vi.fn(async () => true) });
    expect(retry.status).toBe("ok");
  });

  it("still succeeds when only the confirmation fails", async () => {
    const d = deps({ sendConfirmation: vi.fn(async () => false) });
    expect((await submitAffiliateApplicationCore(form(), d)).status).toBe("ok");
  });

  it("answers a bot like a person and sends nothing", async () => {
    const d = deps();
    expect(await submitAffiliateApplicationCore(form({ website: "x" }), d)).toEqual({ status: "ok", name: "", email: "" });
    expect(d.sendOps).not.toHaveBeenCalled();
  });

  it("returns the field and its message for a person's mistake", async () => {
    const d = deps();
    expect(await submitAffiliateApplicationCore(form({ channel: "" }), d)).toEqual({
      status: "error",
      field: "channel",
      message: AFFILIATE_FIELD_ERROR_MESSAGES.channel
    });
    expect(d.sendOps).not.toHaveBeenCalled();
  });

  it("limits a second application for the same channel the same day", async () => {
    const d = deps();
    await submitAffiliateApplicationCore(form(), d);
    const second = await submitAffiliateApplicationCore(form({ email: "otra@agencia.es" }), d);
    expect(second).toEqual({ status: "error", message: AFFILIATE_SUBMIT_MESSAGES.limited });
    expect(d.sendOps).toHaveBeenCalledTimes(1);
  });

  it("asks to resend when the form had not finished loading", async () => {
    expect(await submitAffiliateApplicationCore(form({ rendered_at: "0" }), deps())).toEqual({
      status: "error",
      message: AFFILIATE_SUBMIT_MESSAGES.tooFast
    });
  });
});
