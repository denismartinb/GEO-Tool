import type { Metadata } from "next";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { COMPARATIVAS_BREADCRUMB } from "@/lib/comparativas";
import { KeyTakeaway, Verdict, CompareTable, Pill, ArticleCta } from "@/components/blog/article";
import { COMPARISON_ROWS, PEEC_RESEARCH_DATE } from "@/lib/comparativas/genscore-vs-peec-ai";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";
const PAGE_URL = `${SITE_URL}/comparativas/genscore-vs-peec-ai`;

export const metadata: Metadata = contentMetadata({
  title: "GenScore vs Peec AI: comparativa de herramientas de visibilidad en IA — GenScore",
  description:
    "GenScore frente a Peec AI: precio de entrada, coste de motores adicionales, cobertura multi-país, usuarios de equipo y bucle de acción. Comparativa honesta, con lo que cada una hace mejor.",
  path: "/comparativas/genscore-vs-peec-ai"
});

function itemListSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "GenScore vs Peec AI",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "GenScore", url: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Peec AI", url: "https://peec.ai" }
    ]
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

export default function GenscoreVsPeecAiPage() {
  return (
    <BlogPageShell activeHref="/comparativas" breadcrumb={COMPARATIVAS_BREADCRUMB}>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Comparativas", url: `${SITE_URL}/comparativas` },
          { name: "GenScore vs Peec AI", url: PAGE_URL }
        ]}
      />
      {itemListSchema()}
      <h1 className="lp-h2">GenScore vs Peec AI</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        Datos de Peec AI revisados el {PEEC_RESEARCH_DATE} en su propia web. Su página de precios no
        muestra importes: el precio de entrada procede de un tercero y es orientativo. Confírmalo en
        peec.ai antes de decidir.
      </p>
      <div className="blog-body">
        <KeyTakeaway label="En dos frases">
          Peec AI incluye usuarios ilimitados en todos sus planes de autoservicio y mide varios países e
          idiomas desde su plan Pro, pero te hace elegir tres modelos y deja Claude para Enterprise.
          GenScore no desglosa por país, pero incluye los tres motores que de verdad importan hoy
          (Gemini, Claude, ChatGPT) sin elegir ni pagar complementos, y convierte lo que detecta en
          contenido generado, no solo en una sugerencia priorizada de qué hacer.
        </KeyTakeaway>

        <h2>Comparativa</h2>
        <CompareTable>
          <table>
            <tbody>
              <tr>
                <th>Criterio</th>
                <th>GenScore</th>
                <th>Peec AI</th>
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
                    {row.peecWins ? (
                      <>
                        <Pill tone="si">Gana aquí</Pill> {row.peec}
                      </>
                    ) : (
                      row.peec
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CompareTable>

        <Verdict title="Cuándo elegir Peec AI" badge="Cuándo elegir el competidor">
          Si monitorizas la misma marca en dos o tres mercados o idiomas a la vez (desde su plan Pro), o
          si tu equipo es grande y valoras tener usuarios ilimitados en todos los planes, Peec AI cubre
          ese caso mejor que GenScore hoy.
        </Verdict>

        <Verdict title="Cuándo elegir GenScore" badge="Cuándo elegir GenScore">
          Si operas principalmente en España o LATAM y quieres el producto en tu idioma, si quieres
          empezar sin tarjeta y sin pagar un extra por los tres motores principales, o si lo que
          necesitas no es solo una lista priorizada de oportunidades sino contenido ya generado y listo
          para publicar (FAQ, schema, briefs), GenScore está construido específicamente para eso.
        </Verdict>

        <h2>Metodología</h2>
        <p>
          Los datos de GenScore vienen directamente de los planes reales del producto (la misma fuente
          que usa la página de Precios). Los de Peec AI —modelos, países e idiomas, usuarios— proceden
          de su propia{" "}
          <a href="https://www.peec.ai/pricing" rel="nofollow noopener noreferrer" target="_blank">
            página de precios
          </a>
          , y su función «Actions», de{" "}
          <a href="https://peec.ai/blog/introducing-actions" rel="nofollow noopener noreferrer" target="_blank">
            su blog
          </a>
          , revisados el 9 de octubre de 2026. Esa página no muestra importes, así que el precio de
          entrada es de{" "}
          <a href="https://pricingsaas.com/companies/peec" rel="nofollow noopener noreferrer" target="_blank">
            PricingSaaS
          </a>{" "}
          (último visto el 14 de septiembre de 2026, con facturación anual) y es orientativo. Si
          detectas un dato desactualizado o inexacto, dínoslo y lo corregimos.
        </p>

        <ArticleCta
          title="¿Cuánto te cuesta de verdad no saberlo?"
          text="Prueba Pro 7 días gratis y compara tu visibilidad real, sin pagar complementos por motor. Sin tarjeta."
        />
      </div>
    </BlogPageShell>
  );
}
