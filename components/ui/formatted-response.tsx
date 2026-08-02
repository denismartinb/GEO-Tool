"use client";

import { Fragment } from "react";
import type { InlineToken } from "@/lib/markdown/inline-markdown";
import { parseMarkdownBlocks, tokenizeInline } from "@/lib/markdown/inline-markdown";

/**
 * Renders a raw LLM response as markdown-lite instead of a plain-text blob
 * with literal `**bold**` / `* item` syntax showing through. Shared between
 * the prompt drawer and the citations evidence panel — both display the same
 * kind of raw provider text and both used to dump it unformatted (founder
 * review, 2026-08-02: citations should follow the same formatting rules
 * prompts already had).
 *
 * Block classification and inline tokenization live in
 * `lib/markdown/inline-markdown.ts` (unit-tested there); this component only
 * maps the parsed blocks onto JSX and adds the optional brand highlight.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlights literal occurrences of the brand name inside a raw model
 * response — real substring matching against `project.brand`, not an
 * invented heuristic. Case-insensitive; renders as plain text with no
 * matches when the brand name is empty or doesn't appear.
 */
function highlightBrand(text: string, brand: string): React.ReactNode {
  const trimmed = brand.trim();
  if (!trimmed) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, "gi"));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === trimmed.toLowerCase() ? <mark key={i}>{part}</mark> : part
  );
}

/** Only ever link http(s) URLs — a raw model response is untrusted text, and
 * a `javascript:`/other scheme slipping into an href would be a real XSS
 * vector, not just a formatting nit. */
function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Splits a token's text on embedded newlines, rendering each break as <br/>. */
function renderTextWithLineBreaks(value: string, brand: string, keyPrefix: string): React.ReactNode {
  const parts = value.split("\n");
  return parts.map((part, i) => (
    <Fragment key={`${keyPrefix}-${i}`}>
      {i > 0 && <br />}
      {highlightBrand(part, brand)}
    </Fragment>
  ));
}

/**
 * Renders a parsed inline-markdown token tree. Containers (bold, italic, link
 * label) hold child tokens rather than a raw string — providers nest these
 * freely, e.g. OpenAI's `**[label](url)**` — so rendering recurses.
 */
function renderTokens(tokens: InlineToken[], brand: string, keyPrefix: string): React.ReactNode {
  return tokens.map((t, i) => {
    const key = `${keyPrefix}-${i}`;
    if (t.type === "link") {
      const label = renderTokens(t.label, brand, `${key}l`);
      return isSafeHttpUrl(t.url) ? (
        <a key={key} href={t.url} target="_blank" rel="noopener noreferrer" className="pr2-md-link">
          {label}
        </a>
      ) : (
        <Fragment key={key}>{label}</Fragment>
      );
    }
    if (t.type === "bold") {
      return <strong key={key}>{renderTokens(t.children, brand, `${key}b`)}</strong>;
    }
    if (t.type === "italic") {
      return <em key={key}>{renderTokens(t.children, brand, `${key}i`)}</em>;
    }
    return <Fragment key={key}>{renderTextWithLineBreaks(t.value, brand, key)}</Fragment>;
  });
}

/**
 * Renders one or more lines of inline markdown. Accepts a multi-line string
 * (joined with "\n") rather than requiring one call per line, so a construct
 * split across a line boundary by the caller is still tokenized as a single
 * string and doesn't get severed at the newline.
 */
function renderInline(line: string, brand: string): React.ReactNode {
  return renderTokens(tokenizeInline(line), brand, "t");
}

/**
 * Renders a raw model response as markdown-lite.
 *
 * Headings render as a bold line, not a real <h*> tag — they are relative to
 * the model's own answer, not the page's heading outline, and providers don't
 * agree on a consistent depth for the same kind of title.
 *
 * `brand` is optional: pass it to highlight literal brand mentions (as the
 * prompt drawer does); omit it where there's no single brand to highlight
 * against.
 */
export function FormattedResponse({ text, brand = "" }: { text: string; brand?: string }) {
  return (
    <>
      {parseMarkdownBlocks(text).map((block, key) => {
        if (block.type === "heading") {
          return (
            <p key={key} className="pr2-md-h">
              {renderInline(block.lines[0], brand)}
            </p>
          );
        }
        if (block.type === "bullets") {
          return (
            <ul key={key} className="pr2-md-list">
              {block.lines.map((l, i) => (
                <li key={i}>{renderInline(l, brand)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "numbered") {
          return (
            <ol key={key} className="pr2-md-list">
              {block.lines.map((l, i) => (
                <li key={i}>{renderInline(l, brand)}</li>
              ))}
            </ol>
          );
        }
        // Paragraph: tokenize the whole block at once (lines rejoined) so a
        // construct spanning a line boundary isn't severed before parsing.
        return (
          <p key={key} className="pr2-md-p">
            {renderInline(block.lines.join("\n"), brand)}
          </p>
        );
      })}
    </>
  );
}
