import { describe, expect, it } from "vitest";
import { collectAnchoredDomains } from "@/lib/recommendations/anchored-domains";
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
