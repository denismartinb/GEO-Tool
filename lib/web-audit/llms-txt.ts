import type { DomainCoverageMap } from "./coverage-map";

/**
 * WEB-AUDIT-ISSUES-1 fase 3a — the `llms.txt` the user can publish.
 *
 * Pure, no I/O, no `server-only`: importable from Vitest and from the server
 * page alike, exactly like fase 1's `issues.ts` and fase 3b's `page-fixes.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS REAL AND WHAT IS A PLACEHOLDER — read before adding anything here.
 * ---------------------------------------------------------------------------
 * An llms.txt is a *curated reading guide*: sections, links, and one
 * description per link. We have two of those three for real, and the third is
 * the whole reason this file is careful:
 *
 *   Real:
 *     - the site's domain and the project's brand name
 *     - the section names — they are the user's OWN active prompts, via the
 *       coverage map's `topic`
 *     - every URL — a coverage-map page only exists because its grounding
 *       citation resolved, fail-closed, to the project's own domain
 *   NOT real, and never presented as such:
 *     - `DomainCoveragePage.title`. It reads like a page title but it was
 *       WRITTEN BY GEMINI, not read from the page. domain-coverage.ts is
 *       explicit that the only verified artifact is the URL — "the narrative
 *       note Gemini returns is NEVER treated as verified fact". Pasting model
 *       prose into a file the user publishes at the root of their own domain,
 *       as the official description of their own pages, would be exactly the
 *       fake product behavior CLAUDE.md forbids.
 *
 * So descriptions are emitted as a declared placeholder token, the same
 * contract fase 3b uses for `<title>` and meta description. The user writes
 * 8-10 short sentences; nothing here invents them, and nothing here launders a
 * model's guess into a published fact.
 *
 * Generating those descriptions with Gemini is a separate phase with its own
 * Task Intake — it introduces AI runtime, cost and sanitization to a phase
 * that deliberately has none. Do not quietly add it here.
 */

/** Replace-me token. Uppercase and unmistakable so it can never be published by accident. */
export const LLMS_DESCRIPTION_TOKEN = "DESCRIBE ESTA PÁGINA EN 1 FRASE";

/** Same idea for the site-level blurb, which we equally cannot know. */
export const LLMS_SUMMARY_TOKEN = "DESCRIBE TU NEGOCIO EN 1 O 2 FRASES";

/** Cap per section so one over-covered topic can't produce an unreadable file. */
const MAX_LINKS_PER_SECTION = 5;

/** Cap on sections, for the same reason. Ordered by the campaign's own order. */
const MAX_SECTIONS = 12;

export type LlmsTxtInput = {
  /** Project brand, used as the file's H1. */
  brand: string;
  /** Normalized domain, no scheme. */
  domainNormalized: string;
  /** Latest completed coverage campaign, or null when none has ever run. */
  coverage: DomainCoverageMap | null;
};

export type LlmsTxtResult = {
  /** The file's full text, ready to save as llms.txt. */
  content: string;
  /** Tokens the user must replace before publishing. Empty is impossible by construction. */
  placeholders: string[];
  /** How many real, verified URLs made it into the file. */
  linkCount: number;
  /** How many sections (topics) the file has. */
  sectionCount: number;
};

function stripTrailingSlash(url: string): string {
  return url.length > 1 && url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Markdown link text must not contain unescaped brackets, and a URL must not
 * contain spaces or parentheses that would end the link early. Both come from
 * persisted data, so this is belt-and-braces rather than a live sanitizer —
 * but a malformed link in a file the user publishes is a real defect.
 */
function safeLinkText(text: string): string {
  return text.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !/[()\s]/.test(url);
  } catch {
    return false;
  }
}

/**
 * Builds the file. Returns `null` when there is nothing real to build it from
 * — a project that has never run a coverage audit has no verified URLs, and an
 * llms.txt whose only content is placeholders would be worse than none: it
 * looks like a working artifact and teaches the model nothing.
 */
export function buildLlmsTxt(input: LlmsTxtInput): LlmsTxtResult | null {
  const topics = (input.coverage?.topics ?? [])
    .filter((topic) => topic.found && topic.pages.length > 0)
    .slice(0, MAX_SECTIONS);

  const seenUrls = new Set<string>();
  const sections: Array<{ topic: string; links: Array<{ url: string; label: string }> }> = [];

  for (const topic of topics) {
    const links: Array<{ url: string; label: string }> = [];
    for (const page of topic.pages) {
      if (links.length >= MAX_LINKS_PER_SECTION) break;
      if (!isSafeUrl(page.url)) continue;

      const key = stripTrailingSlash(page.url);
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);

      // The link's visible text is the PATH, not Gemini's title — a path is
      // something the site really has, and the user can recognise it at a
      // glance to write the description next to it.
      const path = new URL(page.url).pathname;
      links.push({ url: page.url, label: safeLinkText(path === "/" ? "Portada" : path) });
    }

    if (links.length > 0) {
      sections.push({ topic: safeLinkText(topic.topic), links });
    }
  }

  if (sections.length === 0) return null;

  const lines: string[] = [
    `# ${safeLinkText(input.brand)}`,
    "",
    `> ${LLMS_SUMMARY_TOKEN}`,
    "",
    `Sitio: https://${input.domainNormalized}`,
    ""
  ];

  for (const section of sections) {
    lines.push(`## ${section.topic}`, "");
    for (const link of section.links) {
      lines.push(`- [${link.label}](${link.url}): ${LLMS_DESCRIPTION_TOKEN}`);
    }
    lines.push("");
  }

  return {
    content: `${lines.join("\n").trimEnd()}\n`,
    placeholders: [LLMS_SUMMARY_TOKEN, LLMS_DESCRIPTION_TOKEN],
    linkCount: seenUrls.size,
    sectionCount: sections.length
  };
}

export type PublishStep = {
  title: string;
  body: string;
  /** Optional literal the user needs — a path, a URL. Rendered as code. */
  code?: string;
};

/**
 * How to actually publish the file (founder request, 2026-08-04: "que se den
 * instrucciones precisas al usuario de cómo tiene que publicarlo en su web").
 *
 * Generating the text is the easy half. "Publica un fichero llms.txt en la
 * raíz de tu dominio" assumes the reader knows what a web root is, which
 * platform they are on, and how to verify it worked — and a marketing lead on
 * a Shopify store knows none of those. Every step below is checkable: the
 * last one is a URL they can open, so success is something they SEE, not
 * something they assume.
 *
 * Deliberately not per-platform beyond a short pointer: the audit knows the
 * domain, not the CMS, and inventing a "your platform is WordPress" step from
 * nothing would be a guess dressed as instruction.
 */
export function publishSteps(domainNormalized: string): PublishStep[] {
  return [
    {
      title: "Rellena los huecos en mayúsculas",
      body:
        "Sustituye cada marcador por tu propio texto: una o dos frases sobre el negocio arriba, " +
        "y una frase por enlace explicando qué responde esa página. Escríbelas para que las lea " +
        "un modelo de IA, no para posicionar: directas y concretas, sin adjetivos de marketing."
    },
    {
      title: "Guarda el fichero con ese nombre exacto",
      body: "En minúsculas y con extensión .txt. Ni llms.TXT ni LLMs.txt — el nombre se comprueba tal cual.",
      code: "llms.txt"
    },
    {
      title: "Súbelo a la raíz de tu dominio",
      body:
        "Tiene que quedar colgando del dominio, no dentro de una carpeta ni de una página. " +
        "En un sitio estático (Vercel, Netlify, Astro, Next.js) va en la carpeta public/. " +
        "En WordPress, en la carpeta raíz por FTP o con un plugin de ficheros. " +
        "En Shopify, Webflow o Squarespace no siempre se puede subir un fichero suelto: " +
        "busca su opción de \"custom files\" o pídeselo a quien te lleve el sitio.",
      code: "public/llms.txt"
    },
    {
      title: "Compruébalo tú mismo abriendo esta URL",
      body:
        "Debe mostrar el texto plano del fichero. Si sale un 404, una página de tu web o el fichero " +
        "se descarga en vez de verse, no está bien publicado.",
      code: `https://${domainNormalized}/llms.txt`
    },
    {
      title: "Vuelve a auditar",
      body:
        "En el próximo escaneo esta incidencia pasará a la pestaña Correcto. Si sigue aquí, casi " +
        "siempre es que el fichero está dentro de una subcarpeta o que la plataforma le añade una " +
        "extensión al guardarlo."
    }
  ];
}
