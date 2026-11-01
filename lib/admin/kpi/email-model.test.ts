import { describe, expect, it } from "vitest";
import {
  buildContacts,
  buildSending,
  buildUnsubscribes,
  classifyEmails,
  contactWeeks,
  formatRate,
  type ContactUser,
  type ResendEmail
} from "@/lib/admin/kpi/email-model";
import { panelWindow } from "@/lib/admin/kpi/period";

const now = new Date("2026-11-01T16:00:00Z");
const window28 = panelWindow("28d", now);
const window7 = panelWindow("7d", now);

const users: ContactUser[] = [
  { id: "a", email: "Ana@Example.com", createdAt: "2026-09-01T10:00:00Z" },
  { id: "b", email: "bea@example.com", createdAt: "2026-10-20T10:00:00Z" },
  { id: "c", email: "carla@example.com", createdAt: "2026-10-31T10:00:00Z" }
];

function mail(partial: Partial<ResendEmail> & { to: string[]; createdAt: string }): ResendEmail {
  return { lastEvent: "delivered", subject: "Algo", ...partial };
}

describe("contacts", () => {
  it("counts live accounts, sign-ups in the window and the previous one, and a cumulative line", () => {
    const view = buildContacts({ users, unsubscribes: [], window: window7, now });
    expect(view.total).toBe(3);
    expect(view.addedInWindow).toBe(1);
    expect(view.addedPrevious).toBe(1);
    expect(view.daily).toHaveLength(28);
    expect(view.daily[0].total).toBe(1);
    expect(view.daily[27].total).toBe(3);
    expect(view.daily.find((d) => d.date === "2026-10-20")?.added).toBe(1);
  });

  it("puts unsubscribes on their Madrid day and ignores re-subscriptions", () => {
    const view = buildContacts({
      users,
      unsubscribes: [
        { ownerId: "a", category: "lifecycle", enabled: false, source: "email_link", createdAt: "2026-10-30T23:30:00Z" },
        { ownerId: "a", category: "lifecycle", enabled: true, source: "settings", createdAt: "2026-10-31T09:00:00Z" }
      ],
      window: window28,
      now
    });
    // 23:30 UTC on the 30th is 00:30 on the 31st in Madrid (UTC+1).
    expect(view.daily.find((d) => d.date === "2026-10-31")?.unsubscribed).toBe(1);
    expect(view.daily.find((d) => d.date === "2026-10-30")?.unsubscribed).toBe(0);
  });
});

describe("unsubscribes", () => {
  it("splits by category and source, compares with the previous window and counts re-subscriptions apart", () => {
    const view = buildUnsubscribes(
      [
        { ownerId: "a", category: "lifecycle", enabled: false, source: "email_link", createdAt: "2026-10-30T10:00:00Z" },
        { ownerId: "b", category: "weekly_digest", enabled: false, source: "one_click", createdAt: "2026-10-29T10:00:00Z" },
        { ownerId: "b", category: "weekly_digest", enabled: true, source: "settings", createdAt: "2026-10-30T10:00:00Z" },
        { ownerId: "a", category: "score_drop", enabled: false, source: "settings", createdAt: "2026-10-22T10:00:00Z" }
      ],
      window7
    );
    expect(view.inWindow).toBe(2);
    expect(view.previous).toBe(1);
    expect(view.resubscribed).toBe(1);
    expect(view.byCategory).toMatchObject({ lifecycle: 1, weekly_digest: 1, score_drop: 0, first_scan: 0 });
    expect(view.bySource).toMatchObject({ email_link: 1, one_click: 1, settings: 0 });
  });
});

describe("emails sent", () => {
  it("names a lifecycle email by its email_sends row, the digest by subject, the rest as other; drops non-contacts", () => {
    const userIdByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
    const out = classifyEmails({
      emails: [
        mail({ to: ["ana@example.com"], createdAt: "2026-10-30T07:46:10Z" }),
        mail({ to: ["ana@example.com"], createdAt: "2026-10-27T06:00:00Z", subject: "Tu resumen semanal de ana.es" }),
        mail({ to: ["ana@example.com"], createdAt: "2026-10-30T12:00:00Z" }),
        mail({ to: ["operador@genscore.es"], createdAt: "2026-10-30T12:00:00Z" })
      ],
      userIdByEmail,
      sends: [{ ownerId: "a", kind: "winback_d3", sentAt: "2026-10-30T07:45:58Z" }]
    });
    expect(out.map((o) => o.group)).toEqual(["winback", "digest", "other"]);
  });

  it("uses each email_sends row once", () => {
    const userIdByEmail = new Map([["ana@example.com", "a"]]);
    const out = classifyEmails({
      emails: [
        mail({ to: ["ana@example.com"], createdAt: "2026-10-30T07:46:00Z" }),
        mail({ to: ["ana@example.com"], createdAt: "2026-10-30T07:47:00Z" })
      ],
      userIdByEmail,
      sends: [{ ownerId: "a", kind: "feature_gsc", sentAt: "2026-10-30T07:45:59Z" }]
    });
    expect(out.map((o) => o.group)).toEqual(["feature", "other"]);
  });

  it("counts delivered, opens, clicks and bounces from the last event, and the weekly rate per contact", () => {
    const view = buildSending({
      emails: [
        mail({ to: ["ana@example.com"], createdAt: "2026-10-30T10:00:00Z", lastEvent: "clicked" }),
        mail({ to: ["ana@example.com"], createdAt: "2026-10-29T10:00:00Z", lastEvent: "opened" }),
        mail({ to: ["bea@example.com"], createdAt: "2026-10-29T10:00:00Z", lastEvent: "bounced" }),
        mail({ to: ["bea@example.com"], createdAt: "2026-10-29T11:00:00Z", lastEvent: "scheduled" }),
        mail({ to: ["bea@example.com"], createdAt: "2026-10-22T10:00:00Z", lastEvent: "delivered" })
      ],
      users,
      sends: [],
      window: window7,
      now,
      domainTracking: null
    });
    expect(view.totals).toEqual({ sent: 3, delivered: 2, opened: 2, clicked: 1, bounced: 1 });
    expect(view.tracking).toBe("on");
    expect(view.windowCovered).toBe(true);
    expect(view.previousCovered).toBe(true);
    const weeks = contactWeeks(users, window7.from, window7.to);
    expect(view.perContactWeek).toBeCloseTo(3 / weeks);
    expect(view.perContactWeekPrevious).not.toBeNull();
  });

  it("has no previous rate for 28 days, because Resend keeps 30", () => {
    const view = buildSending({ emails: [], users, sends: [], window: window28, now, domainTracking: null });
    expect(view.windowCovered).toBe(true);
    expect(view.previousCovered).toBe(false);
    expect(view.perContactWeekPrevious).toBeNull();
  });

  it("reads tracking as off only from the domain, and unknown without evidence", () => {
    const base = { emails: [], users, sends: [], window: window7, now };
    expect(buildSending({ ...base, domainTracking: { open: false, click: false } }).tracking).toBe("off");
    expect(buildSending({ ...base, domainTracking: null }).tracking).toBe("unknown");
    expect(buildSending({ ...base, domainTracking: { open: true, click: true } }).tracking).toBe("on");
  });
});

describe("contact time", () => {
  it("counts each contact only from its sign-up", () => {
    const from = new Date("2026-10-25T00:00:00Z");
    const to = new Date("2026-11-01T00:00:00Z");
    expect(contactWeeks([{ id: "x", email: "x@x.es", createdAt: "2026-10-28T12:00:00Z" }], from, to)).toBeCloseTo(0.5);
    expect(contactWeeks([{ id: "y", email: "y@y.es", createdAt: "2026-11-02T00:00:00Z" }], from, to)).toBe(0);
  });

  it("formats with a Spanish comma", () => {
    expect(formatRate(1.62)).toBe("1,6");
  });
});
