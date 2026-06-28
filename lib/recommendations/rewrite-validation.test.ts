import { describe, expect, it } from "vitest";
import { validateRewriteAgainstEvidence, type RewriteValidationInput } from "./rewrite-validation";

function baseInput(overrides: Partial<RewriteValidationInput> = {}): RewriteValidationInput {
  return {
    title: "Refuerza tu contenido citable frente a Conforama",
    description: "Acme no aparece citada frente a Conforama en respuestas sobre muebles.",
    allowedCompetitors: ["Conforama"],
    allowedDomains: ["example.com"],
    trackedCompetitors: ["Conforama", "Ikea", "Maisons du Monde"],
    brandDomain: "acme.com",
    ...overrides
  };
}

describe("validateRewriteAgainstEvidence", () => {
  it("passes when the text only mentions anchored competitors and domains", () => {
    const result = validateRewriteAgainstEvidence(baseInput());
    expect(result).toEqual({ valid: true });
  });

  it("passes when the text mentions the brand's own domain", () => {
    const result = validateRewriteAgainstEvidence(
      baseInput({
        title: "Mejora la autoridad de acme.com",
        description: "Acme no aparece citada frente a Conforama en respuestas sobre muebles.",
        allowedDomains: []
      })
    );
    expect(result).toEqual({ valid: true });
  });

  it("passes when there are no competitors or domains to anchor at all", () => {
    const result = validateRewriteAgainstEvidence(
      baseInput({
        title: "Mejora la legibilidad de tus respuestas",
        description: "Añade datos estructurados para que las IA puedan citarte mejor.",
        allowedCompetitors: [],
        allowedDomains: [],
        trackedCompetitors: []
      })
    );
    expect(result).toEqual({ valid: true });
  });

  it("rejects when the text mentions a tracked competitor that isn't anchored to this recommendation", () => {
    const result = validateRewriteAgainstEvidence(
      baseInput({
        title: "Refuerza tu contenido citable frente a Ikea",
        description: "Acme no aparece citada frente a Ikea en respuestas sobre muebles.",
        allowedCompetitors: ["Conforama"]
      })
    );
    expect(result).toEqual({ valid: false, reason: "untracked_competitor_mentioned" });
  });

  it("rejects when the text mentions a domain that isn't anchored to this recommendation", () => {
    const result = validateRewriteAgainstEvidence(
      baseInput({
        title: "Aparece más en bylmo.com",
        description: "Acme no aparece citada frente a Conforama en respuestas sobre muebles."
      })
    );
    expect(result).toEqual({ valid: false, reason: "unanchored_domain_mentioned" });
  });

  it("passes a JSON-LD example that references schema.org and the brand's own domain", () => {
    const result = validateRewriteAgainstEvidence(
      baseInput({
        title: "Añade datos estructurados para tu página",
        description:
          'Ejemplo: { "@context": "https://schema.org", "@type": "FAQPage", "url": "https://acme.com/faq" }',
        allowedDomains: []
      })
    );
    expect(result).toEqual({ valid: true });
  });

  it("still rejects a third-party domain even inside a JSON-LD-looking example", () => {
    const result = validateRewriteAgainstEvidence(
      baseInput({
        title: "Añade datos estructurados",
        description: '{ "@context": "https://schema.org", "sameAs": "https://bylmo.com/acme" }'
      })
    );
    expect(result).toEqual({ valid: false, reason: "unanchored_domain_mentioned" });
  });

  it("does not false-positive on a Spanish abbreviation like 'p.ej.'", () => {
    const result = validateRewriteAgainstEvidence(
      baseInput({
        title: "Añade ejemplos concretos, p.ej. comparativas de precio",
        description: "Acme no aparece citada frente a Conforama en respuestas sobre muebles."
      })
    );
    expect(result).toEqual({ valid: true });
  });

  it("is case-insensitive and accent-insensitive when matching competitor names", () => {
    const result = validateRewriteAgainstEvidence(
      baseInput({
        title: "Compite mejor frente a IKEA",
        description: "Acme no aparece citada frente a Conforama en respuestas sobre muebles.",
        trackedCompetitors: ["Ikea"]
      })
    );
    expect(result).toEqual({ valid: false, reason: "untracked_competitor_mentioned" });
  });

  it("does not flag a competitor name that appears only as a substring of another word", () => {
    const result = validateRewriteAgainstEvidence(
      baseInput({
        title: "Mejora tu estrategia de contenidos",
        description: "Acme debería invertir en autoridad temática y datos verificables.",
        trackedCompetitors: ["IA"]
      })
    );
    expect(result).toEqual({ valid: true });
  });
});
