import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SEO-INDEX-1 (log §473): el comprobador gratuito salía prerenderizado sin H1,
 * sin texto y sin FAQ, porque `useSearchParams` obligaba a envolver todo el
 * contenido en un `Suspense` con `fallback={null}`. El contenido tiene que
 * llegar en el HTML del servidor.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("comprobador gratuito en el HTML del servidor", () => {
  it("el formulario no usa useSearchParams", () => {
    expect(read("components/free-checker/free-checker-form.tsx")).not.toMatch(/useSearchParams\(|import \{[^}]*useSearchParams/);
  });

  it("la página no esconde su contenido tras un Suspense", () => {
    expect(read("app/gratis/aparece-mi-marca-en-chatgpt/page.tsx")).not.toMatch(/<Suspense/);
  });
});
