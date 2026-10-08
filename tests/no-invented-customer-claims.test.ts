import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TESTIMONIO-RETIRADO-1 (founder, 2026-10-08, log §146 rectified): the homepage testimonial (a named person, a
 * company, two photos and a growth figure) was INVENTED, and an earlier one before it too. Nothing in the product may
 * render it again, and no customer case, logo or photo may appear without the original and the customer's consent on
 * record. A quote can come back only by editing this test together with the evidence.
 *
 * Scope: what the PRODUCT ships (app/, components/, lib/, public/). Design artefacts under docs/ are history and are
 * annotated, not scanned.
 */
const ROOT = process.cwd();
const SCANNED = ["app", "components", "lib", "public"];
const IGNORED_DIRS = new Set(["node_modules", ".next"]);
// These files must name the retired case to forbid it.
const ALLOWED = new Set([
  "tests/no-invented-customer-claims.test.ts",
  "lib/email/email-claims.test.ts",
  "lib/email/lifecycle/templates.test.ts"
]);
const FORBIDDEN = /\bNerea\b|\bNordika\b|nordikahome|Sol[ií]s\b.*Marketing|Aisha Robinson|Beltway|\+?128\s?%|cuota de voz en IA[^.\n]{0,40}128/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (IGNORED_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe("no invented customer claims ship in the product", () => {
  const files = SCANNED.flatMap((d) => (existsSync(join(ROOT, d)) ? walk(join(ROOT, d)) : []));

  it("scans a meaningful number of files (the guard is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("names none of the retired testimonials, companies or figures in any source or content file", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (ALLOWED.has(rel) || !/\.(tsx?|mdx?|css|json|txt|xml|html|svg)$/.test(rel)) continue;
      if (FORBIDDEN.test(readFileSync(file, "utf8"))) offenders.push(rel);
    }
    expect(offenders, "retired testimonial text found; see log §146 (rectified) and §237").toEqual([]);
  });

  it("ships none of the retired customer photos or screenshots", () => {
    const names = files.map((f) => relative(ROOT, f).replace(/\\/g, "/"));
    expect(names.filter((n) => /(^|[\/_.-])(nerea|nordika)/i.test(n))).toEqual([]);
    expect(existsSync(join(ROOT, "public/home/nerea.webp"))).toBe(false);
    expect(existsSync(join(ROOT, "public/home/nordika-home.webp"))).toBe(false);
  });

  it("keeps no testimonial section or styles on the homepage", () => {
    const landing = readFileSync(join(ROOT, "components/landing/landing-page.tsx"), "utf8");
    expect(landing).not.toMatch(/lp-testi|Nuestros clientes/);
    expect(readFileSync(join(ROOT, "app/globals.css"), "utf8")).not.toMatch(/\.lp-testi/);
  });
});
