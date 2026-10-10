import type { IssueCheckKey, TechnicalIssue } from "@/lib/web-audit/issues";

/**
 * Presentation-layer labels/guidance for lib/web-audit/issues.ts's technical
 * checks (WEB-AUDIT-ISSUES-1 fase 2). Deterministic, aggregate-level text —
 * same rationale as buildPageCheckGuidance (no LLM, no interpretation), just
 * phrased for "N pages fail this" instead of one page's own detail.
 *
 * Lives here, not in the Auditoría SEO screen, because Visión general names
 * the same issues in its Auditoría SEO card (SEARCH-SEO-1, log §269): one
 * label per check, so the two screens never call a problem by two names.
 */
export const ISSUE_CHECK_META: Record<IssueCheckKey, { label: string; guidance: string; unit: "página" | "bot" }> = {
  structured_data: {
    label: "Datos estructurados",
    guidance: "Añade datos estructurados (JSON-LD) con un @type reconocido por los motores de IA: Article, FAQPage, HowTo, Product, Organization…",
    unit: "página"
  },
  single_h1: { label: "Un solo <h1> por página", guidance: "Usa un único <h1> en cada página afectada.", unit: "página" },
  two_h2: { label: "Al menos dos <h2>", guidance: "Añade al menos dos <h2> que estructuren la respuesta.", unit: "página" },
  answer_first_intro: {
    label: "Intro respuesta-primero",
    guidance: "Añade un párrafo de al menos 200 caracteres justo después del título que responda directamente a la pregunta principal.",
    unit: "página"
  },
  title_length: { label: "Título con longitud válida", guidance: "Ajusta el <title> a entre 15 y 70 caracteres.", unit: "página" },
  description_length: {
    label: "Meta description con longitud válida",
    guidance: "Ajusta la meta description a entre 50 y 160 caracteres.",
    unit: "página"
  },
  open_graph: { label: "Etiquetas Open Graph", guidance: "Añade etiquetas Open Graph (og:title y og:description).", unit: "página" },
  noindex: {
    label: "Página indexable",
    guidance: 'Quita la etiqueta <meta name="robots" content="noindex"> — mientras esté, ni Google ni los motores de IA pueden indexar la página.',
    unit: "página"
  },
  canonical: {
    label: "Canonical propio",
    guidance: 'Añade o corrige el <link rel="canonical"> para que apunte a esta misma URL en tu dominio.',
    unit: "página"
  },
  hreflang: {
    label: "Hreflang",
    guidance: 'Si estas páginas tienen versiones en otros idiomas o países, añade etiquetas <link rel="alternate" hreflang="...">.',
    unit: "página"
  },
  list_or_table: {
    label: "Listas o tablas",
    guidance: "Añade listas o tablas que estructuren la información — los motores de IA citan con más frecuencia contenido en ese formato.",
    unit: "página"
  },
  content_length: {
    label: "Contenido sustancial",
    guidance: "Amplía el contenido visible de la página — los motores de IA prefieren respuestas sustanciales.",
    unit: "página"
  },
  freshness: {
    label: "Contenido actualizado",
    guidance: "Actualiza el contenido y refresca su fecha de modificación (dateModified en el JSON-LD, o una etiqueta de última modificación).",
    unit: "página"
  },
  snippet_blocked: {
    label: "Fragmentos bloqueados",
    guidance:
      'Estas páginas declaran "nosnippet" o "max-snippet:0", que prohíbe a los motores reproducir un fragmento — sin fragmento no hay cita, por buena que sea la página. Quítalo de la etiqueta <meta name="robots"> o de la cabecera X-Robots-Tag de tu servidor o CDN.',
    unit: "página"
  },
  bot_blocked: { label: "Acceso de bots de IA", guidance: "Revisa tu robots.txt y quita la regla que bloquea a este motor.", unit: "bot" },
  llms_txt_missing: {
    label: "llms.txt",
    guidance: "Publica un fichero llms.txt en la raíz de tu dominio con una guía de lectura para los modelos de IA.",
    unit: "página"
  },
  sitemap_missing: {
    label: "sitemap.xml",
    guidance:
      "Un sitemap le dice a los buscadores y a los motores de IA qué páginas tienes. Casi seguro que tu plataforma ya sabe generarlo — es cuestión de activarlo, no de escribirlo.",
    unit: "página"
  }
};

export function pluralizeUnit(unit: "página" | "bot", count: number): string {
  if (unit === "bot") return count === 1 ? "bot" : "bots";
  return count === 1 ? "página" : "páginas";
}


export const SINGLE_FACT_CHECKS = new Set<IssueCheckKey>(["llms_txt_missing", "sitemap_missing"]);

/** "3 de 10 páginas", "1 de 5 bots", or "No encontrado" for a site-wide file that is simply missing. */
export function issueScopeLabel(issue: TechnicalIssue): string {
  if (SINGLE_FACT_CHECKS.has(issue.check)) return "No encontrado";
  const unit = ISSUE_CHECK_META[issue.check].unit;
  return `${issue.affectedCount} de ${issue.applicableCount} ${pluralizeUnit(unit, issue.applicableCount)}`;
}
