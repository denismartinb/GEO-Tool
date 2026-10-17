import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AGENTIC_REVIEW_DAILY_LIMIT, readAgenticAudits, runConsoleAgenticAuditCore } from "./console-audit";
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

function fakeFetch(requested: string[]): AgenticFetcher {
  return async (url) => {
    requested.push(url);
    const path = new URL(url).pathname;
    if (path === "/p/zapatilla") {
      return { kind: "response", status: 200, finalUrl: url, headers: { "content-type": "text/html" }, body: PRODUCT_HTML, ms: 5 };
    }
    return { kind: "response", status: 404, finalUrl: url, headers: {}, body: "", ms: 5 };
  };
}

function setup(opts: { owns?: boolean; profile?: unknown; count?: number; countError?: unknown } = {}) {
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
        { data: { id: "row1" }, error: null },
        { error: null }
      ]
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
      audit: { fetch: fakeFetch(requested), tokenAllowed: () => true },
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
    expect(order.indexOf("fetch")).toBeGreaterThan(1);
    expect(order.slice(0, 2)).toEqual(["db", "db"]);
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
  it("returns the last completed review, the saved URL and the reviews of the last 24 hours", async () => {
    const calls: Call[] = [];
    const now = Date.parse("2026-10-17T10:00:00Z");
    const supabase = client(
      {
        agentic_audits: [
          { data: { url: "https://tienda.es/p/a", created_at: "2026-10-17T09:00:00Z", result: { score: 54 } }, error: null },
          {
            data: [
              { url: "https://tienda.es/p/b", created_at: "2026-10-17T09:30:00Z" },
              { url: "https://tienda.es/p/a", created_at: "2026-10-17T09:00:00Z" },
              { url: "https://tienda.es/p/a", created_at: "2026-10-15T09:00:00Z" }
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
      savedUrl: "https://tienda.es/p/b",
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
