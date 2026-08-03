import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS, type BlogCluster } from "./posts";

/**
 * GROWTH-3 Fase 3.1 — densidad visual obligatoria.
 *
 * `docs/brand/article-design-system.md` §3 define un mínimo de bloques de
 * composición por cluster. Este test lo hace cumplir: una regla que no es un
 * test no existe (es el mismo criterio que ya aplican los tests de ≥3 enlaces
 * internos del glosario y de ≥1 fila donde gana el competidor).
 *
 * El objetivo real de este fichero es que NINGÚN artículo nuevo pueda
 * publicarse como texto plano.
 */

/** Mínimo de apariciones por componente, por cluster (system §3). */
const RECIPES: Record<BlogCluster["key"], Record<string, number>> = {
  fundamentos: { KeyTakeaway: 1, Figure: 1, AuthorBio: 1, ArticleCta: 1 },
  medicion: { KeyTakeaway: 1, Figure: 1, StatGrid: 1, AuthorBio: 1, ArticleCta: 1 },
  playbooks: { KeyTakeaway: 1, NumberedSection: 2, QuickAction: 2, Figure: 1, AuthorBio: 1, ArticleCta: 1 },
  sectores: { KeyTakeaway: 1, Figure: 1, StatGrid: 1, AuthorBio: 1, ArticleCta: 1 }
};

/**
 * Artículos escritos antes de que existiera la librería (GROWTH-1 y
 * GROWTH-2). Están exentos del mínimo mientras se convierten.
 *
 * ESTA LISTA SOLO PUEDE ENCOGER. Un artículo nuevo nace cumpliendo la receta;
 * si alguien añade un slug aquí en vez de componer el artículo, el test de
 * abajo que fija el tamaño máximo se lo impide.
 */
const PENDING_CONVERSION = new Set([
  "que-es-el-geo-score",
  "que-es-geo-generative-engine-optimization",
  "como-elegir-prompts-monitorizar-marca-ia",
  "como-elegir-competidores-analisis-geo",
  "genscore-vs-herramientas-geo",
  "como-conseguir-que-chatgpt-te-cite"
]);

function readArticle(slug: string): string {
  const path = join(process.cwd(), "app", "blog", slug, "page.mdx");
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** Cuenta aperturas de un componente JSX concreto, no menciones en prosa. */
function countComponent(source: string, name: string): number {
  return [...source.matchAll(new RegExp(`<${name}[\\s/>]`, "g"))].length;
}

describe("recetas de composición por cluster", () => {
  const converted = BLOG_POSTS.filter((p) => !PENDING_CONVERSION.has(p.slug));

  it("hay al menos un artículo ya convertido al sistema de diseño", () => {
    expect(converted.length).toBeGreaterThan(0);
  });

  for (const post of converted) {
    it(`cumple el mínimo visual de su cluster (${post.cluster}): ${post.slug}`, () => {
      const source = readArticle(post.slug);
      expect(source.length, `${post.slug}: no se pudo leer el MDX`).toBeGreaterThan(0);

      const recipe = RECIPES[post.cluster];
      const missing: string[] = [];
      for (const [component, min] of Object.entries(recipe)) {
        const found = countComponent(source, component);
        if (found < min) missing.push(`${component} (${found}/${min})`);
      }
      expect(missing, `${post.slug} incumple la receta de "${post.cluster}": ${missing.join(", ")}`).toEqual([]);
    });

    it(`importa los componentes del barril, no de ficheros sueltos: ${post.slug}`, () => {
      const source = readArticle(post.slug);
      expect(source).toContain('from "@/components/blog/article"');
      expect(source, "no debe importar de components/blog/article/blocks o /figure directamente").not.toMatch(
        /from "@\/components\/blog\/article\/(blocks|figure)"/
      );
    });
  }
});

describe("la deuda de conversión solo puede encoger", () => {
  it("no quedan más de 6 artículos sin convertir", () => {
    // Cuando conviertas uno, baja este número. Nunca lo subas: subirlo
    // significa que se publicó un artículo nuevo en texto plano.
    expect(PENDING_CONVERSION.size).toBeLessThanOrEqual(6);
  });

  it("todo slug pendiente corresponde a un artículo que existe de verdad", () => {
    const real = new Set(BLOG_POSTS.map((p) => p.slug));
    for (const slug of PENDING_CONVERSION) {
      expect(real.has(slug), `${slug} está en PENDING_CONVERSION pero no existe en BLOG_POSTS`).toBe(true);
    }
  });
});

describe("el detector de composición funciona", () => {
  it("cuenta aperturas de componente y no menciones en prosa", () => {
    expect(countComponent("<KeyTakeaway>x</KeyTakeaway>", "KeyTakeaway")).toBe(1);
    expect(countComponent("<QuickAction />\n<QuickAction>y</QuickAction>", "QuickAction")).toBe(2);
    expect(countComponent("hablamos de KeyTakeaway en el texto", "KeyTakeaway")).toBe(0);
    // No debe confundir un componente con otro cuyo nombre lo contiene.
    expect(countComponent("<StatGrid><Stat /></StatGrid>", "Stat")).toBe(1);
  });
});
