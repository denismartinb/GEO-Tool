import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { KeyTakeaway, ArticleCta } from "@/components/blog/article";
import { ABOUT_CONTACT, ABOUT_LEAD, ABOUT_SECTIONS, ABOUT_TITLE } from "@/lib/brand/about";
import { ORGANIZATION_ID, SITE_ORIGIN } from "@/lib/brand/canonical-definition";
import { contentMetadata } from "@/lib/seo/metadata";

const PAGE_PATH = "/sobre-genscore";
const PAGE_URL = `${SITE_ORIGIN}${PAGE_PATH}`;

/**
 * «Quiénes somos» — GEO-SELF-1 Fase 1. La página `AboutPage` de la entidad:
 * lo que un motor necesita para describir la empresa (qué es, desde dónde,
 * qué mide, cómo contactar) en una URL propia, con su schema apuntando por
 * `@id` al `Organization` del layout raíz.
 *
 * El texto vive en `lib/brand/about.ts` (lo comparte `/llms-full.txt`). Las
 * reglas duras de esta página están allí: ninguna persona con nombre, ninguna
 * foto, ningún empleador.
 */
export const metadata: Metadata = contentMetadata({
  title: "Quiénes somos: GenScore, herramienta GEO hecha en España — GenScore",
  description: ABOUT_LEAD,
  path: PAGE_PATH
});

const aboutPageJson = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": `${PAGE_URL}#aboutpage`,
  url: PAGE_URL,
  name: ABOUT_TITLE,
  description: ABOUT_LEAD,
  inLanguage: "es-ES",
  about: { "@id": ORGANIZATION_ID },
  mainEntity: { "@id": ORGANIZATION_ID },
  isPartOf: { "@type": "WebSite", url: SITE_ORIGIN, name: "GenScore" }
};

export default function SobreGenScorePage() {
  return (
    <BlogPageShell activeHref={PAGE_PATH}>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_ORIGIN },
          { name: ABOUT_TITLE, url: PAGE_URL }
        ]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageJson) }} />

      <h1 className="lp-h2">{ABOUT_TITLE}</h1>
      <p className="legal-updated" style={{ marginBottom: 36 }}>
        GenScore, herramienta GEO hecha en España: qué es, qué mide y cómo contactar.
      </p>

      <div className="blog-body">
        <KeyTakeaway label="En una frase">{ABOUT_LEAD}</KeyTakeaway>

        {ABOUT_SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.link && (
              <p>
                <Link href={section.link.href}>{section.link.label} →</Link>
              </p>
            )}
          </section>
        ))}

        <h2>Contacto</h2>
        <p>
          Escríbenos a <a href={`mailto:${ABOUT_CONTACT.email}`}>{ABOUT_CONTACT.email}</a>; te
          contestamos en castellano. También estamos en{" "}
          <a href={ABOUT_CONTACT.linkedin} rel="noopener noreferrer" target="_blank">
            LinkedIn
          </a>{" "}
          y en{" "}
          <a href={ABOUT_CONTACT.g2} rel="noopener noreferrer" target="_blank">
            G2
          </a>
          .
        </p>
        <p>
          Si quieres ver el producto antes de escribirnos, empieza por{" "}
          <Link href="/que-es-genscore">qué es GenScore</Link> o mira los planes en{" "}
          <Link href="/pricing">Precios</Link>.
        </p>

        <ArticleCta
          title="Mira dónde apareces hoy"
          text="Lanza tu primer escaneo con GenScore y comprueba si ChatGPT, Gemini y Claude nombran tu marca. Prueba Pro 7 días gratis, sin tarjeta."
        />
      </div>
    </BlogPageShell>
  );
}
