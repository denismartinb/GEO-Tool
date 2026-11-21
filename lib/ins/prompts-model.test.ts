import { describe, expect, it } from "vitest";
import { buildPromptsModel, promptMatches, type PromptRow } from "./prompts-model";

function row(over: Partial<PromptRow> & { id: string }): PromptRow {
  return {
    prompt_id: over.id,
    prompt_text_snapshot: `Pregunta ${over.id}`,
    brand_mentioned: false,
    sentiment: "neutral",
    extracted_json: {},
    category: null,
    provider: "gemini",
    ...over,
  };
}

describe("buildPromptsModel", () => {
  it("counts prompts, not rows, and puts the brand-absent ones first", () => {
    const m = buildPromptsModel({
      results: [
        row({ id: "a", brand_mentioned: true, provider: "gemini" }),
        row({ id: "a", prompt_id: "a", brand_mentioned: false, provider: "openai" }),
        row({ id: "b", prompt_id: "b" }),
      ],
      projectDomain: "acme.com",
      providers: ["gemini", "openai"],
    });
    expect(m.scanned).toBe(2);
    expect(m.named).toBe(1);
    expect(m.visibility).toBe(50);
    expect(m.items[0].key).toBe("b");
    expect(m.items.find((i) => i.key === "a")!.namedBy).toEqual(["gemini"]);
  });

  it("measures each engine over its own answers", () => {
    const m = buildPromptsModel({
      results: [
        row({ id: "1", prompt_id: "p", brand_mentioned: true, provider: "gemini" }),
        row({ id: "2", prompt_id: "p", brand_mentioned: false, provider: "gemini" }),
        row({ id: "3", prompt_id: "p", brand_mentioned: false, provider: "openai" }),
      ],
      projectDomain: "acme.com",
      providers: ["gemini", "openai", "claude"],
    });
    expect(m.engines).toEqual([
      { provider: "gemini", percent: 50 },
      { provider: "openai", percent: 0 },
      { provider: "claude", percent: 0 },
    ]);
  });

  it("builds topics only with two categories or more and ranks them by visibility", () => {
    const one = buildPromptsModel({
      results: [row({ id: "a", category: "Precios" })],
      projectDomain: "acme.com",
      providers: ["gemini"],
    });
    expect(one.topics).toEqual([]);

    const m = buildPromptsModel({
      results: [
        row({ id: "a", category: "Precios", brand_mentioned: false }),
        row({ id: "b", category: "Autónomos", brand_mentioned: true }),
        row({ id: "c" }),
      ],
      projectDomain: "acme.com",
      providers: ["gemini"],
    });
    expect(m.topics.map((t) => t.category)).toEqual(["Autónomos", "Precios", "Sin categoría"]);
    expect(m.best?.category).toBe("Autónomos");
    expect(m.worst?.category).toBe("Sin categoría");
  });

  it("lists prompts the last scan did not cover as pending, never as named or absent", () => {
    const m = buildPromptsModel({
      results: [row({ id: "a", brand_mentioned: true })],
      pending: [{ id: "n1", text: "Nuevo prompt de prueba", category: null }],
      projectDomain: "acme.com",
      providers: ["gemini"],
    });
    expect(m.pending).toBe(1);
    expect(m.scanned).toBe(1);
    expect(m.visibility).toBe(100);
    expect(m.items.at(-1)).toMatchObject({ key: "n1", pending: true, named: false });
  });

  it("flags a prompt that cites the own domain and counts a competitor once across engines", () => {
    const ext = {
      competitors: [{ name: "Rival", mentioned: true }],
      citations: [{ domain: "www.acme.com" }],
    };
    const m = buildPromptsModel({
      results: [
        row({ id: "1", prompt_id: "p", extracted_json: ext, provider: "gemini" }),
        row({ id: "2", prompt_id: "p", extracted_json: ext, provider: "openai" }),
      ],
      projectDomain: "acme.com",
      providers: ["gemini", "openai"],
    });
    expect(m.items[0].competitors).toBe(1);
    expect(m.items[0].citesOwn).toBe(true);
  });

  it("gives no sentiment to an answer that never named the brand", () => {
    const m = buildPromptsModel({
      results: [row({ id: "a", brand_mentioned: false, sentiment: "negative" })],
      projectDomain: "acme.com",
      providers: ["gemini"],
    });
    expect(m.items[0].sentiment).toBeNull();
  });
});

describe("promptMatches", () => {
  it("ignores case and accents and also matches the topic", () => {
    const item = buildPromptsModel({
      results: [row({ id: "a", prompt_text_snapshot: "¿Qué software de facturación?" })],
      projectDomain: "acme.com",
      providers: ["gemini"],
    }).items[0];
    expect(promptMatches(item, "FACTURACION")).toBe(true);
    expect(promptMatches(item, "precios")).toBe(false);
    expect(promptMatches(item, "precios", "Precios")).toBe(true);
    expect(promptMatches(item, "  ")).toBe(true);
  });
});
