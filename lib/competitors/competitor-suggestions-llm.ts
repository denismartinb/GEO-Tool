import "server-only";

import { z } from "zod";
import { generateGroundedGeminiJson, toIncidentError } from "@/lib/llm/gemini-client";
import { reportLlmIncident } from "@/lib/llm/llm-incident";
import { isBrandDomain } from "@/lib/domains/brand-domain";
import type { BusinessProfile } from "@/lib/llm/contracts";

/**
 * PRELAUNCH-HARDENING-1 Fase R5 (2/2) — la sugerencia de competidores, en su
 * zona. Le aplica `.claude/rules/competitors.md`, que es la regla que de
 * verdad la gobierna, y queda junto a `suggest-competitors.ts`, que es quien
 * la persiste. `lib/llm/gemini.ts` la reexporta (log §80).
 */

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}


export type SuggestedCompetitor = { name: string; domain: string };

const competitorsResponseSchema = z.object({
  competitors: z
    .array(
      z.object({
        name: z.string(),
        domain: z.string()
      })
    )
    .default([])
});

/**
 * Real Gemini-backed suggestion of direct competitors for a brand/domain.
 * Requires a `profile` (lib/projects/business-profile.ts's
 * resolveBusinessContext) so the model reasons from actual evidence of what
 * the business does instead of guessing from the domain string alone — see
 * docs/adr/0020-grounded-business-profile.md for why the previous
 * domain-only version produced e.g. generator manufacturers for
 * "genscore.es" and consumer lenders for "ifinanciera.es". Uses google_search
 * grounding so small/regional competitors the model has no training-data
 * knowledge of can still be found. Returns deduplicated, schema-safe rows
 * ready to persist in project_competitors. Never throws on partial/garbage
 * items — it filters them out.
 */
export async function suggestCompetitors(input: {
  brand: string;
  domain: string;
  country: string;
  language: string;
  profile: BusinessProfile;
  limit?: number;
}): Promise<SuggestedCompetitor[]> {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 8);
  const promptBlock = [
    "You are a GEO market analyst. Use Google Search to find the most relevant DIRECT competitors of this specific business.",
    `Return ONLY valid JSON with this exact shape: { "competitors": [{ "name": string, "domain": string }] }. Respond with JSON only — no markdown, no commentary, no code fences.`,
    `List up to ${limit} real competitors operating in the same sector, sub-sector, business model and geographic scope described below.`,
    "Prioritize competitors of a COMPARABLE size and market position, including regional or local players — do NOT default to large, globally famous category leaders unless they genuinely compete for the same customers in the same market.",
    "Use the competitor's real root domain (no https://, no www., no path). Do not include the brand itself.",
    "",
    `Business: ${input.brand} (${input.domain})`,
    `What it sells: ${input.profile.whatItSells}`,
    `Sector / sub-sector: ${input.profile.sector} / ${input.profile.subSector}`,
    `Business model: ${input.profile.businessModel}`,
    `Target customer: ${input.profile.targetCustomer}`,
    `Geographic scope: ${input.profile.geographicScope}`,
    `Estimated size: ${input.profile.sizeEstimate}`,
    `Market/country: ${input.country}`,
    `Language: ${input.language}`
  ].join("\n");

  let raw: unknown;
  try {
    raw = await generateGroundedGeminiJson(promptBlock);
  } catch (error) {
    // The other silent `catch`. This is the grounded call — the exact one that
    // returned 429 on 2026-08-09 — and an empty competitor list is
    // indistinguishable to the user from "we found no competitors".
    await reportLlmIncident({
      surface: "onboarding_suggestions",
      provider: "gemini",
      error: toIncidentError(error),
      domain: input.domain
    });
    return [];
  }
  const parsed = competitorsResponseSchema.safeParse(raw);
  if (!parsed.success) return [];

  const ownDomain = normalizeDomain(input.domain);
  const seen = new Set<string>();
  const out: SuggestedCompetitor[] = [];

  for (const item of parsed.data.competitors) {
    const name = item.name.trim();
    const domain = normalizeDomain(item.domain);
    if (!name || name.length > 120) continue;
    if (!domain || domain.length < 3 || domain.length > 255) continue;
    if (!domain.includes(".")) continue;
    // BRAND-DOMAIN-1: never suggest the brand's own site as its competitor,
    // including the same brand on another TLD (ikea.com for an ikea.es
    // project) — strict equality used to let those through.
    if (isBrandDomain(domain, ownDomain)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({ name, domain });
    if (out.length >= limit) break;
  }

  return out;
}
