import type { Metadata } from "next";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { COMPARATIVAS_BREADCRUMB } from "@/lib/comparativas";
import { KeyTakeaway, Verdict, CompareTable, Pill, ArticleCta } from "@/components/blog/article";
import { COMPARISON_ROWS, PROFOUND_RESEARCH_DATE } from "@/lib/comparativas/genscore-vs-profound";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";
const PAGE_URL = `${SITE_URL}/comparativas/genscore-vs-profound`;

export const metadata: Metadata = contentMetadata({
  title: "GenScore vs Profound: alternativa en español a la plataforma AEO — GenScore",
  description:
    "GenScore frente a Profound: precio de entrada, motores cubiertos, a quién se dirige cada una y gestión multi-cliente. Comparativa honesta, con lo que cada una hace mejor.",
  path: "/comparativas/genscore-vs-profound"
});

function itemListSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "GenScore vs Profound",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "GenScore", url: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Profound", url: "https://www.tryprofound.com" }
    ]
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

export default function GenscoreVsProfoundPage() {
  return (
    <BlogPageShell breadcrumb={COMPARATIVAS_BREADCRUMB}>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Comparativas", url: `${SITE_URL}/comparativas` },
          { name: "GenScore vs Profound", url: PAGE_URL }
        ]}
      />
      {itemListSchema()}
      <h1 className="lp-h2">GenScore vs Profound</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        Datos de Profound revisados el {PROFOUND_RESEARCH_DATE} en su propia web y en fuentes públicas
        de terceros — confírmalos en tryprofound.com antes de decidir: su página de precios no publica
        cifras.
      </p>
      <div className="blog-body">
        <KeyTakeaway label="En dos frases">
          Profound es una plataforma de visibilidad en IA bien financiada y dirigida a mid-market y
          grandes empresas, con hasta nueve motores y creación de contenido en su plan Enterprise — pero
          sin precio público, sin que conste un producto en castellano y sin presencia conocida en el
          mercado hispanohablante. GenScore se prueba 7 días con Pro, sin tarjeta y sin hablar con nadie
          de ventas, cubre los tres motores que de verdad importan hoy (Gemini, Claude, ChatGPT) y
          convierte lo que detecta en acciones concretas desde el plan Pro, sin un contrato Enterprise.
        </KeyTakeaway>

        <h2>Comparativa</h2>
        <CompareTable>
          <table>
            <tbody>
              <tr>
                <th>Criterio</th>
                <th>GenScore</th>
                <th>Profound</th>
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
                    {row.profoundWins ? (
                      <>
                        <Pill tone="si">Gana aquí</Pill> {row.profound}
                      </>
                    ) : (
                      row.profound
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CompareTable>

        <Verdict title="Cuándo elegir Profound" badge="Cuándo elegir el competidor">
          Si eres una empresa de tamaño medio o grande con presupuesto para una herramienta enterprise,
          necesitas cobertura amplia de motores (incluido Perplexity, que GenScore no soporta hoy) o
          crear contenido dentro de la misma herramienta, y no te importa que no conste una interfaz en
          castellano ni pasar por una demo de ventas antes de ver un precio, Profound es una opción real,
          con analítica más profunda y 4,5/5 en G2.
        </Verdict>

        <Verdict title="Cuándo elegir GenScore" badge="Cuándo elegir GenScore">
          Si operas en España o LATAM y quieres el producto en tu idioma, si prefieres ver un precio
          antes de hablar con nadie y probarlo 7 días sin tarjeta, o si lo que necesitas no es solo un
          panel de analítica sino que te digan qué hacer al respecto (recomendaciones con evidencia y un
          generador de soluciones listas para publicar) sin firmar un contrato Enterprise, GenScore está
          construido específicamente para eso.
        </Verdict>

        <h2>Metodología</h2>
        <p>
          Los datos de GenScore vienen directamente de los planes reales del producto (la misma fuente
          que usa la página de Precios). Los de Profound proceden de su propia web — página de precios,
          página principal y centro de ayuda (
          <a href="https://www.tryprofound.com/pricing" rel="nofollow noopener noreferrer" target="_blank">
            tryprofound.com/pricing
          </a>
          ,{" "}
          <a
            href="https://help.tryprofound.com/articles/8593548222-agency-mode-overview"
            rel="nofollow noopener noreferrer"
            target="_blank"
          >
            «Agency Mode Overview»
          </a>
          ), revisada el 9 de octubre de 2026, y de reseñas y cobertura de prensa de terceros para las
          valoraciones y la financiación, consultadas en agosto de 2026. No hemos accedido a su
          plataforma. Su precio no se declara con una cifra propia a propósito: su web no lo publica, y
          la retirada de sus planes de entrada la cita un tercero (
          <a href="https://geotoolbox.ai/blog/profound-pricing" rel="nofollow noopener noreferrer" target="_blank">
            GEO Toolbox
          </a>
          , competidor, comprobado el 28 de septiembre de 2026), no su propia web. Si detectas un dato
          desactualizado, dínoslo y lo corregimos.
        </p>

        <ArticleCta
          title="¿Cuánto te cuesta de verdad no saberlo?"
          text="Prueba Pro 7 días gratis y compara tu visibilidad real, sin hablar con ventas. Sin tarjeta."
        />
      </div>
    </BlogPageShell>
  );
}
