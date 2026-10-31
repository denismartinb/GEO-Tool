import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CONSOLE-SKELETONS-1 (log §398): every console loading state is an
// Instrumento skeleton, so it follows the tokens (dark mode included).
function loadings(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return loadings(p);
    return name === "loading.tsx" ? [p] : [];
  });
}

describe("console loading skeletons", () => {
  const files = loadings(join(process.cwd(), "app/dashboard"));

  it("finds the console loading states", () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it.each(files)("%s renders inside SkPage", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("@/components/ins/skeleton");
    expect(src).toContain("<SkPage");
    expect(src).not.toMatch(/components\/ui\/skeleton|className="skel/);
  });

  it("the skeleton sheet only paints with Instrumento tokens", () => {
    const css = readFileSync(join(process.cwd(), "app/ins/skeleton.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(css).toContain("prefers-reduced-motion");
  });
});
