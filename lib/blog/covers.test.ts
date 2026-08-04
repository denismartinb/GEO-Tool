import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "./posts";

/**
 * Portadas de artículo.
 *
 * El fundador encontró esto mirando el blog en el móvil: un artículo sin
 * `coverImage` cae en el respaldo de degradado + icono, y eso **no se lee
 * como una portada** — se lee como una imagen que no ha cargado. Sus
 * palabras: "parece un icono de algo que no carga bien".
 *
 * El fallo real no es que faltaran tres imágenes: es que faltaban **en
 * silencio**. Nada en el build, en los tests ni en el pilot distingue "esta
 * portada es así a propósito" de "a este artículo se le olvidó la portada".
 * Este fichero elimina esa ambigüedad.
 *
 * Ver la enmienda de 2026-08-04 en `docs/adr/0026-article-imagery-policy.md`.
 */

/**
 * Artículos publicados sin portada el día en que se detectó el problema.
 * MISMO PATRÓN que la deuda de conversión: solo puede encoger, y la línea
 * base se fija literalmente para que no encoja "por accidente" junto a ella
 * (ese error ya se coló dos veces en la Fase 3.2).
 */
const COVER_DEBT = new Set([
  "que-es-el-geo-score",
  "llms-txt-guia-practica",
  "como-conseguir-que-chatgpt-te-cite"
]);

const COVER_DEBT_BASELINE = ["como-conseguir-que-chatgpt-te-cite", "llms-txt-guia-practica", "que-es-el-geo-score"];

describe("todo artículo publicado tiene portada propia", () => {
  for (const post of BLOG_POSTS.filter((p) => !COVER_DEBT.has(p.slug))) {
    it(`declara coverImage: ${post.slug}`, () => {
      expect(
        post.coverImage,
        `${post.slug} no declara coverImage, así que caería en el degradado con icono. ` +
          "Una portada ausente se lee como una imagen rota, no como una decisión."
      ).toBeTruthy();
    });

    it(`el fichero de portada existe de verdad en disco: ${post.slug}`, () => {
      // Sin esta guarda, un post sin `coverImage` revienta aquí con un
      // TypeError en vez de con el fallo legible del test de arriba (QA lo
      // señaló). Un test que falla mal es peor que uno que falla claro.
      expect(typeof post.coverImage, `${post.slug} no declara coverImage`).toBe("string");
      if (typeof post.coverImage !== "string") return;

      const rel = post.coverImage.replace(/^\//, "");
      expect(
        existsSync(join(process.cwd(), "public", rel)),
        `${post.slug} apunta a ${post.coverImage} pero ese fichero no existe en public/`
      ).toBe(true);
    });
  }
});

describe("la deuda de portadas solo puede encoger", () => {
  it("todo pendiente estaba en la línea base — no se puede añadir uno nuevo", () => {
    const intrusos = [...COVER_DEBT].filter((slug) => !COVER_DEBT_BASELINE.includes(slug));
    expect(
      intrusos,
      `estos slugs no estaban en la deuda original: ${intrusos.join(", ")}. ` +
        "Un artículo nuevo nace con portada; no se exime."
    ).toEqual([]);
  });

  /**
   * La línea base se fija literalmente, no solo por tamaño. Es la lección de
   * la Fase 3.2: si la base encoge a la vez que la deuda, la garantía de
   * pertenencia se evapora en silencio — y con la deuda vacía, el check de
   * pertenencia es cierto sin comprobar nada.
   */
  it("la línea base es exactamente la deuda detectada el 2026-08-04", () => {
    expect(COVER_DEBT_BASELINE).toEqual([
      "como-conseguir-que-chatgpt-te-cite",
      "llms-txt-guia-practica",
      "que-es-el-geo-score"
    ]);
  });

  it("todo slug pendiente corresponde a un artículo real", () => {
    const real = new Set(BLOG_POSTS.map((p) => p.slug));
    for (const slug of COVER_DEBT) {
      expect(real.has(slug), `${slug} está en COVER_DEBT pero no existe en BLOG_POSTS`).toBe(true);
    }
  });
});
