import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { COMPARATIVAS_BREADCRUMB } from "@/lib/comparativas";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { KeyTakeaway, Verdict, CompareTable, Pill, ArticleCta } from "@/components/blog/article";
import {
  ALTERNATIVES,
  FAQ_ITEMS,
  LEAVE_REASONS,
  PAGE,
  PEEC_PLANS,
  PEEC_STRENGTHS,
  SOURCES
} from "@/lib/comparativas/alternativas-a-peec-ai";
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
    name: "Alternativas a Peec AI en 2026",
    itemListElement: ALTERNATIVES.map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: a.name,
      url: a.url
    }))
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

function reasonLabel(id: string): string {
  return LEAVE_REASONS.find((r) => r.id === id)?.shortLabel ?? id;
}

/** GEO-SELF-1 Fase 2 (log §257). Misma estructura que `alternativas-a-otterly`. */
export default function AlternativasAPeecAiPage() {
  return (
    <BlogPageShell breadcrumb={COMPARATIVAS_BREADCRUMB}>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Comparativas", url: `${SITE_URL}/comparativas` },
          { name: "Alternativas a Peec AI", url: PAGE_URL }
        ]}
      />
      {itemListSchema()}
      <FaqPageSchema items={FAQ_ITEMS} />

      <h1 className="lp-h2">{PAGE.h1}</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        {PAGE.dateLine}
      </p>

      <div className="blog-body">
        <KeyTakeaway label="En dos frases">{PAGE.keyTakeaway}</KeyTakeaway>

        <h2>Qué hace bien Peec AI, y a quién le sirve</h2>
        <p>
          Peec AI es una buena herramienta de medición, y si te vas conviene saber qué dejas. Lo que
          casi nunca se cuenta es a quién le sirve de verdad cada una de sus ventajas.
        </p>
        <ul>
          {PEEC_STRENGTHS.map((s) => (
            <li key={s.claim}>
              <strong>{s.claim}</strong> {s.context}
            </li>
          ))}
        </ul>

        <h2>La escalera de Peec AI</h2>
        <p>
          Peec AI escala por prompts, modelos y mercados. Los prompts, los modelos y los países salen de
          su página oficial; los importes no están ahí, así que los damos como orientativos, según
          PricingSaaS y con facturación anual.
        </p>
        <CompareTable>
          <table>
            <tbody>
              <tr>
                <th>Plan</th>
                <th>Precio orientativo (PricingSaaS)</th>
                <th>Prompts</th>
                <th>Modelos</th>
                <th>Países e idiomas</th>
              </tr>
              {PEEC_PLANS.map((plan) => (
                <tr key={plan.plan}>
                  <td>
                    <strong>{plan.plan}</strong>
                  </td>
                  <td>{plan.price}</td>
                  <td>{plan.prompts}</td>
                  <td>{plan.models}</td>
                  <td>{plan.markets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CompareTable>

        <h2>Los cinco motivos reales para buscar alternativa</h2>
        <p>
          Cada uno lleva a una herramienta distinta. Identifica el tuyo antes de mirar la lista: elegir
          por ranking general es cómo se acaba pagando por resolver un problema que no se tenía.
        </p>
        {LEAVE_REASONS.map((reason, i) => (
          <div key={reason.id}>
            <h3>
              {i + 1}. {reason.title}
            </h3>
            <p>{reason.detail}</p>
          </div>
        ))}

        <h2>Las alternativas, y qué resuelve cada una</h2>
        <CompareTable>
          <table>
            <tbody>
              <tr>
                <th>Alternativa</th>
                <th>Resuelve</th>
                <th>Precio</th>
                <th>Español</th>
              </tr>
              {ALTERNATIVES.map((alt) => (
                <tr key={alt.slug}>
                  <td>
                    <strong>{alt.name}</strong>
                    {alt.ours ? " (nuestra)" : ""}
                  </td>
                  <td>
                    {alt.solves.map((id) => (
                      <Pill key={id} tone="si">
                        {reasonLabel(id)}
                      </Pill>
                    ))}
                  </td>
                  <td>{alt.pricingNote}</td>
                  <td>{alt.spanishSupport}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CompareTable>

        {ALTERNATIVES.map((alt) => (
          <div className="tool-profile-card" key={alt.slug}>
            <h3>{alt.name}</h3>
            <p>{alt.oneLiner}</p>
            <p>
              <strong>Dónde no llega:</strong> {alt.tradeoff}
            </p>
            {alt.comparisonHref && (
              <p>
                <Link href={alt.comparisonHref}>
                  Ver la comparativa completa GenScore vs {alt.ours ? "Peec AI" : alt.name}
                </Link>
              </p>
            )}
          </div>
        ))}

        <Verdict title={PAGE.verdictTitle} badge="Cuándo elegir GenScore">
          {PAGE.verdict}
        </Verdict>

        <p>{PAGE.switchingNote}</p>

        <h2>Preguntas frecuentes</h2>
        {FAQ_ITEMS.map((item) => (
          <div key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </div>
        ))}

        <h2>Metodología</h2>
        <p>
          {PAGE.methodology} Los datos de GenScore se pueden comprobar en la página de{" "}
          <Link href="/precios">Precios</Link>.
        </p>

        <SourcesList sources={Object.values(SOURCES)} />

        <ArticleCta title={PAGE.cta.title} text={PAGE.cta.text} />
      </div>
    </BlogPageShell>
  );
}
