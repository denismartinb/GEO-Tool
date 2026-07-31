import { describe, expect, it } from "vitest";
import {
  normalizeMarkdownSource,
  parseMarkdownBlocks,
  tokenizeInline,
} from "@/lib/markdown/inline-markdown";

/**
 * The founder's real ChatGPT answer (project "Alberdiderma"), reproduced
 * verbatim from the reported screenshot: OpenAI's web_search wraps each long
 * Maps citation so the `[label]` and the `(url)` land on separate lines. This
 * exact shape rendered as raw brackets + full URL before the fix.
 */
const OPENAI_WRAPPED_LINKS = `Para tratar el acné severo en Madrid, puedes considerar las siguientes clínicas dermatológicas especializadas:

[Clínica Dermatológica Madrid De Felipe]
(https://www.google.com/maps/search/Cl%C3%ADnica+Dermatol%C3%B3gica+Madrid+De+Felipe%2C+Madrid%2C+Espa%C3%B1a?utm_source=openai)
_Madrid, España_
Con más de 30 años de experiencia, ofrecen tratamientos integrales para el acné.

[Alberdiderma]
(https://www.google.com/maps/search/Alberdiderma%2C+Madrid%2C+Espa%C3%B1a?utm_source=openai)
_Madrid, España_
Centro dermatológico de referencia con más de 20 años de experiencia.`;

function linksOf(text: string) {
  return parseMarkdownBlocks(text)
    .flatMap((b) => tokenizeInline(b.lines.join("\n")))
    .filter((t) => t.type === "link");
}

describe("tokenizeInline — links", () => {
  it("parses a plain markdown link", () => {
    expect(tokenizeInline("Ver [Alberdiderma](https://alberdiderma.com) aquí")).toEqual([
      { type: "text", value: "Ver " },
      { type: "link", label: "Alberdiderma", url: "https://alberdiderma.com" },
      { type: "text", value: " aquí" },
    ]);
  });

  it("parses a link with a space between ] and (", () => {
    expect(tokenizeInline("[Alberdiderma] (https://alberdiderma.com)")).toEqual([
      { type: "link", label: "Alberdiderma", url: "https://alberdiderma.com" },
    ]);
  });

  it("parses a link split across a line break between ] and (", () => {
    expect(tokenizeInline("[Alberdiderma]\n(https://alberdiderma.com)")).toEqual([
      { type: "link", label: "Alberdiderma", url: "https://alberdiderma.com" },
    ]);
  });

  it("never leaves the raw URL as visible text once the link is parsed", () => {
    const tokens = tokenizeInline("[Alberdiderma]\n(https://www.google.com/maps/search/x?utm_source=openai)");
    const visibleText = tokens
      .filter((t) => t.type === "text")
      .map((t) => (t.type === "text" ? t.value : ""))
      .join("");
    expect(visibleText).not.toContain("google.com");
    expect(visibleText).not.toContain("[");
  });
});

describe("tokenizeInline — emphasis", () => {
  it("parses bold", () => {
    expect(tokenizeInline("**Aspectos a tener en cuenta:**")).toEqual([
      { type: "bold", value: "Aspectos a tener en cuenta:" },
    ]);
  });

  it("parses italic at a word boundary", () => {
    expect(tokenizeInline("_Madrid, España_")).toEqual([
      { type: "italic", value: "Madrid, España" },
    ]);
  });

  it("does not treat underscores inside a bare URL as italic", () => {
    const tokens = tokenizeInline("https://x.com/a?utm_source=openai&utm_medium=chat");
    expect(tokens.every((t) => t.type === "text")).toBe(true);
  });

  it("does not open an italic run on a mid-word underscore", () => {
    const tokens = tokenizeInline("el campo utm_source y el campo utm_medium");
    expect(tokens.every((t) => t.type === "text")).toBe(true);
  });
});

describe("normalizeMarkdownSource", () => {
  it("rejoins a link whose label and target are on separate lines", () => {
    expect(normalizeMarkdownSource("[A]\n(https://a.com)")).toBe("[A](https://a.com)");
  });

  it("rejoins even when a blank line separates label and target", () => {
    expect(normalizeMarkdownSource("[A]\n\n(https://a.com)")).toBe("[A](https://a.com)");
  });

  it("leaves a bracketed phrase followed by a plain parenthetical untouched", () => {
    const text = "Un array [1, 2]\n\n(y un comentario aparte)";
    expect(normalizeMarkdownSource(text)).toBe(text);
  });
});

describe("parseMarkdownBlocks", () => {
  it("recovers every wrapped link in the founder's reported ChatGPT answer", () => {
    const links = linksOf(OPENAI_WRAPPED_LINKS);
    expect(links.map((l) => (l.type === "link" ? l.label : ""))).toEqual([
      "Clínica Dermatológica Madrid De Felipe",
      "Alberdiderma",
    ]);
  });

  it("leaves no raw google.com URL or bracket visible in that answer", () => {
    const visibleText = parseMarkdownBlocks(OPENAI_WRAPPED_LINKS)
      .flatMap((b) => tokenizeInline(b.lines.join("\n")))
      .filter((t) => t.type === "text")
      .map((t) => (t.type === "text" ? t.value : ""))
      .join("");
    expect(visibleText).not.toContain("google.com");
    expect(visibleText).not.toContain("utm_source");
    expect(visibleText).not.toContain("[");
    expect(visibleText).not.toContain("_Madrid");
  });

  it("classifies bullet lists and strips their markers", () => {
    expect(parseMarkdownBlocks("- uno\n- dos")).toEqual([
      { type: "bullets", lines: ["uno", "dos"] },
    ]);
  });

  it("classifies numbered lists and strips their markers", () => {
    expect(parseMarkdownBlocks("1. uno\n2) dos")).toEqual([
      { type: "numbered", lines: ["uno", "dos"] },
    ]);
  });

  it("splits a leading ATX heading from its body", () => {
    expect(parseMarkdownBlocks("## Título\nCuerpo del párrafo")).toEqual([
      { type: "heading", lines: ["Título"] },
      { type: "paragraph", lines: ["Cuerpo del párrafo"] },
    ]);
  });

  it("keeps a multi-line paragraph's lines together in one block", () => {
    expect(parseMarkdownBlocks("primera línea\nsegunda línea")).toEqual([
      { type: "paragraph", lines: ["primera línea", "segunda línea"] },
    ]);
  });

  it("drops blank blocks", () => {
    expect(parseMarkdownBlocks("uno\n\n\n\ndos")).toEqual([
      { type: "paragraph", lines: ["uno"] },
      { type: "paragraph", lines: ["dos"] },
    ]);
  });
});
