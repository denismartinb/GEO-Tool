import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PostMeta } from "./blocks";
import type { BlogPost } from "@/lib/blog/posts";

/**
 * SEO-POS-1 (T9). `PostMeta` sustituye a la fecha en prosa que cada MDX
 * escribía a mano — este test es lo que impide que vuelva a desincronizarse
 * del dato real, y fija que "Actualizado el…" solo aparece cuando hay un
 * refresco de verdad.
 */
const basePost: BlogPost = {
  slug: "ejemplo",
  title: "Título",
  description: "Descripción",
  datePublished: "2026-07-12",
  coverIcon: "compass",
  cluster: "fundamentos"
};

describe("PostMeta", () => {
  it("muestra la fecha de publicación formateada en castellano", () => {
    const html = renderToStaticMarkup(PostMeta({ post: basePost }));
    expect(html).toContain("12 de julio de 2026");
  });

  it("sin dateUpdated, no añade ninguna mención de actualización", () => {
    const html = renderToStaticMarkup(PostMeta({ post: basePost }));
    expect(html).not.toContain("Actualizado");
  });

  it("con dateUpdated, añade la fecha de actualización junto a la de publicación", () => {
    const html = renderToStaticMarkup(PostMeta({ post: { ...basePost, dateUpdated: "2026-08-10" } }));
    expect(html).toContain("12 de julio de 2026");
    expect(html).toContain("Actualizado el 10 de agosto de 2026");
  });
});
