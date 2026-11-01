import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WP-PLUGIN-1 (log §421). The WordPress plugin reuses the Chrome extension's
 * page reading and scoring as is, so the score a site sees in wp-admin is the
 * one the extension shows. A copy that drifts is two «Nota SEO + IA».
 */

const ROOT = process.cwd();
const PLUGIN = join(ROOT, "docs/wordpress-plugin/genscore");
const EXTENSION = join(ROOT, "docs/chrome-extension/prueba/extension");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]
  );
}

describe("WordPress plugin", () => {
  it.each(["collect.js", "score.js"])("vendor/%s is the extension's file, byte for byte", (file) => {
    expect(read(join(PLUGIN, "assets/vendor", file))).toBe(read(join(EXTENSION, file)));
  });

  it("never calls genscore.es from PHP or its own script: links only", () => {
    const code = filesUnder(PLUGIN)
      .filter((f) => /\.(php|js)$/.test(f) && !f.includes("/vendor/"))
      .map(read)
      .join("\n");
    expect(code).not.toMatch(/wp_remote_(get|post|request)|wp_safe_remote|curl_init|file_get_contents\(\s*['"]https?:/);
    expect(code).not.toMatch(/fetch\(\s*["'`]https?:\/\/(www\.)?genscore\.es/);
  });

  it("every PHP file refuses to run outside WordPress", () => {
    for (const file of filesUnder(PLUGIN).filter((f) => f.endsWith(".php") && !f.endsWith("index.php"))) {
      const src = read(file);
      expect(src, file).toMatch(/defined\( '(ABSPATH|WP_UNINSTALL_PLUGIN)' \)/);
    }
  });

  it("has no em dashes in what a person reads", () => {
    const text = filesUnder(PLUGIN)
      .filter((f) => /\.(php|js|txt|css)$/.test(f) && !f.includes("/vendor/"))
      .map(read)
      .join("\n");
    expect(text).not.toContain("—");
  });

  const php = spawnSync("php", ["-v"]).status === 0;
  it.skipIf(!php)("robots.txt rules pass their PHP tests", () => {
    const out = execFileSync("php", [join(ROOT, "docs/wordpress-plugin/tests/robots-test.php")], {
      encoding: "utf8"
    });
    expect(out).not.toContain("FAIL");
  });
});
