import { z } from "zod";

export const extractionSentimentSchema = z.enum(["positive", "neutral", "negative", "mixed", "unknown"]);
export const extractionConfidenceSchema = z.enum(["low", "medium", "high"]);

export const extractionCitationSchema = z.object({
  url: z.string().nullable(),
  domain: z.string().nullable(),
  label: z.string().nullable(),
  evidence: z.string().nullable()
});

/**
 * Citation source provenance for the final persisted citation list:
 * - "grounding": came from Gemini's Google Search grounding metadata
 *   (groundingChunks), i.e. a real source the model actually consulted.
 * - "inline": a URL mentioned inline in the model's plain-text answer,
 *   extracted heuristically and NOT verified by grounding.
 *
 * Only "grounding" citations count toward citations_count / citation_found
 * (see docs/adr/0004-gemini-search-grounding.md).
 */
export const citationSourceSchema = z.enum(["grounding", "inline"]);

/**
 * Final persisted citation shape stored in extracted_json.citations after
 * merging the LLM-extraction output with real grounding metadata from the
 * Gemini visibility call.
 */
export const groundedCitationSchema = z.object({
  url: z.string().nullable(),
  domain: z.string().nullable(),
  title: z.string().nullable(),
  source: citationSourceSchema,
  confidence: extractionConfidenceSchema
});

export type GroundedCitation = z.infer<typeof groundedCitationSchema>;

/**
 * 1-based rank of this entity's FIRST mention in the raw response text
 * (1 = mentioned first / most prominent). `null` when `mentioned: false` —
 * see docs/adr/0005-average-brand-position.md.
 */
const positionSchema = z.number().int().positive().nullable();

export const extractionCompetitorSchema = z.object({
  name: z.string(),
  mentioned: z.boolean(),
  /**
   * The literal name/variant the model claims to have found in the response
   * text for this competitor — same field and same purpose as brand's below
   * (MENTION-VERIFY-1, docs/adr/0021): `verifyExtractedMentions`
   * (lib/scan/extraction.ts) checks this claim against the actual raw
   * response text before trusting `mentioned: true`. `.default(null)` so
   * extracted_json persisted before this field existed still parses.
   */
  display_name_found: z.string().nullable().default(null),
  evidence: z.array(z.string()),
  position: positionSchema
});

export const extractionOutputSchema = z.object({
  brand: z.object({
    mentioned: z.boolean(),
    /**
     * The literal name/variant the model claims to have found in the
     * response text. `verifyExtractedMentions` (lib/scan/extraction.ts,
     * MENTION-VERIFY-1, docs/adr/0021) checks this claim against the actual
     * raw response text and downgrades `mentioned: true` to an explicit
     * non-mention when it's empty or isn't actually present — defends
     * against extraction hallucinating a mention from topical/semantic
     * similarity rather than the brand's name genuinely appearing.
     */
    display_name_found: z.string().nullable(),
    evidence: z.array(z.string()),
    position: positionSchema
  }),
  competitors: z.array(extractionCompetitorSchema),
  citations: z.array(extractionCitationSchema),
  sentiment: extractionSentimentSchema,
  /**
   * Short noun-phrase themes driving any NEGATIVE/mixed sentiment ABOUT THE
   * BRAND (e.g. "atención al cliente", "plazos de entrega"). Empty when
   * sentiment is positive/neutral or no clear driver is stated. Powers gap 9
   * (address_negative_narrative). Optional with a default so older extracted
   * JSON without the field still parses.
   */
  sentiment_drivers: z.array(z.string()).default([]),
  /**
   * Brand/company names mentioned in the response that are NEITHER the
   * project's own brand NOR one of the tracked competitors passed in — i.e.
   * genuinely unmonitored brands the AI is surfacing on its own. Powers
   * RECS-4A (N6, "competidores emergentes"). Optional with a default so
   * older extracted JSON without the field still parses.
   */
  other_brands_mentioned: z.array(z.string()).default([]),
  summary: z.string(),
  confidence: extractionConfidenceSchema,
  notes: z.array(z.string())
});

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
