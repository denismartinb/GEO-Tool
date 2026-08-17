import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { DefinedTermSchema } from "@/components/seo/defined-term-schema";
import { GLOSSARY_TERMS } from "@/lib/glosario/terms";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";
/**
 * GROWTH-2 Fase 2.6b — same fixed-date convention as app/sitemap.ts.
 *
 * Se sube cuando cambia el CONTENIDO de alguna entrada, nunca sola
 * (`content-strategy.md` §4.4: "un refresco cambia un dato, un ejemplo o una
 * sección — nunca solo la fecha"). Último cambio: 2026-08-13, al retirar de
 * `geo-score` y `citacion-en-ia` el reparto de pesos del compuesto (log §75).
 */
const GLOSSARY_LAST_MODIFIED = "2026-08-15";

export function generateStaticParams() {
  return GLOSSARY_TERMS.map((t) => ({ termino: t.slug }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ termino: string }>;
}): Promise<Metadata> {
  const { termino } = await params;
  const entry = GLOSSARY_TERMS.find((t) => t.slug === termino);
  if (!entry) return {};
  return {
    ...contentMetadata({
      title: `¿Qué es ${entry.term}? — Glosario GEO — GenScore`,
      description: entry.definition,
      path: `/glosario/${entry.slug}`
    })
  };
}

export default async function GlosarioTerminoPage({ params }: { params: Promise<{ termino: string }> }) {
  const { termino } = await params;
  const entry = GLOSSARY_TERMS.find((t) => t.slug === termino);
  if (!entry) notFound();

  const paragraphs = entry.longDefinition.split("\n\n");

  return (
    <BlogPageShell activeHref="/glosario">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Glosario", url: `${SITE_URL}/glosario` },
          { name: entry.term, url: `${SITE_URL}/glosario/${entry.slug}` }
        ]}
      />
      {/*
        SEO-POS-1 Fase E, E4: un término explicado en varias URLs emite el nodo
        compartido —mismo `@id`, `url` del documento de referencia, el resto
        como `sameAs`— en vez de una definición suelta más. Sólo `geo-score` lo
        tiene hoy; los demás viven en una sola URL y no desambiguan nada.
      */}
      <DefinedTermSchema
        term={entry.term}
        description={entry.definition}
        url={entry.canonicalNode?.url ?? `${SITE_URL}/glosario/${entry.slug}`}
        inDefinedTermSetUrl={`${SITE_URL}/glosario`}
        id={entry.canonicalNode?.termId}
        sameAs={entry.canonicalNode?.sameAs}
      />
      <p className="legal-updated">
        <Link href="/glosario">Glosario GEO</Link>
      </p>
      <h1 className="lp-h2">¿Qué es {entry.term}?</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        Última actualización: {GLOSSARY_LAST_MODIFIED}
      </p>
      <div className="legal-body">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="glossary-related">
        <h2>Sigue explorando</h2>
        <ul>
          {entry.relatedLinks.map((link) => (
            <li key={link.href}>
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </BlogPageShell>
  );
}
