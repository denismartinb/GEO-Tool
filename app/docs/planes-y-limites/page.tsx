import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageShell } from "@/components/docs/docs-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { getDocPage } from "@/lib/docs/nav";
import { PLANS } from "@/app/pricing/plans-data";
import { contentMetadata } from "@/lib/seo/metadata";

const SLUG = "planes-y-limites";
const page = getDocPage(SLUG)!;

export const metadata: Metadata = contentMetadata({
  title: `${page.title} — Genscore`,
  description: page.description,
  path: `/docs/${SLUG}`
});

export default function PlanesYLimitesPage() {
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
        Genscore cobra por cuánto monitorizas — dominios, prompts y motores de IA — no por número de
        usuarios. Los usuarios son ilimitados desde el plan Starter.
      </p>

      <h2>Límites por plan</h2>
      <div className="docs-table-wrap">
      <table>
        <tbody>
          <tr>
            <th>Plan</th>
            <th>Dominios</th>
            <th>Prompts</th>
            <th>Motores de IA</th>
            <th>Refresco</th>
          </tr>
          {PLANS.map((plan) => (
            <tr key={plan.id}>
              <td>{plan.name}</td>
              <td>{plan.meter.projects}</td>
              <td>~{plan.meter.prompts}</td>
              <td>{plan.meter.engines}</td>
              <td>{plan.meter.refresh}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <h2>Qué cambia al subir de plan</h2>
      <ul>
        <li><strong>Free → Starter</strong>: pasas de un escaneo puntual a monitorización con refresco semanal y tendencia histórica.</li>
        <li><strong>Starter → Pro</strong>: refresco diario, más dominios y prompts, y el generador de soluciones (FAQ, schema, briefs listos para publicar).</li>
        <li><strong>Pro → Agencia</strong>: volumen de dominios y prompts a medida de tu cartera de clientes, con las mismas condiciones de motores y refresco que Pro.</li>
      </ul>

      <p>
        Precios y comparativa completa de funciones en <Link href="/pricing">Precios</Link>.
      </p>
    </DocsPageShell>
  );
}
