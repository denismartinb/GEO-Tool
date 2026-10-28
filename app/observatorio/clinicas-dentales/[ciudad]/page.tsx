import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { ArticleCta } from "@/components/blog/article";
import { contentMetadata } from "@/lib/seo/metadata";
import { SITE_ORIGIN } from "@/lib/brand/canonical-definition";
import {
  CITY_IDS,
  EDITION,
  ENGINES,
  getCity,
  type EngineKey
} from "@/lib/observatorio/clinicas-dentales";

const ENGINE_KEYS = Object.keys(ENGINES) as EngineKey[];

export function generateStaticParams() {
  return CITY_IDS.map((ciudad) => ({ ciudad }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ ciudad: string }> }): Promise<Metadata> {
  const { ciudad } = await params;
  const city = getCity(ciudad);
  if (!city) return {};
  return contentMetadata({
    title: `Clínicas dentales que la IA recomienda en ${city.name} · Observatorio GenScore`,
    description: `Las clínicas dentales que más nombran ChatGPT, Gemini y Claude en ${city.name}. Edición ${EDITION.label}, medida con preguntas reales de pacientes.`,
    path: `/observatorio/clinicas-dentales/${city.id}`
  });
}

export default async function CiudadPage({ params }: { params: Promise<{ ciudad: string }> }) {
  const { ciudad } = await params;
  const city = getCity(ciudad);
  if (!city) notFound();

  const pagePath = `/observatorio/clinicas-dentales/${city.id}`;
  return (
    <BlogPageShell
      activeHref="/observatorio"
      breadcrumb={[
        { label: "Observatorio", href: "/observatorio" },
        { label: "Clínicas dentales", href: "/observatorio/clinicas-dentales" },
        { label: city.name, href: pagePath }
      ]}
    >
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_ORIGIN },
          { name: "Observatorio", url: `${SITE_ORIGIN}/observatorio` },
          { name: "Clínicas dentales", url: `${SITE_ORIGIN}/observatorio/clinicas-dentales` },
          { name: city.name, url: `${SITE_ORIGIN}${pagePath}` }
        ]}
      />

      <h1 className="lp-h2">Clínicas dentales que la IA recomienda en {city.name}</h1>
      <p className="legal-updated" style={{ marginBottom: 36 }}>
        Edición {EDITION.label} · Medición del 10 de octubre de 2026 ·{" "}
        <Link href="/observatorio/clinicas-dentales/metodologia">Metodología</Link>
      </p>

      <div className="blog-body">
        <p>
          Presencia: porcentaje de respuestas que nombran a la clínica al menos una vez. Cada motor aporta el mismo número de respuestas. Las cadenas se marcan aparte.
        </p>
        <div className="art-tablewrap"><table>
          <thead>
            <tr>
              <th>Clínica</th>
              <th>Presencia</th>
              {ENGINE_KEYS.map((engine) => (
                <th key={engine}>{ENGINES[engine]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...city.clinics]
              .sort((a, b) => b.presence - a.presence || a.name.localeCompare(b.name))
              .map((clinic) => (
                <tr key={clinic.slug}>
                  <td>
                    <Link href={`/observatorio/clinicas-dentales/clinica/${clinic.slug}`}>{clinic.name}</Link>
                    {clinic.chain ? " (cadena)" : ""}
                  </td>
                  <td>{clinic.presence}%</td>
                  {ENGINE_KEYS.map((engine) => (
                    <td key={engine}>{clinic.byEngine[engine]}%</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table></div>

        <p>
          Una clínica solo cuenta si su nombre aparece en la respuesta. Es una foto del 10 de octubre de 2026: repetida otro día, el orden puede moverse. No es un juicio sobre la calidad de ninguna clínica, y solo nombramos clínicas que la IA recomienda.
        </p>

        <ArticleCta
          title={`¿Aparece tu clínica cuando un paciente pregunta en ${city.name}?`}
          text="GenScore mide si la IA te recomienda con las preguntas de tu ciudad y tu especialidad, y te dice qué cambiar para aparecer. Prueba de 7 días, sin tarjeta."
          cta="Medir mi clínica gratis"
          href="/signup"
        />
      </div>
    </BlogPageShell>
  );
}
