import { describe, expect, it } from "vitest";
import {
  collectAnchoredDomains,
  competitorsAnchoredByDomain,
  domainsShownInPrompt
} from "@/lib/recommendations/anchored-domains";
import { buildRecommendationRewritePrompt } from "@/lib/recommendations/recommendation-rewrite-llm";
import { validateRewriteAgainstEvidence } from "@/lib/recommendations/rewrite-validation";

describe("collectAnchoredDomains", () => {
  it("unions citation domains, source domains and cited pages, de-duplicated and normalized", () => {
    expect(
      collectAnchoredDomains({
        citation_domains: ["amicited.com", "Keyword.com"],
        source_domains: ["amicited.com", "https://www.atrevia.com/"],
        citation_pages: [
          { domain: "blog.hubspot.es", url: "https://blog.hubspot.es/marketing/geo" },
          { domain: "semrush.com", url: "https://es.semrush.com/blog/geo/" }
        ]
      })
    ).toEqual(["amicited.com", "keyword.com", "atrevia.com", "blog.hubspot.es", "semrush.com", "es.semrush.com"]);
  });

  it("keeps the page domain when its url is unparseable, and drops empty entries", () => {
    expect(
      collectAnchoredDomains({
        citation_domains: ["", "  "],
        citation_pages: [{ domain: "dageno.ai", url: "no es una url" }, { domain: "", url: "" }]
      })
    ).toEqual(["dageno.ai"]);
  });

  it("returns an empty set for evidence with no domains at all", () => {
    expect(collectAnchoredDomains({})).toEqual([]);
  });
});

describe("anchored domains vs the anti-fabrication guard", () => {
  // The founder's real GenScore card (pursue_citation_sources, 2026-08-20):
  // the 8-item citation_domains aggregate and the cited pages disagree, and the
  // prompt asks the model to name those exact pages. Before this fix the guard
  // rejected the answer it had just asked for.
  const evidence = {
    citation_domains: [
      "amicited.com",
      "keyword.com",
      "atrevia.com",
      "seranking.com",
      "delve.ai",
      "brand24.com",
      "mentio.tech",
      "extremovirtual.com"
    ],
    source_domains: ["amicited.com", "keyword.com", "atrevia.com"],
    citation_pages: [
      { domain: "amicited.com", url: "https://amicited.com/" },
      { domain: "dageno.ai", url: "https://dageno.ai/herramientas" },
      { domain: "blog.hubspot.es", url: "https://blog.hubspot.es/marketing/geo" },
      { domain: "es.semrush.com", url: "https://es.semrush.com/blog/geo/" }
    ]
  };

  const rewriteNamingTheCitedPages = {
    title: "Consigue que las webs que ya cita la IA mencionen a GenScore",
    description:
      "Prioriza dageno.ai y blog.hubspot.es, y ofrece un dato propio a es.semrush.com: la IA ya cita esas páginas."
  };

  it("rejects the cited pages when only citation_domains is anchored (the bug)", () => {
    expect(
      validateRewriteAgainstEvidence({
        ...rewriteNamingTheCitedPages,
        allowedCompetitors: [],
        allowedDomains: evidence.citation_domains,
        trackedCompetitors: [],
        brandDomain: "genscore.io"
      })
    ).toEqual({ valid: false, reason: "unanchored_domain_mentioned", offending: "dageno.ai" });
  });

  it("accepts them once the full anchored set is used", () => {
    expect(
      validateRewriteAgainstEvidence({
        ...rewriteNamingTheCitedPages,
        allowedCompetitors: [],
        allowedDomains: collectAnchoredDomains(evidence),
        trackedCompetitors: [],
        brandDomain: "genscore.io"
      })
    ).toEqual({ valid: true });
  });

  it("still rejects a domain that is in no part of the evidence", () => {
    expect(
      validateRewriteAgainstEvidence({
        title: "Escribe a inventado-por-la-ia.com",
        description: "Contacta también con otracosa.es.",
        allowedCompetitors: [],
        allowedDomains: collectAnchoredDomains(evidence),
        trackedCompetitors: [],
        brandDomain: "genscore.io"
      })
    ).toEqual({ valid: false, reason: "unanchored_domain_mentioned", offending: "inventado-por-la-ia.com" });
  });
});

describe("competitorsAnchoredByDomain", () => {
  it("admite al competidor cuyo propio dominio está anclado a la tarjeta", () => {
    expect(
      competitorsAnchoredByDomain(
        ["SE Ranking", "Semrush", "Otterly", "Brand24", "Delve AI"],
        ["seranking.com", "es.semrush.com", "brand24.com", "delve.ai"]
      )
    ).toEqual(["SE Ranking", "Semrush", "Brand24", "Delve AI"]);
  });

  it("no admite a un competidor cuyo dominio no está en la evidencia", () => {
    expect(competitorsAnchoredByDomain(["Otterly", "Peec AI"], ["seranking.com", "dageno.ai"])).toEqual([]);
  });

  it("empareja por etiqueta exacta: un dominio parecido no habilita la marca (ADR 0019)", () => {
    expect(competitorsAnchoredByDomain(["Acme"], ["evilacme.com", "acme-falso.com"])).toEqual([]);
    expect(competitorsAnchoredByDomain(["Acme"], ["acme.com"])).toEqual(["Acme"]);
  });

  it("ignora nombres vacíos y dominios sin etiqueta utilizable", () => {
    expect(competitorsAnchoredByDomain(["", "  "], ["seranking.com"])).toEqual([]);
    expect(competitorsAnchoredByDomain(["SE Ranking"], ["", "com"])).toEqual([]);
  });

  it("no se queda con el segundo nivel genérico de un `.co.uk`", () => {
    expect(competitorsAnchoredByDomain(["Which", "Co"], ["which.co.uk"])).toEqual(["Which"]);
  });
});

describe("domainsShownInPrompt", () => {
  // La tarjeta real del fundador (2026-08-21): la página citada es
  // `blog.hubspot.es` y su TÍTULO es la cadena "hubspot.es". El prompt le
  // enseña las dos (`- blog.hubspot.es — "hubspot.es"`), el modelo escribió el
  // título y el guardián lo descartó por «hubspot.es».
  const input = {
    brand: "GenScore",
    domain: "genscore.es",
    language: "es",
    recommendationType: "pursue_citation_sources",
    ruleTitle: "Consigue que 5 webs que cita la IA te mencionen",
    ruleDescription: "La IA se apoya en amicited.com, dageno.ai, blog.hubspot.es en consultas donde tu dominio no aparece.",
    whyThisMatters: "Entrar en las webs que los motores ya citan es la vía más corta.",
    affectedPrompts: ["¿Existen plataformas que ofrezcan análisis competitivo de la visibilidad en IA?"],
    mentionedCompetitors: [],
    citationDomains: ["amicited.com", "keyword.com", "dageno.ai", "blog.hubspot.es"],
    evidenceSnippets: [],
    citationPages: [
      { domain: "blog.hubspot.es", title: "hubspot.es", url: "https://blog.hubspot.es/marketing/geo" },
      { domain: "es.semrush.com", title: "semrush.com", url: "https://es.semrush.com/blog/geo/" }
    ]
  };

  it("incluye el título de una página citada cuando el título es él mismo un dominio", () => {
    const shown = domainsShownInPrompt(buildRecommendationRewritePrompt(input));
    // El dominio de la página y su título, que son distintos y ambos visibles.
    expect(shown).toContain("blog.hubspot.es");
    expect(shown).toContain("hubspot.es");
    expect(shown).toContain("es.semrush.com");
    expect(shown).toContain("semrush.com");
  });

  it("el conjunto por evidencia NO lo incluía: es el agujero que cerró esta vuelta", () => {
    expect(
      collectAnchoredDomains({ citation_domains: input.citationDomains, citation_pages: input.citationPages })
    ).not.toContain("hubspot.es");
  });

  it("una propuesta que nombra el título citado ya no se descarta", () => {
    const shown = domainsShownInPrompt(buildRecommendationRewritePrompt(input));
    expect(
      validateRewriteAgainstEvidence({
        title: "Consigue una mención en hubspot.es",
        description: 'Contacta con quien publica "hubspot.es" (blog.hubspot.es) y ofrece un dato propio.',
        allowedCompetitors: [],
        allowedDomains: shown,
        trackedCompetitors: [],
        brandDomain: "genscore.es"
      })
    ).toEqual({ valid: true });
  });

  it("sigue rechazando un dominio que el prompt no enseña", () => {
    const shown = domainsShownInPrompt(buildRecommendationRewritePrompt(input));
    expect(
      validateRewriteAgainstEvidence({
        title: "Escribe a inventado-por-la-ia.com",
        description: "Y también a otracosa.es.",
        allowedCompetitors: [],
        allowedDomains: shown,
        trackedCompetitors: [],
        brandDomain: "genscore.es"
      })
    ).toEqual({ valid: false, reason: "unanchored_domain_mentioned", offending: "inventado-por-la-ia.com" });
  });

  it("el andamiaje fijo del prompt no cuela ningún dominio ajeno", () => {
    const shown = domainsShownInPrompt(
      buildRecommendationRewritePrompt({ ...input, citationDomains: [], citationPages: [], ruleDescription: "d", whyThisMatters: "", affectedPrompts: [] })
    );
    // Sólo schema.org (vocabulario de datos estructurados) y el dominio de la marca.
    expect(shown.sort()).toEqual(["genscore.es", "schema.org"]);
  });
});
