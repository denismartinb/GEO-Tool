import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BLOG_CLUSTERS } from "@/lib/blog/posts";
import { MARKETING_CONTENT_LINKS } from "@/components/marketing-content-links";

/**
 * SEO-POS-1 (T7). Hasta ahora el repo no tenía `not-found.tsx`, así que
 * cualquier URL inexistente —y `/blog/<cluster>` y `/glosario/<termino>`
 * llaman a `notFound()` de verdad— caía en la página por defecto de Next: sin
 * marca, sin navegación y sin un solo enlace de vuelta al sitio.
 *
 * `noindex` a propósito: un 404 ya devuelve el estado correcto, pero la
 * etiqueta evita que una variante enlazada desde fuera se quede rondando en el
 * índice.
 */
export const metadata: Metadata = {
  title: "Página no encontrada — Genscore",
  robots: { index: false, follow: true }
};

export default function NotFound() {
  return (
    <BlogPageShell>
      <h1 className="lp-h2">Esta página no existe</h1>
      <p className="lp-sub">
        El enlace que has seguido apunta a una dirección que no está publicada, o
        el contenido ha cambiado de sitio. Desde aquí puedes seguir a lo que sí
        existe.
      </p>

      <h2 className="lp-h3">Empieza por aquí</h2>
      <ul>
        {MARKETING_CONTENT_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href}>{l.label}</Link>
          </li>
        ))}
        <li>
          <Link href="/geo">Qué es el GEO</Link>
        </li>
        <li>
          <Link href="/pricing">Precios</Link>
        </li>
      </ul>

      <h2 className="lp-h3">Temas del blog</h2>
      <ul>
        {BLOG_CLUSTERS.map((cluster) => (
          <li key={cluster.key}>
            <Link href={`/blog/${cluster.key}`}>{cluster.title}</Link>: {cluster.description}
          </li>
        ))}
      </ul>
    </BlogPageShell>
  );
}
