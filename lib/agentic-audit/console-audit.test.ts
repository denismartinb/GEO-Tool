import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AGENTIC_REVIEW_DAILY_LIMIT,
  AGENTIC_SCREEN_MIN_GAP_MS,
  AGENTIC_SCREEN_STALE_MS,
  readAgenticAudits,
  runConsoleAgenticAuditCore,
  runScheduledAgenticAudit,
  shouldAutoReview
} from "./console-audit";
import type { AgenticFetcher } from "./run-audit";

type Call = [string, unknown[]];

/**
 * A chainable stand-in for the Supabase client. Each `from(table)` takes the
 * next queued result for that table, so one test can script the project,
 * profile, count, insert and update reads in order.
 */
function client(queues: Record<string, unknown[]>, calls: Call[]) {
  return {
    from(table: string) {
      calls.push(["from", [table]]);
      const result = queues[table]?.shift() ?? { data: null, error: null };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "order", "limit", "insert", "update", "maybeSingle", "single"]) {
        b[m] = (...args: unknown[]) => {
          calls.push([m, args]);
          return b;
        };
      }
      b.then = (resolve: (v: unknown) => void) => resolve(result);
      return b;
    }
  };
}

const PROJECT = "11111111-1111-4111-8111-111111111111";
const user = { id: "u1" } as never;
const PRO = { current_plan: "pro", trial_ends_at: null, stripe_subscription_id: "sub_1", email: "a@b.es" };

const PRODUCT_HTML = `<html><head><script type="application/ld+json">{"@type":"Product","name":"X","offers":{"@type":"Offer","price":"9","priceCurrency":"EUR","availability":"InStock"}}</script>
</head><body><form action="/cart/add"><button>Añadir al carrito</button></form><p>${"Texto ".repeat(200)}</p></body></html>`;

const HOME_HTML = `<html><body><a href="/p/zapatilla">Zapatilla</a><p>${"Texto ".repeat(50)}</p></body></html>`;

function fakeFetch(requested: string[], pages: Record<string, string> = { "/p/zapatilla": PRODUCT_HTML, "/": HOME_HTML }): AgenticFetcher {
  return async (url) => {
    requested.push(url);
    const body = pages[new URL(url).pathname];
    if (body !== undefined) {
      return { kind: "response", status: 200, finalUrl: url, headers: { "content-type": "text/html" }, body, ms: 5 };
    }
    return { kind: "response", status: 404, finalUrl: url, headers: {}, body: "", ms: 5 };
  };
}

type Row = { status: string; created_at: string; result: unknown };

function setup(
  opts: { owns?: boolean; profile?: unknown; count?: number; countError?: unknown; recent?: Row[]; pages?: Record<string, string> } = {}
) {
  const userCalls: Call[] = [];
  const serviceCalls: Call[] = [];
  const requested: string[] = [];
  const supabase = client(
    {
      projects: [{ data: opts.owns === false ? null : { id: PROJECT, domain: "tienda.es" }, error: null }],
      profiles: [{ data: opts.profile === undefined ? PRO : opts.profile, error: null }]
    },
    userCalls
  );
  const service = client(
    {
      agentic_audits: [
        { count: opts.count ?? 0, error: opts.countError ?? null },
        { data: opts.recent ?? [], error: null },
        { data: { id: "row1" }, error: null },
        { error: null }
      ],
      profiles: [{ data: opts.profile === undefined ? PRO : opts.profile, error: null }]
    },
    serviceCalls
  );
  return {
    userCalls,
    serviceCalls,
    requested,
    deps: {
      supabase: supabase as never,
      service: service as never,
      user,
      audit: { fetch: fakeFetch(requested, opts.pages), tokenAllowed: () => true },
      now: () => Date.parse("2026-10-17T10:00:00Z")
    }
  };
}

describe("runConsoleAgenticAuditCore (log §322)", () => {
  it("reviews a product page of the project's domain and stores the result, scoped to project and owner", async () => {
    const s = setup();
    const result = await runConsoleAgenticAuditCore({ projectId: PROJECT, url: "https://www.tienda.es/p/zapatilla" }, s.deps);
    expect(result).toEqual({ success: true });

    const insert = s.serviceCalls.find(([m]) => m === "insert");
    expect(insert?.[1][0]).toMatchObject({ project_id: PROJECT, owner_user_id: "u1", status: "pending" });
    const update = s.serviceCalls.find(([m]) => m === "update");
    expect(update?.[1][0]).toMatchObject({ status: "completed" });
    expect((update?.[1][0] as { score: number | null }).score).toEqual(expect.any(Number));
    expect(s.serviceCalls).toContainEqual(["eq", ["owner_user_id", "u1"]]);
    // The engine's fixed list only, all on the store's own host.
    expect(s.requested.every((u) => new URL(u).hostname === "www.tienda.es")).toBe(true);
  });

  it("writes the pending row before any request leaves", async () => {
    const s = setup();
    const order: string[] = [];
    const originalFetch = s.deps.audit.fetch;
    s.deps.audit.fetch = async (...args) => {
      if (!order.includes("fetch")) order.push("fetch");
      return originalFetch(...args);
    };
    const service = s.deps.service as unknown as { from: (t: string) => unknown };
    const originalFrom = service.from.bind(service);
    service.from = (t: string) => {
      order.push("db");
      return originalFrom(t);
    };
    await runConsoleAgenticAuditCore({ projectId: PROJECT, url: "tienda.es/p/zapatilla" }, s.deps);
    expect(order.indexOf("fetch")).toBeGreaterThan(2);
    expect(order.slice(0, 3)).toEqual(["db", "db", "db"]);
  });

  it("refuses a project the user does not own, without writing or fetching", async () => {
    const s = setup({ owns: false });
    const result = await runConsoleAgenticAuditCore({ projectId: PROJECT, url: "tienda.es/p/zapatilla" }, s.deps);
    expect(result).toMatchObject({ success: false, error: "project_not_found" });
    expect(s.serviceCalls).toEqual([]);
    expect(s.requested).toEqual([]);
  });

  it("is Pro and above only, and fails closed without a profile", async () => {
    for (const profile of [null, { ...PRO, current_plan: "starter" }, { ...PRO, current_plan: "free" }]) {
      const s = setup({ profile });
      const result = await runConsoleAgenticAuditCore({ projectId: PROJECT, url: "tienda.es/p/zapatilla" }, s.deps);
      expect(result).toMatchObject({ success: false, error: "plan_required" });
      expect(s.requested).toEqual([]);
    }
  });

  it("lets the Pro trial in while it lasts", async () => {
    const s = setup({ profile: { ...PRO, stripe_subscription_id: null, trial_ends_at: "2099-01-01T00:00:00Z" } });
    const result = await runConsoleAgenticAuditCore({ projectId: PROJECT, url: "tienda.es/p/zapatilla" }, s.deps);
    expect(result).toEqual({ success: true });
  });

  it("only reviews the project's own domain or its subdomains", async () => {
    const s = setup();
    const result = await runConsoleAgenticAuditCore({ projectId: PROJECT, url: "https://otra-tienda.es/p/x" }, s.deps);
    expect(result).toMatchObject({ success: false, error: "other_domain" });
    expect(s.requested).toEqual([]);
  });

  it("stops at the daily limit before writing or fetching", async () => {
    const s = setup({ count: AGENTIC_REVIEW_DAILY_LIMIT });
    const result = await runConsoleAgenticAuditCore({ projectId: PROJECT, url: "tienda.es/p/zapatilla" }, s.deps);
    expect(result).toMatchObject({ success: false, error: "limit_reached" });
    expect(s.serviceCalls.some(([m]) => m === "insert")).toBe(false);
    expect(s.requested).toEqual([]);
  });

  it("says not available while migration 0043 is not applied", async () => {
    const s = setup({ countError: { code: "42P01" } });
    const result = await runConsoleAgenticAuditCore({ projectId: PROJECT, url: "tienda.es/p/zapatilla" }, s.deps);
    expect(result).toMatchObject({ success: false, error: "unavailable" });
    expect(s.requested).toEqual([]);
  });
});

describe("readAgenticAudits", () => {
  it("returns the last completed review, the newest attempt and the reviews of the last 24 hours", async () => {
    const calls: Call[] = [];
    const now = Date.parse("2026-10-17T10:00:00Z");
    const supabase = client(
      {
        agentic_audits: [
          { data: { url: "https://tienda.es/p/a", created_at: "2026-10-17T09:00:00Z", result: { score: 54 } }, error: null },
          {
            data: [
              { status: "failed", created_at: "2026-10-17T09:30:00Z" },
              { status: "completed", created_at: "2026-10-17T09:00:00Z" },
              { status: "completed", created_at: "2026-10-15T09:00:00Z" }
            ],
            error: null
          }
        ]
      },
      calls
    );
    const read = await readAgenticAudits(supabase as never, PROJECT, "u1", now);
    expect(read).toEqual({
      available: true,
      latest: { url: "https://tienda.es/p/a", createdAt: "2026-10-17T09:00:00Z", result: { score: 54 } },
      lastAttempt: { createdAt: "2026-10-17T09:30:00Z", status: "failed" },
      usedToday: 2
    });
    expect(calls).toContainEqual(["eq", ["owner_user_id", "u1"]]);
    expect(calls).toContainEqual(["eq", ["project_id", PROJECT]]);
  });

  it("reports unavailable while migration 0043 is not applied", async () => {
    const supabase = client({ agentic_audits: [{ data: null, error: { code: "42P01" } }, { data: null, error: null }] }, []);
    expect(await readAgenticAudits(supabase as never, PROJECT, "u1")).toEqual({ available: false });
  });
});

describe("automatic review (log §323)", () => {
  const NOW = Date.parse("2026-10-17T10:00:00Z");

  it("finds the product page by itself from the project's domain and remembers how", async () => {
    const s = setup();
    const result = await runConsoleAgenticAuditCore({ projectId: PROJECT }, s.deps);
    expect(result).toEqual({ success: true });
    expect(s.serviceCalls.find(([m]) => m === "insert")?.[1][0]).toMatchObject({ url: "https://tienda.es/" });
    const update = s.serviceCalls.find(([m]) => m === "update")?.[1][0] as { url: string; result: { found: string } };
    expect(update.url).toBe("https://tienda.es/p/zapatilla");
    expect(update.result.found).toBe("home");
  });

  it("keeps the product page of the last review and the way it was found", async () => {
    const s = setup({
      recent: [
        {
          status: "completed",
          created_at: "2026-10-14T06:00:00Z",
          result: { url: "https://tienda.es/p/zapatilla", pageKind: "product", found: "catalog" }
        }
      ]
    });
    await runConsoleAgenticAuditCore({ projectId: PROJECT }, s.deps);
    expect(s.requested[0]).toBe("https://tienda.es/p/zapatilla");
    const update = s.serviceCalls.find(([m]) => m === "update")?.[1][0] as { result: { found: string } };
    expect(update.result.found).toBe("catalog");
  });

  it("looks again from the home page when the saved product page is gone", async () => {
    const s = setup({
      pages: { "/": HOME_HTML.replace("/p/zapatilla", "/p/bota"), "/p/bota": PRODUCT_HTML },
      recent: [
        {
          status: "completed",
          created_at: "2026-10-14T06:00:00Z",
          result: { url: "https://tienda.es/p/zapatilla", pageKind: "product", found: "sitemap" }
        }
      ]
    });
    await runConsoleAgenticAuditCore({ projectId: PROJECT }, s.deps);
    const update = s.serviceCalls.find(([m]) => m === "update")?.[1][0] as { url: string; result: { found: string } };
    expect(update.url).toBe("https://tienda.es/p/bota");
    expect(update.result.found).toBe("home");
  });

  it("does not start again from the screen when a review started minutes ago", async () => {
    const s = setup({ recent: [{ status: "pending", created_at: "2026-10-17T09:55:00Z", result: null }] });
    const result = await runConsoleAgenticAuditCore({ projectId: PROJECT }, s.deps);
    expect(result).toEqual({ success: true, skipped: "recent" });
    expect(s.serviceCalls.some(([m]) => m === "insert")).toBe(false);
    expect(s.requested).toEqual([]);
  });

  it("after a scan, checks the plan with the server's ids and runs at most once in 20 hours", async () => {
    const fresh = setup({ recent: [{ status: "completed", created_at: "2026-10-17T00:00:00Z", result: null }] });
    const skipped = await runScheduledAgenticAudit({
      service: fresh.deps.service,
      projectId: PROJECT,
      ownerUserId: "u1",
      projectDomain: "tienda.es",
      audit: fresh.deps.audit,
      now: fresh.deps.now
    });
    expect(skipped).toEqual({ success: true, skipped: "recent" });
    expect(fresh.requested).toEqual([]);

    const starter = setup({ profile: { ...PRO, current_plan: "starter" } });
    const refused = await runScheduledAgenticAudit({
      service: starter.deps.service,
      projectId: PROJECT,
      ownerUserId: "u1",
      projectDomain: "tienda.es",
      audit: starter.deps.audit
    });
    expect(refused).toEqual({ success: false, error: "skipped_plan" });
    expect(starter.requested).toEqual([]);
  });

  it("starts from the screen only when there is no review, or it is stale, and never twice in a row", () => {
    const base = { available: true as const, latest: null, lastAttempt: null, usedToday: 0 };
    expect(shouldAutoReview(base, NOW)).toBe(true);
    const old = new Date(NOW - AGENTIC_SCREEN_STALE_MS - 1).toISOString();
    const latest = { url: "u", createdAt: old, result: {} as never };
    expect(shouldAutoReview({ ...base, latest, lastAttempt: { createdAt: old, status: "completed" } }, NOW)).toBe(true);
    const recent = new Date(NOW - AGENTIC_SCREEN_MIN_GAP_MS + 1000).toISOString();
    expect(shouldAutoReview({ ...base, lastAttempt: { createdAt: recent, status: "failed" } }, NOW)).toBe(false);
    expect(shouldAutoReview({ ...base, usedToday: AGENTIC_REVIEW_DAILY_LIMIT }, NOW)).toBe(false);
    const yesterday = new Date(NOW - 20 * 60 * 60 * 1000).toISOString();
    expect(
      shouldAutoReview({ ...base, latest: { ...latest, createdAt: yesterday }, lastAttempt: { createdAt: yesterday, status: "completed" } }, NOW)
    ).toBe(false);
  });
});
