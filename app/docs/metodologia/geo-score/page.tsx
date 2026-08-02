import type { Metadata } from "next";
import { DocsPageShell } from "@/components/docs/docs-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { getDocPage } from "@/lib/docs/nav";

const SLUG = "metodologia/geo-score";
const page = getDocPage(SLUG)!;

export const metadata: Metadata = {
  title: `${page.title} — Genscore`,
  description: page.description,
  alternates: { canonical: `https://www.genscore.es/docs/${SLUG}` }
};

export default function GeoScoreMethodologyPage() {
  return (
    <DocsPageShell activeSlug={SLUG}>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.genscore.es" },
          { name: "Docs", url: "https://www.genscore.es/docs" },
          { name: page.title, url: `https://www.genscore.es/docs/${SLUG}` }
        ]}
      />
      <h1>{page.title}</h1>
      <p className="docs-updated">Actualizado el 2 de agosto de 2026 — versión de score: geo-score-v2</p>

      <p>
        El GEO Score (0-100) combina cuatro componentes, cada uno con su propio peso. No es una media
        simple: cada componente mide algo distinto, y si uno no se puede calcular en un escaneo concreto, se
        descarta y el resto de pesos se reajusta — nunca se rellena con un valor inventado.
      </p>

      <h2>Los cuatro componentes</h2>
      <div className="docs-table-wrap">
      <table>
        <tbody>
          <tr>
            <th>Componente</th>
            <th>Peso</th>
            <th>Qué mide</th>
          </tr>
          <tr>
            <td>Presencia</td>
            <td>40%</td>
            <td>¿Aparece tu marca en la respuesta, sí o no? La señal más fundamental.</td>
          </tr>
          <tr>
            <td>Prominencia</td>
            <td>25%</td>
            <td>Cuando aparece, ¿lo hace pronto y con protagonismo, o como una mención tardía?</td>
          </tr>
          <tr>
            <td>Cuota de voz</td>
            <td>20%</td>
            <td>De toda la atención que la IA reparte entre marcas mencionadas, cuánta es tuya.</td>
          </tr>
          <tr>
            <td>Autoridad</td>
            <td>15%</td>
            <td>¿Esa presencia está respaldada por una cita o fuente real, o es solo una mención suelta?</td>
          </tr>
        </tbody>
      </table>
      </div>

      <h2>Qué pasa cuando falta un componente</h2>
      <p>
        La <strong>prominencia</strong> solo existe cuando la marca aparece mencionada — si no aparece en
        ningún prompt del escaneo, ese componente se retira del cálculo y los pesos restantes se
        renormalizan (presencia pasa a pesar ~53%, cuota de voz ~27%, autoridad ~20%). La{" "}
        <strong>cuota de voz</strong> sigue la misma regla: si ni tu marca ni ningún competidor rastreado
        aparece mencionado en todo el escaneo, no hay voz que repartir — se descarta en vez de asumir un
        100 por defecto para una marca invisible en un mercado vacío.
      </p>

      <h2>Confianza del escaneo</h2>
      <p>
        Cada GEO Score lleva una etiqueta de confianza: <strong>alta</strong> requiere al menos 20
        resultados completamente extraídos en el escaneo; entre 2 y 19, la confianza es{" "}
        <strong>media</strong>. Con una sola llamada por prompt y motor, menos resultados significan más
        volatilidad estadística — la etiqueta lo refleja en vez de aparentar una precisión que la muestra no
        tiene.
      </p>

      <h2>Franjas de madurez</h2>
      <p>
        El indicador visual usa dos umbrales (70 y 40) para clasificar el score como «competitivo»,
        «emergente» o «inicial». Son los mismos umbrales desde el lanzamiento; recalibrarlos con datos
        reales de más proyectos es un trabajo pendiente y explícitamente aparte.
      </p>
    </DocsPageShell>
  );
}
