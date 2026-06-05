import { describe, it, expect } from "vitest";

// Inline copies of the pure parser functions from app/dashboard/projects/actions.ts
function normalizePrompt(prompt: string) {
  return prompt.trim().toLocaleLowerCase();
}

function normalizeCompetitorValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

function parseInitialPrompts(input: string | undefined) {
  if (!input) return [];
  const seen = new Set<string>();
  const prompts: Array<{ prompt_text: string; category: null; sort_order: number }> = [];
  for (const rawLine of input.split("\n")) {
    const promptText = rawLine.trim();
    if (!promptText) continue;
    const normalized = normalizePrompt(promptText);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    prompts.push({ prompt_text: promptText, category: null, sort_order: prompts.length });
    if (prompts.length >= 10) break;
  }
  return prompts;
}

function parseInitialCompetitors(input: string | undefined) {
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
    const dedupeKey = `${normalizeCompetitorValue(name)}|${normalizeCompetitorValue(domain)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    competitors.push({ name, domain });
    if (competitors.length >= 5) break;
  }
  return competitors;
}

describe("parseInitialPrompts", () => {
  it("returns empty array for undefined input", () => {
    expect(parseInitialPrompts(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseInitialPrompts("")).toEqual([]);
  });

  it("parses single prompt", () => {
    const result = parseInitialPrompts("¿Cuál es el mejor proveedor de internet?");
    expect(result).toHaveLength(1);
    expect(result[0].prompt_text).toBe("¿Cuál es el mejor proveedor de internet?");
    expect(result[0].sort_order).toBe(0);
  });

  it("parses multiple prompts separated by newlines", () => {
    const input = "Prompt uno\nPrompt dos\nPrompt tres";
    const result = parseInitialPrompts(input);
    expect(result).toHaveLength(3);
  });

  it("skips empty lines", () => {
    const input = "Prompt uno\n\n\nPrompt dos";
    const result = parseInitialPrompts(input);
    expect(result).toHaveLength(2);
  });

  it("deduplicates case-insensitive prompts", () => {
    const input = "Prompt uno\nprompt uno\nPROMPT UNO";
    const result = parseInitialPrompts(input);
    expect(result).toHaveLength(1);
  });

  it("respects MAX_INITIAL_PROMPTS = 10", () => {
    const input = Array.from({ length: 15 }, (_, i) => `Prompt ${i + 1}`).join("\n");
    const result = parseInitialPrompts(input);
    expect(result).toHaveLength(10);
  });

  it("assigns correct sort_order", () => {
    const input = "Primero\nSegundo\nTercero";
    const result = parseInitialPrompts(input);
    expect(result[0].sort_order).toBe(0);
    expect(result[1].sort_order).toBe(1);
    expect(result[2].sort_order).toBe(2);
  });
});

describe("parseInitialCompetitors", () => {
  it("returns empty array for undefined input", () => {
    expect(parseInitialCompetitors(undefined)).toEqual([]);
  });

  it("parses valid competitor line", () => {
    const result = parseInitialCompetitors("Vodafone | vodafone.es");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Vodafone");
    expect(result[0].domain).toBe("vodafone.es");
  });

  it("trims whitespace from name and domain", () => {
    const result = parseInitialCompetitors("  Vodafone  |  vodafone.es  ");
    expect(result[0].name).toBe("Vodafone");
    expect(result[0].domain).toBe("vodafone.es");
  });

  it("skips lines without pipe separator", () => {
    const result = parseInitialCompetitors("Vodafone vodafone.es");
    expect(result).toHaveLength(0);
  });

  it("skips lines with domain shorter than 3 chars", () => {
    const result = parseInitialCompetitors("Test | ab");
    expect(result).toHaveLength(0);
  });

  it("skips empty lines", () => {
    const input = "Vodafone | vodafone.es\n\nOrange | orange.es";
    const result = parseInitialCompetitors(input);
    expect(result).toHaveLength(2);
  });

  it("deduplicates same name+domain", () => {
    const input = "Vodafone | vodafone.es\nVodafone | vodafone.es\nVODAFONE | VODAFONE.ES";
    const result = parseInitialCompetitors(input);
    expect(result).toHaveLength(1);
  });

  it("respects MAX_INITIAL_COMPETITORS = 5", () => {
    const lines = Array.from({ length: 8 }, (_, i) => `Comp${i} | comp${i}.com`).join("\n");
    const result = parseInitialCompetitors(lines);
    expect(result).toHaveLength(5);
  });

  it("skips lines with empty name", () => {
    const result = parseInitialCompetitors("| vodafone.es");
    expect(result).toHaveLength(0);
  });
});
