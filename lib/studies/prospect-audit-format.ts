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
  /** What was measured on the homepage, so every verdict carries its evidence. Null when it could not be read. */
  evidence: {
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
  } | null;
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

const label = (check: IssueCheckKey) => LABEL[check]?.label ?? check;

export function formatAuditSection(audit: ProspectAudit): string {
  const out: string[] = [`## Auditoría técnica (${audit.domain})`, ""];
  out.push(
    "Qué se ha medido: la portada y los ficheros robots.txt, llms.txt y sitemap.xml, con las mismas comprobaciones que la Auditoría web de GenScore. No es una auditoría del sitio entero: el resto de páginas no se ha mirado.",
    ""
  );

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
      const detail = issue.check === "bot_blocked" ? ` (${issue.affectedLabels.join(", ")})` : "";
      out.push(`| ${SEVERITY[issue.severity]} | ${label(issue.check)}${detail} | ${LABEL[issue.check]?.fix ?? "—"} |`);
    }
    out.push("");
  } else if (audit.homepageStatus === "analyzed") {
    out.push("No hay problemas técnicos en lo medido.", "");
  }

  if (audit.evidence) out.push(...evidenceTable(audit));

  const passing = audit.passing.filter((check) => check.passedCount === check.applicableCount).map((check) => label(check.check));
  if (passing.length > 0) out.push(`**Ya está bien:** ${passing.join(", ")}.`, "");

  return out.join("\n");
}

const LOCAL_SCHEMA = /^(Organization|LocalBusiness|ProfessionalService|Corporation)$|Business$|Agency$/;

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
