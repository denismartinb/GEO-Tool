import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aggregateBrands, brandKey, formatReport, parseArgs, SECTORS, type AnswerRecord } from "./sector-study";

/**
 * SECTOR-STUDY-1. The generation/extraction half needs live provider keys and
 * is exercised by running `pnpm study:sector`, not here. What IS pinned here
 * is everything a published figure depends on: how mentions are counted, how
 * failures are kept out of the denominator, and that the script cannot reach
 * a database.
 */

const record = (overrides: Partial<AnswerRecord>): AnswerRecord => ({
  engine: "gemini",
  promptIndex: 0,
  sample: 1,
  model: "m",
  error: null,
  rawText: "…",
  seedMentions: [],
  otherBrands: [],
  ...overrides
});

describe("sector-study isolation", () => {
  it("never imports a Supabase client", () => {
    const source = readFileSync(path.resolve(__dirname, "sector-study.ts"), "utf8");
    expect(source).not.toMatch(/(from|import\()\s*["'][^"']*supabase/i);
  });

  it("sector prompts never name a seed brand (that would bias the answer)", () => {
    for (const sector of SECTORS) {
      for (const prompt of sector.prompts) {
        for (const seed of sector.seedBrands) {
          const key = brandKey(seed.split("(")[0]);
          expect(brandKey(prompt).split(" "), `${sector.id}: "${prompt}" names ${seed}`).not.toContain(key);
        }
      }
    }
  });
});

describe("brandKey", () => {
  it("folds case, accents and punctuation but never fuzzy-matches", () => {
    expect(brandKey("Línea Directa")).toBe(brandKey("linea directa"));
    expect(brandKey("Holded.")).toBe("holded");
    expect(brandKey("Sage")).not.toBe(brandKey("Sage 50"));
  });
});

describe("aggregateBrands", () => {
  it("counts one mention per answer per brand and excludes failed answers from the denominator", () => {
    const rows = aggregateBrands(
      [
        record({ seedMentions: [{ name: "Holded", position: 1 }], otherBrands: ["holded", "Nuevo"] }),
        record({ engine: "openai", promptIndex: 1, seedMentions: [{ name: "Quipu", position: 2 }, { name: "Holded", position: 1 }] }),
        record({ engine: "claude", error: "ExtractionError:schema" })
      ],
      ["Holded", "Quipu", "Sage"]
    );
    const holded = rows.find((row) => row.name === "Holded")!;
    expect(holded.mentions).toBe(2);
    expect(holded.rate).toBe(1);
    expect(holded.firstPlace).toBe(2);
    expect(holded.promptsCovered).toBe(2);
    expect(holded.perEngine.claude).toEqual({ mentions: 0, valid: 0 });

    const nuevo = rows.find((row) => row.name === "Nuevo")!;
    expect(nuevo.seed).toBe(false);
    expect(nuevo.rate).toBe(0.5);

    const sage = rows.find((row) => row.name === "Sage")!;
    expect(sage.mentions).toBe(0);
    expect(rows[0].name).toBe("Holded");
  });

  it("an other-brand that matches a seed is counted as that seed", () => {
    const rows = aggregateBrands([record({ otherBrands: ["SAGE"] })], ["Sage"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Sage", seed: true, mentions: 1 });
  });
});

describe("formatReport", () => {
  it("states valid vs failed answers and lists seeds nobody named", () => {
    const sector = SECTORS[0];
    const records = [record({ seedMentions: [{ name: "Holded", position: 1 }] }), record({ engine: "openai", error: "x" })];
    const report = formatReport({
      sector,
      records,
      rows: aggregateBrands(records, sector.seedBrands),
      samples: 1,
      date: "2026-10-09"
    });
    expect(report).toContain("**1 válidas** (1 fallidas, excluidas del cálculo)");
    expect(report).toContain("| 1 | Holded | 100% (1/1)");
    expect(report).toMatch(/Candidatas que ningún motor nombró: [^\n]*Quipu/);
    expect(report).not.toMatch(/Candidatas que ningún motor nombró: [^\n]*Holded/);
  });
});

describe("formatReport with a subset of engines", () => {
  it("only shows the engines that ran, and counts them in the header", () => {
    const sector = SECTORS[0];
    const records = [record({ seedMentions: [{ name: "Holded", position: 1 }] })];
    const report = formatReport({
      sector,
      records,
      rows: aggregateBrands(records, sector.seedBrands),
      samples: 1,
      date: "d",
      engines: ["gemini", "openai"]
    });
    expect(report).toContain("× 2 motores");
    expect(report).toContain("| Gemini | ChatGPT |");
    expect(report).not.toContain("Claude |");
  });
});

describe("formatReport with no valid answers", () => {
  it("refuses to print a ranking (no 'nobody named X' claims from zero data)", () => {
    const sector = SECTORS[0];
    const records = [record({ error: "GeminiConfigError" })];
    const report = formatReport({ sector, records, rows: aggregateBrands(records, sector.seedBrands), samples: 1, date: "d" });
    expect(report).toContain("Estudio sin datos");
    expect(report).not.toContain("Candidatas");
  });

  it("warns when more than 20% of answers failed", () => {
    const sector = SECTORS[0];
    const records = [record({}), record({ engine: "openai", error: "x" })];
    const report = formatReport({ sector, records, rows: aggregateBrands(records, sector.seedBrands), samples: 1, date: "d" });
    expect(report).toContain("**Atención:** fallaron 1 de 2");
  });
});

describe("parseArgs", () => {
  it("defaults and bounds", () => {
    expect(parseArgs(["--sector", "x"])).toEqual({
      sector: "x",
      samples: 2,
      list: false,
      concurrency: 3,
      engines: ["gemini", "openai", "claude"]
    });
    expect(parseArgs(["--engines", "gemini,openai"]).engines).toEqual(["gemini", "openai"]);
    expect(() => parseArgs(["--engines", "perplexity"])).toThrow();
    expect(() => parseArgs(["--samples", "9"])).toThrow();
  });
});
