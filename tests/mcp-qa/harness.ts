import { vi } from "vitest";
import { FIXTURES, PAYLOADS, REVIEW } from "./fixtures";

export const state: any = { fixture: "data", bearer: "none" as "none" | "ok" | "invalid", executed: [] as any[], writes: [] as any[], loads: [] as any[], exceptions: [] as any[] };
export function reset(fixture = "data", bearer: any = "ok") {
  Object.assign(state, { fixture, bearer, executed: [], writes: [], loads: [], exceptions: [] });
}
const fx = () => FIXTURES[state.fixture];
export const account = () => ({
  supabase: {}, user: { id: "u-" + state.fixture, email: `${state.fixture}@example.test` }, profile: null,
  planId: fx().plan ?? "pro", planName: fx().plan === "free" ? "Free" : "Pro", domainCap: fx().cap,
  trialEndsAt: state.fixture === "trial" ? "2026-11-08T00:00:00Z" : null
});
vi.mock("@/lib/mcp/auth", () => ({ accountFromBearer: async () => state.bearer === "ok" ? { kind: "ok", account: account() } : { kind: state.bearer } }));
vi.mock("@/lib/ext/account", () => ({ listExtProjects: async () => fx().projects }));
vi.mock("@/lib/ext/project-data", async () => {
  const real: any = await vi.importActual("@/lib/ext/project-data");
  return {
    ...real,
    loadExtProjectData: async (_a: any, { domain }: any) => {
      state.loads.push(domain);
      if (fx().load === "timeout") throw new Error("canceling statement due to statement timeout host=db.internal-secret.supabase.co");
      if (fx().load === "internal") throw new Error("TypeError: cannot read properties of undefined (reading 'score') at /var/task/secret");
      const project = real.pickProject(fx().projects, domain);
      if (!project) return { kind: "not_found" };
      const base = PAYLOADS[project.domain] ?? PAYLOADS["genscore.es"];
      return { kind: "ok", project, payload: { ...base, ...(fx().payloadOverride?.[project.domain] ?? {}) } };
    }
  };
});
vi.mock("@/lib/page-review/review", () => ({ reviewPage: async (url: string) => { state.executed.push({ tool: "reviewPage", url }); return { kind: "ok", review: REVIEW(url) }; } }));
vi.mock("@/lib/free-checker/rate-limit", async () => {
  const real: any = await vi.importActual("@/lib/free-checker/rate-limit");
  return { ...real, checkPublicCheckLimits: async () => ({ allowed: true }), hashIp: () => "h" };
});
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: (table: string) => ({
    insert: (v: any) => { state.writes.push({ table, op: "insert", v }); return { select: () => ({ single: async () => ({ data: { id: "r1" }, error: null }) }) }; },
    update: (v: any) => { state.writes.push({ table, op: "update", v }); return { eq: () => ({ then: (r: any) => r?.({}) }) }; }
  }) })
}));
vi.mock("@/lib/analytics/funnel-events", () => ({ captureFunnelEvent: vi.fn() }));
vi.mock("@/lib/observability/report-error", () => ({ reportError: (e: any, w: string) => state.exceptions.push(w) }));
vi.mock("@/lib/stripe", () => ({ getFounderOffer: async () => ({ planIds: ["starter", "pro"], remaining: 12, total: 38 }) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (f: any) => { try { f?.(); } catch {} } }));
