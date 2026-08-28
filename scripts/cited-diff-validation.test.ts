import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyCitation, parseDomainArg, parseLimitArg, summarizeSplit } from "./cited-diff-validation";

/**
 * CITED-DIFF-1 Fase 0. Two jobs, kept apart on purpose (same split as
 * extraction-bench.test.ts):
 *
 * 1. The guards are the actual safety properties this script's Task Intake
 *    promised — read-only, and the SSRF check is imported from fetch-page.ts
 *    rather than reimplemented. They must fail loudly if a future edit
 *    breaks either, not rely on a reviewer noticing.
 * 2. Everything else is ordinary unit coverage of the pure helpers. None of
 *    it touches a network or a database — the parts that do (fetchCitation-
 *    Sample, fetchPublicPage, main) need live Supabase credentials and real
 *    internet egress this repo's test environment does not have (the sandbox
 *    proxy rejects arbitrary outbound connections — see the file header),
 *    and are exercised by running `pnpm cited-diff:validate` directly, on
 *    the founder's own machine, not by this suite.
 */

describe("cited-diff-validation guards", () => {
  const source = readFileSync(path.resolve(__dirname, "cited-diff-validation.ts"), "utf8");

  it("never calls a Supabase write method", () => {
    const forbidden = [".update(", ".insert(", ".upsert(", ".delete("];
    for (const pattern of forbidden) {
      expect(source.includes(pattern), `cited-diff-validation.ts must not call ${pattern} — this script is read-only by design`).toBe(
        false
      );
    }
  });

  it("imports the SSRF guard from fetch-page.ts instead of reimplementing it", () => {
    expect(source).toContain('from "../lib/web-audit/fetch-page"');
    expect(source).toContain("hostnameResolvesToPublicIp");
    // A reimplementation would need its own private-IP range table — if one
    // ever gets added here instead of imported, this is the tripwire.
    expect(source).not.toMatch(/10\.\d.*RFC1918|isPrivateOrReserved(IPv4|IPv6)\s*\(/);
  });

  it("imports sanitizeField instead of a local HTML stripper, and never renders raw HTML", () => {
    expect(source).toContain('from "../lib/text/sanitize"');
    expect(source).toContain("sanitizeField(");
  });

  it("never follows a redirect automatically (no redirect: \"follow\")", () => {
    expect(source).not.toContain('redirect: "follow"');
    expect(source).toContain('redirect: "manual"');
  });
});

describe("parseLimitArg", () => {
  it("reads --limit followed by a number", () => {
    expect(parseLimitArg(["--limit", "5"], 15)).toBe(5);
  });

  it("falls back to the default when --limit is absent", () => {
    expect(parseLimitArg([], 15)).toBe(15);
  });

  it("falls back to the default when the value is not a positive number", () => {
    expect(parseLimitArg(["--limit", "abc"], 15)).toBe(15);
    expect(parseLimitArg(["--limit", "0"], 15)).toBe(15);
    expect(parseLimitArg(["--limit", "-3"], 15)).toBe(15);
  });
});

describe("parseDomainArg", () => {
  it("reads --domain and lowercases it", () => {
    expect(parseDomainArg(["--domain", "Ejemplo.ES"])).toBe("ejemplo.es");
  });

  it("returns null when --domain is absent", () => {
    expect(parseDomainArg(["--limit", "5"])).toBeNull();
  });

  it("returns null when --domain has no value", () => {
    expect(parseDomainArg(["--domain"])).toBeNull();
  });
});

describe("classifyCitation", () => {
  it("returns null for a non-grounding citation", () => {
    expect(classifyCitation("openai", { source: "inline", domain: "example.com", url: "https://example.com/a" })).toBeNull();
  });

  it("returns null for a grounding citation with no domain", () => {
    expect(classifyCitation("gemini", { source: "grounding", url: "https://vertexaisearch.cloud.google.com/x" })).toBeNull();
  });

  it("marks an OpenAI-style citation (url host matches domain) as recoverable", () => {
    const result = classifyCitation("openai", {
      source: "grounding",
      domain: "www.movistar.es",
      url: "https://www.movistar.es/fibra-y-movil/",
      title: "Fibra y móvil"
    });
    expect(result).toEqual({ provider: "openai", domain: "www.movistar.es", recoverableUrl: "https://www.movistar.es/fibra-y-movil/" });
  });

  it("marks a Gemini-wrapper-only citation (url host does NOT match domain) as unrecoverable", () => {
    const result = classifyCitation("gemini", {
      source: "grounding",
      domain: "www.movistar.es",
      url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
      title: "Fibra y móvil"
    });
    expect(result).toEqual({ provider: "gemini", domain: "www.movistar.es", recoverableUrl: null });
  });

  it("treats a Gemini citation with no url at all the same as unrecoverable", () => {
    const result = classifyCitation("gemini", { source: "grounding", domain: "www.movistar.es", url: null });
    expect(result?.recoverableUrl).toBeNull();
  });
});

describe("summarizeSplit", () => {
  it("tallies recoverable vs total per provider", () => {
    const split = summarizeSplit([
      { provider: "openai", domain: "a.com", recoverableUrl: "https://a.com/1" },
      { provider: "openai", domain: "b.com", recoverableUrl: "https://b.com/1" },
      { provider: "gemini", domain: "c.com", recoverableUrl: null },
      { provider: "gemini", domain: "d.com", recoverableUrl: "https://d.com/1" }
    ]);

    expect(split).toEqual([
      { provider: "gemini", total: 2, recoverable: 1 },
      { provider: "openai", total: 2, recoverable: 2 }
    ]);
  });

  it("returns an empty array for no citations", () => {
    expect(summarizeSplit([])).toEqual([]);
  });
});
