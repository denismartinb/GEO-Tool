import { describe, expect, it } from "vitest";
import { classifyPrompt, summarizePromptMix } from "./prompt-intent";

const ID = { brand: "GenScore", aliases: [] as string[] };

describe("classifyPrompt", () => {
  it("informativa por defecto", () => {
    expect(classifyPrompt("¿Qué es el posicionamiento en respuestas de IA?", ID)).toEqual({ intent: "informational", branded: false });
    expect(classifyPrompt("¿Cómo funciona un buscador generativo?", ID).intent).toBe("informational");
  });

  it("comercial: precio, comparación, «mejor»", () => {
    expect(classifyPrompt("¿Cuánto cuesta una herramienta de monitorización GEO?", ID).intent).toBe("commercial");
    expect(classifyPrompt("Mejores herramientas GEO para agencias", ID).intent).toBe("commercial");
    expect(classifyPrompt("Alternativas a Otterly", ID).intent).toBe("commercial");
  });

  it("local: cerca de mí, ciudad o país", () => {
    expect(classifyPrompt("¿Dónde comprar moda cerca de mí?", ID).intent).toBe("local");
    expect(classifyPrompt("Mejor agencia de marketing en Madrid", ID).intent).toBe("local");
    expect(classifyPrompt("Herramientas GEO en España", ID).intent).toBe("local");
  });

  it("branded sólo con la marca como palabra completa; tildes y mayúsculas no importan", () => {
    expect(classifyPrompt("¿Es buena genscore para una pyme?", ID).branded).toBe(true);
    expect(classifyPrompt("Opiniones sobre GenScore", ID).branded).toBe(true);
    expect(classifyPrompt("¿Qué es un score genérico?", ID).branded).toBe(false);
  });

  it("límite de palabra: «Zara» no está en «Zaragoza»", () => {
    expect(classifyPrompt("Mejores tiendas de ropa en Zaragoza", { brand: "Zara" }).branded).toBe(false);
    expect(classifyPrompt("¿Zara tiene tienda online?", { brand: "Zara" }).branded).toBe(true);
  });

  it("no junta palabras: «ElCorteIngles» pegado no equivale a «El Corte Inglés»", () => {
    expect(classifyPrompt("¿Qué opinas de ElCorteIngles?", { brand: "El Corte Inglés" }).branded).toBe(false);
    expect(classifyPrompt("¿Qué opinas de El Corte Inglés?", { brand: "El Corte Inglés" }).branded).toBe(true);
  });

  it("un alias también cuenta como marca", () => {
    expect(classifyPrompt("¿Merece la pena Club del Gourmet?", { brand: "El Corte Inglés", aliases: ["Club del Gourmet"] }).branded).toBe(true);
  });

  it("un nombre demasiado corto no se usa para decir que es branded", () => {
    expect(classifyPrompt("¿Qué es HP?", { brand: "HP" }).branded).toBe(false);
  });

  it("texto vacío no rompe", () => {
    expect(classifyPrompt("", ID)).toEqual({ intent: "informational", branded: false });
  });
});

describe("summarizePromptMix", () => {
  it("cuenta por intención y marca, ignorando filas vacías", () => {
    const mix = summarizePromptMix(
      ["¿Qué es GEO?", "Mejores herramientas GEO", "Herramientas GEO en España", "", "  "],
      ID
    );
    expect(mix).toEqual({ total: 3, informational: 1, commercial: 1, local: 1, branded: 0 });
  });
});
