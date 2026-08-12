import type { Metadata } from "next";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { KeyTakeaway, Verdict, CompareTable, Pill, ArticleCta } from "@/components/blog/article";
import { COMPARISON_ROWS, PEEC_RESEARCH_DATE } from "@/lib/comparativas/genscore-vs-peec-ai";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";
const PAGE_URL = `${SITE_URL}/comparativas/genscore-vs-peec-ai`;

export const metadata: Metadata = contentMetadata({
  title: "Genscore vs Peec AI: comparativa de herramientas de visibilidad en IA — Genscore",
  description:
    "Genscore frente a Peec AI: precio de entrada, coste de motores adicionales, cobertura multi-país, usuarios de equipo y bucle de acción. Comparativa honesta, con lo que cada una hace mejor.",
  path: "/comparativas/genscore-vs-peec-ai"
});

function itemListSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Genscore vs Peec AI",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Genscore", url: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Peec AI", url: "https://peec.ai" }
    ]
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

export default function GenscoreVsPeecAiPage() {
  return (
    <BlogPageShell activeHref="/comparativas">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Comparativas", url: `${SITE_URL}/comparativas` },
          { name: "Genscore vs Peec AI", url: PAGE_URL }
        ]}
      />
      {itemListSchema()}
      <h1 className="lp-h2">Genscore vs Peec AI</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        Datos de Peec AI consultados el {PEEC_RESEARCH_DATE} en fuentes públicas de terceros — varias
        cifras exactas (motores incluidos por defecto, coste de add-ons, duración del trial) no se
        pudieron corroborar entre fuentes independientes y no se publican aquí como hechos. Confírmalas
        en peec.ai antes de decidir.
      </p>
      <div className="blog-body">
        <KeyTakeaway label="En dos frases">
          Peec AI no cobra un extra por lanzar tus prompts en distintos idiomas o países, y ya incluye
          usuarios ilimitados en su plan de entrada. Genscore no desglosa por país, pero incluye los tres
          motores que de verdad importan hoy (Gemini, Claude, ChatGPT) sin coste extra por añadirlos, y
          convierte lo que detecta en contenido generado, no solo en una sugerencia priorizada de qué
          hacer.
        </KeyTakeaway>

        <h2>Comparativa</h2>
        <CompareTable>
          <table>
            <tbody>
              <tr>
                <th>Criterio</th>
                <th>Genscore</th>
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
          Si monitorizas marca en varios mercados o idiomas a la vez y no quieres pagar un extra por
          cada uno, o si tu equipo es grande y valoras tener usuarios ilimitados ya en el plan de
          entrada, Peec AI cubre ese caso mejor que Genscore hoy.
        </Verdict>

        <Verdict title="Cuándo elegir Genscore" badge="Cuándo elegir Genscore">
          Si operas principalmente en España o LATAM y quieres el producto en tu idioma, si quieres
          empezar sin tarjeta y sin pagar un extra por los tres motores principales, o si lo que
          necesitas no es solo una lista priorizada de oportunidades sino contenido ya generado y listo
          para publicar (FAQ, schema, briefs), Genscore está construido específicamente para eso.
        </Verdict>

        <h2>Metodología</h2>
        <p>
          Los datos de Genscore vienen directamente de los planes reales del producto (la misma fuente
          que usa la página de Precios). Los datos de Peec AI proceden de una búsqueda agregada de
          reseñas y páginas de precios públicas de terceros — su propia página de precios no pudo
          consultarse de forma directa, así que solo se publican aquí las cifras y afirmaciones que dos
          o más fuentes independientes corroboraron. Si detectas un dato desactualizado o inexacto,
          dínoslo y lo corregimos.
        </p>

        <ArticleCta
          title="¿Cuánto te cuesta de verdad no saberlo?"
          text="Lanza tu escaneo gratuito y compara tu visibilidad real, sin pagar add-ons por idioma. Sin tarjeta."
        />
      </div>
    </BlogPageShell>
  );
}
