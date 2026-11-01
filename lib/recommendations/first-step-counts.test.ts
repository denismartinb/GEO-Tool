import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RECS-FAQ-COUNT-1 (log §424): the FAQ first step said «las tres preguntas de
 * la lista» whatever the list held; on genscore.es it held one. A first step
 * that points at the list never states how many questions it has.
 */
describe("first steps never hardcode how many questions the list holds", () => {
  it("has no number word before «preguntas de la lista»", () => {
    const src = readFileSync(join(__dirname, "recommendation-engine.ts"), "utf8");
    expect(src).not.toMatch(/\b(dos|tres|cuatro|cinco|seis|\d+) preguntas de la lista/i);
  });
});
