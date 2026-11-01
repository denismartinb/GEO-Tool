// MCP-GUIDES-1: the text index behind the MCP tool `buscar_guias`. The blog
// posts are the source of truth; this script turns each `page.mdx` into
// plain-text chunks (one per `##` section, split when long) and writes
// `lib/mcp/guides/blog-index.json`. Titles, dates and kinds are NOT stored
// here: they are read at runtime from `BLOG_POSTS`, so they never drift.
// `lib/mcp/guides/blog-index.test.ts` fails when the JSON is stale.
//
//   node scripts/build-guides-index.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLOG = join(root, "app/blog");
const OUT = join(root, "lib/mcp/guides/blog-index.json");

/** Longest chunk kept in one piece; longer sections are split by paragraph. */
export const MAX_CHUNK_CHARS = 1400;

const unescape = (s) => s.replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\\'/g, "'");

/** The FAQ written as data in the page (`faqItems`), as «Pregunta. Respuesta.» pairs. */
export function extractFaq(source) {
  const block = source.match(/export const faqItems\s*=\s*\[([\s\S]*?)\n\];/);
  if (!block) return [];
  const pairs = [];
  const re = /question:\s*"((?:[^"\\]|\\.)*)"\s*,\s*answer:\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)/g;
  let m;
  while ((m = re.exec(block[1]))) {
    const answer = [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => unescape(x[1])).join("");
    pairs.push({ question: unescape(m[1]), answer });
  }
  return pairs;
}

/**
 * Removes every JSX tag, attributes included, scanning braces and quotes so
 * a `>` inside an attribute does not end the tag early. Long quoted strings
 * inside a tag (a figure's caption, a checklist's items) are page text, so
 * they are kept; short ones (labels, tones, class names) are not.
 */
export function stripJsx(s) {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "<" && /[A-Za-z/]/.test(s[i + 1] ?? "")) {
      let depth = 0;
      let j = i + 1;
      const kept = [];
      while (j < s.length) {
        const d = s[j];
        if (d === '"' || d === "'" || d === "`") {
          let k = j + 1;
          while (k < s.length && s[k] !== d) k += s[k] === "\\" ? 2 : 1;
          const literal = s.slice(j + 1, k);
          if (literal.length >= 25 && literal.includes(" ")) kept.push(literal);
          j = k + 1;
          continue;
        }
        if (d === "{") depth++;
        else if (d === "}") depth--;
        else if (d === ">" && depth <= 0) break;
        j++;
      }
      out += kept.length ? `\n\n${kept.join("\n\n")}\n\n` : " ";
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** MDX body to plain text with `## ` headings kept as section markers. */
export function mdxToText(source) {
  let s = source
    .replace(/^import\s[\s\S]*?\sfrom\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^export const [\s\S]*?\n(?:\];|\}\);|\};)\s*$/gm, "")
    .replace(/^export const .*;$/gm, "");
  // A numbered step's title is a real heading on the page.
  s = s.replace(/<NumberedSection\b[^>]*?\btitle="([^"]*)"[^>]*>/g, "\n### $1\n");
  s = s.replace(/<QuickAction>/g, "\nQué hacer: ");
  s = stripJsx(s);
  s = s.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
  // Markdown that reads as noise in plain text.
  s = s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/^\s*\d+\.\s+/gm, "- ")
    .replace(/^\|.*\|\s*$/gm, (row) => (/^\|[\s:|-]+\|$/.test(row.trim()) ? "" : row.replace(/\|/g, " · ").replace(/^ · | · $/g, "").trim()));
  return s;
}

function normalizeSpace(text) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0 && !/^[\s·{}()[\],;-]+$/.test(p))
    .join("\n\n");
}

function splitLong(text) {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const parts = [];
  let current = "";
  for (const p of text.split("\n\n")) {
    if (current && current.length + p.length + 2 > MAX_CHUNK_CHARS) {
      parts.push(current);
      current = p;
    } else current = current ? `${current}\n\n${p}` : p;
  }
  if (current) parts.push(current);
  return parts;
}

/** One post's chunks: the lede, each `##` section and the FAQ. */
export function chunkPost(source) {
  const text = mdxToText(source);
  const chunks = [];
  const sections = text.split(/^## +/m);
  sections.forEach((raw, i) => {
    const [first, ...rest] = raw.split("\n");
    const section = i === 0 ? "" : first.trim();
    const body = normalizeSpace((i === 0 ? raw : rest.join("\n")).replace(/^### +(.*)$/gm, "\n\n$1:"));
    if (!body) return;
    for (const piece of splitLong(body)) chunks.push({ section, text: piece });
  });
  for (const f of extractFaq(source)) chunks.push({ section: f.question, text: f.answer });
  return chunks;
}

export function buildGuidesIndex(blogDir = BLOG) {
  const posts = readdirSync(blogDir)
    .filter((slug) => !slug.startsWith("[") && statSync(join(blogDir, slug)).isDirectory())
    .sort()
    .flatMap((slug) => {
      const file = join(blogDir, slug, "page.mdx");
      try {
        return [{ slug, chunks: chunkPost(readFileSync(file, "utf8")) }];
      } catch {
        return [];
      }
    });
  return `${JSON.stringify({ posts }, null, 0)}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUT, buildGuidesIndex());
  console.log("lib/mcp/guides/blog-index.json written");
}
