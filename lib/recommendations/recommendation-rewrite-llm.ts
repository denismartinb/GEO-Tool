import "server-only";

import { z } from "zod";
import { generateGeminiJson } from "@/lib/llm/gemini-client";
import { CODE_ARTIFACT_MAX, PROSE_ARTIFACT_MAX } from "@/lib/recommendations/pasteable-artifact";

/**
 * PRELAUNCH-HARDENING-1 Fase R5 (2/2) — la reescritura de recomendaciones, en
 * su zona. Le aplica `.claude/rules/recommendations.md` y queda junto a
 * `lib/recommendations/rewrite-recommendation.ts`, que es quien la orquesta.
 * `lib/llm/gemini.ts` la reexporta porque su test mockea esa ruta (log §80).
 */

export type RecommendationRewriteInput = {
  brand: string;
  domain: string;
  language: string;
  recommendationType: string;
  ruleTitle: string;
  ruleDescription: string;
  whyThisMatters: string;
  affectedPrompts: string[];
  mentionedCompetitors: string[];
  /**
   * The FULL set of domains this recommendation's evidence anchors — the same
   * set the anti-fabrication guard enforces on the answer
   * (lib/recommendations/anchored-domains.ts). It must stay the same set on
   * both sides: this prompt's allowlist used to be the narrower
   * `evidence_json.citation_domains` while the prompt also handed over
   * `citationPages` built from a different list, so a card whose cited pages
   * fell outside those domains asked the model for a page name the guard then
   * rejected — and the rewrite failed on that card every time.
   */
  citationDomains: string[];
  dominantCompetitor?: string;
  evidenceSnippets: string[];
  /**
   * Specific pages (title + url) the AI already cites (RECS-2B / N2,
   * pursue_citation_sources only) — lets the digital-PR asset target a named
   * article instead of only a bare domain. Every domain here is part of the
   * anchored set above, so naming one of these pages is allowed by the guard.
   */
  citationPages?: { domain: string; title: string; url: string }[];
};

export type RecommendationRewrite = {
  title: string;
  summary: string;
  steps: string[];
  examples: { label: string; content: string }[];
};

const recommendationRewriteSchema = z.object({
  title: z.string(),
  summary: z.string(),
  steps: z.array(z.string()).default([]),
  // Back-compat: accept either the new `examples` array or a legacy single
  // `example` object, so an older-style model response still parses.
  examples: z.array(z.object({ label: z.string(), content: z.string() })).optional(),
  example: z.object({ label: z.string(), content: z.string() }).nullable().optional()
});

const MAX_GENERATED_EXAMPLES = 3;

/**
 * Turns a rule-based recommendation into a structured, copy-paste-ready action
 * plan — using ONLY the facts passed in (the recommendation engine owns "what
 * gap + what evidence"; the caller in lib/recommendations/rewrite-recommendation.ts
 * anchors that evidence and re-validates + sanitizes the result before
 * persisting). This function only builds the prompt and parses Gemini's JSON.
 *
 * Output shape: a specific `title`, a 1-2 sentence `summary`, 3-6 concrete
 * `steps`, and an optional ready-to-paste `example` artifact (e.g. a citable
 * paragraph or FAQ block) the user can drop onto their site. Real examples must
 * stay anchored to the given facts — a placeholder like "[tu dato aquí]" is
 * required where a specific value isn't in the evidence, never an invented one.
 *
 * Fail-soft on schema-invalid output (returns null), matching this file's
 * suggestCompetitors/generateAddedPrompts convention. A network/API failure
 * still throws, also matching that convention — the caller is expected to
 * catch it and fall back safely (no fake success, no raw error surfaced).
 */
/**
 * Type-specific asset guidance (Fase C1). The base prompt produces a generic
 * action plan; this steers the steps and example artifacts toward the
 * deliverable that actually fits each gap type — a comparison page for a
 * competitor gap, a FAQ for an informational gap, an Organization schema for an
 * entity-clarity gap, etc. Returns null for unknown types (generic plan). All
 * anti-fabrication rules in the base prompt still apply.
 */
function assetPlaybook(input: RecommendationRewriteInput): string | null {
  const competitor = input.dominantCompetitor ?? input.mentionedCompetitors[0] ?? "el competidor";
  switch (input.recommendationType) {
    case "close_competitor_gap":
      return `ASSET FOCUS — comparison page: build the plan around a "${input.brand} vs ${competitor}" or "alternativa a ${competitor}" page. Provide as examples a page outline (H1 + H2/H3 sections) and a short comparison table (rows = criteria; columns = ${input.brand} and ${competitor} only), using only the given facts and [tu dato aquí] placeholders.`;
    case "add_comparison_content":
      return `ASSET FOCUS — comparison: provide as examples a concise comparison table (rows = criteria; one column for ${input.brand} and one per named competitor only) and a FAQPage JSON-LD snippet answering the comparative query.`;
    case "create_faq_section":
      return "ASSET FOCUS — FAQ: provide as examples 2-4 concise question/answer pairs matching the affected prompts, plus a FAQPage JSON-LD snippet wrapping them.";
    case "strengthen_brand_entity_clarity":
      return `ASSET FOCUS — entity clarity: provide as examples an Organization JSON-LD snippet (name "${input.brand}", url the brand domain, a short description, its category) and a brief "Acerca de" page outline stating the brand's category and key descriptors.`;
    case "add_citation_block":
      return "ASSET FOCUS — citable block: provide as examples a factual, directly-extractable paragraph answering the affected query, and an Article or FAQPage JSON-LD snippet.";
    case "address_negative_narrative":
      return "ASSET FOCUS — counter-narrative: AI answers carry a recurring negative perception of the brand around the theme in the facts below. Provide as examples (1) a content brief to counter it — target page, angle, and the factual points/proof to publish (use only given facts; [tu dato aquí] for any specific metric), and (2) a short, citable factual paragraph that directly addresses that theme. Stay factual and respectful: correct with evidence, never deny, attack, or invent figures.";
    case "update_stale_content":
      return "ASSET FOCUS — freshness update: the AI is citing outdated information about the brand. Provide as examples (1) a list of the specific facts or figures that appear stale based on the evidence snippets (use only what is given; [tu dato aquí] for any updated value to fill in), and (2) a concise, up-to-date factual paragraph the brand can publish so models start citing current information. Never invent dates or numbers — mark every unknown value with a clearly-labelled placeholder.";
    case "pursue_citation_sources":
      return `ASSET FOCUS — digital PR / get cited by your sources: the domains below are sources the AI already trusts in this space that do not mention the brand. Do NOT assume they are all press to email — infer each one's likely type from the domain and give the RIGHT play: publication/blog/listicle/media -> pitch a contribution or request inclusion; marketplace/comparator/directory -> get listed or claim a profile; community/forum (e.g. reddit, quora) -> participate helpfully, never a cold email; an apparent company/provider or a competitor of the brand, or a clearly out-of-market site (a country TLD that does not match the brand's market) -> mark it 'no es un objetivo de outreach' and exclude it from the plan.${input.citationPages?.length ? " When a source has a specific example page listed under 'Example pages already cited', name that exact page/article in the plan instead of only the bare domain — it is a stronger, more concrete PR target." : ""} Examples to provide: (1) a prioritized list of ONLY the relevant sources, each tagged with its type and its specific play (name the specific cited page when one is given for that domain); (2) ONE adaptable outreach template ONLY for the sources where outreach actually applies (publications) — placeholders for names/links, never invent metrics. Use ONLY the domains and pages given.`;
    case "increase_brand_visibility":
      return "ASSET FOCUS — content brief: provide as examples a content brief (target query, search intent, H1 + H2 outline, key entities) and a concise citable intro paragraph for the page.";
    case "increase_brand_prominence":
      return `ASSET FOCUS — prominence: the brand is mentioned but ${input.dominantCompetitor ?? "a competitor"} consistently appears first or more prominently in the same answers. Provide as examples (1) a revised opening/lead paragraph structure for the relevant page that leads with the brand's strongest differentiator and direct answer first (front-load the key fact, don't bury it), and (2) a short outline of what to add so the brand reads as the primary, most complete answer rather than a secondary mention. Use only the given facts; [tu dato aquí] for any missing specific value.`;
    case "amplify_positive_pattern":
      return "ASSET FOCUS — replicate a winning pattern: the evidence snippets below are from queries where the AI ALREADY mentions and cites the brand favorably (no negative framing) — this is not a gap to fix, it's a pattern to copy elsewhere. Provide as examples (1) a short analysis of the common structural/content traits across those winning snippets (e.g. what makes them directly quotable/citable), and (2) a checklist the brand can apply to its weaker pages to replicate that same pattern. Do not propose brand-new unrelated content — the point is replication, not invention.";
    case "track_emerging_competitor":
      return "ASSET FOCUS — competitor tracking suggestion: this is NOT a content gap to fix by publishing something on the brand's site; it's a suggestion to start monitoring a brand inside this tool. Provide as examples (1) a short one-paragraph rationale for why this brand is worth tracking, grounded only in the given facts (how many queries it recurs in), and (2) a brief checklist of what to watch once it is tracked (e.g. compare visibility across the affected prompt categories, watch its position vs. the brand's). Do NOT produce a webpage template, FAQ, or JSON-LD snippet for this recommendation type — there is no page to publish.";
    default:
      return null;
  }
}

/**
 * El prompt exacto que ve el modelo, construido aparte para que el guardián
 * pueda leerlo.
 *
 * Es la única forma de mantener el invariante sin ir ampliando una lista a
 * mano: lo que el modelo puede nombrar es **lo que este texto le enseña**, y el
 * guardián admite exactamente eso. Cada vez que se dedujo el conjunto por otro
 * camino faltó una pieza distinta — primero las páginas citadas (log §137),
 * luego los competidores anclados por su dominio (log §133), y después el
 * TÍTULO de una página citada, que muy a menudo es él mismo un dominio
 * (`blog.hubspot.es — "hubspot.es"`). Tres agujeros del mismo agujero.
 */
export function buildRecommendationRewritePrompt(input: RecommendationRewriteInput): string {
  const playbook = assetPlaybook(input);
  const promptBlock = [
    "You are a senior GEO (Generative Engine Optimization) consultant writing one concrete, copy-paste-ready action plan on a brand's dashboard.",
    "Turn the generic recommendation below into a specific, complete plan this exact brand can act on immediately.",
    "You MUST use ONLY the facts listed below. Do NOT invent any fact, statistic, competitor name, domain, page or detail not explicitly given.",
    "Where a specific value (a number, a price, a date) would be needed but is not in the facts, write a clearly-marked placeholder like [tu dato aquí]. NEVER invent the value.",
    "Do NOT mention any competitor name other than the ones explicitly listed under 'Competitors you may mention'.",
    // RECS-USEFULNESS-1 Fase C (log §128). C1 lo vuelve a comprobar en el
    // servidor sobre una lista cerrada; C2 y C3 son reglas BLANDAS y sólo
    // viven aquí — declarado así a propósito, ver la regla de ruta.
    "You may NAME a competitor, but you may NEVER claim the brand is better, stronger, more reliable or otherwise superior to a named competitor. A neutral, verifiable comparison is fine ('X answers this query, you do not'); a value judgement is not ('unlike X, we keep a high standard'). Comparative advertising naming rivals without objective, verifiable data exposes the brand to a legal claim — never write it, not even softened.",
    "An evaluative adjective about the brand's own product IS an invented value unless a given fact backs it. 'Competitive prices', 'excellent coverage', 'robust network', 'superior experience', 'added value' are inventions exactly like an invented number would be: you do not know them. Either ground the claim in the facts below, or write the placeholder ([tu dato aquí]) and let the user fill it in. Prefer a short, verifiable sentence over a long, flattering one.",
    "Whenever an example is FAQPage (or any schema whose content is user-visible), the plan MUST state that the questions and answers have to be visible on the page itself — structured data describing content that is not on the page is treated as spam by search engines and cannot be corroborated by AI engines.",
    "Do NOT mention any domain or URL other than the ones explicitly listed under 'Domains you may mention'.",
    "If no competitors or domains are listed below, do not invent or imply any.",
    `Write entirely in this language: ${input.language}.`,
    'Return ONLY valid JSON with this exact shape: { "title": string, "summary": string, "steps": string[], "examples": { "label": string, "content": string }[] }.',
    '"title": a single concise, specific sentence, max 140 characters, no surrounding quotes.',
    '"summary": 1-2 sentences, max 400 characters, why this matters for this brand given the facts.',
    '"steps": 3 to 6 concrete, specific actions (each max 200 characters) the brand should take, grounded in the real prompts/competitors below.',
    "IMPORTANT: the brand may ALREADY have this information on its site but in a form AI engines cannot read. So the steps MUST cover not just creating content but making it machine-readable: at least one step on HOW to expose/structure it for AI — clear semantic HTML and descriptive headings, structured data (JSON-LD schema such as FAQPage/Article/Organization) where relevant, content crawlable as real text (not hidden behind scripts, images or logins), and concise directly-extractable answers. Phrase it as 'if you already have this, expose it like this; if not, create it like this'.",
    `"examples": 1 to 3 ready-to-paste TEMPLATE artifacts the user adapts before publishing — one per distinct deliverable the steps call for (e.g. a citable factual paragraph, a short FAQ, a JSON-LD schema snippet). Each is an example to review and fill in, never a verified fact. Each item: "label" names it (max 80 chars); "content" is the pasteable text.`,
    `LENGTH BUDGET — prose artifacts (a paragraph, an outline, an outreach template): up to ${PROSE_ARTIFACT_MAX} characters. Code artifacts (JSON-LD, an HTML snippet): up to ${CODE_ARTIFACT_MAX} characters, because a FAQPage with two answered questions does not fit in less.`,
    "COMPLETENESS BEATS COVERAGE — a code artifact MUST be syntactically complete and valid on its own: every brace, bracket, quote and tag closed, no ellipsis, never stopped mid-sentence. If the full artifact would not fit in its budget, produce a SMALLER but complete one (e.g. a FAQPage with two questions instead of four) — never a truncated larger one. A JSON-LD block that does not parse is worse than no example at all, and it will be discarded.",
    "In any example (especially JSON-LD), the ONLY URLs/domains you may use are the brand domain above and schema.org (for @context). For any other URL — social profiles, third-party pages — use a placeholder like https://[tu-dominio]/pagina; NEVER write a real third-party or competitor domain.",
    ...(playbook ? ["", playbook] : []),
    "",
    `Brand: ${input.brand}`,
    `Brand domain: ${input.domain}`,
    `Recommendation type: ${input.recommendationType}`,
    "",
    "Generic title to improve:",
    input.ruleTitle,
    "Generic description to improve:",
    input.ruleDescription,
    "",
    "Why this matters (real reasoning from the scan):",
    input.whyThisMatters || "(none given)",
    ...(input.dominantCompetitor ? ["", `Dominant competitor in this specific gap: ${input.dominantCompetitor}`] : []),
    "",
    "Real prompts (from this project's actual last scan) affected by this gap:",
    input.affectedPrompts.length ? input.affectedPrompts.map((p) => `- ${p}`).join("\n") : "(none given)",
    "",
    "Real evidence snippets extracted from actual AI answers:",
    input.evidenceSnippets.length ? input.evidenceSnippets.map((s) => `- ${s}`).join("\n") : "(none given)",
    "",
    "Competitors you may mention (do not mention any other competitor):",
    input.mentionedCompetitors.length ? input.mentionedCompetitors.join(", ") : "(none — do not name any competitor)",
    "",
    "Domains you may mention (do not mention any other domain):",
    input.citationDomains.length ? input.citationDomains.join(", ") : "(none — do not name any domain)",
    ...(input.citationPages?.length
      ? [
          "",
          "Example pages already cited by the AI for some of the domains above (domain — title):",
          input.citationPages.map((p) => `- ${p.domain} — "${p.title}"`).join("\n")
        ]
      : [])
  ].join("\n");

  return promptBlock;
}

export async function rewriteRecommendation(input: RecommendationRewriteInput): Promise<RecommendationRewrite | null> {
  const promptBlock = buildRecommendationRewritePrompt(input);

  const raw = await generateGeminiJson(promptBlock);
  const parsed = recommendationRewriteSchema.safeParse(raw);
  if (!parsed.success) return null;

  const title = parsed.data.title.trim();
  const summary = parsed.data.summary.trim();
  if (!title || !summary) return null;
  if (title.length > 200 || summary.length > 600) return null;

  const steps = parsed.data.steps.map((step) => step.trim()).filter((step) => step.length > 0 && step.length <= 400);

  const rawExamples = parsed.data.examples ?? (parsed.data.example ? [parsed.data.example] : []);
  const examples = rawExamples
    .map((item) => ({ label: item.label.trim(), content: item.content.trim() }))
    // El tope de aquí es sólo un cortafuegos contra una respuesta desbocada;
    // quién puede recortarse y quién se descarta entero lo decide
    // `checkPasteableArtifact` en el saneado del servidor (log §126). Antes
    // valía 2000 y descartaba en silencio artefactos de código válidos.
    .filter((item) => item.label.length > 0 && item.content.length > 0 && item.content.length <= CODE_ARTIFACT_MAX)
    .slice(0, MAX_GENERATED_EXAMPLES);

  return { title, summary, steps, examples };
}
