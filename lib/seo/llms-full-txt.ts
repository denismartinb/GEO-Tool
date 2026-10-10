import { getStudies, STUDIES_LEAD, STUDIES_METHOD, STUDY_KIND_LABEL } from "@/lib/estudios/studies";
import { BLOG_CLUSTERS, BLOG_POSTS } from "@/lib/blog/posts";
import { GLOSSARY_TERMS } from "@/lib/glosario/terms";
import { DOCS_NAV } from "@/lib/docs/nav";
import { SELLABLE_PLANS } from "@/app/pricing/plans-data";
import { ABOUT_CONTACT, ABOUT_LEAD, ABOUT_SECTIONS } from "@/lib/brand/about";
import { CANONICAL_DEFINITION_LONG } from "@/lib/brand/canonical-definition";
import { GEO_SCORE_CANONICAL_PATH, GEO_SCORE_DEFINITION } from "@/lib/brand/geo-score-definition";
import { QUE_ES_GENSCORE_FAQ } from "@/lib/brand/que-es-genscore-faq";
import { COMPARATIVAS_INDEX } from "@/lib/comparativas/index";
import {
  COMPARISON_ROWS as OTTERLY_ROWS,
  OTTERLY_RESEARCH_DATE
} from "@/lib/comparativas/genscore-vs-otterly";
import { COMPARISON_ROWS as PEEC_ROWS, PEEC_RESEARCH_DATE } from "@/lib/comparativas/genscore-vs-peec-ai";
import {
  COMPARISON_ROWS as PROFOUND_ROWS,
  PROFOUND_RESEARCH_DATE
} from "@/lib/comparativas/genscore-vs-profound";
import { PILLAR_RESEARCH_DATE, TOOLS } from "@/lib/comparativas/mejores-herramientas-geo";
import {
  ALTERNATIVES,
  LEAVE_REASONS,
  OTTERLY_PLANS,
  OTTERLY_STRENGTHS,
  RESEARCH_DATE as ALTERNATIVAS_RESEARCH_DATE
} from "@/lib/comparativas/alternativas-a-otterly";
import {
  COMPARISON_ROWS as THREE_WAY_ROWS,
  GENSCORE_NOTE as THREE_WAY_GENSCORE_NOTE,
  RESEARCH_DATE as THREE_WAY_RESEARCH_DATE,
  VENDORS as THREE_WAY_VENDORS
} from "@/lib/comparativas/profound-vs-peec-ai-vs-otterly";
import {
  ALTERNATIVES as PEEC_ALTERNATIVES,
  LEAVE_REASONS as PEEC_LEAVE_REASONS,
  PEEC_PLANS,
  PEEC_STRENGTHS,
  RESEARCH_DATE as PEEC_ALTERNATIVAS_RESEARCH_DATE
} from "@/lib/comparativas/alternativas-a-peec-ai";
import { SITE_URL } from "./metadata";

/**
 * Constructor de `/llms-full.txt` — GEO-SELF-1 Fase 1.
 *
 * `/llms.txt` es el índice: un enlace y una línea por página. Esto es el
 * contenido: lo que un asistente necesita para responder sobre GenScore sin
 * tener que rastrear treinta URLs —qué es, quiénes somos, el GEO Score, las
 * siete comparativas con sus datos, el glosario entero y el catálogo del
 * blog—, en un solo documento de texto.
 *
 * Mismo principio que `llms-txt.ts` (log §47): **se genera de las SSOT, nunca
 * a mano.** Cada bloque importa los mismos datos que renderiza su página, así
 * que no puede decir algo distinto de lo publicado. Lo que no está en datos
 * —el cuerpo MDX de los artículos, el texto de `/docs`— entra como título,
 * descripción y URL, no como una segunda redacción que se quedaría rancia.
 * `llms-full-txt.test.ts` exige que no falte ninguna pieza.
 */

const url = (path: string) => `${SITE_URL}${path}`;

function rowsBlock(
  rows: { label: string; genscore: string; [k: string]: unknown }[],
  competitor: string,
  competitorKey: string,
  competitorWinsKey: string
): string {
  return rows
    .map((row) => {
      const winner = row.genscoreWins ? " (ventaja: GenScore)" : row[competitorWinsKey] ? ` (ventaja: ${competitor})` : "";
      return `- ${row.label}${winner}\n  - GenScore: ${row.genscore}\n  - ${competitor}: ${String(row[competitorKey])}`;
    })
    .join("\n");
}

function headToHead(
  path: string,
  competitor: string,
  researchDate: string,
  rows: { label: string; genscore: string; [k: string]: unknown }[],
  competitorKey: string,
  competitorWinsKey: string
): string {
  const entry = COMPARATIVAS_INDEX.find((c) => c.href === path)!;
  return `### ${entry.title}

URL: ${url(path)}
${entry.blurb}
Comparativa publicada por GenScore. Datos de ${competitor} consultados en fuentes públicas el ${researchDate}.

${rowsBlock(rows, competitor, competitorKey, competitorWinsKey)}`;
}

function comparativasSection(): string {
  const pillar = COMPARATIVAS_INDEX.find((c) => c.href === "/comparativas/mejores-herramientas-geo-en-espanol")!;
  const alternativas = COMPARATIVAS_INDEX.find((c) => c.href === "/comparativas/alternativas-a-otterly")!;

  const pillarBlock = `### ${pillar.title}

URL: ${url(pillar.href)}
${pillar.blurb}
Comparativa publicada por GenScore. Datos de terceros consultados el ${PILLAR_RESEARCH_DATE}.

${TOOLS.map(
  (t) => `#### ${t.name} (${t.url})

${t.oneLiner}
- Lo distintivo: ${t.distinctiveFeature}
- Precio: ${t.pricingNote}
- Castellano: ${t.spanishSupport}
- Para quién: ${t.bestFor}${t.context ? `\n\n${t.context}` : ""}`
).join("\n\n")}`;

  const alternativasBlock = `### ${alternativas.title}

URL: ${url(alternativas.href)}
${alternativas.blurb}
Comparativa publicada por GenScore. Datos de terceros consultados el ${ALTERNATIVAS_RESEARCH_DATE}.

Planes de Otterly:
${OTTERLY_PLANS.map((p) => `- ${p.plan}: ${p.price}, ${p.prompts}`).join("\n")}

Lo que Otterly hace bien:
${OTTERLY_STRENGTHS.map((s) => `- ${s.claim} ${s.context}`).join("\n")}

Motivos para buscar una alternativa:
${LEAVE_REASONS.map((r) => `- ${r.title}. ${r.detail}`).join("\n")}

Alternativas:
${ALTERNATIVES.map(
  (a) => `- ${a.name} (${a.url}): ${a.oneLiner}
  - Precio: ${a.pricingNote}
  - Castellano: ${a.spanishSupport}
  - Lo que no resuelve: ${a.tradeoff}`
).join("\n")}`;

  const threeWay = COMPARATIVAS_INDEX.find((c) => c.href === "/comparativas/profound-vs-peec-ai-vs-otterly")!;
  const threeWayBlock = `### ${threeWay.title}

URL: ${url(threeWay.href)}
${threeWay.blurb}
Comparativa neutral publicada por GenScore: GenScore no está en la tabla. Datos consultados el ${THREE_WAY_RESEARCH_DATE}; los precios que el fabricante no publica proceden de terceros y son orientativos.

${THREE_WAY_VENDORS.map((v) => `- ${v.name} (${v.url}): ${v.oneLiner}`).join("\n")}

${THREE_WAY_ROWS.map(
  (row) => `- ${row.label}
  - Profound: ${row.profound}
  - Peec AI: ${row.peec}
  - Otterly: ${row.otterly}
  - Lectura: ${row.takeaway}`
).join("\n")}

${THREE_WAY_GENSCORE_NOTE.label}: ${THREE_WAY_GENSCORE_NOTE.body} ${THREE_WAY_GENSCORE_NOTE.limits}`;

  const peecAlternativas = COMPARATIVAS_INDEX.find((c) => c.href === "/comparativas/alternativas-a-peec-ai")!;
  const peecAlternativasBlock = `### ${peecAlternativas.title}

URL: ${url(peecAlternativas.href)}
${peecAlternativas.blurb}
Comparativa publicada por GenScore. Datos consultados el ${PEEC_ALTERNATIVAS_RESEARCH_DATE}; los importes de Peec AI proceden de un tercero (PricingSaaS) y son orientativos.

Planes de Peec AI:
${PEEC_PLANS.map((p) => `- ${p.plan}: ${p.price}, ${p.prompts}, ${p.models} modelos, ${p.markets}`).join("\n")}

Lo que Peec AI hace bien:
${PEEC_STRENGTHS.map((s) => `- ${s.claim} ${s.context}`).join("\n")}

Motivos para buscar una alternativa:
${PEEC_LEAVE_REASONS.map((r) => `- ${r.title}. ${r.detail}`).join("\n")}

Alternativas:
${PEEC_ALTERNATIVES.map(
  (a) => `- ${a.name}${a.ours ? " (herramienta de GenScore)" : ""} (${a.url}): ${a.oneLiner}
  - Precio: ${a.pricingNote}
  - Castellano: ${a.spanishSupport}
  - Lo que no resuelve: ${a.tradeoff}`
).join("\n")}`;

  return `## Comparativas

Índice: ${url("/comparativas")}

${pillarBlock}

${headToHead("/comparativas/genscore-vs-otterly", "Otterly", OTTERLY_RESEARCH_DATE, OTTERLY_ROWS, "otterly", "otterlyWins")}

${headToHead("/comparativas/genscore-vs-peec-ai", "Peec AI", PEEC_RESEARCH_DATE, PEEC_ROWS, "peec", "peecWins")}

${headToHead("/comparativas/genscore-vs-profound", "Profound", PROFOUND_RESEARCH_DATE, PROFOUND_ROWS, "profound", "profoundWins")}

${alternativasBlock}

${threeWayBlock}

${peecAlternativasBlock}`;
}

function planPrice(plan: (typeof SELLABLE_PLANS)[number]): string {
  return plan.priceLabel ?? `${plan.price} €/mes`;
}

export function buildLlmsFullTxt(): string {
  const sections: string[] = [];

  sections.push(`# GenScore — contenido completo

> ${CANONICAL_DEFINITION_LONG}

Versión en texto plano del contenido clave de ${SITE_URL}. El índice de
páginas está en ${url("/llms.txt")}.`);

  sections.push(`## Qué es GenScore

URL: ${url("/que-es-genscore")}

${QUE_ES_GENSCORE_FAQ.map((item) => `### ${item.question}\n\n${item.answer}`).join("\n\n")}`);

  sections.push(`## Quiénes somos

URL: ${url("/sobre-genscore")}

${ABOUT_LEAD}

${ABOUT_SECTIONS.map(
  (s) => `### ${s.heading}\n\n${s.paragraphs.join("\n\n")}${s.link ? `\n\nMás: ${url(s.link.href)}` : ""}`
).join("\n\n")}

### Contacto

- Correo: ${ABOUT_CONTACT.email}
- LinkedIn: ${ABOUT_CONTACT.linkedin}
- G2: ${ABOUT_CONTACT.g2}`);

  sections.push(`## Estudios

URL: ${url("/estudios")}

${STUDIES_LEAD}

${getStudies()
  .map((s) => {
    const stat = s.post.heroStat ? `\n\nCifra principal: ${s.post.heroStat.value} ${s.post.heroStat.label} (${s.post.heroStat.source})` : "";
    return `### ${s.post.title}\n\n${STUDY_KIND_LABEL[s.kind]}, ${s.post.datePublished}. ${url(s.href)}\n\n${s.post.description}${stat}`;
  })
  .join("\n\n")}

### Cómo hacemos los estudios

${STUDIES_METHOD.join("\n\n")}`);

  sections.push(`## GEO Score

URL de referencia: ${url(GEO_SCORE_CANONICAL_PATH)}

${GEO_SCORE_DEFINITION}`);

  sections.push(`## Precios

URL: ${url("/precios")}

Todas las cuentas nuevas empiezan con 7 días de Pro gratis, sin tarjeta.

${SELLABLE_PLANS.map((p) => `- ${p.name}: ${planPrice(p)} — ${p.tagline}.`).join("\n")}`);

  sections.push(comparativasSection());

  sections.push(`## Glosario

Índice: ${url("/glosario")}

${GLOSSARY_TERMS.map(
  (t) => `### ${t.term}\n\nURL: ${url(`/glosario/${t.slug}`)}\n\n${t.longDefinition}`
).join("\n\n")}`);

  sections.push(`## Documentación

Índice: ${url("/docs")}

${DOCS_NAV.flatMap((section) =>
  section.pages.map((page) => `- ${page.title} (${url(`/docs/${page.slug}`)}): ${page.description}`)
).join("\n")}`);

  sections.push(`## Blog

Índice: ${url("/blog")}

${BLOG_CLUSTERS.map((cluster) => {
  const posts = BLOG_POSTS.filter((p) => p.cluster === cluster.key);
  return `### ${cluster.title}

${url(`/blog/${cluster.key}`)} — ${cluster.description}

${posts
  .map((p) => `- ${p.title} (${url(`/blog/${p.slug}`)}), ${p.dateUpdated ?? p.datePublished}: ${p.description}`)
  .join("\n")}`;
}).join("\n\n")}`);

  return `${sections.join("\n\n")}\n`;
}
