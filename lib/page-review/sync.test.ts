import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script without types
import { buildCollectFactory, buildScoreCopy } from "../../scripts/sync-page-review.mjs";

/**
 * MCP-SERVER-1 (log §418): `revisar_pagina` and the Chrome extension must
 * give the same page the same nota. The server runs generated copies of the
 * extension's files; if either side changes alone, this fails. Fix with
 * `node scripts/sync-page-review.mjs`.
 */
const root = join(__dirname, "..", "..");
const ext = (f: string) => readFileSync(join(root, "docs/chrome-extension/prueba/extension", f), "utf8");
const lib = (f: string) => readFileSync(join(__dirname, f), "utf8");

describe("page review parity with the Chrome extension", () => {
  it("collect.cjs is the extension's collect.js, wrapped", () => {
    expect(lib("collect.cjs")).toBe(buildCollectFactory(ext("collect.js")));
  });
  it("score.cjs is the extension's score.js", () => {
    expect(lib("score.cjs")).toBe(buildScoreCopy(ext("score.js")));
  });
  it("the wrapper really removed the module.exports line", () => {
    expect(lib("collect.cjs")).not.toContain("module.exports = { collectPageFacts }");
  });
});
