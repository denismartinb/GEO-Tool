import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STUDY-API-1 — the study API is an authenticated surface that spends LLM
 * budget without a browser session, so its gates are pinned directly: a
 * regression here does not fail loudly, it quietly lets a caller spend.
 */

const runStudyStep = vi.fn(async (_input: unknown) => [{ engine: "openai", promptIndex: 0, sample: 1 }]);
vi.mock("@/lib/studies/study-engine", () => ({ runStudyStep: (input: unknown) => runStudyStep(input) }));

type Reservation = { allowed: true; usedToday: number; cap: number } | { allowed: false; reason: string; cap: number };
const reserveStudyApiUnits = vi.fn(
  async (_service: unknown, _input: { units: number; label: string }): Promise<Reservation> => ({
    allowed: true,
    usedToday: 1,
    cap: 600
  })
);
vi.mock("@/lib/studies/study-api-cap", () => ({
  reserveStudyApiUnits: (service: unknown, input: { units: number; label: string }) => reserveStudyApiUnits(service, input)
}));

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

const SECRET = "test-study-secret";

const validBody = {
  spec: { kind: "custom", domain: "clinica.es", prompts: ["mejor clínica estética en Madrid"], competitors: ["Otra Clínica"] },
  engines: ["openai", "gemini", "openai"],
  promptIndex: 0,
  sample: 1
};

function post(body: unknown, { auth = `Bearer ${SECRET}` }: { auth?: string | null } = {}) {
  return new Request("http://test.local/api/internal/study/step", {
    method: "POST",
    headers: auth ? { "Content-Type": "application/json", Authorization: auth } : { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function loadRoute() {
  return import("./route");
}

describe("POST /api/internal/study/step", () => {
  beforeEach(() => {
    vi.stubEnv("STUDY_API_SECRET", SECRET);
    runStudyStep.mockClear();
    reserveStudyApiUnits.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a request without the secret and spends nothing", async () => {
    const { POST } = await loadRoute();
    const response = await POST(post(validBody, { auth: null }));
    expect(response.status).toBe(401);
    expect(reserveStudyApiUnits).not.toHaveBeenCalled();
    expect(runStudyStep).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const { POST } = await loadRoute();
    const response = await POST(post(validBody, { auth: "Bearer nope" }));
    expect(response.status).toBe(401);
    expect(runStudyStep).not.toHaveBeenCalled();
  });

  it("fails closed when STUDY_API_SECRET is unset, even for a request that sends one", async () => {
    vi.stubEnv("STUDY_API_SECRET", "");
    const { POST } = await loadRoute();
    const response = await POST(post(validBody, { auth: "Bearer " }));
    expect(response.status).toBe(401);
    expect(runStudyStep).not.toHaveBeenCalled();
  });

  it("does not accept CRON_SECRET in place of its own secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const { POST } = await loadRoute();
    const response = await POST(post(validBody, { auth: "Bearer cron-secret" }));
    expect(response.status).toBe(401);
  });

  it("rejects a malformed body before reserving", async () => {
    const { POST } = await loadRoute();
    const response = await POST(post({ ...validBody, engines: ["bing"] }));
    expect(response.status).toBe(400);
    expect(reserveStudyApiUnits).not.toHaveBeenCalled();
  });

  it("stops at the daily ceiling without calling the engine", async () => {
    reserveStudyApiUnits.mockResolvedValueOnce({ allowed: false, reason: "daily_cap_reached", cap: 600 });
    const { POST } = await loadRoute();
    const response = await POST(post(validBody));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "daily_cap_reached" });
    expect(runStudyStep).not.toHaveBeenCalled();
  });

  it("reserves one unit per distinct engine, then runs the step", async () => {
    const { POST } = await loadRoute();
    const response = await POST(post(validBody));
    expect(response.status).toBe(200);
    expect(reserveStudyApiUnits).toHaveBeenCalledWith({}, { units: 2, label: "clinica.es" });
    expect(runStudyStep).toHaveBeenCalledWith(expect.objectContaining({ engines: ["openai", "gemini"], promptIndex: 0 }));
    expect(await response.json()).toEqual({ answers: [{ engine: "openai", promptIndex: 0, sample: 1 }] });
  });

  it("returns the engine's own validation code as 422", async () => {
    runStudyStep.mockRejectedValueOnce(new Error("bad_prompt_index"));
    const { POST } = await loadRoute();
    const response = await POST(post({ ...validBody, promptIndex: 7 }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "bad_prompt_index" });
  });
});
