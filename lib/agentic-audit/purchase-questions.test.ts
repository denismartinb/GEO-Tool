import { describe, expect, it } from "vitest";
import {
  buildPurchaseQuestions,
  classifyPurchaseQuestion,
  marketplacesIn,
  PURCHASE_MIN_ANSWERS,
  type PurchaseAnswer
} from "./purchase-questions";

describe("classifyPurchaseQuestion", () => {
  it.each([
    ["¿Dónde me pongo implantes dentales en Madrid? Busco una clínica de confianza.", "where"],
    ["Necesito una endodoncia en Valencia, ¿a qué clínica voy?", "where"],
    ["¿Dónde comprar zapatillas de trail con envío en 24 h?", "where"],
    ["Quiero contratar una gestoría online en Madrid", "where"],
    ["¿Cuánto cuesta una campaña de Meta Ads gestionada por profesionales?", "price"],
    ["¿Qué clínicas dentales de Madrid tienen mejor relación calidad-precio?", "price"],
    ["¿Qué programa de facturación gratuito o barato me recomiendas para autónomos?", "price"],
    ["Zapatillas de trail por menos de 100 €", "price"],
    ["¿Cuál es el mejor programa de facturación para autónomos en España?", "choose"],
    ["Recomiéndame un dentista bueno en Madrid.", "choose"],
    ["Busco un ERP sencillo para una pyme española que venda productos, ¿cuál me recomiendas?", "choose"],
    ["¿Qué clínica dental de Madrid es la más recomendada para implantes de carga inmediata?", "choose"],
    ["What is the best CRM for a small agency?", "choose"]
  ])("%s → %s", (text, reason) => {
    expect(classifyPurchaseQuestion(text)).toBe(reason);
  });

  it.each([
    "¿Cómo elegir la talla de unas zapatillas de trail?",
    "¿Cómo elegir la mejor agencia de marketing digital en Benissa?",
    "¿Qué diferencias hay entre el SEO para Google y el SEO para plataformas de IA como ChatGPT?",
    "¿Qué opinan los clientes sobre las agencias de marketing digital especializadas en SEO para IA?",
    "Comparativa de programas de contabilidad en la nube para pequeñas empresas en España",
    "¿Cómo se gestiona la reputación online de una marca en el sector turístico de Alicante?",
    "¿Qué servicios de marketing online son cruciales para una PYME que busca expandirse?",
    "¿Cómo puedo mejorar el posicionamiento SEO de mi negocio local en Alicante?"
  ])("no cuenta: %s", (text) => {
    expect(classifyPurchaseQuestion(text)).toBeNull();
  });

  it("«online» alone is not a purchase word", () => {
    expect(classifyPurchaseQuestion("¿Qué aplicación de facturación online es más fácil de usar?")).toBeNull();
  });

  it("a question in the «Precio y planes» topic counts as price", () => {
    expect(classifyPurchaseQuestion("Planes de Holded para autónomos", "Precio y planes")).toBe("price");
  });
});

describe("marketplacesIn", () => {
  it("finds a marketplace by citation domain on any TLD and by name in the text", () => {
    expect(marketplacesIn(null, [{ domain: "www.amazon.es", source: "grounding" }], "monteratrail.es")).toEqual(["Amazon"]);
    expect(marketplacesIn("Puedes pedir cita en Doctoralia.", [], "clinica.es")).toEqual(["Doctoralia"]);
  });

  it("matches names as words, with their capital", () => {
    expect(marketplacesIn("Amazonas es un río; el booking del hotel", [], "x.es")).toEqual([]);
  });

  it("never counts the project's own marketplace", () => {
    expect(marketplacesIn("Cómpralo en Amazon", [{ domain: "amazon.com" }], "amazon.es")).toEqual([]);
  });
});

function answer(promptId: string, text: string, provider: string, over: Partial<PurchaseAnswer> = {}): PurchaseAnswer {
  return { promptId, promptText: text, topic: null, provider, rawText: "", brandMentioned: false, citations: [], ...over };
}

const Q1 = "¿Dónde comprar zapatillas de trail baratas?";
const Q2 = "Mejores zapatillas de trail para ultras por menos de 150 €";
const Q3 = "¿Qué zapatillas de trail me compro para empezar?";
const INFO = "¿Cómo se limpian unas zapatillas de trail?";

function scan(): PurchaseAnswer[] {
  const out: PurchaseAnswer[] = [];
  for (const [id, text] of [["q1", Q1], ["q2", Q2], ["q3", Q3], ["i", INFO]] as const) {
    out.push(
      answer(id, text, "openai", { rawText: "Lo tienes en Amazon." }),
      answer(id, text, "gemini", { brandMentioned: true, citations: [{ domain: "monteratrail.es", source: "grounding" }] }),
      answer(id, text, "claude", { brandMentioned: id === "q2" }),
      answer(id, text, "perplexity", { citations: [{ domain: "amazon.es", source: "grounding" }] })
    );
  }
  return out;
}

describe("buildPurchaseQuestions", () => {
  it("measures only purchase questions, and cited only for engines that search", () => {
    const r = buildPurchaseQuestions(scan(), { domain: "monteratrail.es", totalQuestions: 4 });
    expect(r.questions.map((q) => q.promptId)).toEqual(["q1", "q2", "q3"]);
    expect(r.enough).toBe(true);
    expect(r.figures).toEqual({ answers: 12, named: 4 / 12, cited: 3 / 9, marketplace: 6 / 12 });
    const claude = r.byEngine.find((e) => e.provider === "claude");
    expect(claude?.cited).toBeNull();
    expect(r.byEngine.map((e) => e.provider)).toEqual(["openai", "gemini", "claude", "perplexity"]);
    expect(r.topMarketplace).toBe("Amazon");
    expect(r.questions[0].byEngine.claude.cited).toBeNull();
  });

  it("an own-domain citation that is not from grounding does not count", () => {
    const r = buildPurchaseQuestions(
      [answer("q1", Q1, "gemini", { citations: [{ domain: "monteratrail.es", source: "inline" }] })],
      { domain: "monteratrail.es", totalQuestions: 1 }
    );
    expect(r.questions[0].byEngine.gemini.cited).toBe(false);
  });

  it("below the floor there are questions but no percentages", () => {
    const few = scan().filter((a) => a.promptId === "q1");
    expect(few.length).toBeLessThan(PURCHASE_MIN_ANSWERS);
    const r = buildPurchaseQuestions(few, { domain: "monteratrail.es", totalQuestions: 4 });
    expect(r.questions).toHaveLength(1);
    expect(r.enough).toBe(false);
    expect(r.figures).toBeNull();
    expect(r.byEngine).toEqual([]);
  });

  it("writes the example from the question where engines differ most", () => {
    const r = buildPurchaseQuestions(scan(), { domain: "monteratrail.es", totalQuestions: 4 });
    expect(r.example).toBe(`«${Q2}»: ChatGPT y Perplexity mandan a Amazon; Gemini cita tu web; Claude te nombra.`);
  });

  it("no example when no engine did anything", () => {
    const r = buildPurchaseQuestions([answer("q1", Q1, "claude")], { domain: "monteratrail.es", totalQuestions: 1 });
    expect(r.example).toBeNull();
  });
});
