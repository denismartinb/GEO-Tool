import { describe, expect, it } from "vitest";
import { classifyBotAnswer, serverBlockedEngines, serverStateFor, type ServerProbeReport } from "./server-probe";

const report = (engines: ServerProbeReport["engines"], baseline: "ok" | "unknown" = "ok") => ({
  serverProbe: { measuredAt: "2026-11-02T00:00:00Z", baseline, engines }
});

describe("classifyBotAnswer (GEO-ALERTS-1, log §440)", () => {
  it("reads a refusal or a challenge as blocked, a 2xx as allowed", () => {
    expect(classifyBotAnswer({ baselineOk: true, status: 403, challenged: false })).toBe("blocked");
    expect(classifyBotAnswer({ baselineOk: true, status: 401, challenged: false })).toBe("blocked");
    expect(classifyBotAnswer({ baselineOk: true, status: 200, challenged: true })).toBe("blocked");
    expect(classifyBotAnswer({ baselineOk: true, status: 200, challenged: false })).toBe("allowed");
  });

  it("never calls a rate limit, a server error or a failed baseline a block", () => {
    expect(classifyBotAnswer({ baselineOk: true, status: 429, challenged: false })).toBe("unknown");
    expect(classifyBotAnswer({ baselineOk: true, status: 503, challenged: false })).toBe("unknown");
    expect(classifyBotAnswer({ baselineOk: true, status: null, challenged: false })).toBe("unknown");
    expect(classifyBotAnswer({ baselineOk: false, status: 403, challenged: false })).toBe("unknown");
  });
});

describe("serverBlockedEngines / serverStateFor", () => {
  it("lists the engines refused, only when the baseline answered", () => {
    const r = report({
      chatgpt: { token: "OAI-SearchBot", state: "blocked", status: 403 },
      claude: { token: "Claude-SearchBot", state: "allowed", status: 200 }
    });
    expect(serverBlockedEngines(r)).toEqual(["chatgpt"]);
    expect(serverBlockedEngines(report({ chatgpt: { token: "OAI-SearchBot", state: "blocked", status: 403 } }, "unknown"))).toEqual([]);
  });

  it("is null when never probed (old snapshots, and Gemini, which we never impersonate)", () => {
    expect(serverStateFor({}, "chatgpt")).toBeNull();
    expect(serverStateFor(report({}), "gemini")).toBeNull();
    expect(serverStateFor(report({}, "unknown"), "claude")).toBe("unknown");
  });
});
