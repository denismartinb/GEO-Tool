import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "./posts";

/**
 * SEO-POS-1 (S1, log §49). El propio borrador del plan proponía titular la
 * primera pieza de la Fase C "…en ChatGPT, Gemini y Perplexity" — Perplexity
 * no es un motor que Genscore ejecute hoy (`docs/launch-plan.md` Fase 8:
 * Gemini, Claude, ChatGPT; Perplexity "sin fecha, fuera de alcance"). Se
 * corrigió antes de publicar, pero solo porque alguien releyó el título con
 * cuidado. Este test es la red que no depende de que eso vuelva a pasar.
 *
 * No es una prohibición absoluta: una pieza que compare Genscore con la
 * competencia, o que hable de "cómo aparecer en Perplexity" como tema de
 * mercado (S7 de `docs/content-calendar.md`), tiene motivo legítimo para
 * nombrarlo. Por eso es un allow-list explícito, no un blanket ban — y **solo
 * puede crecer**, nunca reducirse en silencio: cada entrada nueva se añade en
 * el mismo PR que la justifica, igual que `PENDING_CONVERSION` en
 * `article-recipes.test.ts`.
 */
const ALLOWED_TO_MENTION_PERPLEXITY = new Set<string>([]);

function readArticle(slug: string): string {
  return readFileSync(join(process.cwd(), "app", "blog", slug, "page.mdx"), "utf8");
}

describe("honestidad de motores en el cuerpo de los artículos", () => {
  for (const post of BLOG_POSTS) {
    if (ALLOWED_TO_MENTION_PERPLEXITY.has(post.slug)) continue;

    it(`${post.slug} no nombra Perplexity como motor de Genscore`, () => {
      const source = readArticle(post.slug);
      expect(
        source,
        `${post.slug} menciona Perplexity — no es un motor soportado hoy. ` +
          "Si el artículo tiene un motivo legítimo (comparativa, tema de mercado), " +
          "añade el slug a ALLOWED_TO_MENTION_PERPLEXITY en este mismo PR y explica por qué."
      ).not.toMatch(/Perplexity/i);
    });
  }
});
