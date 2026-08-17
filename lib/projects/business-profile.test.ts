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

const { fetchHomepageEvidence, resolveBusinessContext, resolveAndCacheBusinessProfile } = await import(
  "./business-profile"
);

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

    // The reason is required, not decorative: this is the ONLY one of the three
    // that is genuinely about the visitor's own site, and the free checker's
    // copy branches on exactly that (log §111, Fase C-bis).
    expect(result).toEqual({ status: "unidentified", reason: "homepage_unreadable" });
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

    // The homepage was read fine — telling this visitor to check that their
    // page loads would be a diagnosis the code cannot support.
    expect(result).toEqual({ status: "unidentified", reason: "profile_low_confidence" });
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

    expect(result).toEqual({ status: "unidentified", reason: "profile_failed" });
  });
});

/**
 * COMPETITOR-GROUNDING-2 / COMPETITOR-SUGGESTIONS-1: the lazy
 * compute-and-cache helper is shared by prompt generation and competitor
 * suggestion, so its behaviour is pinned here rather than through either
 * caller.
 */
describe("resolveAndCacheBusinessProfile", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const PROFILE = {
    whatItSells: "CRM software",
    sector: "software",
    subSector: "CRM",
    businessModel: "b2b" as const,
    targetCustomer: "pymes",
    geographicScope: "ES",
    sizeEstimate: "small",
    confidence: "high" as const
  };

  function fakeSupabase(options: { updateError?: { message: string } | null } = {}) {
    const updates: Array<Record<string, unknown>> = [];
    const builder: Record<string, unknown> = {};
    for (const m of ["update", "eq"]) {
      builder[m] = vi.fn((...args: unknown[]) => {
        if (m === "update") updates.push(args[0] as Record<string, unknown>);
        return builder;
      });
    }
    builder.then = (resolve: (v: unknown) => unknown) => resolve({ error: options.updateError ?? null });
    return { client: { from: vi.fn(() => builder) } as never, updates };
  }

  const baseArgs = {
    projectId: "project-1",
    ownerUserId: "user-1",
    domain: "example.com",
    country: "ES",
    language: "es"
  };

  it("returns the cached profile without resolving or writing anything", async () => {
    const { client, updates } = fakeSupabase();

    const result = await resolveAndCacheBusinessProfile({
      ...baseArgs,
      existingProfile: PROFILE,
      supabase: client
    });

    expect(result).toEqual(PROFILE);
    expect(fetchPageSafelyMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("ignores a malformed cached value and resolves afresh", async () => {
    fetchPageSafelyMock.mockResolvedValue(analyzedHtml("<title>CRM</title>"));
    inferBusinessProfileMock.mockResolvedValue(PROFILE);
    const { client, updates } = fakeSupabase();

    const result = await resolveAndCacheBusinessProfile({
      ...baseArgs,
      existingProfile: { garbage: true },
      supabase: client
    });

    expect(result).toEqual(PROFILE);
    expect(updates).toHaveLength(1);
  });

  it("resolves and persists when nothing is cached yet", async () => {
    fetchPageSafelyMock.mockResolvedValue(analyzedHtml("<title>CRM</title>"));
    inferBusinessProfileMock.mockResolvedValue(PROFILE);
    const { client, updates } = fakeSupabase();

    const result = await resolveAndCacheBusinessProfile({
      ...baseArgs,
      existingProfile: null,
      supabase: client
    });

    expect(result).toEqual(PROFILE);
    expect(updates).toEqual([{ business_profile: PROFILE }]);
  });

  it("returns null without writing when the business cannot be identified", async () => {
    fetchPageSafelyMock.mockResolvedValue(analyzedHtml("<title>CRM</title>"));
    inferBusinessProfileMock.mockResolvedValue(null);
    const { client, updates } = fakeSupabase();

    const result = await resolveAndCacheBusinessProfile({
      ...baseArgs,
      existingProfile: null,
      supabase: client
    });

    expect(result).toBeNull();
    expect(updates).toHaveLength(0);
  });

  it("still returns the freshly-resolved profile when the best-effort cache write fails", async () => {
    fetchPageSafelyMock.mockResolvedValue(analyzedHtml("<title>CRM</title>"));
    inferBusinessProfileMock.mockResolvedValue(PROFILE);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fakeSupabase({ updateError: { message: "write denied" } });

    const result = await resolveAndCacheBusinessProfile({
      ...baseArgs,
      existingProfile: null,
      supabase: client
    });

    expect(result).toEqual(PROFILE);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
