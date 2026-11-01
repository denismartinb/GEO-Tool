import { describe, expect, it } from "vitest";
import { guideIndex } from "./corpus";
import { buildIndex, excerpt, searchGuides, stem, terms, type GuideChunk } from "./search";

/** MCP-GUIDES-1 (log §425): the guide search finds the article a person means, and nothing when there is none. */

const chunk = (path: string, title: string, text: string): GuideChunk => ({ path, title, section: "", text, kind: "guia", date: "2026-10-01" });

describe("terms", () => {
  it("folds accents and case, drops stopwords and plurals", () => {
    expect(terms("¿Qué FUENTES cita la IA?")).toEqual(["fuent", "cit", "ia"]);
    expect(stem("citen")).toBe(stem("cita"));
    expect(stem("agéntico".normalize("NFD").replace(/[̀-ͯ]/g, ""))).toBe(stem("agenticos"));
  });
});

describe("searchGuides on the real corpus", () => {
  const idx = guideIndex();
  const top = (q: string) => searchGuides(idx, q)[0]?.chunk.path;

  it.each([
    ["qué fuentes cita la IA", "/blog/que-fuentes-cita-la-ia"],
    ["robots.txt GPTBot bloquear", "/blog/bots-de-ia-robots-txt-cuales-dejar-entrar"],
    ["medir tráfico de ChatGPT en GA4", "/blog/como-medir-trafico-chatgpt-ga4"],
    ["qué es el GEO score", "/blog/que-es-el-geo-score"],
    ["black friday", "/blog/black-friday-agentes-de-ia"],
    ["qué clínicas dentales recomienda la IA", "/blog/que-clinicas-dentales-recomienda-la-ia"]
  ])("«%s» → %s", (q, path) => {
    expect(top(q)).toBe(path);
  });

  it("finds nothing for a question no guide answers", () => {
    expect(searchGuides(idx, "precio de la pizza")).toEqual([]);
    expect(searchGuides(idx, "¿qué?")).toEqual([]);
  });

  it("never returns more than two pieces of the same article", () => {
    const hits = searchGuides(idx, "comercio agéntico agentes compra", 6);
    const counts = new Map<string, number>();
    for (const h of hits) counts.set(h.chunk.path, (counts.get(h.chunk.path) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });
});

describe("searchGuides ranking", () => {
  it("weighs the title over a passing mention", () => {
    const idx = buildIndex([chunk("/a", "Guía de llms.txt", "Cómo escribirlo."), chunk("/b", "Otra cosa", "Hablamos de mil temas y de paso llms.txt.")]);
    expect(searchGuides(idx, "llms.txt")[0].chunk.path).toBe("/a");
  });
});

describe("excerpt", () => {
  it("cuts at a sentence end, not mid-word", () => {
    const text = `${"Primera frase con bastante texto. ".repeat(30)}`;
    const e = excerpt(text, 200);
    expect(e.length).toBeLessThanOrEqual(200);
    expect(e.endsWith(".")).toBe(true);
  });
});

describe("searchGuides: verb forms", () => {
  it("«que ChatGPT me cite» finds the guide on getting cited", () => {
    const paths = searchGuides(guideIndex(), "cómo conseguir que ChatGPT me cite").map((h) => h.chunk.path);
    expect(paths[0]).toBe("/blog/como-conseguir-que-chatgpt-te-cite");
  });
});
