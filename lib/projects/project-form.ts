import { z } from "zod";
import { PROMPT_CATEGORIES } from "@/lib/projects/prompt-categories";

/**
 * Pure, dependency-free parsing & normalization for the "new project" form.
 *
 * Extracted from the server action so the input contract (which fields the
 * onboarding form actually submits) is unit-testable without a database or
 * network. This is the layer that previously broke: the simplified domain+país
 * form omits optional fields, so FormData.get() returns null for them and the
 * optional zod fields must accept that (null -> undefined).
 */

export const MAX_INITIAL_PROMPTS = 15;
export const MAX_INITIAL_COMPETITORS = 5;

const COUNTRY_LANGUAGE: Record<string, string> = {
  es: "es",
  mx: "es",
  ar: "es",
  co: "es",
  cl: "es",
  pe: "es",
  us: "en",
  uk: "en",
  gb: "en",
  ca: "en",
  au: "en",
  de: "de",
  fr: "fr",
  it: "it",
  pt: "pt",
  br: "pt"
};

export const projectFormSchema = z.object({
  domain: z.string().min(3).max(255),
  country: z.string().min(2).max(10),
  name: z.string().min(1).max(120).optional(),
  brand: z.string().min(1).max(120).optional(),
  language: z.string().min(2).max(20).optional(),
  businessDescription: z.string().max(500).optional(),
  initialPrompts: z.string().optional(),
  initialPromptCategories: z.string().optional(),
  initialCompetitors: z.string().optional()
});

export function cleanDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

export function deriveBrandFromDomain(domain: string): string {
  const label = cleanDomain(domain).split(".")[0] ?? domain;
  const cleaned = label.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return domain;
  return cleaned
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ")
    .slice(0, 120);
}

export function languageForCountry(country: string, fallback = "es"): string {
  return COUNTRY_LANGUAGE[country.trim().toLowerCase()] ?? fallback;
}

export function isValidDomain(domain: string): boolean {
  return domain.length >= 3 && domain.length <= 255 && domain.includes(".");
}

export function parseInitialPrompts(promptsInput: string | undefined, categoriesInput?: string | undefined) {
  if (!promptsInput) return [];

  // Split BEFORE dedup so category lines align 1:1 with prompt lines by index.
  const promptLines = promptsInput.split("\n");
  const categoryLines = categoriesInput !== undefined ? categoriesInput.split("\n") : undefined;
  const categorySet: ReadonlySet<string> = new Set(PROMPT_CATEGORIES);

  const seen = new Set<string>();
  const prompts: Array<{ prompt_text: string; category: string | null; sort_order: number }> = [];

  for (let i = 0; i < promptLines.length; i++) {
    const promptText = promptLines[i].trim();
    if (!promptText) continue;

    const normalized = promptText.toLocaleLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const rawCategory = categoryLines?.[i]?.trim();
    const category = rawCategory && categorySet.has(rawCategory) ? rawCategory : null;

    prompts.push({ prompt_text: promptText, category, sort_order: prompts.length });

    if (prompts.length >= MAX_INITIAL_PROMPTS) break;
  }

  return prompts;
}

export function parseInitialCompetitors(input: string | undefined) {
  if (!input) return [];

  const seen = new Set<string>();
  const competitors: Array<{ name: string; domain: string }> = [];

  for (const rawLine of input.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const [rawName, rawDomain] = line.split("|", 2);
    const name = rawName?.trim() ?? "";
    const domain = rawDomain?.trim() ?? "";

    if (!name) continue;
    if (!domain || domain.length < 3) continue;

    const dedupeKey = `${name.toLocaleLowerCase()}|${domain.toLocaleLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    competitors.push({ name, domain });

    if (competitors.length >= MAX_INITIAL_COMPETITORS) break;
  }

  return competitors;
}

export type NormalizedProjectInput = {
  domain: string;
  country: string;
  brand: string;
  name: string;
  language: string;
  businessDescription?: string;
  initialPrompts: Array<{ prompt_text: string; category: string | null; sort_order: number }>;
  initialCompetitors: Array<{ name: string; domain: string }>;
};

export type ParseProjectResult =
  | { ok: true; value: NormalizedProjectInput }
  | { ok: false; error: "invalid_project_data" };

/**
 * Parse + normalize the new-project FormData into the values createProject
 * persists. Coerces absent FormData fields (null) to undefined so the optional
 * fields validate. Returns a discriminated result instead of throwing/redirecting
 * so it can be unit-tested in isolation.
 */
export function parseProjectForm(formData: FormData): ParseProjectResult {
  const field = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };

  const parsed = projectFormSchema.safeParse({
    name: field("name"),
    domain: field("domain"),
    brand: field("brand"),
    country: field("country"),
    language: field("language"),
    businessDescription: field("business_description"),
    initialPrompts: field("initial_prompts"),
    initialPromptCategories: field("initial_prompt_categories"),
    initialCompetitors: field("initial_competitors")
  });

  if (!parsed.success) {
    return { ok: false, error: "invalid_project_data" };
  }

  const payload = parsed.data;
  const domain = cleanDomain(payload.domain);
  if (!isValidDomain(domain)) {
    return { ok: false, error: "invalid_project_data" };
  }

  const country = payload.country.trim();
  const brand = payload.brand?.trim() || deriveBrandFromDomain(domain);
  const name = payload.name?.trim() || brand;
  const language = payload.language?.trim() || languageForCountry(country);

  return {
    ok: true,
    value: {
      domain,
      country,
      brand,
      name,
      language,
      businessDescription: payload.businessDescription?.trim() || undefined,
      initialPrompts: parseInitialPrompts(payload.initialPrompts, payload.initialPromptCategories),
      initialCompetitors: parseInitialCompetitors(payload.initialCompetitors)
    }
  };
}
