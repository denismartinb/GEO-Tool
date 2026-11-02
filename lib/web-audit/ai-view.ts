import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { SitePlatform } from "@/lib/web-audit/page-checks";

/**
 * «Lo que lee la IA» in the console (AI-VIEW-CONSOLE-1, log §449).
 *
 * Every audited page as an AI bot receives it: no session, no JavaScript. The
 * console only has the HTML, so a page is «Llega vacía» (an application shell,
 * `jsShell`), «Poco texto» (its main content is still painted by a script,
 * `jsThin`) or «Llega completa». A partial gap on a long page needs a browser
 * that runs the page; the Chrome extension measures that, and the console never
 * guesses it. Pure: no Supabase, no clock.
 */

export type AiViewState = "ok" | "thin" | "empty";

export type AiViewPage = {
  url: string;
  path: string;
  words: number;
  state: AiViewState;
  hasH1: boolean;
  h2Count: number;
  ldTypes: string[];
};

export type AiView = {
  total: number;
  ok: number;
  pages: AiViewPage[];
  /** Pages that are not «ok», in audit order. */
  bad: AiViewPage[];
  /** The platform most pages give away, or null. */
  platform: SitePlatform | null;
};

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname || "/";
  } catch {
    return url;
  }
}

export function buildAiView(pages: PageAuditEntry[] | null | undefined): AiView | null {
  const seen = new Set<string>();
  const out: AiViewPage[] = [];
  const votes = new Map<SitePlatform, number>();
  for (const p of pages ?? []) {
    const c = p.status === "analyzed" ? p.check?.citability : undefined;
    // Only pages measured since JS-RENDER-CHECK-1: an older snapshot is not declared clean.
    if (!c || c.jsShell === undefined) continue;
    const path = pathOf(p.url);
    if (seen.has(path)) continue;
    seen.add(path);
    const state: AiViewState = c.jsShell ? "empty" : c.jsThin ? "thin" : "ok";
    out.push({
      url: p.url,
      path,
      words: c.wordCount,
      state,
      hasH1: (p.check?.answerFormat?.h1Count ?? 0) > 0,
      h2Count: p.check?.answerFormat?.h2Count ?? 0,
      ldTypes: p.check?.structuredData?.matchedTypes ?? []
    });
    if (c.platform) votes.set(c.platform, (votes.get(c.platform) ?? 0) + 1);
  }
  if (out.length === 0) return null;
  const platform = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const bad = out.filter((p) => p.state !== "ok");
  return { total: out.length, ok: out.length - bad.length, pages: out, bad, platform };
}

/** The headline under the big figure (Denis's wording, 2026-11-02). */
export function aiViewHeadline(v: AiView): string {
  if (v.bad.length === 0) return "páginas llegan completas a los bots de IA. ChatGPT, Claude y Perplexity reciben su contenido sin ejecutar JavaScript.";
  const rest = v.bad.length === 1 ? "la otra" : `las otras ${v.bad.length}`;
  if (v.ok === 0)
    return "páginas llegan completas a los bots de IA. En todas, el contenido importante no está en el HTML, por tanto ChatGPT, Claude y Perplexity no pueden leerlo debido a que no ejecutan JavaScript.";
  return `páginas llegan completas a los bots de IA. En ${rest}, el contenido importante no está en el HTML, por tanto ChatGPT, Claude y Perplexity no pueden leerlo debido a que no ejecutan JavaScript.`;
}

/** The llms.txt lines that point to the Markdown version of each affected page. */
export function aiViewLlmsLines(v: AiView): string {
  return ["## Páginas clave en Markdown", ...v.bad.map((p) => `- [${p.path === "/" ? "Portada" : p.path}](${mdUrl(p.url)})`)].join("\n");
}

export function mdUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.origin}${path || "/index"}.md`;
  } catch {
    return `${url}.md`;
  }
}
