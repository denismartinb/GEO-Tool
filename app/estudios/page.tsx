import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { KeyTakeaway, ArticleCta, Stat } from "@/components/blog/article";
import { ORGANIZATION_ID, SITE_ORIGIN } from "@/lib/brand/canonical-definition";
import { contentMetadata } from "@/lib/seo/metadata";
import { FREE_REPORT_ENTRY, freeReportHref } from "@/lib/free-report/promo";
import { getStudies, STUDIES_LEAD, STUDIES_METHOD, STUDIES_TITLE, STUDY_KIND_LABEL } from "@/lib/estudios/studies";

const PAGE_PATH = "/estudios";
const PAGE_URL = `${SITE_ORIGIN}${PAGE_PATH}`;

/**
 * Hub de estudios — GEO-SELF-1 Fase 4 (log §260). Una URL estable que reúne
 * los estudios publicados, para que un motor o un periodista tenga un sitio
 * que citar. Cada estudio es un artículo del blog; su título, fecha y cifra
 * salen de `lib/blog/posts.ts` vía `lib/estudios/studies.ts`, nunca de aquí.
 */
export const metadata: Metadata = contentMetadata({
  title: "Estudios sobre búsqueda con IA en España — GenScore",
  description: STUDIES_LEAD,
  path: PAGE_PATH
});

const DATE_FMT = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function EstudiosPage() {
  const studies = getStudies();

  const collectionJson = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${PAGE_URL}#collection`,
    url: PAGE_URL,
    name: STUDIES_TITLE,
    description: STUDIES_LEAD,
    inLanguage: "es-ES",
    publisher: { "@id": ORGANIZATION_ID },
    isPartOf: { "@type": "WebSite", url: SITE_ORIGIN, name: "GenScore" },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: studies.map((s, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_ORIGIN}${s.href}`,
        name: s.post.title
      }))
    }
  };

  return (
    <BlogPageShell activeHref={PAGE_PATH}>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_ORIGIN },
          { name: "Estudios", url: PAGE_URL }
        ]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJson) }} />

      <h1 className="lp-h2">{STUDIES_TITLE}</h1>
      <p className="legal-updated" style={{ marginBottom: 36 }}>
        Datos con fuente para entender cómo la IA recomienda marcas en España.
      </p>

      <div className="blog-body">
        <KeyTakeaway label="Qué encontrarás aquí">{STUDIES_LEAD}</KeyTakeaway>

        {studies.map((s) => (
          <section key={s.post.slug} style={{ marginTop: 48 }}>
            <p className="legal-updated" style={{ marginBottom: 0 }}>
              {STUDY_KIND_LABEL[s.kind]} · {DATE_FMT.format(new Date(`${s.post.datePublished}T00:00:00Z`))}
            </p>
            <h2 style={{ marginTop: 6 }}>
              <Link href={s.href}>{s.post.title}</Link>
            </h2>
            <p>{s.post.description}</p>
            {s.post.heroStat && (
              <Stat value={s.post.heroStat.value} label={s.post.heroStat.label} source={s.post.heroStat.source} />
            )}
            <p>
              <Link href={s.href}>Leer el estudio →</Link>
            </p>
          </section>
        ))}

        <h2>Cómo hacemos los estudios</h2>
        {STUDIES_METHOD.map((line) => (
          <p key={line}>{line}</p>
        ))}

        <h2>Cómo citar estos datos</h2>
        <p>
          Puedes usar cualquier cifra de estos estudios citando a GenScore como fuente y enlazando al estudio
          correspondiente. Si necesitas los datos de un sector concreto o tienes una pregunta sobre el método,
          escríbenos desde <Link href="/sobre-genscore">quiénes somos</Link>.
        </p>

        <ArticleCta
          title="¿Qué dice la IA de tu sector?"
          text="Pide el informe gratuito y te enseñamos qué marcas nombran ChatGPT, Gemini y Claude cuando alguien pregunta por lo que vendes."
          cta="Pedir el informe gratis"
          href={freeReportHref(FREE_REPORT_ENTRY.studiesHub)}
        />
      </div>
    </BlogPageShell>
  );
}
