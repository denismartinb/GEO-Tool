import type { Metadata } from "next";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { KeyTakeaway, Verdict, CompareTable, Pill, ArticleCta } from "@/components/blog/article";
import { COMPARISON_ROWS, OTTERLY_RESEARCH_DATE } from "@/lib/comparativas/genscore-vs-otterly";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";
const PAGE_URL = `${SITE_URL}/comparativas/genscore-vs-otterly`;

export const metadata: Metadata = contentMetadata({
  title: "Genscore vs Otterly: comparativa de herramientas de visibilidad en IA — Genscore",
  description:
    "Genscore frente a Otterly: precio de entrada, motores de IA cubiertos, cobertura multi-país, idioma y bucle de acción. Comparativa honesta, con lo que cada una hace mejor.",
  path: "/comparativas/genscore-vs-otterly"
});

function itemListSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Genscore vs Otterly",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Genscore", url: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Otterly", url: "https://otterly.ai" }
    ]
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

export default function GenscoreVsOtterlyPage() {
  return (
    <BlogPageShell>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Comparativas", url: `${SITE_URL}/comparativas` },
          { name: "Genscore vs Otterly", url: PAGE_URL }
        ]}
      />
      {itemListSchema()}
      <h1 className="lp-h2">Genscore vs Otterly</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        Datos de Otterly consultados el {OTTERLY_RESEARCH_DATE} en fuentes públicas de terceros —
        confírmalos en otterly.ai antes de decidir, los precios cambian.
      </p>
      <div className="blog-body">
        <KeyTakeaway label="En dos frases">
          Otterly cubre nominalmente más motores y más mercados, y no tiene competencia real en
          castellano ni en el bucle de acción — solo monitoriza y audita. Genscore empieza gratis, cubre
          los tres motores que de verdad importan hoy (Gemini, Claude, ChatGPT) sin coste extra por
          añadirlos, y convierte lo que detecta en acciones concretas, no solo en un informe.
        </KeyTakeaway>

        <h2>Comparativa</h2>
        <CompareTable>
          <table>
            <tbody>
              <tr>
                <th>Criterio</th>
                <th>Genscore</th>
                <th>Otterly</th>
              </tr>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.genscore}</td>
                  <td>
                    {row.otterlyWins ? (
                      <>
                        <Pill tone="si">Gana aquí</Pill> {row.otterly}
                      </>
                    ) : (
                      row.otterly
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CompareTable>

        <Verdict title="Cuándo elegir Otterly" badge="Cuándo elegir el competidor">
          Si necesitas seguimiento en decenas de mercados a la vez, cobertura nominal de seis motores
          (aunque dos sean add-ons de pago), o ya trabajas en inglés y no te importa que el producto no
          tenga versión en castellano, Otterly es una opción real y más madura en volumen de mercados.
        </Verdict>

        <Verdict title="Cuándo elegir Genscore" badge="Cuándo elegir Genscore">
          Si operas en España o LATAM y quieres el producto y el soporte en tu idioma, si quieres empezar
          sin tarjeta y sin pagar por motores que no vas a usar, o si lo que necesitas no es solo saber que
          tienes un problema de visibilidad sino que te digan qué hacer al respecto (recomendaciones con
          evidencia y un generador de soluciones listas para publicar), Genscore está construido
          específicamente para eso.
        </Verdict>

        <h2>Metodología</h2>
        <p>
          Los datos de Genscore vienen directamente de los planes reales del producto (la misma fuente que
          usa la página de Precios). Los datos de Otterly proceden de reseñas y páginas de precios públicas
          de terceros consultadas en la fecha indicada arriba — no de acceso directo a su plataforma. Si
          detectas un dato desactualizado, dínoslo y lo corregimos.
        </p>

        <ArticleCta
          title="¿Cuánto te cuesta de verdad no saberlo?"
          text="Lanza tu escaneo gratuito y compara tu visibilidad real, sin pagar add-ons por motor. Sin tarjeta."
        />
      </div>
    </BlogPageShell>
  );
}
