import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { ArticleCta, KeyTakeaway, Stat, StatGrid } from "@/components/blog/article";
import { contentMetadata } from "@/lib/seo/metadata";
import { SITE_ORIGIN } from "@/lib/brand/canonical-definition";
import {
  CITIES,
  CITY_IDS,
  EDITION,
  STUDY_HREF,
  type ClinicEntry
} from "@/lib/observatorio/clinicas-dentales";

const PAGE_PATH = "/observatorio/clinicas-dentales";
const PAGE_URL = `${SITE_ORIGIN}${PAGE_PATH}`;

export const metadata: Metadata = contentMetadata({
  title: "Qué clínicas dentales recomienda la IA · Observatorio GenScore",
  description:
    "Ranking de las clínicas dentales que más recomiendan ChatGPT, Gemini y Claude en Madrid y Valencia. Edición octubre de 2026, medida con preguntas reales de pacientes.",
  path: PAGE_PATH
});

type Row = { clinic: ClinicEntry; cityName: string; engines: number };

function allRows(): Row[] {
  return CITY_IDS.flatMap((city) =>
    CITIES[city].clinics.map((clinic) => ({
      clinic,
      cityName: CITIES[city].name,
      engines: Object.values(clinic.byEngine).filter((v) => v > 0).length
    }))
  ).sort((a, b) => b.clinic.presence - a.clinic.presence || a.clinic.name.localeCompare(b.clinic.name));
}

export default function ClinicasDentalesPage() {
  const rows = allRows();
  return (
    <BlogPageShell
      activeHref="/observatorio"
      breadcrumb={[
        { label: "Observatorio", href: "/observatorio" },
        { label: "Clínicas dentales", href: PAGE_PATH }
      ]}
    >
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_ORIGIN },
          { name: "Observatorio", url: `${SITE_ORIGIN}/observatorio` },
          { name: "Clínicas dentales", url: PAGE_URL }
        ]}
      />

      <h1 className="lp-h2">Qué clínicas dentales recomienda la IA</h1>
      <p className="legal-updated" style={{ marginBottom: 36 }}>
        Edición {EDITION.label} · Medición del 10 de octubre de 2026 en {CITY_IDS.map((id) => CITIES[id].name).join(" y ")} ·{" "}
        <Link href="/observatorio/clinicas-dentales/metodologia">Metodología</Link>
      </p>

      <div className="blog-body">
        <KeyTakeaway>
          Cuando un paciente pregunta a la IA a qué dentista ir, la respuesta trae tres o cuatro nombres y casi nunca coinciden entre motores. Estas son las clínicas que más aparecen.
        </KeyTakeaway>

        <StatGrid label={`Observatorio GenScore, edición ${EDITION.label}: clínicas dentales`}>
          <Stat value="7%" label="De las clínicas nombradas aparecen en más de un motor" source="Estudio GenScore, 10 oct 2026" tone="warm" />
          <Stat value="2 de cada 3" label="Respuestas de Claude nombran una cadena dental; las de Gemini, ninguna" source="Estudio GenScore, 10 oct 2026" tone="cyan" />
          <Stat value="77%" label="De las clínicas independientes bien valoradas analizadas no aparece en ninguna respuesta" source="Estudio GenScore, 10 oct 2026" tone="blue" />
        </StatGrid>

        <h2>Las más nombradas</h2>
        <p>
          Presencia: porcentaje de respuestas que nombran a la clínica al menos una vez, con cada motor aportando el mismo número de respuestas. Las cadenas se marcan aparte. El detalle motor a motor está en la página de cada ciudad.
        </p>
        <div className="art-tablewrap"><table>
          <thead>
            <tr>
              <th>Clínica</th>
              <th>Ciudad</th>
              <th>Presencia</th>
              <th>Motores que la nombran</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ clinic, cityName, engines }) => (
              <tr key={`${clinic.slug}-${cityName}`}>
                <td>
                  <Link href={`/observatorio/clinicas-dentales/clinica/${clinic.slug}`}>
                    {clinic.name}
                  </Link>
                  {clinic.chain ? " (cadena)" : ""}
                </td>
                <td>{cityName}</td>
                <td>{clinic.presence}%</td>
                <td>{engines} de 3</td>
              </tr>
            ))}
          </tbody>
        </table></div>

        <h2>Ciudad a ciudad</h2>
        <ul>
          {CITY_IDS.map((id) => (
            <li key={id}>
              <Link href={`/observatorio/clinicas-dentales/${id}`}>Clínicas dentales que la IA recomienda en {CITIES[id].name}</Link>
            </li>
          ))}
        </ul>

        <p>
          Los datos completos y el análisis están en el estudio:{" "}
          <Link href={STUDY_HREF}>Qué clínicas dentales recomienda la IA</Link>. Solo nombramos clínicas que aparecen en las respuestas del estudio; no publicamos quién no aparece.
        </p>

        <ArticleCta
          title="¿Aparece tu clínica cuando un paciente pregunta a la IA?"
          text="GenScore hace esta medición con las preguntas de tu clínica y tus competidores, de forma periódica, y te dice qué cambiar para aparecer. Prueba de 7 días, sin tarjeta."
          cta="Medir mi clínica gratis"
          href="/signup"
        />
      </div>
    </BlogPageShell>
  );
}
