import { describe, expect, it } from "vitest";
import {
  CANONICAL_DEFINITION,
  CANONICAL_DEFINITION_LONG,
  SUPPORTED_ENGINES
} from "./canonical-definition";

/**
 * SEO-POS-1 Fase E, E2 (log §92). La definición canónica se repite a propósito
 * en varias superficies —página de entidad, schema, metadata— así que un error
 * aquí se multiplica en vez de quedarse en una página.
 *
 * El riesgo concreto y documentado: el consejo externo que originó esta fase
 * proponía definir GenScore como una plataforma que mide en "ChatGPT, Gemini,
 * Claude, Perplexity y Google AI Overviews", y recomendaba repetir esa frase
 * **literalmente** en home, /about, documentación y pie. Dos de esos cinco
 * motores no los ejecutamos. Aplicarlo habría sembrado el mismo reclamo falso
 * que PRICING-TRUTH-1 retiró del producto, en las superficies más vistas del
 * sitio y en la cadena que más se repite.
 */
const UNSUPPORTED_ENGINES = ["Perplexity", "AI Overviews", "Copilot", "Grok", "DeepSeek", "Meta AI"];

describe("definición canónica de GenScore", () => {
  const bothVariants = [
    ["corta", CANONICAL_DEFINITION],
    ["larga", CANONICAL_DEFINITION_LONG]
  ] as const;

  for (const [label, text] of bothVariants) {
    it(`la versión ${label} nombra los tres motores que sí ejecutamos`, () => {
      for (const engine of SUPPORTED_ENGINES) {
        expect(text, `falta ${engine}`).toContain(engine);
      }
    });

    it(`la versión ${label} no nombra ningún motor que no ejecutemos`, () => {
      const named = UNSUPPORTED_ENGINES.filter((e) => new RegExp(e, "i").test(text));
      expect(
        named,
        `La definición canónica nombra motores que GenScore no ejecuta: ${named.join(", ")}. ` +
          "Es la frase que se repite en la página de entidad, en el schema y en la metadata, " +
          "así que un motor de más aquí es un reclamo falso multiplicado por todas ellas " +
          "(docs/launch-plan.md Fase 8; precedente PRICING-TRUTH-1)."
      ).toEqual([]);
    });

    it(`la versión ${label} dice qué es GenScore antes que qué hace`, () => {
      // Una definición de entidad que empieza por el beneficio ("Mide tu
      // visibilidad…") no declara categoría, y la categoría es justo lo que
      // desambigua frente a los otros GenScore.
      expect(text.startsWith("GenScore es una plataforma de Generative Engine Optimization")).toBe(true);
    });
  }

  it("la versión larga extiende la corta, no la contradice", () => {
    expect(CANONICAL_DEFINITION_LONG.startsWith(CANONICAL_DEFINITION)).toBe(true);
  });
});
