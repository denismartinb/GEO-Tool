import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageFetchResult } from "@/lib/web-audit/fetch-page";

const fetchPageSafelyMock = vi.fn<(url: string, domain: string) => Promise<PageFetchResult>>();
const inferBusinessProfileMock = vi.fn();

vi.mock("@/lib/web-audit/fetch-page", () => ({
  fetchPageSafely: (url: string, domain: string) => fetchPageSafelyMock(url, domain)
}));

vi.mock("@/lib/llm/gemini", () => ({
  inferBusinessProfile: (input: unknown) => inferBusinessProfileMock(input)
}));

const { fetchHomepageEvidence, resolveBusinessContext } = await import("./business-profile");

function analyzedHtml(html: string): PageFetchResult {
  return { status: "analyzed", html, finalUrl: "https://example.com/" };
}

describe("fetchHomepageEvidence", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("extracts title, meta description and headings from a real homepage", async () => {
    fetchPageSafelyMock.mockResolvedValue(
      analyzedHtml(
        `<html><head><title>GenScore — Visibilidad de marca en IA</title>
         <meta name="description" content="Mide y mejora cómo aparece tu marca en respuestas de ChatGPT, Gemini y Perplexity."></head>
         <body><h1>Monitoriza tu visibilidad en IA</h1><h2>Competidores</h2>
         <p>${"Contenido real de la página de inicio sobre GEO. ".repeat(5)}</p></body></html>`
      )
    );

    const evidence = await fetchHomepageEvidence("genscore.es");

    expect(fetchPageSafelyMock).toHaveBeenCalledWith("https://genscore.es", "genscore.es");
    expect(evidence.status).toBe("ok");
    if (evidence.status !== "ok") throw new Error("expected ok");
    expect(evidence.title).toBe("GenScore — Visibilidad de marca en IA");
    expect(evidence.description).toContain("Mide y mejora");
    expect(evidence.headings).toEqual(["Monitoriza tu visibilidad en IA", "Competidores"]);
    expect(evidence.excerpt).toContain("Contenido real de la página de inicio sobre GEO.");
  });

  it("returns unavailable when the fetch itself fails", async () => {
    fetchPageSafelyMock.mockResolvedValue({ status: "skipped_timeout" });

    const evidence = await fetchHomepageEvidence("slow-site.com");

    expect(evidence).toEqual({ status: "unavailable" });
  });

  it("returns unavailable for an analyzed page with no usable content (empty shell / SPA)", async () => {
    fetchPageSafelyMock.mockResolvedValue(analyzedHtml(`<html><head></head><body><div id="root"></div></body></html>`));

    const evidence = await fetchHomepageEvidence("spa-only.com");

    expect(evidence).toEqual({ status: "unavailable" });
  });
});

describe("resolveBusinessContext", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns unidentified without calling Gemini when there is no evidence and no user description", async () => {
    fetchPageSafelyMock.mockResolvedValue({ status: "skipped_offsite" });

    const result = await resolveBusinessContext({ domain: "nobody-home.com", country: "ES", language: "es" });

    expect(result).toEqual({ status: "unidentified" });
    expect(inferBusinessProfileMock).not.toHaveBeenCalled();
  });

  it("returns identified with the profile when evidence yields a medium/high-confidence profile", async () => {
    fetchPageSafelyMock.mockResolvedValue(analyzedHtml(`<html><head><title>iFinanciera</title></head><body>x</body></html>`));
    inferBusinessProfileMock.mockResolvedValue({
      whatItSells: "Consultoría de dirección financiera para pymes",
      sector: "Servicios profesionales",
      subSector: "Consultoría financiera B2B",
      businessModel: "b2b",
      targetCustomer: "Pymes",
      geographicScope: "España",
      sizeEstimate: "Pequeña consultoría",
      confidence: "high"
    });

    const result = await resolveBusinessContext({ domain: "ifinanciera.es", country: "ES", language: "es" });

    expect(result.status).toBe("identified");
    if (result.status !== "identified") throw new Error("expected identified");
    expect(result.profile.sector).toBe("Servicios profesionales");
  });

  it("returns unidentified when Gemini itself reports low confidence and no user description was given", async () => {
    fetchPageSafelyMock.mockResolvedValue(analyzedHtml(`<html><head><title>Parked domain</title></head><body>x</body></html>`));
    inferBusinessProfileMock.mockResolvedValue({
      whatItSells: "",
      sector: "",
      subSector: "",
      businessModel: "unknown",
      targetCustomer: "",
      geographicScope: "",
      sizeEstimate: "",
      confidence: "low"
    });

    const result = await resolveBusinessContext({ domain: "unclear.com", country: "ES", language: "es" });

    expect(result).toEqual({ status: "unidentified" });
  });

  it("accepts a low-confidence profile when the user supplied their own description", async () => {
    fetchPageSafelyMock.mockResolvedValue({ status: "skipped_offsite" });
    inferBusinessProfileMock.mockResolvedValue({
      whatItSells: "Lo que describió el usuario",
      sector: "Desconocido",
      subSector: "Desconocido",
      businessModel: "unknown",
      targetCustomer: "Desconocido",
      geographicScope: "Desconocido",
      sizeEstimate: "Desconocido",
      confidence: "low"
    });

    const result = await resolveBusinessContext({
      domain: "sinweb.com",
      country: "ES",
      language: "es",
      userDescription: "Somos una consultoría de dirección financiera para pymes."
    });

    expect(result.status).toBe("identified");
    expect(inferBusinessProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ userDescription: "Somos una consultoría de dirección financiera para pymes." })
    );
  });

  it("returns unidentified when the Gemini profile call throws", async () => {
    fetchPageSafelyMock.mockResolvedValue(analyzedHtml(`<html><head><title>Some real content</title></head><body>x</body></html>`));
    inferBusinessProfileMock.mockRejectedValue(new Error("network error"));

    const result = await resolveBusinessContext({ domain: "flaky.com", country: "ES", language: "es" });

    expect(result).toEqual({ status: "unidentified" });
  });
});
