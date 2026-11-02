import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { isPageRender, RENDER_KINDS, type RenderKind } from "@/lib/web-audit/ai-render";

/**
 * «Lo que lee la IA» in Auditoría GEO.
 *
 * AI-VIEW-CONSOLE-1 (log §449) showed one row per page from what the HTML
 * proves. AI-READ-2 (log §451) replaces it with global figures (Denis,
 * 2026-11-02: no page list, «datos e insights globales»; no fix block, a fix
 * goes to Recomendaciones only when its cause is certain):
 *
 * - with browser measurements (`PageAuditEntry.render`), the share of what a
 *   person sees that reaches the AI, weighted by what each page matters, what
 *   is lost by kind of content, and where it is lost;
 * - without them, only the share of pages that arrive complete, from the HTML.
 *
 * Never a page count, never a URL list. Pure: no Supabase, no clock.
 */

export type AiViewState = "ok" | "thin" | "empty";

export type AiKindLine = {
  kind: RenderKind;
  label: string;
  /** Share (0-100) of the blocks of this kind a person sees that do not reach the AI. */
  missingPct: number;
  consequence: string;
  /** One literal block that does not arrive, when there is one. */
  sample: string | null;
  where: string | null;
};

export type AiGroupLine = { label: string; pct: number };
export type AiGroup = { title: string; lines: AiGroupLine[]; insight: string | null };

export type AiView =
  | {
      mode: "measured";
      pct: number;
      delta: number | null;
      kinds: AiKindLine[];
      groups: AiGroup[];
    }
  | {
      mode: "html";
      /** Share (0-100) of pages whose content arrives complete in the HTML. */
      okPct: number;
      allOk: boolean;
    };

type Kinded = { seen: number; missing: number };
type Measured = {
  pct: number;
  prevPct?: number;
  weight: number;
  source: "cited" | "topic" | "home" | "other";
  type: "product" | "article" | "other";
  kinds: Partial<Record<RenderKind, Kinded>>;
  samples: Array<{ kind: string; text: string }>;
};

const KIND_COPY: Record<RenderKind, { label: string; consequence: string }> = {
  price: { label: "Tus precios", consequence: "Si alguien pregunta cuánto cuesta, la IA no puede dar tu precio y responde con el de otro." },
  faq: { label: "Preguntas frecuentes", consequence: "Las respuestas que se abren con JavaScript no llegan. Es justo el formato que la IA más copia." },
  review: { label: "Opiniones", consequence: "La IA no puede contar lo que opinan tus clientes." },
  spec: { label: "Fichas y características", consequence: "Las tablas y fichas que pinta un script no llegan a la IA." }
};

const SOURCE_LABEL: Record<Measured["source"], string> = {
  cited: "Lo que cita la IA",
  topic: "Tus páginas sobre los temas que vigilas",
  home: "Portada",
  other: "Resto de páginas"
};
const TYPE_LABEL: Record<Measured["type"], string> = {
  product: "Lo que vendes",
  article: "Blog y guías",
  other: "Resto de páginas"
};

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

function sourceOf(contextLabel: string, path: string): Measured["source"] {
  if (contextLabel === "portada" || path === "/") return "home";
  if (contextLabel.startsWith("citada")) return "cited";
  if (contextLabel === "verificada") return "topic";
  return "other";
}

function typeOf(p: PageAuditEntry, path: string, kinds: Measured["kinds"]): Measured["type"] {
  const ld = p.check?.structuredData?.matchedTypes ?? [];
  if (ld.includes("Product") || (kinds.price?.seen ?? 0) > 0 || /\/(product|producto|productos|tienda|shop|p|precios|pricing|tarifas|planes)(\/|$)/i.test(path)) {
    return "product";
  }
  if (ld.some((t) => t === "Article" || t === "BlogPosting" || t === "NewsArticle") || /\/(blog|noticias|guia|guias|articulos?|news)(\/|$)/i.test(path)) {
    return "article";
  }
  return "other";
}

const WEIGHT: Record<Measured["source"], number> = { cited: 3, home: 2, topic: 1.5, other: 1 };

function weighted(items: Array<{ pct: number; weight: number }>): number {
  const w = items.reduce((a, b) => a + b.weight, 0);
  return w > 0 ? Math.round(items.reduce((a, b) => a + b.pct * b.weight, 0) / w) : 0;
}

function groupBy<K extends string>(pages: Measured[], key: (m: Measured) => K, labels: Record<K, string>): AiGroupLine[] {
  const map = new Map<K, Measured[]>();
  for (const m of pages) map.set(key(m), [...(map.get(key(m)) ?? []), m]);
  const order = Object.keys(labels) as K[];
  return order.filter((k) => map.has(k)).map((k) => ({ label: labels[k], pct: weighted(map.get(k)!) }));
}

/** One reading of each group, only when the figures say something. */
export function importanceInsight(lines: AiGroupLine[], overall: number): string | null {
  const cited = lines.find((l) => l.label === SOURCE_LABEL.cited);
  if (!cited) return null;
  if (cited.pct <= overall - 8) return "Lo que más te recomienda la IA es lo que peor le llega.";
  if (cited.pct >= 95) return "Lo que te cita la IA le llega entero.";
  return null;
}

export function typeInsight(lines: AiGroupLine[]): string | null {
  const product = lines.find((l) => l.label === TYPE_LABEL.product);
  const article = lines.find((l) => l.label === TYPE_LABEL.article);
  if (product && article && article.pct >= 95 && product.pct <= 85) return "El blog llega entero; el problema está en lo que vendes.";
  if (lines.length < 2) return null;
  const worst = [...lines].sort((a, b) => a.pct - b.pct)[0];
  const best = [...lines].sort((a, b) => b.pct - a.pct)[0];
  const phrase: Record<string, string> = {
    [TYPE_LABEL.product]: "lo que vendes",
    [TYPE_LABEL.article]: "el blog y las guías",
    [TYPE_LABEL.other]: "el resto de páginas"
  };
  if (worst.pct <= 85 && best.pct - worst.pct >= 10) return `El mayor hueco está en ${phrase[worst.label] ?? worst.label.toLowerCase()}.`;
  return null;
}

function whereOf(types: Set<Measured["type"]>, sources: Set<Measured["source"]>): string | null {
  if (types.size === 1 && types.has("product")) return "En lo que vendes";
  if (types.size === 1 && types.has("article")) return "En tus artículos";
  if (sources.size === 1 && sources.has("home")) return "En tu portada";
  return "En varias partes de tu web";
}

export function buildAiView(pages: PageAuditEntry[] | null | undefined): AiView | null {
  const measured: Measured[] = [];
  const htmlStates: AiViewState[] = [];
  const seen = new Set<string>();
  for (const p of pages ?? []) {
    if (p.status !== "analyzed") continue;
    const path = pathOf(p.url);
    if (seen.has(path)) continue;
    seen.add(path);
    const r = isPageRender(p.render) ? p.render : undefined;
    if (r && r.state === "ok") {
      const kinds = r.kinds ?? {};
      const source = sourceOf(p.contextLabel ?? "", path);
      measured.push({
        pct: r.pct,
        prevPct: r.prevPct,
        weight: WEIGHT[source],
        source,
        type: typeOf(p, path, kinds),
        kinds,
        samples: Array.isArray(r.samples) ? r.samples : []
      });
    }
    const c = p.check?.citability;
    if (c && c.jsShell !== undefined) htmlStates.push(c.jsShell ? "empty" : c.jsThin ? "thin" : "ok");
  }

  if (measured.length > 0) {
    const pct = weighted(measured);
    const withPrev = measured.filter((m) => m.prevPct !== undefined);
    const delta =
      withPrev.length >= Math.ceil(measured.length / 2)
        ? weighted(withPrev) - weighted(withPrev.map((m) => ({ pct: m.prevPct!, weight: m.weight })))
        : null;

    const kinds: AiKindLine[] = [];
    for (const kind of RENDER_KINDS) {
      let s = 0;
      let miss = 0;
      const types = new Set<Measured["type"]>();
      const sources = new Set<Measured["source"]>();
      let sample: string | null = null;
      for (const m of measured) {
        const k = m.kinds[kind];
        if (!k || k.seen === 0) continue;
        s += k.seen;
        miss += k.missing;
        if (k.missing > 0) {
          types.add(m.type);
          sources.add(m.source);
          sample ??= m.samples.find((x) => x.kind === kind)?.text ?? null;
        }
      }
      if (s === 0) continue;
      const missingPct = Math.round((miss / s) * 100);
      kinds.push({ kind, ...KIND_COPY[kind], missingPct, sample: missingPct > 0 ? sample : null, where: missingPct > 0 ? whereOf(types, sources) : null });
    }

    const groups: AiGroup[] = [];
    const byImportance = groupBy(measured, (m) => m.source, SOURCE_LABEL);
    if (byImportance.length >= 2) groups.push({ title: "Por lo que importa", lines: byImportance, insight: importanceInsight(byImportance, pct) });
    const byType = groupBy(measured, (m) => m.type, TYPE_LABEL);
    if (byType.length >= 2) groups.push({ title: "Por tipo de página", lines: byType, insight: typeInsight(byType) });

    return { mode: "measured", pct, delta: delta !== null && delta !== 0 ? delta : null, kinds, groups };
  }

  if (htmlStates.length === 0) return null;
  const ok = htmlStates.filter((s) => s === "ok").length;
  return { mode: "html", okPct: Math.round((ok / htmlStates.length) * 100), allOk: ok === htmlStates.length };
}

/** The sentence under the big figure. */
export function aiViewHeadline(v: AiView): string {
  if (v.mode === "measured") return "de lo que ven tus clientes llega a ChatGPT, Claude y Perplexity.";
  if (v.allOk) return "de tus páginas llegan completas a la IA. ChatGPT, Claude y Perplexity reciben su contenido sin ejecutar JavaScript.";
  return "de tus páginas llegan completas a la IA. En el resto, parte del contenido sólo aparece con JavaScript, y ChatGPT, Claude y Perplexity no lo ejecutan.";
}
