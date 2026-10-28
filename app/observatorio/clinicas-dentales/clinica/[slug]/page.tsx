import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { ArticleCta } from "@/components/blog/article";
import { contentMetadata } from "@/lib/seo/metadata";
import { SITE_ORIGIN } from "@/lib/brand/canonical-definition";
import {
  allClinicSlugs,
  EDITION,
  ENGINES,
  getClinicSightings,
  type EngineKey
} from "@/lib/observatorio/clinicas-dentales";

const ENGINE_KEYS = Object.keys(ENGINES) as EngineKey[];

export function generateStaticParams() {
  return allClinicSlugs().map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const sightings = getClinicSightings(slug);
  if (sightings.length === 0) return {};
  const { clinic } = sightings[0];
  return contentMetadata({
    title: `${clinic.name} en las respuestas de la IA · Observatorio GenScore`,
    description: `Con qué frecuencia nombran ChatGPT, Gemini y Claude a ${clinic.name}. Edición ${EDITION.label} del observatorio de clínicas dentales.`,
    path: `/observatorio/clinicas-dentales/clinica/${slug}`
  });
}

export default async function ClinicaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sightings = getClinicSightings(slug);
  if (sightings.length === 0) notFound();

  const { clinic } = sightings[0];
  const pagePath = `/observatorio/clinicas-dentales/clinica/${slug}`;
  return (
    <BlogPageShell
      activeHref="/observatorio"
      breadcrumb={[
        { label: "Observatorio", href: "/observatorio" },
        { label: "Clínicas dentales", href: "/observatorio/clinicas-dentales" },
        { label: clinic.name, href: pagePath }
      ]}
    >
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_ORIGIN },
          { name: "Observatorio", url: `${SITE_ORIGIN}/observatorio` },
          { name: "Clínicas dentales", url: `${SITE_ORIGIN}/observatorio/clinicas-dentales` },
          { name: clinic.name, url: `${SITE_ORIGIN}${pagePath}` }
        ]}
      />

      <h1 className="lp-h2">
        {clinic.name} en las respuestas de la IA
      </h1>
      <p className="legal-updated" style={{ marginBottom: 36 }}>
        {clinic.chain ? "Cadena de clínicas · " : ""}Edición {EDITION.label} · Medición del 10 de octubre de 2026 ·{" "}
        <Link href="/observatorio/clinicas-dentales/metodologia">Metodología</Link>
      </p>

      <div className="blog-body">
        <p>
          Presencia: porcentaje de respuestas de la IA que nombran a {clinic.name} al menos una vez cuando un paciente pregunta por un dentista en su ciudad. Cada motor aporta el mismo número de respuestas.
        </p>

        {sightings.map(({ clinic: entry, city, cityName }) => (
          <section key={city} style={{ marginTop: 32 }}>
            <h2>{cityName}</h2>
            <div className="art-tablewrap"><table>
              <thead>
                <tr>
                  <th>Presencia</th>
                  {ENGINE_KEYS.map((engine) => (
                    <th key={engine}>{ENGINES[engine]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{entry.presence}%</td>
                  {ENGINE_KEYS.map((engine) => (
                    <td key={engine}>{entry.byEngine[engine]}%</td>
                  ))}
                </tr>
              </tbody>
            </table></div>
          </section>
        ))}

        <p style={{ marginTop: 32 }}>
          Es la primera edición: la evolución de estas cifras se publicará aquí cuando haya nuevas mediciones. Es una foto del 10 de octubre de 2026, no un juicio sobre la calidad de la clínica.
        </p>

        <ArticleCta
          title="¿Quieres el detalle completo de tu clínica?"
          text="La ficha pública muestra el resultado agregado. GenScore mide tu caso concreto (tus preguntas, tus competidores, qué cambiar para aparecer) y lo actualiza de forma periódica. Prueba de 7 días, sin tarjeta."
          cta="Medir mi clínica gratis"
          href="/signup"
        />
      </div>
    </BlogPageShell>
  );
}
