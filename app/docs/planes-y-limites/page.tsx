import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageShell } from "@/components/docs/docs-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { getDocPage } from "@/lib/docs/nav";
import { LISTED_PLANS, PLANS } from "@/app/pricing/plans-data";
import { contentMetadata } from "@/lib/seo/metadata";

const SLUG = "planes-y-limites";
const page = getDocPage(SLUG)!;

export const metadata: Metadata = contentMetadata({
  title: `${page.title} — GenScore`,
  description: page.description,
  path: `/docs/${SLUG}`
});

const proPlan = PLANS.find((plan) => plan.id === "pro")!;

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
        GenScore tiene un plan gratuito y un único plan de pago, Pro, al mismo precio para todos
        ({proPlan.price} € al mes, IVA incluido). Lo que cambia entre uno y otro son los límites:
        dominios, prompts y motores de IA.
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
          {LISTED_PLANS.map((plan) => (
            <tr key={plan.id}>
              <td>{plan.name}</td>
              <td>{plan.meter.projects}</td>
              <td>{plan.id === "pro" ? plan.meter.prompts : `~${plan.meter.prompts}`}</td>
              <td>{plan.meter.engines}</td>
              <td>{plan.meter.refresh}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <h2>Qué cambia al subir de plan</h2>
      <ul>
        <li><strong>Free → Pro</strong>: pasas de un escaneo puntual a monitorización con escaneo {proPlan.meter.refresh.toLowerCase()} y evolución histórica, con hasta {proPlan.meter.projects} dominios y {proPlan.meter.prompts} prompts en total (repartidos entre tus dominios como quieras), y el generador de soluciones (FAQ, schema, briefs listos para publicar).</li>
      </ul>

      <p>
        Precios y comparativa completa de funciones en <Link href="/pricing">Precios</Link>.
      </p>
    </DocsPageShell>
  );
}
