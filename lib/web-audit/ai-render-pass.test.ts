import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { nextPageToMeasure, runAiRenderPass } from "./ai-render-pass";
import type { PageAuditEntry } from "./technical-audit";

const NOW = Date.parse("2026-11-02T10:00:00.000Z");
const body = (extra = "") => `<html><body><main><p>${Array.from({ length: 60 }, (_, i) => `cafe${i}`).join(" ")}</p>${extra}</main></body></html>`;

const entry = (url: string, contextLabel = "", more: Partial<PageAuditEntry> = {}): PageAuditEntry =>
  ({ url, contextLabel, status: "analyzed", check: null, fetchMs: 1, htmlBytes: 1, ...more }) as PageAuditEntry;

function fakeService(snapshots: Array<{ id: string; project_id: string; pages: PageAuditEntry[]; created_at: string }>, projects: Array<{ id: string; domain: string }>) {
  const writes: Array<{ id: string; pages: PageAuditEntry[] }> = [];
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "gte", "order", "limit", "in", "eq"]) c[m] = () => c;
    (c as { then: unknown }).then = (res: (v: unknown) => unknown) => res(result);
    return c;
  };
  const service = {
    from(table: string) {
      if (table === "projects") return chain({ data: projects, error: null });
      return {
        ...chain({ data: snapshots, error: null }),
        update(v: { pages: PageAuditEntry[] }) {
          const c: Record<string, unknown> = {};
          let id = "";
          c.eq = (col: string, val: string) => {
            if (col === "id") id = val;
            return c;
          };
          (c as { then: unknown }).then = (res: (v: unknown) => unknown) => {
            writes.push({ id, pages: structuredClone(v.pages) });
            return res({ error: null });
          };
          return c;
        }
      };
    }
  };
  return { service: service as never, writes };
}

describe("nextPageToMeasure", () => {
  it("takes the home page first and skips fresh measurements and failed fetches", () => {
    const pages = [
      entry("https://acme.com/a"),
      entry("https://acme.com/", "portada"),
      entry("https://acme.com/b", "", { status: "skipped_offsite" })
    ];
    expect(nextPageToMeasure(pages, new Date(NOW))).toBe(1);
    pages[1] = { ...pages[1], render: { state: "unmeasured", measuredAt: new Date(NOW - 1000).toISOString() } };
    expect(nextPageToMeasure(pages, new Date(NOW))).toBe(0);
  });
});

describe("runAiRenderPass (AI-READ-2, log §451)", () => {
  it("does nothing without Cloudflare credentials", async () => {
    const { service } = fakeService([], []);
    expect(await runAiRenderPass({ service, deadlineAt: NOW + 60_000, now: () => NOW })).toEqual({ skipped: "not_configured", measured: 0 });
  });

  it("measures pages, writes each into the newest snapshot and keeps the previous figure", async () => {
    const { service, writes } = fakeService(
      [
        { id: "new", project_id: "p1", created_at: "2026-11-02T09:00:00Z", pages: [entry("https://acme.com/", "portada", { render: { state: "ok", measuredAt: "2026-10-20T00:00:00Z", pct: 70, words: 1, kinds: {}, samples: [] } })] },
        { id: "old", project_id: "p1", created_at: "2026-11-01T09:00:00Z", pages: [entry("https://acme.com/")] }
      ],
      [{ id: "p1", domain: "acme.com" }]
    );
    let t = NOW;
    const r = await runAiRenderPass({
      service,
      deadlineAt: NOW + 50_000,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      fetchRaw: async () => body(),
      render: async () => ({ kind: "ok", html: body("<p>1 kg · 24,90 €</p>") })
    });
    expect(r.measured).toBe(1);
    expect(writes.map((w) => w.id)).toEqual(["new"]);
    expect(writes[0].pages[0].render).toMatchObject({ state: "ok", prevPct: 70 });
  });

  it("stops on quota without writing, and leaves the page eligible", async () => {
    const { service, writes } = fakeService(
      [{ id: "s", project_id: "p1", created_at: "2026-11-02T09:00:00Z", pages: [entry("https://acme.com/")] }],
      [{ id: "p1", domain: "acme.com" }]
    );
    const r = await runAiRenderPass({ service, deadlineAt: NOW + 50_000, now: () => NOW, fetchRaw: async () => body(), render: async () => ({ kind: "quota" }) });
    expect(r).toEqual({ measured: 0, agentic: 0, stopped: "quota" });
    expect(writes).toEqual([]);
  });

  it("never starts a page whose worst case does not fit, and never measures another domain", async () => {
    const { service, writes } = fakeService(
      [{ id: "s", project_id: "p1", created_at: "2026-11-02T09:00:00Z", pages: [entry("https://evil.com/")] }],
      [{ id: "p1", domain: "acme.com" }]
    );
    const render = vi.fn();
    expect(await runAiRenderPass({ service, deadlineAt: NOW + 5_000, now: () => NOW, render, fetchRaw: async () => body() })).toEqual({ measured: 0, agentic: 0, stopped: "budget" });
    await runAiRenderPass({ service, deadlineAt: NOW + 50_000, now: () => NOW, render, fetchRaw: async () => body() });
    expect(render).not.toHaveBeenCalled();
    expect(writes[0].pages[0].render).toMatchObject({ state: "unmeasured" });
  });

  it("spaces browser calls by the free plan's gap", async () => {
    const { service } = fakeService(
      [{ id: "s", project_id: "p1", created_at: "2026-11-02T09:00:00Z", pages: [entry("https://acme.com/"), entry("https://acme.com/b")] }],
      [{ id: "p1", domain: "acme.com" }]
    );
    let t = NOW;
    const calls: number[] = [];
    await runAiRenderPass({
      service,
      deadlineAt: NOW + 59_000,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      fetchRaw: async () => body(),
      render: async () => {
        calls.push(t);
        t += 2_000;
        return { kind: "ok", html: body() };
      }
    });
    expect(calls.length).toBe(2);
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(10_000);
  });
});

describe("agentic product pages (AGENTS-BROWSER-1, log §453)", () => {
  const result = { url: "https://acme.com/p/brisa", found: "catalog", pageRead: true } as never;
  const page = `<html><body><main><h1>Brisa</h1><p>${"Chaqueta ligera impermeable. ".repeat(12)}</p><p>149,00 €</p><button>Añadir a la cesta</button></main></body></html>`;

  it("renders the chosen product page before the audit pages and stores what it found", async () => {
    const { service } = fakeService([], []);
    const saved: unknown[] = [];
    const calls: string[] = [];
    let t = NOW;
    const r = await runAiRenderPass({
      service,
      deadlineAt: NOW + 50_000,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      render: async (url) => {
        calls.push(url);
        return { kind: "ok", html: page };
      },
      agentic: {
        load: async () => [{ id: "a1", projectId: "p1", url: "https://acme.com/p/brisa", result }],
        save: async (_t, read) => {
          saved.push(read);
          return true;
        }
      }
    });
    expect(calls).toEqual(["https://acme.com/p/brisa"]);
    expect(r).toMatchObject({ agentic: 1 });
    expect(saved[0]).toMatchObject({ state: "ok", price: { state: "exact" }, buy: { state: "named" } });
  });

  it("carries a fresh read forward without rendering, and stops on quota", async () => {
    const { service } = fakeService([], []);
    const carry = { state: "blocked" as const, measuredAt: new Date(NOW).toISOString() };
    const saved: unknown[] = [];
    const r = await runAiRenderPass({
      service,
      deadlineAt: NOW + 50_000,
      now: () => NOW,
      render: async () => ({ kind: "quota" }),
      agentic: {
        load: async () => [
          { id: "a1", projectId: "p1", url: "https://acme.com/p", result, carry },
          { id: "a2", projectId: "p2", url: "https://b.com/p", result }
        ],
        save: async (_t, read) => {
          saved.push(read);
          return true;
        }
      }
    });
    expect(saved).toEqual([carry]);
    expect(r).toEqual({ measured: 0, agentic: 1, stopped: "quota" });
  });
});
