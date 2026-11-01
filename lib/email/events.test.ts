import { describe, expect, it } from "vitest";
import { toEmailEventRow } from "./events";

const base = {
  type: "email.clicked",
  created_at: "2026-11-02T08:00:00Z",
  data: {
    email_id: "em_9",
    to: ["cliente@ejemplo.com"],
    subject: "Asunto",
    click: { link: "https://www.genscore.es/x?utm_source=email", ipAddress: "1.2.3.4", userAgent: "UA" },
    tags: { kind: "feature_gsc" }
  }
};

describe("toEmailEventRow (MAIL-METRICS-1, log §419)", () => {
  it("keeps the event, the type and the time, and nothing about the person", () => {
    const row = toEmailEventRow("msg_1", base);
    expect(row).toEqual({
      webhook_id: "msg_1",
      resend_email_id: "em_9",
      event: "clicked",
      kind: "feature_gsc",
      occurred_at: "2026-11-02T08:00:00.000Z"
    });
    const text = JSON.stringify(row);
    for (const secret of ["cliente@ejemplo.com", "Asunto", "utm_source", "1.2.3.4", "UA"]) expect(text).not.toContain(secret);
  });

  it("reads the tag as an object or as a list, and drops an unknown type", () => {
    expect(toEmailEventRow("m", { ...base, data: { ...base.data, tags: [{ name: "kind", value: "welcome" }] } })?.kind).toBe("welcome");
    expect(toEmailEventRow("m", { ...base, data: { ...base.data, tags: { kind: "made_up" } } })?.kind).toBeNull();
    expect(toEmailEventRow("m", { ...base, data: { ...base.data, tags: undefined } })?.kind).toBeNull();
  });

  it("maps every email event and ignores the rest", () => {
    for (const event of ["sent", "delivered", "delivery_delayed", "opened", "bounced", "complained", "failed", "suppressed"]) {
      expect(toEmailEventRow("m", { ...base, type: `email.${event}` })?.event).toBe(event);
    }
    expect(toEmailEventRow("m", { ...base, type: "email.received" })).toBeNull();
    expect(toEmailEventRow("m", { ...base, type: "domain.updated" })).toBeNull();
  });

  it("refuses a payload without email id or a valid time", () => {
    expect(toEmailEventRow("m", { ...base, data: { ...base.data, email_id: "" } })).toBeNull();
    expect(toEmailEventRow("m", { ...base, created_at: "nope", data: { ...base.data, created_at: undefined } })).toBeNull();
    expect(toEmailEventRow("", base)).toBeNull();
    expect(toEmailEventRow("m", null)).toBeNull();
  });
});
