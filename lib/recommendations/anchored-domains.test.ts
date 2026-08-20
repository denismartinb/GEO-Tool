import { describe, expect, it } from "vitest";
import { collectAnchoredDomains, competitorsAnchoredByDomain } from "@/lib/recommendations/anchored-domains";
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
