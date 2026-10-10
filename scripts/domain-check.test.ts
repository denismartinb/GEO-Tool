import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCommentReply, normalizeDomain, parseDomains } from "./domain-check";
import type { PublicCheckOutcome } from "../lib/free-checker/run-check";

/**
 * DOMAIN-CHECK-BATCH-1. The reply text is published under the founder's name,
 * so its wording rules are pinned here; the live check itself is the public
 * checker's own `runPublicCheck`, already covered by its tests.
 */

const completed = (overrides: Partial<Extract<PublicCheckOutcome, { status: "completed" }>>): PublicCheckOutcome =>
  ({
    status: "completed",
    brand: "Acme",
    prompt: "¿Qué tienda online de bicis recomiendas en España?",
    engine: "openai",
    answer: "…",
    brandMentioned: false,
    brandPosition: null,
    otherBrands: [],
    citedDomains: [],
    citedOwnDomain: false,
    sources: [],
    ...overrides
  }) as PublicCheckOutcome;

describe("domain-check isolation", () => {
  it("never imports a Supabase client (no public_checks row, no rate limit)", () => {
    const source = readFileSync(path.resolve(__dirname, "domain-check.ts"), "utf8");
    expect(source).not.toMatch(/(from|import\()\s*["'][^"']*supabase/i);
  });
});

describe("parseDomains", () => {
  it("normalizes, dedupes and drops junk", () => {
    expect(normalizeDomain(" https://www.Acme.es/tienda?x=1 ")).toBe("acme.es");
    expect(parseDomains("acme.es, www.acme.es\nhola\notra.com;")).toEqual(["acme.es", "otra.com"]);
  });
});

describe("formatCommentReply", () => {
  it("quotes the real question and never claims a position or calls others competitors", () => {
    const reply = formatCommentReply("acme.es", completed({ brandMentioned: true, brandPosition: 1, otherBrands: ["Decathlon"] }));
    expect(reply).toContain("«¿Qué tienda online de bicis recomiendas en España?»");
    expect(reply).toContain("sí nombra a Acme");
    expect(reply).toContain("Decathlon");
    expect(reply).not.toMatch(/puesto|posición|competidor/i);
    expect(reply).toContain("una sola pregunta en un motor");
  });

  it("a non-mention lists who appeared with the not-necessarily-a-competitor caveat", () => {
    const reply = formatCommentReply("acme.es", completed({ otherBrands: ["Decathlon", "Netflix"] }));
    expect(reply).toContain("no nombra a Acme");
    expect(reply).toContain("alguna puede no ser competencia directa");
  });

  it("a failed check sends people to the public checker instead of guessing", () => {
    const reply = formatCommentReply("acme.es", { status: "failed", error: "site_unreachable" } as PublicCheckOutcome);
    expect(reply).toContain("no he podido completar");
    expect(reply).toContain("/gratis/aparece-mi-marca-en-chatgpt");
  });
});
