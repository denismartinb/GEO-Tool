import "server-only";
import { extractionOutputSchema, type ExtractionOutput } from "@/lib/extraction/schema";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-001";
const GEMINI_MODEL_ERROR = "Invalid GEMINI_MODEL. Use a valid Gemini model id such as gemini-2.0-flash-001.";

function getGeminiModel() {
  const configuredValue = process.env.GEMINI_MODEL;
  const configuredModel = configuredValue === undefined ? DEFAULT_GEMINI_MODEL : configuredValue.trim();
  const model = configuredModel.startsWith("models/") ? configuredModel.slice("models/".length) : configuredModel;

  if (!/^gemini-[a-z0-9][a-z0-9._-]*$/i.test(model)) {
    throw new Error(GEMINI_MODEL_ERROR);
  }

  return model;
}

function getGeminiApiError(status: number) {
  if (status === 429) return "Gemini API quota or rate limit reached.";
  if (status === 400) return "Gemini API rejected the request. Check GEMINI_MODEL and request configuration.";
  return `Gemini API request failed with status ${status}.`;
}

export type GeminiVisibilityResponse = {
  text: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  totalTokens: number | null;
};

export type GeminiStructuredExtractionResponse = {
  data: ExtractionOutput;
  model: string;
};

export async function generateGeminiVisibilityAnswer(input: {
  prompt: string;
  brand: string;
  competitors: string[];
  country: string;
  language: string;
}): Promise<GeminiVisibilityResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const model = getGeminiModel();
  const endpoint = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  const instruction =
    "You are a GEO visibility analyst. Answer naturally in plain text. Mention the brand and relevant competitors when useful.";
  const promptBlock = [
    `Prompt: ${input.prompt}`,
    `Brand: ${input.brand}`,
    `Competitors: ${input.competitors.join(", ") || "none"}`,
    `Country: ${input.country}`,
    `Language: ${input.language}`
  ].join("\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptBlock }] }],
      systemInstruction: { parts: [{ text: instruction }] }
    })
  });

  if (!response.ok) {
    throw new Error(getGeminiApiError(response.status));
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    modelVersion?: string;
  };

  const text =
    data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ??
    "";

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    text,
    model: data.modelVersion ?? model,
    tokensIn: data.usageMetadata?.promptTokenCount ?? null,
    tokensOut: data.usageMetadata?.candidatesTokenCount ?? null,
    totalTokens: data.usageMetadata?.totalTokenCount ?? null
  };
}

export async function extractGeminiStructuredData(input: {
  brand: string;
  competitors: string[];
  rawResponseText: string;
  promptText: string;
}): Promise<GeminiStructuredExtractionResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const model = getGeminiModel();
  const endpoint = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

  const schemaInstruction = `Return ONLY valid JSON with this exact shape:
{
  "brand": { "mentioned": boolean, "display_name_found": string|null, "evidence": string[] },
  "competitors": [{ "name": string, "mentioned": boolean, "evidence": string[] }],
  "citations": [{ "url": string|null, "domain": string|null, "label": string|null, "evidence": string|null }],
  "sentiment": "positive"|"neutral"|"negative"|"mixed"|"unknown",
  "summary": string,
  "confidence": "low"|"medium"|"high",
  "notes": string[]
}`;

  const promptBlock = [
    schemaInstruction,
    `Brand: ${input.brand}`,
    `Competitors: ${input.competitors.join(", ") || "none"}`,
    `Original prompt: ${input.promptText}`,
    "Raw LLM response to extract from:",
    input.rawResponseText
  ].join("\n\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptBlock }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    throw new Error(getGeminiApiError(response.status));
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    modelVersion?: string;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
  if (!text) {
    throw new Error("Gemini extraction returned empty JSON.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new Error("Gemini extraction returned invalid JSON.");
  }

  const parsed = extractionOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("Gemini extraction JSON failed schema validation.");
  }

  return {
    data: parsed.data,
    model: data.modelVersion ?? model
  };
}
