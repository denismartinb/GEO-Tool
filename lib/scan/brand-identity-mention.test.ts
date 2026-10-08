import { describe, expect, it, vi } from "vitest";
import type { ExtractionOutput } from "@/lib/extraction/schema";
import { verifyExtractedMentions } from "./extraction";

vi.mock("@/lib/llm/gemini", () => ({ extractGeminiStructuredData: vi.fn() }));
vi.mock("@/lib/llm/claude", () => ({ extractClaudeStructuredData: vi.fn() }));
vi.mock("@/lib/llm/openai", () => ({ extractOpenAIStructuredData: vi.fn() }));
vi.mock("@/lib/scan/citation-resolution", () => ({ resolveGroundingRedirects: vi.fn().mockResolvedValue(new Map()) }));

/**
 * ONBOARDING-IDENTITY-1 — el caso elcorteingles.es.
 *
 * El asistente derivaba la marca del dominio («Elcorteingles») y nadie la
 * confirmaba. Dos respuestas de Claude decían «El Corte Inglés» y el escaneo
 * marcó cero menciones. La causa NO es el verificador: es el nombre guardado.
 * `namesPlausiblyMatch` normaliza a «elcorteingles» y a «el corte ingles», y
 * ninguno contiene al otro por el espacio.
 *
 * Estos tests fijan esa causa y la corrección buscada (marca comercial
 * confirmada o alias confirmado), SIN cambiar cómo compara el verificador:
 * quitar espacios para que «elcorteingles» case aceptaría subcadenas
 * arbitrarias de cualquier texto.
 *
 * Sólo se prueba la causa observada, no las otras respuestas de ese escaneo.
 */

function data(display: string | null, mentioned = true): ExtractionOutput {
  return {
    brand: { mentioned, display_name_found: display, evidence: [], position: mentioned ? 1 : null },
    competitors: [],
    citations: [],
    sentiment: "neutral",
    sentiment_drivers: [],
    other_brands_mentioned: [],
    summary: "",
    confidence: "high",
    notes: [],
    // fixture mínimo: el resto del esquema no interviene en la verificación
  } as unknown as ExtractionOutput;
}

const RAW_WITH_NAME =
  "Para comprar moda y electrónica con garantía, El Corte Inglés es una opción fiable en España, con envío en 24 horas.";

describe("identidad de marca · el caso elcorteingles.es", () => {
  it("la marca derivada del dominio no casa con «El Corte Inglés» (la causa observada)", () => {
    const out = verifyExtractedMentions(data("El Corte Inglés"), RAW_WITH_NAME, "Elcorteingles");
    expect(out.brand.mentioned).toBe(false);
  });

  it("con la marca comercial confirmada, la misma respuesta cuenta", () => {
    const out = verifyExtractedMentions(data("El Corte Inglés"), RAW_WITH_NAME, "El Corte Inglés");
    expect(out.brand.mentioned).toBe(true);
    expect(out.brand.position).toBe(1);
  });

  it("con la marca derivada y un alias confirmado, la misma respuesta cuenta", () => {
    const out = verifyExtractedMentions(data("El Corte Inglés"), RAW_WITH_NAME, "Elcorteingles", ["El Corte Inglés"]);
    expect(out.brand.mentioned).toBe(true);
  });

  it("conserva tildes y espacios: «ElCorteIngles» pegado no se acepta si el texto no lo escribe así", () => {
    const out = verifyExtractedMentions(data("ElCorteIngles"), RAW_WITH_NAME, "El Corte Inglés");
    expect(out.brand.mentioned).toBe(false);
  });
});

describe("identidad de marca · lo que no debe cambiar", () => {
  it("raw sin la marca: un alias confirmado no fabrica una mención", () => {
    const raw = "Para comprar electrónica, Amazon y MediaMarkt son opciones habituales.";
    const out = verifyExtractedMentions(data("El Corte Inglés"), raw, "Elcorteingles", ["El Corte Inglés"]);
    expect(out.brand.mentioned).toBe(false);
    expect(out.brand.display_name_found).toBeNull();
  });

  it("extracción errónea: un nombre genérico reclamado no cuenta como la marca", () => {
    const raw = "Tu marca debería aparecer en esta lista de tiendas online.";
    const out = verifyExtractedMentions(data("tu marca"), raw, "El Corte Inglés", ["El Corte Inglés"]);
    expect(out.brand.mentioned).toBe(false);
  });

  it("no mencionada se queda como no mencionada", () => {
    const out = verifyExtractedMentions(data(null, false), RAW_WITH_NAME, "El Corte Inglés");
    expect(out.brand.mentioned).toBe(false);
  });

  // Alcance preparado, NO resuelto aquí (ver log §237): `namesPlausiblyMatch`
  // acepta subcadena en ambos sentidos sin límite de palabra, así que la marca
  // «Zara» casaría con «Zaragoza» si el modelo lo reclamara y el texto lo
  // contuviera. Cambiarlo toca `lib/scan/extraction.ts`, que mueve la puntuación
  // de todos los proyectos: va en su propia rama, con el Director.
  it.todo("límite de palabra: «Zara» no casa con «Zaragoza» (rama de matching aparte)");
});
