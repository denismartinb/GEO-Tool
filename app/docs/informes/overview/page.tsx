import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageShell } from "@/components/docs/docs-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { getDocPage } from "@/lib/docs/nav";
import { contentMetadata } from "@/lib/seo/metadata";

const SLUG = "informes/overview";
const page = getDocPage(SLUG)!;

export const metadata: Metadata = contentMetadata({
  title: `${page.title} — Genscore`,
  description: page.description,
  path: `/docs/${SLUG}`
});

export default function OverviewReportPage() {
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
      <p className="docs-updated">Actualizado el 2 de agosto de 2026</p>

      <p>
        Overview es la primera pantalla que ves al entrar en un proyecto. Resume, con los datos del último
        escaneo completado, cómo aparece tu marca en respuestas de IA — sin necesidad de navegar a ningún
        otro informe.
      </p>

      <h2>Resumen en lenguaje natural</h2>
      <p>
        En la parte superior, un resumen generado a partir del escaneo real: en cuántos de tus prompts
        aparece la marca, tu GEO Score, y el mayor freno detectado (por ejemplo, que ninguna fuente citada
        sea tuya todavía). Debajo, las recomendaciones de mayor prioridad de ese mismo escaneo.
      </p>

      <h2>Puntuación GEO</h2>
      <p>
        El indicador circular central es tu GEO Score (0-100), con su franja de madurez ("inicial",
        "en desarrollo"...) y la tendencia de tus últimos escaneos. Metodología completa en{" "}
        <Link href="/docs/metodologia/geo-score">GEO Score</Link>.
      </p>

      <h2>Indicadores clave</h2>
      <ul>
        <li>
          <strong>Tasa de mención</strong>: en qué porcentaje de tus prompts aparece tu marca en la
          respuesta de la IA.
        </li>
        <li>
          <strong>Cuota de citas</strong>: de las fuentes que la IA cita para justificar su respuesta, cuántas
          son dominios tuyos.
        </li>
      </ul>

      <h2>Posicionamiento por motores de IA</h2>
      <p>
        Genscore no consulta un único modelo. Este bloque desglosa tu posición media por motor (Gemini,
        Claude, ChatGPT según tu plan) — el número de motores incluidos depende de tu plan, ver{" "}
        <Link href="/docs/planes-y-limites">Planes y límites</Link>.
      </p>

      <h2>Oportunidades</h2>
      <p>
        Un resumen visual de las recomendaciones activas del proyecto (puntos potenciales de mejora y
        cuántas hay pendientes), con acceso directo al listado completo de recomendaciones.
      </p>
    </DocsPageShell>
  );
}
