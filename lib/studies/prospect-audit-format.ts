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
};

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

  const passing = audit.passing.filter((check) => check.passedCount === check.applicableCount).map((check) => label(check.check));
  if (passing.length > 0) out.push(`**Ya está bien:** ${passing.join(", ")}.`, "");

  return out.join("\n");
}
