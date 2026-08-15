import "server-only";

import { z } from "zod";
import { generateGeminiJson, toIncidentError } from "@/lib/llm/gemini-client";
import { reportLlmIncident } from "@/lib/llm/llm-incident";
import type { BusinessProfile, HomepageEvidenceInput } from "@/lib/llm/contracts";

/**
 * PRELAUNCH-HARDENING-1 Fase R5 (2/2) — el perfil de negocio y los alias de
 * marca, en la zona a la que pertenecen.
 *
 * Las dos llamadas viven ahora junto a `lib/projects/business-profile.ts`, que
 * es quien las persiste y cachea. `lib/llm/gemini.ts` las reexporta: seis
 * ficheros de test mockean esa ruta de import, y `business-profile.test.ts` es
 * uno de ellos (log §80).
 */

const businessProfileResponseSchema = z.object({
  what_it_sells: z.string(),
  sector: z.string(),
  sub_sector: z.string(),
  business_model: z.enum(["b2b", "b2c", "both", "unknown"]),
  target_customer: z.string(),
  geographic_scope: z.string(),
  size_estimate: z.string(),
  confidence: z.enum(["low", "medium", "high"])
});

/**
 * Turns homepage evidence (+ optional user-provided description) into a
 * structured business profile — what suggestCompetitors/suggestPrompts now
 * require instead of guessing from the domain string alone (see
 * docs/adr/0020-grounded-business-profile.md). Returns null (never a
 * fabricated profile) on any failure — callers must treat that as "could not
 * identify the business", not fall back to blind suggestion.
 */
export async function inferBusinessProfile(input: {
  domain: string;
  country: string;
  language: string;
  evidence: HomepageEvidenceInput;
  userDescription?: string;
}): Promise<BusinessProfile | null> {
  const evidenceBlock =
    input.evidence.status === "ok"
      ? [
          `Homepage title: ${input.evidence.title || "(none)"}`,
          `Homepage meta description: ${input.evidence.description || "(none)"}`,
          input.evidence.headings.length
            ? `Homepage headings: ${input.evidence.headings.join(" | ")}`
            : "Homepage headings: (none)",
          `Homepage visible text excerpt: ${input.evidence.excerpt || "(none)"}`
        ].join("\n")
      : "Homepage content could not be fetched or was empty.";

  const promptBlock = [
    "You are a business analyst. Determine what this specific business actually does, using ONLY the evidence given below.",
    'Do NOT guess from the domain name\'s spelling or morphology (e.g. a domain containing "gen" is not necessarily about generators; a domain containing "financiera" is not necessarily a consumer lender). Base your answer strictly on the evidence.',
    `Return ONLY valid JSON with this exact shape: { "what_it_sells": string, "sector": string, "sub_sector": string, "business_model": "b2b"|"b2c"|"both"|"unknown", "target_customer": string, "geographic_scope": string, "size_estimate": string, "confidence": "low"|"medium"|"high" }.`,
    `Set "confidence" to "low" ONLY if the evidence is genuinely insufficient to tell what this business does (e.g. an empty or parked page, no usable description). Use "medium" or "high" whenever the evidence gives a clear picture, even if some fields require reasonable inference from context.`,
    "",
    `Domain: ${input.domain}`,
    `Market/country: ${input.country}`,
    `Language: ${input.language}`,
    ...(input.userDescription?.trim() ? [`Business description provided by the owner: ${input.userDescription.trim()}`] : []),
    "",
    evidenceBlock
  ].join("\n");

  let raw: unknown;
  try {
    raw = await generateGeminiJson(promptBlock);
  } catch (error) {
    // Returning null stays the contract — callers must treat it as "could not
    // identify the business", never as a reason to guess. What changes is that
    // the reason no longer dies here: this `catch {}` is one of the two that
    // made the 2026-08-09 wizard failure produce zero evidence anywhere.
    await reportLlmIncident({
      surface: "onboarding_suggestions",
      provider: "gemini",
      error: toIncidentError(error),
      domain: input.domain
    });
    return null;
  }

  const parsed = businessProfileResponseSchema.safeParse(raw);
  if (!parsed.success) return null;

  return {
    whatItSells: parsed.data.what_it_sells,
    sector: parsed.data.sector,
    subSector: parsed.data.sub_sector,
    businessModel: parsed.data.business_model,
    targetCustomer: parsed.data.target_customer,
    geographicScope: parsed.data.geographic_scope,
    sizeEstimate: parsed.data.size_estimate,
    confidence: parsed.data.confidence
  };
}

const brandAliasesResponseSchema = z.object({
  aliases: z.array(z.string()).default([])
});

/**
 * Proposes the product/trade names that count as a mention of this brand
 * (GEO-SCORE-BRAND-IDENTITY-1). Ungrounded on purpose — this asks the model
 * to READ the supplied homepage evidence, not to recall what it knows about
 * the company. Recall is exactly what produces plausible-but-wrong aliases,
 * and `selectVerifiableAliases` (lib/projects/brand-aliases.ts) drops
 * anything absent from that evidence anyway, so a grounded search call would
 * spend money to generate candidates that are then thrown away.
 *
 * Returns [] (never a fabricated list) on any failure. An empty result is the
 * correct answer for most brands: they are only ever called by their own name.
 */
export async function inferBrandAliases(input: {
  brand: string;
  domain: string;
  evidence: HomepageEvidenceInput;
}): Promise<string[]> {
  if (input.evidence.status !== "ok") return [];

  const evidenceBlock = [
    `Homepage title: ${input.evidence.title || "(none)"}`,
    `Homepage meta description: ${input.evidence.description || "(none)"}`,
    input.evidence.headings.length ? `Homepage headings: ${input.evidence.headings.join(" | ")}` : "Homepage headings: (none)",
    `Homepage visible text excerpt: ${input.evidence.excerpt || "(none)"}`
  ].join("\n");

  const promptBlock = [
    `The brand tracked in this project is "${input.brand}" (${input.domain}).`,
    "List the OTHER names under which an AI assistant would refer to this same brand: its products, sub-brands and trade names.",
    'Example of the problem this solves: for the brand "Mozilla", an answer recommending "Firefox" is talking about Mozilla, but never writes the word "Mozilla".',
    "",
    "Hard rules:",
    "- Use ONLY names that appear in the evidence below. Do not add names you happen to know about this company from elsewhere.",
    "- Never return generic category words (browser, app, platform, store, software, service...). Only names that identify THIS brand specifically.",
    "- Never return the brand's own name, or a legal-form variant of it (S.A., Inc., GmbH).",
    "- Do not return competitors, partners, or products of other companies.",
    "- If the evidence shows no distinct product or sub-brand name, return an empty list. An empty list is a correct and expected answer.",
    "",
    'Return ONLY valid JSON with this exact shape: { "aliases": string[] }.',
    "",
    evidenceBlock
  ].join("\n");

  let raw: unknown;
  try {
    raw = await generateGeminiJson(promptBlock);
  } catch {
    return [];
  }

  const parsed = brandAliasesResponseSchema.safeParse(raw);
  if (!parsed.success) return [];
  return parsed.data.aliases;
}
