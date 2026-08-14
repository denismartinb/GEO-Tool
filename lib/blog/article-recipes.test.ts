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
const PENDING_CONVERSION = new Set<string>([]);

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
   * La línea base se ha roto por accidente DOS veces, las dos con un `sed`
   * que casaba el mismo slug en los dos conjuntos y lo borraba de ambos. Si
   * la línea base encoge a la vez que la deuda, la garantía de pertenencia
   * se evapora en silencio: todo pendiente sigue "estando en la base"
   * simplemente porque la base se encogió con él.
   *
   * Por eso se fija aquí literalmente. No es redundante con la constante:
   * es lo que convierte "hay que tener cuidado" en "el test te para".
   */
  it("la línea base es exactamente la deuda original de la Fase 3.1", () => {
    expect([...CONVERSION_DEBT_BASELINE].sort()).toEqual(
      [
        "como-conseguir-que-chatgpt-te-cite",
        "como-elegir-competidores-analisis-geo",
        "como-elegir-prompts-monitorizar-marca-ia",
        "genscore-vs-herramientas-geo",
        "que-es-el-geo-score",
        "que-es-geo-generative-engine-optimization"
      ].sort()
    );
  });

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

/** Pesos canónicos del GEO Score, en el orden en que los pinta un `ProductMock` (ADR-0015). */
const GEO_WEIGHTS = [0.4, 0.25, 0.2, 0.15];

/** Lee `value:` y `weight:` (opcional) de un array `mockRows` declarado en un MDX. */
export function readMockRows(source: string): { value: number; weight?: number }[] {
  const block = source.match(/mockRows\s*=\s*\[([\s\S]*?)\n\]/);
  if (!block) return [];
  return [...block[1].matchAll(/\{[^}]*\}/g)].map((m) => {
    const value = Number(m[0].match(/value:\s*(\d+(?:\.\d+)?)/)?.[1]);
    const weight = m[0].match(/weight:\s*(\d+(?:\.\d+)?)/)?.[1];
    return weight === undefined ? { value } : { value, weight: Number(weight) };
  });
}

/** El número del gauge que el MDX pasa a `<ProductMock score={N} …>`. */
export function readMockScore(source: string): number | null {
  const m = source.match(/<ProductMock[\s\S]*?score=\{(\d+(?:\.\d+)?)\}/);
  return m ? Number(m[1]) : null;
}

describe("el gauge de un ProductMock cuadra con las filas que enseña", () => {
  /**
   * Este error ya se ha colado DOS veces (QA lo encontró en la PR #309 con un
   * 64 frente a un 65). Un artículo que enseña cuatro barras y un número que
   * no sale de esas barras se contradice a sí mismo a la vista del lector,
   * que es exactamente el tipo de mentira por descuido que este proyecto no
   * publica. Comprobarlo a mano no escala: se comprueba aquí.
   *
   * Si las filas no declaran `weight`, se aplican los pesos canónicos de
   * ADR-0015: las cuatro filas de un ProductMock son siempre los cuatro
   * componentes del GEO Score, en ese orden.
   */
  for (const post of BLOG_POSTS) {
    it(`el score declarado es la media ponderada real: ${post.slug}`, () => {
      const source = readArticle(post.slug);
      const score = readMockScore(source);
      if (score === null) return;

      const rows = readMockRows(source);
      expect(rows.length, `${post.slug}: hay un ProductMock pero no se pudieron leer sus filas`).toBeGreaterThan(0);

      const total = rows.reduce(
        (acc, row, i) => acc + row.value * (row.weight !== undefined ? row.weight / 100 : (GEO_WEIGHTS[i] ?? 0)),
        0
      );
      expect(
        score,
        `${post.slug}: el gauge dice ${score} pero sus propias filas dan ${total.toFixed(2)}`
      ).toBe(Math.round(total));
    });
  }
});

describe("el lector de ProductMock funciona", () => {
  it("lee filas con y sin peso, y el score", () => {
    const conPeso = 'export const mockRows = [\n  { label: "a", value: 80, weight: 40 },\n  { label: "b", value: 60, weight: 60 }\n]';
    expect(readMockRows(conPeso)).toEqual([
      { value: 80, weight: 40 },
      { value: 60, weight: 60 }
    ]);
    const sinPeso = 'export const mockRows = [\n  { label: "a", value: 50 }\n]';
    expect(readMockRows(sinPeso)).toEqual([{ value: 50 }]);
    expect(readMockScore("<ProductMock\n  score={65}\n  rows={mockRows}\n/>")).toBe(65);
    expect(readMockScore("no hay maqueta aquí")).toBeNull();
  });

  it("detecta un gauge que no cuadra", () => {
    // 80*.4 + 60*.6 = 68, no 70 — el test de arriba tiene que poder fallar.
    const rows = [
      { value: 80, weight: 40 },
      { value: 60, weight: 60 }
    ];
    const total = rows.reduce((a, r) => a + r.value * (r.weight / 100), 0);
    expect(Math.round(total)).toBe(68);
    expect(Math.round(total)).not.toBe(70);
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

/**
 * SEO-POS-1 Fase C, S5 (log §70): `RelatedPosts` recibe `cluster` y
 * `currentSlug`. `que-es-una-auditoria-geo` se publicó pasándole `slug`, y el
 * componente devolvió `null` — sin bloque "Sigue leyendo", sin enlaces
 * internos, y **sin ningún error**: MDX no se typechequea, así que una prop
 * equivocada no rompe la build, simplemente no pinta nada.
 *
 * Lo cogió el piloto, que sí comprueba `.blog-related a` sobre el despliegue
 * real. Pero el piloto solo exige que **exista** un enlace: un artículo de
 * `playbooks` que pasara `cluster="medicion"` enlazaría al cluster equivocado
 * y pasaría igual, tanto el piloto como cualquier comprobación ingenua. Por
 * eso este test no mira que la llamada esté, sino que **el cluster que declara
 * coincida con el del propio artículo** en `BLOG_POSTS`.
 */
describe("cada artículo enlaza a su propio cluster", () => {
  for (const post of BLOG_POSTS) {
    it(`RelatedPosts recibe cluster y currentSlug correctos: ${post.slug}`, () => {
      const source = readArticle(post.slug);
      if (!source) return;

      const call = source.match(/<RelatedPosts([^>]*)\/>/);
      expect(call, `${post.slug} no renderiza <RelatedPosts />`).not.toBeNull();

      const props = call?.[1] ?? "";
      expect(
        props,
        `${post.slug}: RelatedPosts necesita cluster="${post.cluster}". Sin él el ` +
          "componente devuelve null y el artículo se queda sin enlazado interno, " +
          "sin que nada falle en build ni en tests."
      ).toContain(`cluster="${post.cluster}"`);
      expect(props, `${post.slug}: RelatedPosts necesita currentSlug`).toContain("currentSlug");
    });
  }
});

/**
 * SEO-POS-1 Fase C, S5, revisión (log §69): el borrador de
 * que-es-una-auditoria-geo publicaba el reparto de puntos real de
 * `lib/web-audit/page-checks.ts` (15/15/15/15/20/20). El fundador decidió
 * que eso es metodología del producto, no buena práctica pública, y pidió
 * quitarlo — dimensiones y umbrales de comportamiento sí, reparto de puntos
 * no.
 *
 * Nada impedía que una sesión futura, al tocar este artículo o al copiar su
 * patrón para uno nuevo, reintrodujera "— 15 puntos" en un título de sección.
 * No hay compilador que lo pille: es MDX, y el número encajaría con
 * naturalidad al lado de cada dimensión. Este test es la memoria que una
 * revisión de founder necesita para no perderse en el siguiente refresco.
 */
describe("que-es-una-auditoria-geo no publica el reparto de puntos del producto", () => {
  const source = readArticle("que-es-una-auditoria-geo");

  it("ninguna sección lleva un recuento de puntos en el título", () => {
    expect(source).not.toMatch(/—\s*\d+\s*puntos/i);
  });

  it("no afirma un total sobre 100 ni un subtotal parcial como 85", () => {
    expect(source).not.toMatch(/\bsobre\s+100\b/i);
    expect(source).not.toMatch(/\b85\s*puntos\b/i);
  });
});

/**
 * SEO-POS-1 S8 (log §78) — una figura con tabla dentro tiene que declararse
 * `wide`.
 *
 * `.art-frame` nace con `overflow: hidden`, que es lo correcto para un
 * `ProductMock` o un SVG y lo peor posible para una tabla: la columna que no
 * cabe **desaparece sin dejar forma de alcanzarla**. Es el fallo de
 * `/docs/metodologia` del §77, esta vez dentro de una figura, y es
 * completamente invisible en revisión — la página carga limpia, el piloto la
 * marca ✅ en las tres anchuras, y la columna que falta suele ser justo la que
 * lleva la conclusión de la figura.
 *
 * Se descubrió mirando las capturas de S8, con las dos figuras nuevas
 * recortadas en 375 px y la Figura 2 de `metricas-geo-que-medir` llevando dos
 * días igual. Que se colara en dos PRs seguidos es la razón de que esto sea un
 * test y no una nota en la regla de ruta.
 */
describe("las figuras con tabla dentro se declaran wide", () => {
  /** Bloques `<Figure …> … </Figure>` de un MDX, con su etiqueta de apertura. */
  function figures(source: string): { open: string; body: string }[] {
    return [...source.matchAll(/<Figure\b([\s\S]*?)>([\s\S]*?)<\/Figure>/g)].map((m) => ({
      open: m[1],
      body: m[2]
    }));
  }

  /** Una tabla de markdown se reconoce por su fila separadora (`| --- | --- |`). */
  function hasMarkdownTable(body: string): boolean {
    return /^\s*\|[\s|:-]*-{3,}[\s|:-]*\|\s*$/m.test(body);
  }

  for (const post of BLOG_POSTS) {
    it(`ninguna figura con tabla se queda sin scroll: ${post.slug}`, () => {
      const offenders = figures(readArticle(post.slug))
        .filter((f) => hasMarkdownTable(f.body) && !/\bwide\b/.test(f.open))
        .map((f) => f.open.replace(/\s+/g, " ").trim().slice(0, 80));
      expect(
        offenders,
        `${post.slug}: figura con tabla y sin \`wide\`. En móvil la última columna se ` +
          "pierde y no hay gesto que la recupere — el marco recorta, no desliza."
      ).toEqual([]);
    });
  }

  it("el detector distingue una figura con tabla de una sin ella", () => {
    const conTabla = '<Figure label="F1." caption="c">\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n</Figure>';
    const sinTabla = '<Figure label="F2." caption="c">\n  <ShareOfVoice brands={x} total="y" />\n</Figure>';
    expect(figures(conTabla).map((f) => hasMarkdownTable(f.body))).toEqual([true]);
    expect(figures(sinTabla).map((f) => hasMarkdownTable(f.body))).toEqual([false]);
  });
});
