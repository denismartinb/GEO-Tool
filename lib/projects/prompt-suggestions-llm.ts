import "server-only";

import { z } from "zod";
import { generateGeminiJson } from "@/lib/llm/gemini-client";
import { PROMPT_CATEGORIES, type PromptCategory } from "@/lib/projects/prompt-categories";
import type { BusinessProfile } from "@/lib/llm/contracts";

/**
 * PRELAUNCH-HARDENING-1 Fase R5 (2/2) — los dos generadores de prompts, en su
 * zona. Quedan junto a `lib/projects/add-prompts.ts`, que es quien los
 * persiste y aplica los límites de plan. `lib/llm/gemini.ts` los reexporta
 * porque `add-prompts.test.ts` mockea esa ruta (log §80).
 */

const promptsResponseSchema = z.object({
  prompts: z
    .array(
      z.object({
        text: z.string(),
        category: z.enum(PROMPT_CATEGORIES)
      })
    )
    .default([])
});

/**
 * Real Gemini-backed suggestion of high-intent prompts a user would ask an AI
 * assistant where the brand could plausibly appear. Requires a `profile`
 * (same rationale as suggestCompetitors — see
 * docs/adr/0020-grounded-business-profile.md) so prompts target the
 * business's actual sector/customer instead of whatever the domain string
 * happens to suggest. Returns deduplicated, schema-safe prompts (text
 * 10..300 chars) with a topic category from the fixed taxonomy, ready to
 * persist in project_prompts.
 */
export async function suggestPrompts(input: {
  brand: string;
  domain: string;
  country: string;
  language: string;
  profile: BusinessProfile;
  limit?: number;
}): Promise<Array<{ text: string; category: PromptCategory }>> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 15);
  const categoryList = PROMPT_CATEGORIES.map((category) => `"${category}"`).join(", ");
  const promptBlock = [
    "You are a GEO research analyst. Generate the most relevant questions real potential customers",
    "would ask an AI assistant (ChatGPT, Gemini, Perplexity) where this specific business could appear in the answer.",
    `Return ONLY valid JSON with this exact shape: { "prompts": [{ "text": string, "category": string }] }.`,
    `Produce exactly ${limit} distinct prompts. Mix informational, commercial and transactional intent.`,
    `Write each "text" in the target language. Each "text" must be a natural question of 10 to 200 characters.`,
    "Do NOT mention the brand name in the prompts; they must be brand-neutral discovery questions.",
    "Every prompt must be about the business described below — its actual sector, what it sells and its target customer — not whatever the domain name might otherwise suggest.",
    "",
    `For "category", choose EXACTLY one of these fixed Spanish labels (verbatim, do NOT translate or alter them,`,
    `regardless of the target language): ${categoryList}.`,
    "Pick the label that best matches the prompt's dominant intent:",
    `- "Comparación": comparing the brand/product against alternatives or competitors.`,
    `- "Alternativas": looking for alternatives or substitutes.`,
    `- "Cómo hacer / guía": how-to, tutorial, or guidance questions.`,
    `- "Precio y planes": pricing, plans, cost, or value questions.`,
    `- "Reseñas y opiniones": reviews, opinions, ratings, or trustworthiness questions.`,
    `- "Casos de uso": use cases, scenarios, or "best for X" questions.`,
    `Use at least 3 different categories across the full set of prompts; do not put everything in one bucket.`,
    "",
    `Business: ${input.brand} (${input.domain})`,
    `What it sells: ${input.profile.whatItSells}`,
    `Sector / sub-sector: ${input.profile.sector} / ${input.profile.subSector}`,
    `Business model: ${input.profile.businessModel}`,
    `Target customer: ${input.profile.targetCustomer}`,
    `Market/country: ${input.country}`,
    `Target language: ${input.language}`
  ].join("\n");

  const raw = await generateGeminiJson(promptBlock);
  const parsed = promptsResponseSchema.safeParse(raw);
  if (!parsed.success) return [];

  const seen = new Set<string>();
  const out: Array<{ text: string; category: PromptCategory }> = [];

  for (const item of parsed.data.prompts) {
    const text = item.text.trim();
    if (text.length < 10 || text.length > 300) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, category: item.category });
    if (out.length >= limit) break;
  }

  return out;
}

export type AddPromptsMode = "auto" | "keywords" | "manual";

export type GeneratedPromptCandidate = { text: string; category: string };

const DEFAULT_ADD_PROMPTS_CATEGORY = "General";

const addPromptsGenerationSchema = z.object({
  prompts: z
    .array(
      z.object({
        text: z.string(),
        category: z.string()
      })
    )
    .default([])
});

const addPromptsCategorizationSchema = z.object({
  items: z
    .array(
      z.object({
        index: z.number(),
        category: z.string()
      })
    )
    .default([])
});

/**
 * Real Gemini-backed generation/categorization for the "Añadir prompts" flow
 * (ADD-PROMPTS-BACKEND-1). Unlike `suggestPrompts` (onboarding, fixed
 * PROMPT_CATEGORIES taxonomy), this allows Gemini to invent a new category
 * label when none of the project's existing categories fit — an open
 * taxonomy, since `project_prompts.category` is a free-text column.
 *
 * - "auto": invents `limit` new prompts from brand/market context alone.
 * - "keywords": invents `limit` new prompts seeded by the user's keywords.
 * - "manual": invents no prompt text — only assigns a category to each of
 *   the user's own prompts. The returned `text` is always exactly the
 *   trimmed input text, never rewritten by Gemini.
 *
 * "auto"/"keywords" prompts are deduplicated (case-insensitive) against
 * `existingPromptTexts` so a regenerate never reintroduces a prompt the
 * project already has active. Returns `[]` (never throws) if Gemini's
 * response fails schema validation, matching `suggestPrompts`/
 * `suggestCompetitors`'s fail-soft convention.
 *
 * COMPETITOR-GROUNDING-2 (docs/adr/0022): optional `profile` — the same
 * `BusinessProfile` `suggestPrompts` already requires (docs/adr/0020) — adds
 * real business context to "auto"/"keywords" generation instead of reasoning
 * from brand/domain strings alone. Absent (existing projects with no
 * persisted profile yet) means behavior identical to before this phase —
 * this is a purely additive parameter, never a hard requirement.
 */
export async function generateAddedPrompts(input: {
  mode: AddPromptsMode;
  brand: string;
  domain: string;
  country: string;
  language: string;
  existingPromptTexts: string[];
  existingCategories: string[];
  keywords?: string[];
  manualPrompts?: string[];
  limit?: number;
  profile?: BusinessProfile;
}): Promise<GeneratedPromptCandidate[]> {
  const categoryHints = input.existingCategories.map((category) => category.trim()).filter(Boolean).join(", ") || "none yet";

  if (input.mode === "manual") {
    const manualPrompts = (input.manualPrompts ?? [])
      .map((text) => text.trim())
      .filter((text) => text.length >= 1 && text.length <= 300);

    if (!manualPrompts.length) return [];

    const numberedList = manualPrompts.map((text, i) => `${i}. ${text}`).join("\n");
    const promptBlock = [
      "You are a GEO research analyst. Assign a short topic category label to each of the following prompts.",
      "Do not rewrite, translate or alter the prompt text in any way — only categorize.",
      `Return ONLY valid JSON with this exact shape: { "items": [{ "index": number, "category": string }] }.`,
      "Return exactly one item per input prompt, using its 0-based index.",
      "",
      `Reuse one of these existing project categories when it genuinely fits: ${categoryHints}.`,
      "Only invent a new short category label (2-4 words, same language as the prompt) when none of the existing ones fit.",
      "",
      `Brand: ${input.brand}`,
      `Brand domain: ${input.domain}`,
      `Market/country: ${input.country}`,
      "",
      "Prompts:",
      numberedList
    ].join("\n");

    const raw = await generateGeminiJson(promptBlock);
    const parsed = addPromptsCategorizationSchema.safeParse(raw);
    const categoryByIndex = new Map<number, string>();
    if (parsed.success) {
      for (const item of parsed.data.items) {
        const category = item.category.trim();
        if (category) categoryByIndex.set(item.index, category);
      }
    }

    return manualPrompts.map((text, i) => ({
      text,
      category: categoryByIndex.get(i) || DEFAULT_ADD_PROMPTS_CATEGORY
    }));
  }

  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
  const keywordsLine =
    input.mode === "keywords" && input.keywords?.length
      ? `Seed keywords supplied by the user — every prompt must relate to at least one of them: ${input.keywords.join(", ")}.`
      : null;

  const promptBlock = [
    "You are a GEO research analyst. Generate new, high-intent questions real potential customers",
    "would ask an AI assistant (ChatGPT, Gemini, Perplexity) where the given brand could appear in the answer.",
    `Return ONLY valid JSON with this exact shape: { "prompts": [{ "text": string, "category": string }] }.`,
    `Produce exactly ${limit} distinct new prompts. Mix informational, commercial and transactional intent.`,
    `Write each "text" in the target language. Each "text" must be a natural question of 10 to 200 characters.`,
    "Do NOT mention the brand name in the prompts; they must be brand-neutral discovery questions.",
    "Do NOT repeat or closely paraphrase any of these prompts the project already has:",
    input.existingPromptTexts.length ? input.existingPromptTexts.join(" | ") : "(none yet)",
    ...(keywordsLine ? ["", keywordsLine] : []),
    "",
    `For "category", reuse one of these existing project categories when it genuinely fits: ${categoryHints}.`,
    "Only invent a new short category label (2-4 words, same language as the prompts) when none of the existing ones fit.",
    "",
    `Brand: ${input.brand}`,
    `Brand domain: ${input.domain}`,
    `Market/country: ${input.country}`,
    `Target language: ${input.language}`,
    ...(input.profile
      ? [
          "",
          "Every prompt must be about the business described below — its actual sector, what it sells and its target customer — not whatever the domain name might otherwise suggest.",
          `What it sells: ${input.profile.whatItSells}`,
          `Sector / sub-sector: ${input.profile.sector} / ${input.profile.subSector}`,
          `Business model: ${input.profile.businessModel}`,
          `Target customer: ${input.profile.targetCustomer}`
        ]
      : [])
  ].join("\n");

  const raw = await generateGeminiJson(promptBlock);
  const parsed = addPromptsGenerationSchema.safeParse(raw);
  if (!parsed.success) return [];

  const seen = new Set(input.existingPromptTexts.map((text) => text.trim().toLowerCase()));
  const out: GeneratedPromptCandidate[] = [];

  for (const item of parsed.data.prompts) {
    const text = item.text.trim();
    if (text.length < 10 || text.length > 300) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const category = item.category.trim() || DEFAULT_ADD_PROMPTS_CATEGORY;
    out.push({ text, category });
    if (out.length >= limit) break;
  }

  return out;
}
