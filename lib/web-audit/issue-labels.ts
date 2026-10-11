import type { IssueCheckKey, IssueSeverity, TechnicalIssue } from "@/lib/web-audit/issues";

/**
 * Presentation-layer labels/guidance for lib/web-audit/issues.ts's technical
 * checks (WEB-AUDIT-ISSUES-1 fase 2). Deterministic, aggregate-level text —
 * same rationale as buildPageCheckGuidance (no LLM, no interpretation), just
 * phrased for "N pages fail this" instead of one page's own detail.
 *
 * Lives here, not in the Auditoría SEO screen, because Visión general names
 * the same issues in its Auditoría SEO card (SEARCH-SEO-1, log §271): one
 * label per check, so the two screens never call a problem by two names.
 */
/** Who a check matters to: Google's results, the AI engines, or both. */
export type IssueAudience = "google" | "ia";

export type IssueCheckMeta = {
  label: string;
  /** What to do about it. */
  guidance: string;
  /** Why it matters, in one or two plain sentences (Auditoría SEO's "Por qué importa"). */
  why: string;
  /** The GOOGLE / IA tags the screen shows next to the check. Empty when neither is honest (Open Graph is for link previews). */
  audience: IssueAudience[];
  unit: "página" | "bot";
};

export const ISSUE_CHECK_META: Record<IssueCheckKey, IssueCheckMeta> = {
  structured_data: {
    label: "Datos estructurados",
    guidance: "Añade datos estructurados (JSON-LD) con un @type reconocido por los motores de IA: Article, FAQPage, HowTo, Product, Organization…",
    why: "Los datos estructurados le dicen a Google y a la IA qué es cada página (un servicio, un producto, una pregunta frecuente) sin que tengan que deducirlo del texto.",
    audience: ["google", "ia"],
    unit: "página"
  },
  single_h1: {
    label: "Un solo <h1> por página",
    guidance: "Usa un único <h1> en cada página afectada.",
    why: "El <h1> es el titular de la página. Si hay varios, o ninguno, Google tiene que adivinar de qué trata.",
    audience: ["google"],
    unit: "página"
  },
  two_h2: {
    label: "Al menos dos <h2>",
    guidance: "Añade al menos dos <h2> que estructuren la respuesta.",
    why: "Los <h2> dividen la página en apartados. A Google le ayudan a entenderla y a la IA a encontrar el trozo que responde a la pregunta.",
    audience: ["google", "ia"],
    unit: "página"
  },
  answer_first_intro: {
    label: "Intro respuesta-primero",
    guidance: "Añade un párrafo de al menos 200 caracteres justo después del título que responda directamente a la pregunta principal.",
    why: "Los asistentes citan sobre todo páginas que contestan en el primer párrafo. Si la respuesta está enterrada, citan a otro.",
    audience: ["ia"],
    unit: "página"
  },
  title_length: {
    label: "Título con longitud válida",
    guidance: "Ajusta el <title> a entre 15 y 70 caracteres.",
    why: "El título es lo que Google enseña en el resultado y lo primero que lee la IA. Si es muy corto o muy largo, se corta o no dice nada.",
    audience: ["google", "ia"],
    unit: "página"
  },
  description_length: {
    label: "Meta description con longitud válida",
    guidance: "Ajusta la meta description a entre 50 y 160 caracteres.",
    why: "Google suele usar la meta description como resumen bajo el título. Una buena descripción hace que más gente entre.",
    audience: ["google"],
    unit: "página"
  },
  open_graph: {
    label: "Etiquetas Open Graph",
    guidance: "Añade etiquetas Open Graph (og:title y og:description).",
    why: "Es el título y el resumen que se ven al compartir un enlace a tu página en redes y en chats.",
    audience: [],
    unit: "página"
  },
  noindex: {
    label: "Página indexable",
    guidance: 'Quita la etiqueta <meta name="robots" content="noindex"> — mientras esté, ni Google ni los motores de IA pueden indexar la página.',
    why: "Con noindex, Google no muestra la página en sus resultados y los asistentes que buscan en la web tampoco la encuentran.",
    audience: ["google", "ia"],
    unit: "página"
  },
  canonical: {
    label: "Canonical propio",
    guidance: 'Añade o corrige el <link rel="canonical"> para que apunte a esta misma URL en tu dominio.',
    why: "El canonical dice cuál es la versión buena de una página. Sin él, Google puede repartir la relevancia entre copias o elegir otra URL.",
    audience: ["google"],
    unit: "página"
  },
  hreflang: {
    label: "Hreflang",
    guidance: 'Si estas páginas tienen versiones en otros idiomas o países, añade etiquetas <link rel="alternate" hreflang="...">.',
    why: "Si tienes la web en varios idiomas o países, hreflang hace que Google enseñe a cada persona la versión que le toca.",
    audience: ["google"],
    unit: "página"
  },
  list_or_table: {
    label: "Listas o tablas",
    guidance: "Añade listas o tablas que estructuren la información — los motores de IA citan con más frecuencia contenido en ese formato.",
    why: "Las listas y las tablas son fáciles de extraer, y los asistentes las citan más que un bloque de texto seguido.",
    audience: ["ia"],
    unit: "página"
  },
  content_length: {
    label: "Contenido sustancial",
    guidance: "Amplía el contenido visible de la página — los motores de IA prefieren respuestas sustanciales.",
    why: "Una página con muy poco texto tiene poco que posicionar en Google y poco que citar para la IA.",
    audience: ["google", "ia"],
    unit: "página"
  },
  freshness: {
    label: "Contenido actualizado",
    guidance: "Actualiza el contenido y refresca su fecha de modificación (dateModified en el JSON-LD, o una etiqueta de última modificación).",
    why: "Google y los asistentes prefieren información reciente, y sin fecha no pueden saber si lo que dices sigue siendo cierto.",
    audience: ["google", "ia"],
    unit: "página"
  },
  snippet_blocked: {
    label: "Fragmentos bloqueados",
    guidance:
      'Estas páginas declaran "nosnippet" o "max-snippet:0", que prohíbe a los motores reproducir un fragmento — sin fragmento no hay cita, por buena que sea la página. Quítalo de la etiqueta <meta name="robots"> o de la cabecera X-Robots-Tag de tu servidor o CDN.',
    why: "Con nosnippet, los buscadores y los asistentes pueden encontrar la página pero no reproducir ni una frase de ella, así que no pueden citarla.",
    audience: ["google", "ia"],
    unit: "página"
  },
  bot_blocked: {
    label: "Acceso de bots de IA",
    guidance: "Revisa tu robots.txt y quita la regla que bloquea a este motor.",
    why: "Si robots.txt bloquea al bot de un asistente, ese asistente no puede leer ninguna página de tu web.",
    audience: ["ia"],
    unit: "bot"
  },
  llms_txt_missing: {
    label: "llms.txt",
    guidance: "Publica un fichero llms.txt en la raíz de tu dominio con una guía de lectura para los modelos de IA.",
    why: "llms.txt es una guía de lectura para los modelos de IA. Todavía es una práctica nueva, pero cuesta poco y les ayuda a encontrar lo importante.",
    audience: ["ia"],
    unit: "página"
  },
  sitemap_missing: {
    label: "sitemap.xml",
    guidance:
      "Un sitemap le dice a los buscadores y a los motores de IA qué páginas tienes. Casi seguro que tu plataforma ya sabe generarlo — es cuestión de activarlo, no de escribirlo.",
    why: "El sitemap es la lista de páginas de tu web. Sin él, Google y los bots de IA sólo encuentran lo que está enlazado.",
    audience: ["google", "ia"],
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

/** One name per severity, shared by the Auditoría SEO screen and Visión general's card: [singular, plural]. */
export const ISSUE_SEVERITY_LABELS: Record<IssueSeverity, [string, string]> = {
  critical: ["Crítico", "Críticos"],
  warning: ["Aviso", "Avisos"],
  improvement: ["Mejora", "Mejoras"]
};
