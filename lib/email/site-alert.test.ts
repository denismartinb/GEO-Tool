import { afterEach, describe, expect, it, vi } from "vitest";

const { sendMock, flag } = vi.hoisted(() => ({ sendMock: vi.fn(), flag: { on: false } }));
vi.mock("@/lib/email/transactional", async (orig) => ({
  ...(await orig<typeof import("@/lib/email/transactional")>()),
  sendEmailWithOutcome: sendMock
}));
vi.mock("@/lib/email/lifecycle/flag", () => ({ isLifecycleEmailEnabled: () => flag.on }));

const { renderSiteAlertEmail, sendSiteAlertEmails } = await import("./site-alert");

type Row = Record<string, unknown>;
function service({ profile, recent = [] as Row[] }: { profile: Row | null; recent?: Row[] }) {
  const updates: Row[] = [];
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "limit", "order"]) c[m] = () => c;
    c.maybeSingle = () => Promise.resolve(result);
    c.then = (resolve: (v: unknown) => void) => resolve(result);
    return c;
  };
  return {
    updates,
    client: {
      from(table: string) {
        if (table === "profiles") return chain({ data: profile, error: null });
        return {
          ...chain({ data: recent, error: null }),
          select: () => chain({ data: recent, error: null }),
          update: (values: Row) => {
            updates.push(values);
            return chain({ error: null });
          }
        };
      }
    }
  };
}

const change = { engine: "ChatGPT", by: "server" as const, tokens: ["OAI-SearchBot"], dedupeKey: "engine_blocked:s:chatgpt" };

afterEach(() => {
  sendMock.mockReset();
  flag.on = false;
});

describe("renderSiteAlertEmail (GEO-ALERTS-1, log §440)", () => {
  it("says what changed, why it matters and which bot to check, without long dashes", () => {
    const { subject, html } = renderSiteAlertEmail({ domain: "cafeventura.es", projectId: "p1", change, footerHtml: "pie" });
    expect(subject).toBe("ChatGPT ya no puede leer cafeventura.es");
    expect(html).toContain("Desde hoy, la búsqueda de ChatGPT no puede entrar en tu web");
    expect(html).toContain("OAI-SearchBot");
    expect(html).toContain("simulación");
    expect(html).toContain("/dashboard/projects/p1/web-audit?bloque=geo");
    expect(subject + html.replace(/GenScore — Generative/g, "")).not.toContain("—");
  });
});

describe("sendSiteAlertEmails", () => {
  it("sends nothing while the lifecycle switch is off", async () => {
    const s = service({ profile: { email: "a@b.es", notify_site_alerts: true } });
    expect(await sendSiteAlertEmails({ service: s.client as never, ownerUserId: "u", projectId: "p1", projectDomain: "x.es", changes: [change] })).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("fails closed without the preference column, and respects an unsubscribe", async () => {
    flag.on = true;
    for (const profile of [{ email: "a@b.es" }, { email: "a@b.es", notify_site_alerts: false }]) {
      const s = service({ profile });
      await sendSiteAlertEmails({ service: s.client as never, ownerUserId: "u", projectId: "p1", projectDomain: "x.es", changes: [change] });
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends once per engine every 30 days and marks the notice after the send", async () => {
    flag.on = true;
    sendMock.mockResolvedValue("sent");
    const fresh = service({ profile: { email: "a@b.es", notify_site_alerts: true } });
    expect(await sendSiteAlertEmails({ service: fresh.client as never, ownerUserId: "u", projectId: "p1", projectDomain: "x.es", changes: [change] })).toEqual(["ChatGPT"]);
    expect(sendMock.mock.calls[0][1]).toEqual({ idempotencyKey: "site-alert/u/engine_blocked:s:chatgpt" });
    expect(fresh.updates[0].payload_json).toMatchObject({ emailedAt: expect.any(String) });

    sendMock.mockClear();
    const recent = service({
      profile: { email: "a@b.es", notify_site_alerts: true },
      recent: [{ payload_json: { agent: "ChatGPT", emailedAt: "2026-10-20T00:00:00Z" } }]
    });
    expect(await sendSiteAlertEmails({ service: recent.client as never, ownerUserId: "u", projectId: "p1", projectDomain: "x.es", changes: [change] })).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not mark anything when the send fails", async () => {
    flag.on = true;
    sendMock.mockResolvedValue("not_sent");
    const s = service({ profile: { email: "a@b.es", notify_site_alerts: true } });
    await sendSiteAlertEmails({ service: s.client as never, ownerUserId: "u", projectId: "p1", projectDomain: "x.es", changes: [change] });
    expect(s.updates).toEqual([]);
  });
});
