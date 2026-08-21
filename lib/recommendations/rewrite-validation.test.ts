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
    expect(result).toEqual({ valid: false, reason: "untracked_competitor_mentioned", offending: "Ikea" });
  });

  it("rejects when the text mentions a domain that isn't anchored to this recommendation", () => {
    const result = validateRewriteAgainstEvidence(
      baseInput({
        title: "Aparece más en bylmo.com",
        description: "Acme no aparece citada frente a Conforama en respuestas sobre muebles."
      })
    );
    // The offending token is logged, never shown: it is what turns "the rewrite
    // named something unanchored" into a diagnosis.
    expect(result).toEqual({ valid: false, reason: "unanchored_domain_mentioned", offending: "bylmo.com" });
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
    expect(result).toEqual({ valid: false, reason: "unanchored_domain_mentioned", offending: "bylmo.com" });
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
    expect(result).toEqual({ valid: false, reason: "untracked_competitor_mentioned", offending: "Ikea" });
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

describe("comparación contra competidores nombrados (Fase C, log §128)", () => {
  const base = {
    title: "Refuerza tu contenido de fibra",
    allowedCompetitors: ["Jazztel", "Vodafone España", "MásMóvil", "Orange España", "Digi"],
    allowedDomains: [],
    trackedCompetitors: ["Jazztel", "Vodafone España", "MásMóvil", "Orange España", "Digi"],
    brandDomain: "movistar.es"
  };

  /**
   * No es un ejemplo inventado: es la frase que el producto generó de verdad
   * para el proyecto Movistar el 2026-08-21, dentro de un artefacto que la
   * Fase A ya devolvía entero y bien formado (log §128).
   */
  const FRASE_DEL_INCIDENTE =
    "A diferencia de operadores como Jazztel, Vodafone España, MásMóvil, Orange España o Digi, " +
    "Movistar mantiene un alto estándar de calidad y cobertura, incluso en sus opciones de bajo coste.";

  it("rechaza la frase real que se generó para Movistar", () => {
    const result = validateRewriteAgainstEvidence({
      ...base,
      description: FRASE_DEL_INCIDENTE,
      segments: [base.title, FRASE_DEL_INCIDENTE]
    });

    expect(result.valid).toBe(false);
    expect(result.valid === false && result.reason).toBe("comparative_claim_against_competitor");
  });

  it("dice QUÉ marcador lo tumbó, no sólo que hubo uno", () => {
    // Los tres motivos del guardián nombran su término: sin él, diagnosticar un
    // rechazo exigía leer los logs de producción (log §131, §134).
    const frase = "Nuestra red es superior a la de Digi en las principales ciudades.";
    const result = validateRewriteAgainstEvidence({ ...base, description: frase, segments: [frase] });

    expect(result).toEqual({
      valid: false,
      reason: "comparative_claim_against_competitor",
      offending: "superior"
    });
  });

  it("rechaza un superlativo directo junto al nombre", () => {
    const frase = "Nuestra red es superior a la de Digi en las principales ciudades.";
    const result = validateRewriteAgainstEvidence({ ...base, description: frase, segments: [frase] });

    expect(result.valid === false && result.reason).toBe("comparative_claim_against_competitor");
  });

  it("NO rechaza nombrar a un competidor sin juzgarlo — es media plataforma", () => {
    const pasos = [
      "Compara tu página con la de Digi en estas consultas: qué responde antes, con qué datos y en qué formato.",
      "Añade Vodafone España en la pestaña Competidores. El próximo escaneo ya la medirá.",
      "Monta una tabla con criterios claros e incluye a Jazztel y a MásMóvil."
    ];
    const result = validateRewriteAgainstEvidence({
      ...base,
      description: pasos.join(" "),
      segments: [base.title, ...pasos]
    });

    expect(result.valid).toBe(true);
  });

  it("NO rechaza el juicio de valor cuando no hay competidor en esa frase", () => {
    const pasos = [
      "Digi aparece antes que tú en 10 respuestas donde sí te mencionan.",
      "Publica la mejor respuesta posible a esa consulta, en las dos primeras frases."
    ];
    const result = validateRewriteAgainstEvidence({
      ...base,
      description: pasos.join(" "),
      segments: [base.title, ...pasos]
    });

    expect(result.valid).toBe(true);
  });

  it("el troceado por frases evita el falso positivo entre pasos distintos", () => {
    // Sin `segments`, estos dos pasos se unirían y el nombre acabaría en la
    // misma frase que el juicio. Con piezas, cada uno se juzga por separado.
    const pasos = ["Revisa qué publica Digi", "Elige la mejor de tus páginas y refuérzala"];
    const result = validateRewriteAgainstEvidence({
      ...base,
      description: pasos.join(" "),
      segments: [base.title, ...pasos]
    });

    expect(result.valid).toBe(true);
  });

  it("sin `segments` sigue validando, con el comportamiento de los llamadores viejos", () => {
    const result = validateRewriteAgainstEvidence({ ...base, description: FRASE_DEL_INCIDENTE });

    expect(result.valid === false && result.reason).toBe("comparative_claim_against_competitor");
  });
});
