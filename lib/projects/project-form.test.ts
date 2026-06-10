import { describe, expect, it } from "vitest";
import {
  cleanDomain,
  deriveBrandFromDomain,
  isValidDomain,
  languageForCountry,
  parseInitialCompetitors,
  parseInitialPrompts,
  parseProjectForm
} from "./project-form";

/**
 * Build a FormData like the browser submits. Only the keys passed are set;
 * everything else is ABSENT, so FormData.get(key) returns null — this is the
 * exact condition that previously broke the onboarding (null vs optional zod).
 */
function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseProjectForm — onboarding input contract", () => {
  it("accepts the domain+país onboarding payload (optional fields ABSENT)", () => {
    // Regression: the simplified wizard submits only domain, country, language.
    // name/brand/business_description/initial_* are absent (FormData.get -> null).
    const result = parseProjectForm(form({ domain: "elpais.com", country: "ES", language: "es" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.domain).toBe("elpais.com");
    expect(result.value.country).toBe("ES");
    expect(result.value.language).toBe("es");
    // derived, not submitted
    expect(result.value.brand).toBe("Elpais");
    expect(result.value.name).toBe("Elpais");
    expect(result.value.initialPrompts).toEqual([]);
    expect(result.value.initialCompetitors).toEqual([]);
  });

  it("accepts domain+país with no language and derives it from country", () => {
    const result = parseProjectForm(form({ domain: "stripe.com", country: "US" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.language).toBe("en");
  });

  it("strips protocol/www/path from the submitted domain", () => {
    const result = parseProjectForm(form({ domain: "https://www.notion.so/product", country: "ES" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.domain).toBe("notion.so");
  });

  it("still accepts the full manual payload (name/brand/language/lists present)", () => {
    const result = parseProjectForm(
      form({
        domain: "acme.com",
        country: "ES",
        name: "Acme Project",
        brand: "Acme",
        language: "es",
        business_description: "Widgets",
        initial_prompts: "best widgets in spain\ntop widget brands",
        initial_competitors: "Globex|globex.com\nInitech|initech.com"
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Acme Project");
    expect(result.value.brand).toBe("Acme");
    expect(result.value.initialPrompts).toHaveLength(2);
    expect(result.value.initialCompetitors).toHaveLength(2);
  });

  it("parses initial_prompts with aligned initial_prompt_categories end-to-end", () => {
    const result = parseProjectForm(
      form({
        domain: "acme.com",
        country: "ES",
        initial_prompts: "best widgets in spain\ntop widget brands",
        initial_prompt_categories: "Comparación\nCasos de uso"
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.initialPrompts).toHaveLength(2);
    expect(result.value.initialPrompts[0]).toMatchObject({
      prompt_text: "best widgets in spain",
      category: "Comparación",
      sort_order: 0
    });
    expect(result.value.initialPrompts[1]).toMatchObject({
      prompt_text: "top widget brands",
      category: "Casos de uso",
      sort_order: 1
    });
  });

  it("rejects when domain is missing", () => {
    const result = parseProjectForm(form({ country: "ES" }));
    expect(result).toEqual({ ok: false, error: "invalid_project_data" });
  });

  it("rejects when country is missing", () => {
    const result = parseProjectForm(form({ domain: "acme.com" }));
    expect(result).toEqual({ ok: false, error: "invalid_project_data" });
  });

  it("rejects a domain without a dot", () => {
    const result = parseProjectForm(form({ domain: "localhost", country: "ES" }));
    expect(result).toEqual({ ok: false, error: "invalid_project_data" });
  });
});

describe("project-form pure helpers", () => {
  it("cleanDomain normalizes input", () => {
    expect(cleanDomain("HTTPS://WWW.Foo.com/bar")).toBe("foo.com");
  });

  it("deriveBrandFromDomain title-cases the root label", () => {
    expect(deriveBrandFromDomain("my-shop.io")).toBe("My Shop");
  });

  it("languageForCountry maps known countries and falls back", () => {
    expect(languageForCountry("DE")).toBe("de");
    expect(languageForCountry("ZZ")).toBe("es");
  });

  it("isValidDomain requires a dot and length", () => {
    expect(isValidDomain("foo.com")).toBe(true);
    expect(isValidDomain("foo")).toBe(false);
  });

  it("parseInitialPrompts dedupes and caps", () => {
    const out = parseInitialPrompts("a prompt\nA Prompt\nother prompt");
    expect(out).toHaveLength(2);
    expect(out[0].sort_order).toBe(0);
  });

  it("parseInitialPrompts assigns categories aligned by line index", () => {
    const out = parseInitialPrompts(
      "best widgets in spain\ntop widget brands",
      "Comparación\nAlternativas"
    );
    expect(out).toHaveLength(2);
    expect(out[0].category).toBe("Comparación");
    expect(out[1].category).toBe("Alternativas");
  });

  it("parseInitialPrompts falls back to null for an off-taxonomy category", () => {
    const out = parseInitialPrompts(
      "best widgets in spain\ntop widget brands",
      "Not A Real Category\nAlternativas"
    );
    expect(out).toHaveLength(2);
    expect(out[0].category).toBeNull();
    expect(out[1].category).toBe("Alternativas");
  });

  it("parseInitialPrompts defaults all categories to null when categoriesInput is omitted", () => {
    const out = parseInitialPrompts("a prompt\nanother prompt");
    expect(out).toHaveLength(2);
    expect(out[0].category).toBeNull();
    expect(out[1].category).toBeNull();
  });

  it("parseInitialCompetitors requires name|domain and dedupes", () => {
    const out = parseInitialCompetitors("Globex|globex.com\nGlobex|globex.com\nNoDomain\nInitech|initech.com");
    expect(out).toHaveLength(2);
  });
});
