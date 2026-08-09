import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email/transactional", () => ({
  isOpsAlertConfigured: vi.fn(() => true),
  sendLlmIncidentAlertEmail: vi.fn(async () => undefined)
}));

import * as emailModule from "@/lib/email/transactional";
import {
  __resetLlmIncidentDedupeForTests,
  isDedupeWindowOpen,
  llmIncidentDedupeKey,
  reportLlmIncident,
  shouldAlertOnLlmIncident
} from "@/lib/llm/llm-incident";
import { ExtractionError } from "@/lib/llm/extraction-errors";

const mockedSend = vi.mocked(emailModule.sendLlmIncidentAlertEmail);
const mockedConfigured = vi.mocked(emailModule.isOpsAlertConfigured);

beforeEach(() => {
  vi.clearAllMocks();
  mockedConfigured.mockReturnValue(true);
  __resetLlmIncidentDedupeForTests();
});

describe("shouldAlertOnLlmIncident", () => {
  it("alerts on the two categories only the operator can clear", () => {
    expect(shouldAlertOnLlmIncident("quota")).toBe(true);
    expect(shouldAlertOnLlmIncident("config")).toBe(true);
  });

  it("stays quiet about model noise that the next attempt usually fixes", () => {
    // Same threshold as the scan-health alert, and for the same reason: an
    // alert that fires on noise is one that gets filtered away.
    for (const category of ["empty", "invalid_json", "schema", "timeout", "http", "unknown"] as const) {
      expect(shouldAlertOnLlmIncident(category)).toBe(false);
    }
  });
});

describe("llmIncidentDedupeKey", () => {
  it("keys on surface, provider and category", () => {
    expect(llmIncidentDedupeKey({ surface: "web_audit", provider: "gemini", category: "quota" })).toBe(
      "web_audit|gemini|quota"
    );
  });

  it("collapses the same incident across different domains", () => {
    // One exhausted account is ONE incident even when it breaks the wizard for
    // five domains in a row — the key deliberately carries no project/domain.
    const a = llmIncidentDedupeKey({ surface: "onboarding_suggestions", provider: "gemini", category: "quota" });
    const b = llmIncidentDedupeKey({ surface: "onboarding_suggestions", provider: "gemini", category: "quota" });
    expect(a).toBe(b);
  });

  it("keeps different surfaces apart", () => {
    expect(llmIncidentDedupeKey({ surface: "web_audit", provider: "gemini", category: "quota" })).not.toBe(
      llmIncidentDedupeKey({ surface: "onboarding_suggestions", provider: "gemini", category: "quota" })
    );
  });
});

describe("isDedupeWindowOpen", () => {
  it("is open when nothing has been sent yet", () => {
    expect(isDedupeWindowOpen(null, 1_000, 500)).toBe(true);
  });

  it("is closed inside the window", () => {
    expect(isDedupeWindowOpen(1_000, 1_400, 500)).toBe(false);
  });

  it("reopens exactly at the boundary", () => {
    expect(isDedupeWindowOpen(1_000, 1_500, 500)).toBe(true);
  });
});

describe("reportLlmIncident", () => {
  it("emails the operator for an actionable failure", async () => {
    await reportLlmIncident({
      surface: "onboarding_suggestions",
      provider: "gemini",
      error: new ExtractionError("quota", "Gemini API quota or rate limit reached."),
      domain: "hostinger.com"
    });

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend.mock.calls[0][0]).toMatchObject({ provider: "gemini", category: "quota", domain: "hostinger.com" });
  });

  it("sends nothing for model noise", async () => {
    await reportLlmIncident({
      surface: "onboarding_suggestions",
      provider: "gemini",
      error: new ExtractionError("invalid_json", "Gemini suggestion returned invalid JSON.")
    });
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("sends nothing for an uncategorized throw", async () => {
    await reportLlmIncident({ surface: "web_audit", provider: "gemini", error: new Error("boom") });
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("dedupes a repeat of the same incident", async () => {
    const incident = {
      surface: "onboarding_suggestions" as const,
      provider: "gemini",
      error: new ExtractionError("quota", "Gemini API quota or rate limit reached.")
    };

    await reportLlmIncident({ ...incident, domain: "amazon.es" });
    await reportLlmIncident({ ...incident, domain: "google.com" });
    await reportLlmIncident({ ...incident, domain: "hostinger.com" });

    expect(mockedSend).toHaveBeenCalledTimes(1);
  });

  it("still reports a different surface hitting the same quota", async () => {
    const error = new ExtractionError("quota", "Gemini API quota or rate limit reached.");
    await reportLlmIncident({ surface: "onboarding_suggestions", provider: "gemini", error });
    await reportLlmIncident({ surface: "web_audit", provider: "gemini", error });
    expect(mockedSend).toHaveBeenCalledTimes(2);
  });

  it("does not mark the incident as sent when the send throws, so the next one can still get through", async () => {
    // A duplicate email beats a swallowed incident — same rule as
    // checkAndSendScanHealthAlert, which writes its dedupe marker only after
    // a successful send.
    mockedSend.mockRejectedValueOnce(new Error("resend down"));
    const incident = {
      surface: "recommendations" as const,
      provider: "gemini",
      error: new ExtractionError("quota", "Gemini API quota or rate limit reached.")
    };

    await expect(reportLlmIncident(incident)).resolves.toBeUndefined();
    await reportLlmIncident(incident);

    expect(mockedSend).toHaveBeenCalledTimes(2);
  });

  it("never throws into the caller — it runs inside a catch whose job is degrading gracefully", async () => {
    mockedConfigured.mockImplementation(() => {
      throw new Error("env read blew up");
    });

    await expect(
      reportLlmIncident({
        surface: "web_audit",
        provider: "gemini",
        error: new ExtractionError("quota", "Gemini API quota or rate limit reached.")
      })
    ).resolves.toBeUndefined();
  });

  it("does not attempt a send when the alert channel cannot deliver", async () => {
    mockedConfigured.mockReturnValue(false);
    await reportLlmIncident({
      surface: "web_audit",
      provider: "gemini",
      error: new ExtractionError("config", "Missing GEMINI_API_KEY")
    });
    expect(mockedSend).not.toHaveBeenCalled();
  });
});
