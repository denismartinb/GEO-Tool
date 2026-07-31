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
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "link"; label: string; url: string };

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

/**
 * Tokenizes inline markdown. Accepts a multi-line string: newlines inside a
 * `text` token are preserved for the caller to render as line breaks, so a
 * construct spanning a line boundary is not severed before it is parsed.
 */
export function tokenizeInline(input: string): InlineToken[] {
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
      tokens.push({ type: "link", label: m[1], url: m[2] });
    } else if (m[3] !== undefined) {
      tokens.push({ type: "bold", value: m[3] });
    } else {
      if (m[4]) tokens.push({ type: "text", value: m[4] });
      tokens.push({ type: "italic", value: m[5] });
    }
    last = re.lastIndex;
  }

  if (last < input.length) tokens.push({ type: "text", value: input.slice(last) });
  return tokens;
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
