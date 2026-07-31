/**
 * Minimal, dependency-free markdown-lite parser for raw LLM responses.
 *
 * Raw provider answers come back as literal markdown (`**bold**`, `_italic_`,
 * `[label](url)`, `* item`) which reads as noise when shown as plain text.
 * This is deliberately NOT a general markdown renderer: it covers only the
 * handful of constructs the providers actually emit in these answers.
 *
 * Extracted out of `components/prompts/prompt-drawer.tsx` so the parsing rules
 * are unit-testable on their own — a link-parsing bug shipped unnoticed while
 * this logic lived inline in a component with no test coverage.
 */

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; children: InlineToken[] }
  | { type: "italic"; children: InlineToken[] }
  | { type: "link"; label: InlineToken[]; url: string };

/**
 * Pulls a markdown link whose label and target were emitted on separate lines
 * back onto a single line.
 *
 * OpenAI's `web_search` answers routinely wrap long citation URLs like:
 *
 *     [Clínica Dermatológica Madrid De Felipe]
 *     (https://www.google.com/maps/search/...?utm_source=openai)
 *
 * Without this, the label/target pair can be split across two blocks by the
 * blank-line block splitter and never recombine, so the reader sees the raw
 * brackets and the full URL as literal text instead of a clean link.
 *
 * Only rejoins when the parenthetical actually opens a URL, so ordinary prose
 * ("un array [1, 2]" followed by "(un comentario aparte)") is left alone.
 */
export function normalizeMarkdownSource(text: string): string {
  return text.replace(/\]\s*\n\s*\((?=(?:https?:\/\/|www\.))/g, "](");
}

/** Deepest nesting we parse before treating the remainder as literal text. */
const MAX_NESTING_DEPTH = 4;

/**
 * Tokenizes inline markdown. Accepts a multi-line string: newlines inside a
 * `text` token are preserved for the caller to render as line breaks, so a
 * construct spanning a line boundary is not severed before it is parsed.
 *
 * **Nesting is parsed recursively.** Providers routinely wrap a link in bold
 * (`**[label](url)**`, OpenAI's usual shape for a list of cited businesses).
 * A flat tokenizer mis-handles this: regex alternation picks the *leftmost*
 * match, so the bold run — which starts two characters earlier — swallows the
 * whole link and renders it as literal `[label](url)` text in bold. Recursing
 * into each container's content is what makes the inner link a real link.
 */
export function tokenizeInline(input: string, depth = 0): InlineToken[] {
  if (depth >= MAX_NESTING_DEPTH) return input ? [{ type: "text", value: input }] : [];
  const tokens: InlineToken[] = [];
  // Alternatives, in precedence order:
  //   1. link   — `[label](url)`; `\s*` tolerates a space or newline between
  //               `]` and `(`, which some providers emit.
  //   2. bold   — `**text**`
  //   3. italic — `_text_`, only at a word boundary so an underscore inside a
  //               bare URL (`?utm_source=openai`) can't open an italic run.
  //               The leading boundary char is captured and re-emitted as text
  //               rather than matched with a lookbehind, for browser support.
  const re =
    /\[([^\]]+)\]\s*\(([^)\s]+)\)|\*\*([^*]+)\*\*|(^|[\s(¡¿"'])_([^_\n]+)_(?=$|[\s).,;:!?"'])/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(input))) {
    if (m.index > last) tokens.push({ type: "text", value: input.slice(last, m.index) });
    if (m[1] !== undefined) {
      tokens.push({ type: "link", label: tokenizeInline(m[1], depth + 1), url: m[2] });
    } else if (m[3] !== undefined) {
      tokens.push({ type: "bold", children: tokenizeInline(m[3], depth + 1) });
    } else {
      if (m[4]) tokens.push({ type: "text", value: m[4] });
      tokens.push({ type: "italic", children: tokenizeInline(m[5], depth + 1) });
    }
    last = re.lastIndex;
  }

  if (last < input.length) tokens.push({ type: "text", value: input.slice(last) });
  return mergeAdjacentText(tokens);
}

/**
 * Collapses consecutive text tokens into one. The italic rule re-emits its
 * leading boundary character as its own token, which would otherwise split a
 * run of plain text into fragments and produce needless React nodes.
 */
function mergeAdjacentText(tokens: InlineToken[]): InlineToken[] {
  const merged: InlineToken[] = [];
  for (const token of tokens) {
    const previous = merged[merged.length - 1];
    if (token.type === "text" && previous?.type === "text") {
      merged[merged.length - 1] = { type: "text", value: previous.value + token.value };
    } else {
      merged.push(token);
    }
  }
  return merged;
}

/**
 * The text a reader actually sees for a token tree — link labels included,
 * link *targets* excluded. A raw URL showing up here means a link failed to
 * parse and its markdown is leaking into the visible transcript.
 */
export function visibleText(tokens: InlineToken[]): string {
  return tokens
    .map((t) => (t.type === "text" ? t.value : visibleText(t.type === "link" ? t.label : t.children)))
    .join("");
}

export type MarkdownBlock =
  | { type: "heading"; lines: string[] }
  | { type: "bullets"; lines: string[] }
  | { type: "numbered"; lines: string[] }
  | { type: "paragraph"; lines: string[] };

const BULLET_PREFIX = /^\s*[-*]\s+/;
const NUMBERED_PREFIX = /^\s*\d+[.)]\s+/;
const HEADING_PREFIX = /^#{1,6}\s+(.*)$/;

/**
 * Splits a raw response into renderable blocks (blank-line separated), after
 * normalizing line-wrapped links. A leading ATX heading (`# `, `## `) is
 * emitted as its own block: Gemini/ChatGPT tend to bold section titles inline
 * while Claude uses real headings, and without this Claude's answers showed
 * literal `#` characters.
 */
export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const source = normalizeMarkdownSource(text);
  const blocks: MarkdownBlock[] = [];

  for (const rawBlock of source.split(/\n\s*\n/)) {
    const lines = rawBlock.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;

    const heading = lines[0].match(HEADING_PREFIX);
    const body = heading ? lines.slice(1) : lines;
    if (heading) blocks.push({ type: "heading", lines: [heading[1]] });
    if (body.length === 0) continue;

    if (body.every((l) => BULLET_PREFIX.test(l))) {
      blocks.push({ type: "bullets", lines: body.map((l) => l.replace(BULLET_PREFIX, "")) });
    } else if (body.every((l) => NUMBERED_PREFIX.test(l))) {
      blocks.push({ type: "numbered", lines: body.map((l) => l.replace(NUMBERED_PREFIX, "")) });
    } else {
      blocks.push({ type: "paragraph", lines: body });
    }
  }

  return blocks;
}
