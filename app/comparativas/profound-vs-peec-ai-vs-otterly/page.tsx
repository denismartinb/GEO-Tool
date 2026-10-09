import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { COMPARATIVAS_BREADCRUMB } from "@/lib/comparativas";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { KeyTakeaway, CompareTable, ArticleCta } from "@/components/blog/article";
import {
  COMPARISON_ROWS,
  FAQ_ITEMS,
  GENSCORE_NOTE,
  PAGE,
  SOURCES,
  VENDORS
} from "@/lib/comparativas/profound-vs-peec-ai-vs-otterly";
import { SourcesList } from "@/components/comparativas/sources-list";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";
const PAGE_URL = `${SITE_URL}/comparativas/${PAGE.slug}`;

export const metadata: Metadata = contentMetadata({
  title: PAGE.metaTitle,
  description: PAGE.metaDescription,
  path: `/comparativas/${PAGE.slug}`
});

function itemListSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Profound vs Peec AI vs Otterly",
    itemListElement: VENDORS.map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: v.name,
      url: v.url
    }))
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

/**
 * GEO-SELF-1 Fase 2 (log §258). Comparativa NEUTRAL a tres: la tabla no lleva
 * insignias de «Gana aquí» porque no compite nadie nuestro en ella, y GenScore
 * sólo aparece en un bloque etiquetado antes de la FAQ — nunca en un
 * `Verdict`, que le daría peso de veredicto.
 */
export default function ProfoundVsPeecAiVsOtterlyPage() {
  return (
    <BlogPageShell breadcrumb={COMPARATIVAS_BREADCRUMB}>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Comparativas", url: `${SITE_URL}/comparativas` },
          { name: "Profound vs Peec AI vs Otterly", url: PAGE_URL }
        ]}
      />
      {itemListSchema()}
      <FaqPageSchema items={FAQ_ITEMS} />

      <h1 className="lp-h2">{PAGE.h1}</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        {PAGE.dateLine}
      </p>

      <div className="blog-body">
        <KeyTakeaway label="En tres frases">{PAGE.keyTakeaway}</KeyTakeaway>

        <h2>Las tres, en una línea</h2>
        <ul>
          {VENDORS.map((v) => (
            <li key={v.id}>
              <strong>{v.name}.</strong> {v.oneLiner}
            </li>
          ))}
        </ul>

        <h2>Comparativa fila a fila</h2>
        <CompareTable>
          <table>
            <tbody>
              <tr>
                <th>Criterio</th>
                <th>Profound</th>
                <th>Peec AI</th>
                <th>Otterly</th>
              </tr>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td>{row.profound}</td>
                  <td>{row.peec}</td>
                  <td>{row.otterly}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CompareTable>

        <h2>Qué decide cada fila</h2>
        <ul>
          {COMPARISON_ROWS.map((row) => (
            <li key={row.label}>
              <strong>{row.label}:</strong> {row.takeaway}
            </li>
          ))}
        </ul>

        <h2>Cómo elegir</h2>
        {PAGE.howToChoose.map((item) => (
          <div key={item.q}>
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}

        <KeyTakeaway label={GENSCORE_NOTE.label}>
          <p>
            <strong>{GENSCORE_NOTE.title}.</strong> {GENSCORE_NOTE.body}
          </p>
          <p>{GENSCORE_NOTE.limits}</p>
          <p>
            <Link href={GENSCORE_NOTE.href}>Ver todas las herramientas GEO comparadas</Link>
          </p>
        </KeyTakeaway>

        <h2>Preguntas frecuentes</h2>
        {FAQ_ITEMS.map((item) => (
          <div key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </div>
        ))}

        <h2>Metodología</h2>
        <p>{PAGE.methodology}</p>

        <SourcesList sources={Object.values(SOURCES)} />

        <ArticleCta title={PAGE.cta.title} text={PAGE.cta.text} />
      </div>
    </BlogPageShell>
  );
}
