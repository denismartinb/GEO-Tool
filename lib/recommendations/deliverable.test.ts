import { describe, expect, it } from "vitest";

import {
  CONTROL_LABEL,
  classifySolutionReadiness,
  deliverableForType,
  readinessLabel
} from "./deliverable";
import { KNOWN_RECOMMENDATION_TYPES } from "./recommendation-engine";

describe("deliverableForType", () => {
  it("da un entregable concreto y un control declarado a TODOS los tipos que el motor emite", () => {
    // El invariante que impide la deriva: una regla nueva sin entrada aquí
    // deja el botón prometiendo "propuesta con IA" genérica otra vez, que es
    // justo lo que esta fase quita.
    for (const type of KNOWN_RECOMMENDATION_TYPES) {
      const spec = deliverableForType(type);
      expect(spec.cta, `falta CTA para ${type}`).not.toBe("Generar propuesta con IA");
      expect(spec.control, `falta control para ${type}`).not.toBeNull();
      expect(CONTROL_LABEL[spec.control!]).toBeTruthy();
    }
  });

  it("nombra el artefacto, no la mecánica", () => {
    expect(deliverableForType("close_competitor_gap").cta).toBe("Generar comparativa");
    expect(deliverableForType("create_faq_section").cta).toBe("Generar FAQ");
    expect(deliverableForType("pursue_media_sources").cta).toBe("Generar pitch");
  });

  it("separa lo que el cliente controla de lo que depende de terceros", () => {
    expect(deliverableForType("add_citation_block").control).toBe("own_site");
    expect(deliverableForType("pursue_community_sources").control).toBe("third_party");
    expect(deliverableForType("track_emerging_competitor").control).toBe("in_app");
  });

  it("degrada sin afirmar nada para un tipo desconocido", () => {
    const spec = deliverableForType("some_future_rule");
    expect(spec.cta).toBe("Generar propuesta con IA");
    // No decir nada es la dirección de fallo correcta: un chip "En tu web"
    // sobre algo sin clasificar sería una afirmación inventada.
    expect(spec.control).toBeNull();
  });
});

describe("classifySolutionReadiness", () => {
  const solution = (examples: string[], steps: string[] = []) => ({
    steps,
    examples: examples.map((content) => ({ content }))
  });

  it("marca listo lo que no tiene ningún hueco", () => {
    expect(classifySolutionReadiness(solution(["Acme fabrica sofás cama con garantía de 5 años."]))).toEqual({
      kind: "ready"
    });
  });

  it("cuenta los huecos del artefacto", () => {
    expect(classifySolutionReadiness(solution(["Precio desde [tu dato aquí] con [tu dato aquí] de garantía."]))).toEqual(
      { kind: "needs_data", blanks: 2 }
    );
  });

  it("cuenta también los huecos de los pasos, que son datos igual de pendientes", () => {
    expect(classifySolutionReadiness(solution(["Texto limpio."], ["Publica el precio [tu dato aquí]."]))).toEqual({
      kind: "needs_data",
      blanks: 1
    });
  });

  it("NO cuenta los corchetes de un JSON-LD como datos que faltan", () => {
    // La regresión que hace falta blindar: el artefacto más pegable que
    // generamos es un JSON-LD, y sus arrays llevan corchetes por todas partes.
    const jsonLd = `{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "¿Cuánto cuesta?" }
  ],
  "sameAs": ["https://ejemplo.es/a", "https://ejemplo.es/b"]
}`;
    expect(classifySolutionReadiness(solution([jsonLd]))).toEqual({ kind: "ready" });
  });

  it("distingue un hueco real dentro de un JSON-LD", () => {
    const jsonLd = `{ "@type": "Product", "offers": [{ "price": "[tu dato aquí]" }] }`;
    expect(classifySolutionReadiness(solution([jsonLd]))).toEqual({ kind: "needs_data", blanks: 1 });
  });

  it("cuenta el placeholder de URL de la convención del prompt", () => {
    expect(classifySolutionReadiness(solution(["Enlaza a https://[tu-dominio]/pagina desde el pie."]))).toEqual({
      kind: "needs_data",
      blanks: 1
    });
  });

  it("no cuenta arrays numéricos ni corchetes vacíos", () => {
    expect(classifySolutionReadiness(solution(["Valores [1,2] y lista vacía []."]))).toEqual({ kind: "ready" });
  });

  it("tolera una solución sin artefactos", () => {
    expect(classifySolutionReadiness(solution([]))).toEqual({ kind: "ready" });
  });
});

describe("readinessLabel", () => {
  it("concuerda en singular y plural", () => {
    expect(readinessLabel({ kind: "ready" })).toBe("Listo para copiar");
    expect(readinessLabel({ kind: "needs_data", blanks: 1 })).toBe("1 hueco por rellenar");
    expect(readinessLabel({ kind: "needs_data", blanks: 3 })).toBe("3 huecos por rellenar");
  });
});
