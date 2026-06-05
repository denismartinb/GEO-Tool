"use server";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function getGeminiEndpoint() {
  const raw = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const model = raw.startsWith("models/") ? raw.slice("models/".length) : raw.trim();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;
}

async function callGeminiJson(prompt: string): Promise<string | null> {
  const endpoint = getGeminiEndpoint();
  if (!endpoint) return null;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    return (
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? null
    );
  } catch {
    return null;
  }
}

export type CompetitorSuggestion = { name: string; domain: string };

export async function suggestCompetitors(input: {
  domain: string;
  brand: string;
  description: string;
  country: string;
  language: string;
}): Promise<CompetitorSuggestion[]> {
  const prompt = [
    "You are a competitive intelligence assistant.",
    "Given a brand's domain, name and description, suggest up to 5 real direct competitors.",
    `Brand: ${input.brand}`,
    `Domain: ${input.domain}`,
    `Description: ${input.description || "Not provided"}`,
    `Country: ${input.country}`,
    "Return ONLY a JSON array of objects with this exact shape:",
    '[{"name": "Competitor Name", "domain": "competitor.com"}]',
    "Rules: only real known companies, actual website domains without https://, max 5 items.",
  ].join("\n");

  const text = await callGeminiJson(prompt);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item): item is { name: string; domain: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).name === "string" &&
          typeof (item as Record<string, unknown>).domain === "string",
      )
      .slice(0, 5)
      .map((item) => ({
        name: item.name.trim(),
        domain: item.domain
          .trim()
          .replace(/^https?:\/\//, "")
          .replace(/\/$/, ""),
      }));
  } catch {
    return [];
  }
}

export async function suggestPrompts(input: {
  domain: string;
  brand: string;
  description: string;
  country: string;
  language: string;
}): Promise<string[]> {
  const langMap: Record<string, string> = {
    es: "Spanish",
    en: "English",
    de: "German",
    fr: "French",
    pt: "Portuguese",
  };
  const lang = langMap[input.language] ?? "Spanish";

  const prompt = [
    "You are a GEO (Generative Engine Optimization) specialist.",
    "Generate 5 realistic questions that users would ask an AI assistant about the brand's product category.",
    `Brand: ${input.brand}`,
    `Domain: ${input.domain}`,
    `Description: ${input.description || "Not provided"}`,
    `Country: ${input.country}`,
    `Write the questions in ${lang}.`,
    "Return ONLY a JSON array of strings:",
    '["Question 1?", "Question 2?", ...]',
    "Questions must be natural, information-seeking queries. Max 5 items.",
  ].join("\n");

  const text = await callGeminiJson(prompt);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is string => typeof item === "string")
      .slice(0, 5)
      .map((item) => item.trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}
