import { describe, expect, it } from "vitest";
import {
  normalizeMarkdownSource,
  parseMarkdownBlocks,
  tokenizeInline,
  visibleText,
  type InlineToken,
} from "@/lib/markdown/inline-markdown";

const text = (value: string): InlineToken => ({ type: "text", value });

/**
 * The founder's real ChatGPT answer (project "Alberdiderma"), reproduced from
 * the reported screenshots. Two provider quirks combine here, and each one on
 * its own was enough to leak raw markdown into the transcript:
 *   1. the link is wrapped in bold (`**[label](url)**`);
 *   2. long URLs get emitted on their own line, after the `]`.
 */
const OPENAI_CITED_LISTING = `Para tratar el acné severo en Madrid, existen varias clínicas dermatológicas especializadas:

**[Clínica Dermatológica Madrid De Felipe]
(https://www.google.com/maps/search/Cl%C3%ADnica+Dermatol%C3%B3gica+Madrid+De+Felipe%2C+Madrid%2C+Espa%C3%B1a?utm_source=openai)**
_Madrid, España_
Con más de 30 años de experiencia, esta clínica se especializa en dermatología integral.

**[Alberdiderma | Clínica Dermatológica en Madrid](https://www.google.com/maps/search/Alberdiderma+%7C+Cl%C3%ADnica+Dermatol%C3%B3gica+en+Madrid%2C+Madrid%2C+Espa%C3%B1a?utm_source=openai)**
_Madrid, España_
Centro dermatológico de referencia con más de 20 años de experiencia.`;

function tokensOf(source: string): InlineToken[] {
  return parseMarkdownBlocks(source).flatMap((b) => tokenizeInline(b.lines.join("\n")));
}

function collectLinks(tokens: InlineToken[]): Array<{ label: string; url: string }> {
  return tokens.flatMap((t) => {
    if (t.type === "link") return [{ label: visibleText(t.label), url: t.url }, ...collectLinks(t.label)];
    if (t.type === "bold" || t.type === "italic") return collectLinks(t.children);
    return [];
  });
}

describe("tokenizeInline — links", () => {
  it("parses a plain markdown link", () => {
    expect(tokenizeInline("Ver [Alberdiderma](https://alberdiderma.com) aquí")).toEqual([
      text("Ver "),
      { type: "link", label: [text("Alberdiderma")], url: "https://alberdiderma.com" },
      text(" aquí"),
    ]);
  });

  it("parses a link with a space between ] and (", () => {
    expect(tokenizeInline("[Alberdiderma] (https://alberdiderma.com)")).toEqual([
      { type: "link", label: [text("Alberdiderma")], url: "https://alberdiderma.com" },
    ]);
  });

  it("parses a link split across a line break between ] and (", () => {
    expect(tokenizeInline("[Alberdiderma]\n(https://alberdiderma.com)")).toEqual([
      { type: "link", label: [text("Alberdiderma")], url: "https://alberdiderma.com" },
    ]);
  });
});

describe("tokenizeInline — nesting", () => {
  /**
   * Regression: a flat tokenizer lets the bold run (which starts earlier, and
   * so wins as the leftmost match) swallow the whole link, rendering
   * "[label](url)" as literal bold text. This is the exact shape OpenAI emits
   * for cited business listings.
   */
  it("parses a link wrapped in bold as a real link inside the bold run", () => {
    expect(tokenizeInline("**[Alberdiderma](https://alberdiderma.com)**")).toEqual([
      {
        type: "bold",
        children: [{ type: "link", label: [text("Alberdiderma")], url: "https://alberdiderma.com" }],
      },
    ]);
  });

  it("parses bold inside a link label", () => {
    expect(tokenizeInline("[**Alberdiderma**](https://alberdiderma.com)")).toEqual([
      {
        type: "link",
        label: [{ type: "bold", children: [text("Alberdiderma")] }],
        url: "https://alberdiderma.com",
      },
    ]);
  });

  it("parses italic nested inside bold", () => {
    expect(tokenizeInline("**muy _importante_**")).toEqual([
      {
        type: "bold",
        children: [text("muy "), { type: "italic", children: [text("importante")] }],
      },
    ]);
  });

  it("stops recursing at the depth limit instead of looping", () => {
    const tokens = tokenizeInline("**a **b **c **d **e [f](https://f.com)** ** ** ** **");
    expect(visibleText(tokens)).toContain("f");
  });
});

describe("tokenizeInline — emphasis", () => {
  it("parses bold", () => {
    expect(tokenizeInline("**Aspectos a tener en cuenta:**")).toEqual([
      { type: "bold", children: [text("Aspectos a tener en cuenta:")] },
    ]);
  });

  it("parses italic at a word boundary", () => {
    expect(tokenizeInline("_Madrid, España_")).toEqual([
      { type: "italic", children: [text("Madrid, España")] },
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
    const source = "Un array [1, 2]\n\n(y un comentario aparte)";
    expect(normalizeMarkdownSource(source)).toBe(source);
  });
});

describe("the founder's reported ChatGPT answer", () => {
  it("recovers every cited link, bold-wrapped and line-wrapped alike", () => {
    expect(collectLinks(tokensOf(OPENAI_CITED_LISTING)).map((l) => l.label)).toEqual([
      "Clínica Dermatológica Madrid De Felipe",
      "Alberdiderma | Clínica Dermatológica en Madrid",
    ]);
  });

  it("leaks no raw URL, bracket or underscore into the visible transcript", () => {
    const visible = visibleText(tokensOf(OPENAI_CITED_LISTING));
    expect(visible).not.toContain("google.com");
    expect(visible).not.toContain("utm_source");
    expect(visible).not.toContain("[");
    expect(visible).not.toContain("]");
    expect(visible).not.toContain("**");
    expect(visible).not.toContain("_Madrid");
  });

  it("keeps the brand name readable as the link label", () => {
    expect(visibleText(tokensOf(OPENAI_CITED_LISTING))).toContain("Alberdiderma");
  });
});

/**
 * The invariant that actually matters for the "Respuestas" tab, asserted
 * across every wrapping shape the providers are known to emit rather than
 * only the one last reported. Two rounds were lost to fixing one shape at a
 * time (line-wrapped, then bold-wrapped); this matrix is the guard against a
 * third.
 */
describe("no markdown syntax leaks into the visible transcript", () => {
  const URL = "https://www.google.com/maps/search/Alberdiderma%2C+Madrid?utm_source=openai";
  const shapes: Array<[string, string]> = [
    ["plain link", `[Alberdiderma](${URL})`],
    ["bold-wrapped link", `**[Alberdiderma](${URL})**`],
    ["italic-wrapped link", `_[Alberdiderma](${URL})_`],
    ["bold label inside link", `[**Alberdiderma**](${URL})`],
    ["line-wrapped link", `[Alberdiderma]\n(${URL})`],
    ["bold and line-wrapped", `**[Alberdiderma]\n(${URL})**`],
    ["blank-line-wrapped link", `[Alberdiderma]\n\n(${URL})`],
    ["bullet item", `- [Alberdiderma](${URL})`],
    ["bold bullet item", `- **[Alberdiderma](${URL})**`],
    ["numbered item", `1. [Alberdiderma](${URL})`],
    ["heading", `## [Alberdiderma](${URL})`],
    ["link inside a sentence", `Destaca [Alberdiderma](${URL}) en Madrid.`],
    ["two links in one line", `[A](${URL}) y [Alberdiderma](${URL})`],
  ];

  it.each(shapes)("%s", (_name, source) => {
    const visible = visibleText(tokensOf(source));
    expect(visible).not.toContain("google.com");
    expect(visible).not.toContain("utm_source");
    expect(visible).not.toContain("](");
    expect(visible).not.toContain("**");
    expect(visible).toContain("Alberdiderma");
  });

  it.each(shapes)("%s — exposes the URL as a real link target", (_name, source) => {
    expect(collectLinks(tokensOf(source)).map((l) => l.url)).toContain(URL);
  });
});

describe("parseMarkdownBlocks", () => {
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
