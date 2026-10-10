import { describe, expect, it, vi } from "vitest";
import { createRequestLimiter } from "@/lib/free-report/request";
import { DEMO_FIELDS, parseDemoForm } from "@/lib/demo/request";
import { findOfferedSlot, formatDemoSlot, listDemoSlots, madridWallClockToUtc } from "@/lib/demo/slots";
import { DEMO_REQUEST_LIMITS, DEMO_SUBMIT_MESSAGES, submitDemoCore } from "@/lib/demo/submit";

// Saturday 2026-10-10, 23:00 Madrid (CEST, UTC+2).
const SAT_NIGHT = new Date("2026-10-10T21:00:00Z");

describe("madridWallClockToUtc", () => {
  it("handles summer and winter time", () => {
    expect(madridWallClockToUtc(2026, 10, 13, 18 * 60).toISOString()).toBe("2026-10-13T16:00:00.000Z");
    expect(madridWallClockToUtc(2026, 11, 3, 18 * 60).toISOString()).toBe("2026-11-03T17:00:00.000Z");
  });
});

describe("listDemoSlots", () => {
  const slots = listDemoSlots(SAT_NIGHT);

  it("offers Monday to Friday, 18:00 to 20:40, every 20 minutes", () => {
    const tuesday = slots.filter((s) => s.day === "2026-10-13").map((s) => s.time);
    expect(tuesday).toEqual(["18:00", "18:20", "18:40", "19:00", "19:20", "19:40", "20:00", "20:20", "20:40"]);
  });

  it("skips weekends and the 12 October national holiday", () => {
    const days = new Set(slots.map((s) => s.day));
    expect(days.has("2026-10-11")).toBe(false);
    expect(days.has("2026-10-12")).toBe(false);
    expect(days.has("2026-10-17")).toBe(false);
    expect([...days][0]).toBe("2026-10-13");
    expect(days.size).toBe(10);
  });

  it("never offers a slot less than four hours ahead", () => {
    const tueAt15 = new Date("2026-10-13T13:00:00Z"); // 15:00 Madrid
    const first = listDemoSlots(tueAt15)[0];
    expect(first.day).toBe("2026-10-13");
    expect(first.time).toBe("19:00");
  });

  it("only accepts ids it offers", () => {
    expect(findOfferedSlot("2026-10-13T16:00:00.000Z", SAT_NIGHT)?.time).toBe("18:00");
    expect(findOfferedSlot("2026-10-11T01:00:00.000Z", SAT_NIGHT)).toBeNull();
    expect(findOfferedSlot("nonsense", SAT_NIGHT)).toBeNull();
  });

  it("writes the slot in Spanish, Madrid time", () => {
    expect(formatDemoSlot(slots[0])).toBe("martes, 13 de octubre, 18:00");
  });
});

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const base: Record<string, string> = {
    [DEMO_FIELDS.name]: "Lucía",
    [DEMO_FIELDS.email]: "lucia@agencia.es",
    [DEMO_FIELDS.domain]: "https://www.agencia.es/",
    [DEMO_FIELDS.slot]: "2026-10-13T16:00:00.000Z",
    [DEMO_FIELDS.topic]: "",
    [DEMO_FIELDS.website]: "",
    [DEMO_FIELDS.renderedAt]: String(SAT_NIGHT.getTime() - 60_000)
  };
  for (const [key, value] of Object.entries({ ...base, ...overrides })) data.set(key, value);
  return data;
}

describe("parseDemoForm", () => {
  const now = SAT_NIGHT.getTime();

  it("accepts a complete request and cleans the domain", () => {
    const result = parseDemoForm(form(), now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request.domain).toBe("agencia.es");
  });

  it("asks for a slot when none was picked", () => {
    expect(parseDemoForm(form({ [DEMO_FIELDS.slot]: "" }), now)).toEqual({ ok: false, kind: "invalid", field: "slot_missing" });
  });

  it("refuses a slot that is not offered", () => {
    expect(parseDemoForm(form({ [DEMO_FIELDS.slot]: "2026-10-11T08:00:00.000Z" }), now)).toEqual({
      ok: false,
      kind: "invalid",
      field: "slot"
    });
  });

  it("drops bots and too-fast submits", () => {
    expect(parseDemoForm(form({ [DEMO_FIELDS.website]: "x" }), now)).toEqual({ ok: false, kind: "bot" });
    expect(parseDemoForm(form({ [DEMO_FIELDS.renderedAt]: String(now - 100) }), now)).toEqual({ ok: false, kind: "too_fast" });
  });

  it("names the field to fix", () => {
    expect(parseDemoForm(form({ [DEMO_FIELDS.name]: "" }), now)).toMatchObject({ field: "name" });
    expect(parseDemoForm(form({ [DEMO_FIELDS.email]: "no" }), now)).toMatchObject({ field: "email" });
    expect(parseDemoForm(form({ [DEMO_FIELDS.email]: "a@yopmail.com" }), now)).toMatchObject({ field: "email_disposable" });
    expect(parseDemoForm(form({ [DEMO_FIELDS.domain]: "nope" }), now)).toMatchObject({ field: "domain" });
  });
});

describe("submitDemoCore", () => {
  const deps = (sendOps = vi.fn(async () => true), sendConfirmation = vi.fn(async () => true)) => ({
    now: () => SAT_NIGHT.getTime(),
    ipHash: "ip",
    source: null,
    limiter: createRequestLimiter(DEMO_REQUEST_LIMITS),
    sendOps,
    sendConfirmation
  });

  it("confirms only after the operator email is accepted", async () => {
    const d = deps();
    const state = await submitDemoCore(form(), d);
    expect(state).toEqual({ status: "ok", when: "martes, 13 de octubre, 18:00", email: "lucia@agencia.es" });
    expect(d.sendOps).toHaveBeenCalledOnce();
    expect(d.sendConfirmation).toHaveBeenCalledOnce();
  });

  it("shows an error and sends no confirmation when the operator email fails", async () => {
    const d = deps(vi.fn(async () => false));
    const state = await submitDemoCore(form(), d);
    expect(state).toEqual({ status: "error", message: DEMO_SUBMIT_MESSAGES.unavailable });
    expect(d.sendConfirmation).not.toHaveBeenCalled();
  });

  it("sends nothing for a bot", async () => {
    const d = deps();
    await submitDemoCore(form({ [DEMO_FIELDS.website]: "spam" }), d);
    expect(d.sendOps).not.toHaveBeenCalled();
  });

  it("limits repeated requests from the same email", async () => {
    const d = deps();
    await submitDemoCore(form(), d);
    await submitDemoCore(form(), d);
    const third = await submitDemoCore(form(), d);
    expect(third).toEqual({ status: "error", message: DEMO_SUBMIT_MESSAGES.limited });
  });
});
