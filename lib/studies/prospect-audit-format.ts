import type { IssueCheckKey, IssueSeverity, TechnicalIssue, TechnicalPassingCheck } from "@/lib/web-audit/issues";

/**
 * SECTOR-STUDY-1 (prospect report) — the technical-audit section of a
 * one-brand study. Pure: it formats what `runProspectAudit` measured and
 * nothing else, so it can be tested and imported from the browser.
 *
 * The labels are a short copy of the web-audit screen's `CHECK_META`
 * (`issue-rows.tsx`), kept here because that one lives in a UI component; a
 * check added there without a label here falls back to its key, never to an
 * invented sentence.
 */

export type ProbeState = "found" | "absent" | "unknown";

/** What was measured on one page, so every verdict carries its evidence. */
export type PageEvidence = {
  finalUrl: string;
  title: string | null;
  titleLength: number;
  descriptionLength: number;
  /** Every JSON-LD @type on the page, not only the ones the score counts. */
  jsonLdTypes: string[];
  /** Visible words in the HTML as served, i.e. without running JavaScript. */
  wordCount: number;
  contentOk: boolean;
  h1Count: number;
};

/** One audited page. `source` says why it was picked: never discovered by following links. */
export type ProspectPage = {
  url: string;
  source: "homepage" | "coverage_page" | "grounding_citation";
  contextLabel: string;
  /** "analyzed", one of fetch-page's skip reasons, or "skipped_budget". */
  status: string;
  pageScore: number | null;
  evidence: PageEvidence | null;
};

export type ProspectAudit = {
  domain: string;
  /** Status of the homepage fetch: "analyzed" or one of fetch-page's skip reasons. */
  homepageStatus: string;
  /** pageScore 0–100 of the homepage, null when it could not be analysed. */
  homepageScore: number | null;
  issues: TechnicalIssue[];
  passing: TechnicalPassingCheck[];
  robots: ProbeState;
  trackedBots: number;
  blockedBots: string[];
  llmsTxt: ProbeState;
  sitemap: ProbeState;
  /** `<loc>` entries seen (a floor when truncated); null when there was no valid sitemap. */
  sitemapLocs: number | null;
  /** Reachable but not a sitemap (usually a soft 404 served with 200). */
  sitemapInvalid: boolean;
  /** The bots a prospect asks about first, read from robots.txt. Meaningless when `robots` is "unknown". */
  keyBots: Array<{ agent: string; allowed: boolean }>;
  /** What was measured on the homepage. Null when it could not be read. */
  evidence: PageEvidence | null;
  /** Every page audited, homepage first (homepage only for a competitor). Optional: older .json files have none. */
  pages?: ProspectPage[];
  /** Mean pageScore over the analysed pages — the product's readiness score. Null when none was analysed. */
  readinessScore?: number | null;
};

const LD_JSON_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** All `@type` values in the page's JSON-LD, including nested and `@graph` nodes. Malformed blocks are skipped. */
export function collectJsonLdTypes(html: string): string[] {
  const types = new Set<string>();
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    for (const value of Array.isArray(type) ? type : [type]) if (typeof value === "string" && value.length <= 60) types.add(value);
    for (const value of Object.values(record)) if (value && typeof value === "object") visit(value, depth + 1);
  };
  for (const match of html.matchAll(LD_JSON_RE)) {
    try {
      visit(JSON.parse(match[1]), 0);
    } catch {
      // malformed JSON-LD: same as the audit, ignored
    }
  }
  return [...types].sort();
}

/** The <title> text, whitespace-collapsed, tags and table pipes stripped, capped. */
export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const text = match[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").replace(/\|/g, "/").trim();
  return text ? text.slice(0, 160) : null;
}

const LABEL: Partial<Record<IssueCheckKey, { label: string; fix: string }>> = {
  structured_data: { label: "Datos estructurados (JSON-LD)", fix: "añadir JSON-LD con un @type reconocido (Organization, Product, FAQPage…)" },
  single_h1: { label: "Un solo <h1>", fix: "dejar un único <h1>" },
  two_h2: { label: "Al menos dos <h2>", fix: "estructurar la página con <h2>" },
  answer_first_intro: { label: "Intro que responde primero", fix: "abrir con un párrafo de 200+ caracteres que diga qué hace la empresa" },
  title_length: { label: "Longitud del <title>", fix: "ajustar el título a 15–70 caracteres" },
  description_length: { label: "Meta description", fix: "ajustarla a 50–160 caracteres" },
  open_graph: { label: "Open Graph", fix: "añadir og:title y og:description" },
  noindex: { label: "Página indexable", fix: "quitar el noindex" },
  snippet_blocked: { label: "Fragmentos permitidos", fix: "quitar nosnippet / max-snippet:0" },
  canonical: { label: "Canonical propio", fix: "apuntar el canonical a la propia URL" },
  hreflang: { label: "Hreflang", fix: "declarar las versiones de idioma si existen" },
  list_or_table: { label: "Listas o tablas", fix: "presentar servicios o datos en listas o tablas" },
  content_length: { label: "Contenido sustancial", fix: "ampliar el texto visible" },
  freshness: { label: "Contenido actualizado", fix: "actualizar y declarar dateModified" },
  bot_blocked: { label: "Acceso de bots de IA", fix: "quitar el bloqueo en robots.txt" },
  llms_txt_missing: { label: "llms.txt", fix: "publicar un llms.txt en la raíz" },
  sitemap_missing: { label: "sitemap.xml", fix: "activar el sitemap de la plataforma" }
};

const SEVERITY: Record<IssueSeverity, string> = { critical: "Crítico", warning: "Aviso", improvement: "Mejora" };

const HOMEPAGE_FAILURE: Record<string, string> = {
  skipped_timeout: "la portada tardó demasiado en responder",
  skipped_not_html: "la portada no devolvió HTML",
  skipped_offsite: "la portada redirige fuera del dominio",
  skipped_unsafe_ip: "el dominio no resuelve a una IP pública",
  skipped_error: "la portada devolvió un error"
};

const PAGE_STATUS: Record<string, string> = {
  analyzed: "analizada",
  skipped_timeout: "tardó demasiado",
  skipped_not_html: "no es HTML",
  skipped_offsite: "redirige fuera del dominio",
  skipped_unsafe_ip: "IP no pública",
  skipped_error: "devolvió un error",
  skipped_budget: "sin tiempo (no se pidió)"
};

const SOURCE: Record<ProspectPage["source"], string> = {
  homepage: "portada",
  coverage_page: "encontrada en la cobertura",
  grounding_citation: "citada por un motor"
};

const label = (check: IssueCheckKey) => LABEL[check]?.label ?? check;

export function formatAuditSection(audit: ProspectAudit): string {
  const out: string[] = [`## Auditoría técnica (${audit.domain})`, ""];
  const extraPages = (audit.pages ?? []).filter((page) => page.source !== "homepage");
  out.push(
    extraPages.length > 0
      ? `Qué se ha medido: la portada, ${extraPages.length === 1 ? "1 página propia" : `${extraPages.length} páginas propias`} que ya salían en los datos (citadas por un motor o encontradas por la cobertura de contenido) y los ficheros robots.txt, llms.txt y sitemap.xml, con las mismas comprobaciones que la Auditoría web de GenScore. No se ha recorrido el sitio ni seguido enlaces: el resto de páginas no se ha mirado.`
      : "Qué se ha medido: la portada y los ficheros robots.txt, llms.txt y sitemap.xml, con las mismas comprobaciones que la Auditoría web de GenScore. No es una auditoría del sitio entero: el resto de páginas no se ha mirado.",
    ""
  );

  if (extraPages.length > 0) {
    const analyzed = (audit.pages ?? []).filter((page) => page.status === "analyzed").length;
    out.push(
      audit.readinessScore !== null && audit.readinessScore !== undefined
        ? `- **Preparación técnica (media de ${analyzed} de ${(audit.pages ?? []).length} páginas analizadas):** ${audit.readinessScore}/100.`
        : "- **Preparación técnica:** sin dato (no se pudo analizar ninguna página)."
    );
  }
  if (audit.homepageStatus === "analyzed" && audit.homepageScore !== null) {
    out.push(`- **Preparación técnica de la portada:** ${audit.homepageScore}/100.`);
  } else {
    out.push(`- **Portada:** no se pudo analizar (${HOMEPAGE_FAILURE[audit.homepageStatus] ?? audit.homepageStatus}).`);
  }

  if (audit.robots === "unknown") {
    out.push("- **Bots de IA:** no se pudo leer robots.txt (bloqueo o error del servidor); sin dato.");
  } else if (audit.blockedBots.length > 0) {
    out.push(`- **Bots de IA bloqueados en robots.txt:** ${audit.blockedBots.join(", ")} (de ${audit.trackedBots} vigilados).`);
  } else {
    out.push(
      `- **Bots de IA:** ninguno de los ${audit.trackedBots} vigilados está bloqueado${audit.robots === "absent" ? " (no hay robots.txt)" : ""}.`
    );
  }

  const fileLine = (name: string, state: ProbeState, extra = "") =>
    `- **${name}:** ${state === "found" ? `sí${extra}` : state === "absent" ? "no existe" : "no se pudo comprobar"}.`;
  out.push(fileLine("llms.txt", audit.llmsTxt));
  if (audit.sitemap === "found" && audit.sitemapInvalid) {
    out.push("- **sitemap.xml:** la URL responde, pero no contiene un sitemap válido.");
  } else {
    out.push(fileLine("sitemap.xml", audit.sitemap, audit.sitemapLocs !== null ? ` (${audit.sitemapLocs} URLs)` : ""));
  }
  out.push("");

  if (audit.issues.length > 0) {
    out.push("### Qué mejorar", "", "| Prioridad | Comprobación | Arreglo |", "|---|---|---|");
    for (const issue of audit.issues) {
      const detail =
        issue.check === "bot_blocked"
          ? ` (${issue.affectedLabels.join(", ")})`
          : issue.applicableCount > 1
            ? ` (${issue.affectedCount} de ${issue.applicableCount} páginas)`
            : "";
      out.push(`| ${SEVERITY[issue.severity]} | ${label(issue.check)}${detail} | ${LABEL[issue.check]?.fix ?? "—"} |`);
    }
    out.push("");
  } else if (audit.homepageStatus === "analyzed") {
    out.push("No hay problemas técnicos en lo medido.", "");
  }

  if (audit.evidence) out.push(...evidenceTable(audit));
  if (extraPages.length > 0) out.push(...pagesTable(audit.pages ?? []));

  const passing = audit.passing.filter((check) => check.passedCount === check.applicableCount).map((check) => label(check.check));
  if (passing.length > 0) out.push(`**Ya está bien:** ${passing.join(", ")}.`, "");

  return out.join("\n");
}

export const LOCAL_SCHEMA = /^(Organization|LocalBusiness|ProfessionalService|Corporation)$|Business$|Agency$/;

function evidenceTable(audit: ProspectAudit): string[] {
  const evidence = audit.evidence;
  if (!evidence) return [];
  const ok = (pass: boolean) => (pass ? "Bien" : "Mejorar");
  const orgTypes = evidence.jsonLdTypes.filter((type) => LOCAL_SCHEMA.test(type));
  const rows: string[] = [];
  if (audit.robots === "unknown") {
    rows.push("| robots.txt para GPTBot, ClaudeBot, Google-Extended | Sin dato | robots.txt no se pudo leer |");
  } else {
    const blocked = audit.keyBots.filter((bot) => !bot.allowed);
    rows.push(
      `| robots.txt para GPTBot, ClaudeBot, Google-Extended | ${ok(blocked.length === 0)} | ${audit.keyBots
        .map((bot) => `${bot.agent}: ${bot.allowed ? "permitido" : "bloqueado"}`)
        .join(" · ")}${audit.robots === "absent" ? " (no hay robots.txt: todo permitido)" : ""} |`
    );
  }
  rows.push(
    `| Schema Organization / LocalBusiness | ${ok(orgTypes.length > 0)} | ${
      evidence.jsonLdTypes.length ? `tipos JSON-LD encontrados: ${evidence.jsonLdTypes.join(", ")}` : "la portada no tiene JSON-LD"
    } |`
  );
  rows.push(
    `| Título | ${ok(evidence.titleLength >= 15 && evidence.titleLength <= 70)} | ${evidence.title ? `«${evidence.title}»` : "sin <title>"} (${evidence.titleLength} caracteres; recomendado 15–70) |`
  );
  rows.push(
    `| Meta description | ${ok(evidence.descriptionLength >= 50 && evidence.descriptionLength <= 160)} | ${
      evidence.descriptionLength ? `${evidence.descriptionLength} caracteres` : "no tiene"
    } (recomendado 50–160) |`
  );
  rows.push(`| Un solo <h1> | ${ok(evidence.h1Count === 1)} | ${evidence.h1Count} <h1> en la portada |`);
  rows.push(
    `| Se lee sin JavaScript | ${ok(evidence.contentOk)} | el HTML servido, sin ejecutar JavaScript, muestra ${evidence.wordCount} palabras visibles |`
  );
  return ["### Evidencia por comprobación", "", `Portada leída: ${evidence.finalUrl}`, "", "| Comprobación | Resultado | Evidencia |", "|---|---|---|", ...rows, ""];
}

const cell = (text: string) => text.replace(/\|/g, "/");

/** One row per audited page with its own evidence, so a verdict on any page can be checked. */
function pagesTable(pages: ProspectPage[]): string[] {
  const rows = pages.map((page) => {
    const evidence = page.evidence;
    const measured = evidence
      ? `${evidence.title ? `«${cell(evidence.title)}» (${evidence.titleLength})` : "sin <title>"} · descripción ${evidence.descriptionLength} · ${evidence.h1Count} <h1> · ${evidence.wordCount} palabras sin JS · JSON-LD: ${evidence.jsonLdTypes.length ? evidence.jsonLdTypes.join(", ") : "ninguno"}`
      : "—";
    return `| ${cell(page.url)} | ${SOURCE[page.source]} | ${PAGE_STATUS[page.status] ?? page.status} | ${page.pageScore ?? "—"} | ${measured} |`;
  });
  return ["### Páginas analizadas", "", "| Página | Por qué se miró | Estado | Nota | Evidencia (título, descripción, h1, palabras, JSON-LD) |", "|---|---|---|---|---|", ...rows, ""];
}
