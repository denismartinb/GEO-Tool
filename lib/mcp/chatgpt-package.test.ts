import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MCP-CONNECTOR-TUNING-1 (log §452): OpenAI's submission spec
 * (developers.openai.com/plugins/deploy/submission.md) declares
 * `tools_triggered` as a comma-separated STRING, e.g. "search_notes, read_note".
 * The package shipped arrays, which blocks the review. This pins the format
 * and that every named tool exists on the server.
 */

const pkg = JSON.parse(readFileSync(join(process.cwd(), "docs/chatgpt-plugin/package/plugin.json"), "utf8"));
const cases = pkg.extensions["com.openai"].review.test_cases;
const TOOLS = [
  "listar_dominios",
  "ver_dominio",
  "ver_recomendaciones",
  "ver_competidores",
  "ver_prompts",
  "ver_auditorias",
  "ver_posicion_google",
  "revisar_pagina",
  "buscar_guias",
  "que_es_genscore"
];

describe("ChatGPT review package (log §452)", () => {
  it("has five positive and three negative cases", () => {
    expect(cases.positive).toHaveLength(5);
    expect(cases.negative).toHaveLength(3);
  });

  it("declares tools_triggered as a comma-separated string of real tools", () => {
    for (const c of cases.positive) {
      expect(typeof c.tools_triggered).toBe("string");
      expect(c.expected_behavior).toBeTruthy();
      for (const name of c.tools_triggered.split(",").map((s: string) => s.trim())) expect(TOOLS).toContain(name);
    }
    expect(cases.positive.map((c: { tools_triggered: string }) => c.tools_triggered)).toEqual([
      "revisar_pagina",
      "buscar_guias",
      "listar_dominios, ver_dominio",
      "ver_recomendaciones",
      "ver_prompts"
    ]);
  });

  it("negative cases carry only description and prompt", () => {
    for (const c of cases.negative) expect(Object.keys(c).sort()).toEqual(["description", "prompt"]);
  });
});
