import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CHROME-EXT-1 paso 02 (log §361): the two read-only routes the extension's
 * panel calls with the GenScore session cookie.
 */

const getUser = vi.fn();
const profileRow = vi.fn();
const projectRows = vi.fn();
const fromCalls: string[] = [];

function chain(result: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "is"]) c[m] = vi.fn(() => c);
  c.maybeSingle = vi.fn(async () => ({ data: result() }));
  c.then = (resolve: (v: unknown) => unknown) => resolve({ data: result() });
  return c;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
    from: (table: string) => {
      fromCalls.push(table);
      return chain(table === "profiles" ? profileRow : projectRows);
    }
  })
}));

const activeCookie = vi.fn<() => string | undefined>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "geo_active_project" && activeCookie() ? { value: activeCookie() } : undefined) })
}));

const loadReportInput = vi.fn();
vi.mock("@/lib/report/report-data", () => ({ loadReportInput: (...a: unknown[]) => loadReportInput(...a) }));
vi.mock("@/lib/agentic-audit/console-audit", () => ({
  readAgenticAudits: async () => ({ available: true, latest: null })
}));

import { GET as context } from "./context/route";
import { GET as project } from "./project/route";

const USER = { id: "user-1", email: "persona@ejemplo.es" };

beforeEach(() => {
  vi.clearAllMocks();
  fromCalls.length = 0;
  profileRow.mockReturnValue({ current_plan: "pro", trial_ends_at: null, stripe_subscription_id: "sub_1", email: USER.email });
  projectRows.mockReturnValue([
    { id: "p1", name: "Marca", brand: "Marca", domain: "marca.es" },
    { id: "p2", name: "Blog", brand: null, domain: "blog.marca.es" }
  ]);
  loadReportInput.mockResolvedValue(null);
  activeCookie.mockReturnValue(undefined);
});

describe("GET /api/ext/context", () => {
  it("answers 401 without a session and never caches", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await context();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(fromCalls).toEqual([]);
  });

  it("lists the account's domains with the effective plan", async () => {
    getUser.mockResolvedValue({ data: { user: USER } });
    const res = await context();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(body.plan.id).toBe("pro");
    expect(body.domains).toEqual([
      { domain: "marca.es", brand: "Marca" },
      { domain: "blog.marca.es", brand: "Blog" }
    ]);
  });

  it("opens on the project the console is pointed at, and ignores a foreign id", async () => {
    getUser.mockResolvedValue({ data: { user: USER } });
    expect((await (await context()).json()).activeDomain).toBe("marca.es");
    activeCookie.mockReturnValue("p2");
    expect((await (await context()).json()).activeDomain).toBe("blog.marca.es");
    activeCookie.mockReturnValue("someone-elses-project");
    expect((await (await context()).json()).activeDomain).toBe("marca.es");
  });

  it("reads an elapsed trial as free, without writing anything", async () => {
    getUser.mockResolvedValue({ data: { user: USER } });
    profileRow.mockReturnValue({ current_plan: "pro", trial_ends_at: "2020-01-01T00:00:00Z", stripe_subscription_id: null, email: USER.email });
    const body = await (await context()).json();
    expect(body.plan.id).toBe("free");
    expect(body.trialEndsAt).toBeNull();
  });
});

describe("GET /api/ext/project", () => {
  const req = (q: string) => new Request(`https://www.genscore.es/api/ext/project?${q}`);

  it("answers 401 without a session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await project(req("domain=marca.es"))).status).toBe(401);
  });

  it("answers 400 without a usable domain", async () => {
    getUser.mockResolvedValue({ data: { user: USER } });
    expect((await project(req(""))).status).toBe(400);
    expect((await project(req("domain=%3Cscript%3E"))).status).toBe(400);
  });

  it("answers 404 for a domain that is not one of the account's projects", async () => {
    getUser.mockResolvedValue({ data: { user: USER } });
    const res = await project(req("domain=otra.es"));
    expect(res.status).toBe(404);
    expect(loadReportInput).not.toHaveBeenCalled();
  });

  it("does not take a look-alike domain for the project", async () => {
    getUser.mockResolvedValue({ data: { user: USER } });
    expect((await project(req("domain=notmarca.es"))).status).toBe(404);
  });

  it("picks the most specific project and reads it with the user's own client", async () => {
    getUser.mockResolvedValue({ data: { user: USER } });
    const res = await project(req("domain=www.blog.marca.es&url=https://blog.marca.es/x"));
    expect(res.status).toBe(200);
    expect(loadReportInput.mock.calls[0][0].project.id).toBe("p2");
    const body = await res.json();
    expect(body).toMatchObject({ domain: "blog.marca.es", brand: "Blog", geoScore: null, citingPrompts: [] });
  });
});
