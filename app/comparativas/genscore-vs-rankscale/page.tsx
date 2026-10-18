import type { Metadata } from "next";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { SourcesList } from "@/components/comparativas/sources-list";
import { COMPARATIVAS_BREADCRUMB } from "@/lib/comparativas";
import { KeyTakeaway, Verdict, CompareTable, Pill, ArticleCta } from "@/components/blog/article";
import {
  COMPARISON_ROWS,
  FAQ_ITEMS,
  RANKSCALE_RESEARCH_DATE,
  SOURCES
} from "@/lib/comparativas/genscore-vs-rankscale";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";
const PAGE_URL = `${SITE_URL}/comparativas/genscore-vs-rankscale`;

export const metadata: Metadata = contentMetadata({
  title: "GenScore vs RankScale: comparativa de herramientas GEO · GenScore",
  description:
    "GenScore frente a RankScale: precio, motores de IA, regiones, idioma y recomendaciones. Comparativa con fuentes y con lo que cada una hace mejor.",
  path: "/comparativas/genscore-vs-rankscale"
});

function itemListSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "GenScore vs RankScale",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "GenScore", url: SITE_URL },
      { "@type": "ListItem", position: 2, name: "RankScale", url: "https://rankscale.ai" }
    ]
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

export default function GenscoreVsRankscalePage() {
  return (
    <BlogPageShell activeHref="/comparativas" breadcrumb={COMPARATIVAS_BREADCRUMB}>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Comparativas", url: `${SITE_URL}/comparativas` },
          { name: "GenScore vs RankScale", url: PAGE_URL }
        ]}
      />
      {itemListSchema()}
      <FaqPageSchema items={FAQ_ITEMS} />
      <h1 className="lp-h2">GenScore vs RankScale</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        Datos de RankScale consultados el {RANKSCALE_RESEARCH_DATE} en su web (rankscale.ai y su página de
        precios). Lo que su web no dice figura como «no consta». Confírmalo en rankscale.ai antes de
        decidir, los precios cambian.
      </p>
      <div className="blog-body">
        <KeyTakeaway label="En dos frases">
          RankScale cubre muchos más motores y regiones, y tiene un plan de entrada más barato con pago
          anual. GenScore está en castellano, se prueba 7 días con Pro y sin tarjeta, y convierte lo que
          detecta en acciones concretas para tu web.
        </KeyTakeaway>

        <h2>Comparativa</h2>
        <CompareTable>
          <table>
            <tbody>
              <tr>
                <th>Criterio</th>
                <th>GenScore</th>
                <th>RankScale</th>
              </tr>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>
                    {row.genscoreWins ? (
                      <>
                        <Pill tone="si">Gana aquí</Pill> {row.genscore}
                      </>
                    ) : (
                      row.genscore
                    )}
                  </td>
                  <td>
                    {row.rankscaleWins ? (
                      <>
                        <Pill tone="si">Gana aquí</Pill> {row.rankscale}
                      </>
                    ) : (
                      row.rankscale
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CompareTable>

        <Verdict title="Cuándo elegir RankScale" badge="Cuándo elegir el competidor">
          Si necesitas vigilar muchos motores a la vez, seguir tu marca en decenas de regiones e idiomas, o
          gestionar varias marcas desde un mismo panel, RankScale tiene más cobertura.
        </Verdict>

        <Verdict title="Cuándo elegir GenScore" badge="Cuándo elegir GenScore">
          Si trabajas en castellano, quieres probar sin tarjeta y buscas que la herramienta te diga qué
          cambiar en tu web, con borradores de FAQ, schema y briefs desde Pro, GenScore está pensado para eso.
        </Verdict>

        <h2>Preguntas frecuentes</h2>
        {FAQ_ITEMS.map((item) => (
          <div key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </div>
        ))}

        <h2>Metodología</h2>
        <p>
          Los datos de GenScore vienen de los planes reales del producto, la misma fuente que la página de
          Precios. Los de RankScale vienen de su propia web en la fecha indicada, sin acceso a su
          plataforma. Si detectas un dato desactualizado, dínoslo y lo corregimos.
        </p>

        <h2>Fuentes</h2>
        <SourcesList sources={Object.values(SOURCES)} />

        <ArticleCta
          title="¿Cuánto te cuesta de verdad no saberlo?"
          text="Prueba Pro 7 días gratis y mide tu visibilidad real en ChatGPT, Gemini y Claude. Sin tarjeta."
        />
      </div>
    </BlogPageShell>
  );
}
