import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ supabase: {}, user: { id: "u1", email: "a@b.c" } }) }));
vi.mock("@/lib/billing", () => ({ getPlanForUser: vi.fn().mockResolvedValue({ id: "pro", caps: { prompts: 15, projects: 5 } }) }));
vi.mock("@/lib/llm/gemini", () => ({
  generateAddedPrompts: vi.fn(),
  inferBrandAliases: vi.fn(),
  suggestCompetitors: vi.fn(),
  suggestPrompts: vi.fn(),
  inferBusinessProfile: vi.fn()
}));
vi.mock("@/lib/llm/llm-incident", () => ({ reportLlmIncident: vi.fn() }));
vi.mock("@/lib/scan/scan-runner", () => ({ ENABLE_SYNC_SCAN_EXECUTION: false }));
vi.mock("@/lib/projects/create-project", () => ({ createProjectCore: vi.fn() }));
vi.mock("@/lib/projects/new-project-defaults", () => ({ newProjectDefaults: vi.fn().mockReturnValue({}) }));
// Sólo la red se simula: la cadena real portada → perfil → motivo es la que se prueba.
vi.mock("@/lib/web-audit/fetch-page", () => ({ fetchPageSafely: vi.fn() }));

import { fetchPageSafely } from "@/lib/web-audit/fetch-page";
import { inferBrandAliases, inferBusinessProfile, suggestCompetitors, suggestPrompts } from "@/lib/llm/gemini";
import { suggestProjectSetup } from "./actions";

const PROFILE = {
  whatItSells: "Grandes almacenes",
  sector: "Retail",
  subSector: "Grandes almacenes",
  businessModel: "b2c" as const,
  targetCustomer: "Consumidor final",
  geographicScope: "España",
  sizeEstimate: "Grande",
  confidence: "high" as const
};

const BLOCKED = { status: "blocked" } as never;
const HOME_OK = {
  status: "analyzed",
  html: "<html><head><title>El Corte Inglés | Moda, electrónica y hogar</title><meta name=\"description\" content=\"Grandes almacenes\"></head><body><h1>El Corte Inglés</h1><p>Descubre El Corte Inglés Gourmet y Club del Gourmet con todo el surtido en tienda y online.</p></body></html>"
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(suggestCompetitors).mockResolvedValue([{ name: "Amazon", domain: "amazon.es" }]);
  vi.mocked(suggestPrompts).mockResolvedValue([{ text: "¿Dónde comprar moda en línea?", category: "Casos de uso" }]);
  vi.mocked(inferBusinessProfile).mockResolvedValue(PROFILE);
  vi.mocked(inferBrandAliases).mockResolvedValue([]);
});

describe("suggestProjectSetup · portada bloqueada (caso elcorteingles.es)", () => {
  it("sin portada legible ni descripción: no sugiere, dice que es la portada y propone la marca como pendiente", async () => {
    vi.mocked(fetchPageSafely).mockResolvedValue(BLOCKED);

    const result = await suggestProjectSetup({ domain: "elcorteingles.es", country: "ES" });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("homepage_unreadable");
    expect(result.failed).toEqual(["competitors", "prompts"]);
    expect(result.brandProposal).toEqual({ brand: "Elcorteingles", source: "domain", pending: true });
    expect(result.proposedAliases).toEqual([]);
    // Nada de modo ciego por dominio (ADR 0020).
    expect(suggestCompetitors).not.toHaveBeenCalled();
    expect(suggestPrompts).not.toHaveBeenCalled();
  });

  it("con la descripción que escribe la persona, sí sugiere aunque la portada siga bloqueada", async () => {
    vi.mocked(fetchPageSafely).mockResolvedValue(BLOCKED);

    const result = await suggestProjectSetup({
      domain: "elcorteingles.es",
      country: "ES",
      description: "Grandes almacenes españoles: moda, electrónica, hogar y supermercado."
    });

    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.competitors).toHaveLength(1);
    expect(vi.mocked(inferBusinessProfile).mock.calls[0][0].userDescription).toContain("Grandes almacenes");
    // Sin portada no hay evidencia contra la que verificar alias: no se inventan.
    expect(inferBrandAliases).not.toHaveBeenCalled();
    expect(result.proposedAliases).toEqual([]);
  });

  it("un fallo de nuestro modelo NO se achaca a la web de la persona", async () => {
    vi.mocked(fetchPageSafely).mockResolvedValue(HOME_OK);
    vi.mocked(inferBusinessProfile).mockResolvedValue(null);

    const result = await suggestProjectSetup({ domain: "elcorteingles.es", country: "ES" });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("profile_failed");
  });
});

describe("suggestProjectSetup · portada legible", () => {
  it("propone «El Corte Inglés» desde el título y sólo los alias que están en la portada", async () => {
    vi.mocked(fetchPageSafely).mockResolvedValue(HOME_OK);
    vi.mocked(inferBrandAliases).mockResolvedValue(["El Corte Inglés Gourmet", "Club del Gourmet", "Marca Inventada"]);

    const result = await suggestProjectSetup({ domain: "elcorteingles.es", country: "ES" });

    expect(result.brandProposal).toEqual({ brand: "El Corte Inglés", source: "homepage_title", pending: false });
    expect(result.brand).toBe("El Corte Inglés");
    expect(result.proposedAliases).not.toContain("Marca Inventada");
    expect(result.proposedAliases).toContain("Club del Gourmet");
  });

  it("dominio inválido no llama a nada", async () => {
    const result = await suggestProjectSetup({ domain: "no es un dominio", country: "ES" });
    expect(result.ok).toBe(false);
    expect(fetchPageSafely).not.toHaveBeenCalled();
  });
});
