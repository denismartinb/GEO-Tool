import { z } from "zod";

export const extractionSentimentSchema = z.enum(["positive", "neutral", "negative", "mixed", "unknown"]);
export const extractionConfidenceSchema = z.enum(["low", "medium", "high"]);

export const extractionCitationSchema = z.object({
  url: z.string().nullable(),
  domain: z.string().nullable(),
  label: z.string().nullable(),
  evidence: z.string().nullable()
});

export const extractionCompetitorSchema = z.object({
  name: z.string(),
  mentioned: z.boolean(),
  evidence: z.array(z.string())
});

export const extractionOutputSchema = z.object({
  brand: z.object({
    mentioned: z.boolean(),
    display_name_found: z.string().nullable(),
    evidence: z.array(z.string())
  }),
  competitors: z.array(extractionCompetitorSchema),
  citations: z.array(extractionCitationSchema),
  sentiment: extractionSentimentSchema,
  summary: z.string(),
  confidence: extractionConfidenceSchema,
  notes: z.array(z.string())
});

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
