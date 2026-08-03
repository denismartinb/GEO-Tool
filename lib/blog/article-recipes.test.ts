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

/**
 * Línea base congelada: los artículos que ya existían en texto plano cuando
 * se creó el sistema de diseño (GROWTH-3 Fase 3.1, 2026-08-03).
 *
 * NO SE AÑADE NADA AQUÍ NUNCA. Solo se quitan entradas de
 * `PENDING_CONVERSION` conforme se convierten.
 */
const CONVERSION_DEBT_BASELINE = new Set([
  "que-es-el-geo-score",
  "que-es-geo-generative-engine-optimization",
  "como-elegir-prompts-monitorizar-marca-ia",
  "como-elegir-competidores-analisis-geo",
  "genscore-vs-herramientas-geo",
  "como-conseguir-que-chatgpt-te-cite"
]);

describe("la deuda de conversión solo puede encoger", () => {
  /**
   * Comprobar solo el tamaño NO basta, y QA lo demostró: se podía sacar un
   * slug de la lista y meter otro nuevo, mantener el tamaño en 6, y con eso
   * eximir a un artículo nuevo en texto plano del check de receta. La
   * garantía real es de pertenencia, no de cardinalidad.
   */
  it("todo pendiente estaba ya en la línea base — no se puede añadir uno nuevo", () => {
    const intrusos = [...PENDING_CONVERSION].filter((slug) => !CONVERSION_DEBT_BASELINE.has(slug));
    expect(
      intrusos,
      `estos slugs no estaban en la deuda original: ${intrusos.join(", ")}. ` +
        "Un artículo nuevo se compone con el sistema de diseño, no se exime."
    ).toEqual([]);
  });

  it("la deuda nunca supera la línea base", () => {
    expect(PENDING_CONVERSION.size).toBeLessThanOrEqual(CONVERSION_DEBT_BASELINE.size);
  });

  it("todo slug pendiente corresponde a un artículo que existe de verdad", () => {
    const real = new Set(BLOG_POSTS.map((p) => p.slug));
    for (const slug of PENDING_CONVERSION) {
      expect(real.has(slug), `${slug} está en PENDING_CONVERSION pero no existe en BLOG_POSTS`).toBe(true);
    }
  });
});

/** Extrae el código fuente de cada `<Checklist … />` de un artículo. */
function checklistBlocks(source: string): string[] {
  return [...source.matchAll(/<Checklist\b[\s\S]*?\/>/g)].map((m) => m[0]);
}

/** Puntos redactados en negativo: "No …", "Nunca …", "Jamás …". */
function countNegativeItems(block: string): { negativos: number; total: number } {
  const items = [...block.matchAll(/"([^"]+)"/g)]
    .map((m) => m[1])
    // `tone="evitar"` y demás props también casan con las comillas: se descartan.
    .filter((s) => s.includes(" "));
  return {
    negativos: items.filter((s) => /^(No|Nunca|Jamás)\b/.test(s.trim())).length,
    total: items.length
  };
}

describe("el icono del Checklist dice lo mismo que el texto", () => {
  /**
   * Hallazgo del ux-pilot en la PR #309: un apartado de "errores comunes"
   * (cosas que NO hay que hacer) renderizado con checks verdes le da al lector
   * que escanea la señal contraria a la que dice la frase. El icono se lee
   * antes que el texto, así que la contradicción gana.
   */
  for (const post of BLOG_POSTS) {
    it(`no marca con check verde una lista de cosas a evitar: ${post.slug}`, () => {
      for (const block of checklistBlocks(readArticle(post.slug))) {
        const { negativos, total } = countNegativeItems(block);
        if (total === 0 || negativos <= total / 2) continue;
        expect(
          block,
          `${post.slug}: un Checklist con ${negativos}/${total} puntos en negativo necesita tone="evitar" ` +
            "(aspa roja). Si no, el icono contradice al texto."
        ).toContain('tone="evitar"');
      }
    });
  }
});

describe("el detector de composición funciona", () => {
  it("distingue un checklist en negativo de uno en positivo", () => {
    const negativo = '<Checklist\n  items={[\n    "No copies tu sitemap",\n    "Nunca lo trates como keywords"\n  ]}\n/>';
    expect(countNegativeItems(negativo)).toEqual({ negativos: 2, total: 2 });

    const positivo = '<Checklist\n  items={[\n    "Publica el fichero en la raíz",\n    "Manténlo corto"\n  ]}\n/>';
    expect(countNegativeItems(positivo).negativos).toBe(0);

    // Una prop de una palabra no se cuenta como punto de la lista.
    expect(countNegativeItems('<Checklist tone="evitar" items={["No hagas esto"]} />').total).toBe(1);
  });

  it("encuentra cada Checklist del artículo por separado", () => {
    expect(checklistBlocks('<Checklist items={["a b"]} />\ntexto\n<Checklist items={["c d"]} />')).toHaveLength(2);
    expect(checklistBlocks("no hay ninguno aquí")).toHaveLength(0);
  });

  it("cuenta aperturas de componente y no menciones en prosa", () => {
    expect(countComponent("<KeyTakeaway>x</KeyTakeaway>", "KeyTakeaway")).toBe(1);
    expect(countComponent("<QuickAction />\n<QuickAction>y</QuickAction>", "QuickAction")).toBe(2);
    expect(countComponent("hablamos de KeyTakeaway en el texto", "KeyTakeaway")).toBe(0);
    // No debe confundir un componente con otro cuyo nombre lo contiene.
    expect(countComponent("<StatGrid><Stat /></StatGrid>", "Stat")).toBe(1);
  });
});
