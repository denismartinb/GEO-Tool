import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { ArticleCta, PromptSet } from "@/components/blog/article";
import { contentMetadata } from "@/lib/seo/metadata";
import { SITE_ORIGIN } from "@/lib/brand/canonical-definition";
import { EDITION, STUDY_HREF } from "@/lib/observatorio/clinicas-dentales";

const PAGE_PATH = "/observatorio/clinicas-dentales/metodologia";
const PAGE_URL = `${SITE_ORIGIN}${PAGE_PATH}`;

export const metadata: Metadata = contentMetadata({
  title: "Metodología del observatorio de clínicas dentales · GenScore",
  description:
    "Cómo medimos qué clínicas dentales recomienda la IA: preguntas reales de pacientes en ChatGPT, Gemini y Claude, repetidas en distintos momentos. Sin nombres de clínica en las preguntas.",
  path: PAGE_PATH
});

export default function MetodologiaPage() {
  return (
    <BlogPageShell
      activeHref="/observatorio"
      breadcrumb={[
        { label: "Observatorio", href: "/observatorio" },
        { label: "Clínicas dentales", href: "/observatorio/clinicas-dentales" },
        { label: "Metodología", href: PAGE_PATH }
      ]}
    >
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_ORIGIN },
          { name: "Observatorio", url: `${SITE_ORIGIN}/observatorio` },
          { name: "Clínicas dentales", url: `${SITE_ORIGIN}/observatorio/clinicas-dentales` },
          { name: "Metodología", url: PAGE_URL }
        ]}
      />

      <h1 className="lp-h2">Cómo medimos qué clínicas dentales recomienda la IA</h1>
      <p className="legal-updated" style={{ marginBottom: 36 }}>
        Edición {EDITION.label} · Medición del 10 de octubre de 2026
      </p>

      <div className="blog-body">
        <p>
          Las mediciones se realizan con un sistema algorítmico que genera las preguntas de búsqueda más relevantes de un sector y las hace a ChatGPT, Gemini y Claude, múltiples veces en cada motor y en distintos momentos del tiempo.
        </p>

        <h2>Las preguntas</h2>
        <p>
          Son las que haría un paciente que busca dentista en su ciudad. Ninguna nombra una clínica. En cada ciudad se hacen las mismas preguntas y solo cambia el nombre de la ciudad. Una muestra:
        </p>
        <PromptSet
          prompts={[
            { text: "¿Cuál es la mejor clínica dental de Valencia?", intent: "Recomendación" },
            { text: "¿Dónde me pongo implantes dentales en Madrid? Busco una clínica de confianza.", intent: "Tratamiento" },
            { text: "¿Qué clínica recomiendas para ortodoncia invisible?", intent: "Tratamiento" },
            { text: "Busco un dentista que trate bien a pacientes con miedo al dentista", intent: "Experiencia" },
            { text: "¿Qué clínicas dentales tienen mejor relación calidad-precio?", intent: "Precio" }
          ]}
        />

        <h2>Qué cuenta como presencia</h2>
        <ul>
          <li>Una clínica solo cuenta si su nombre aparece en la respuesta.</li>
          <li>La presencia es el porcentaje de respuestas que la nombran al menos una vez, con cada motor aportando el mismo número de respuestas.</li>
          <li>Contamos la mención tal cual aparece: no valoramos si el motor recomienda la clínica, la describe o solo la da como contexto.</li>
          <li>Esta edición cubre Madrid y Valencia.</li>
        </ul>

        <h2>Qué publicamos y qué no</h2>
        <p>
          Solo nombramos clínicas que aparecen en las respuestas del estudio. No publicamos qué clínicas no aparecen: ese detalle solo lo ve cada clínica en su diagnóstico privado de GenScore.
        </p>

        <h2>Límites</h2>
        <p>
          Medido el 10 de octubre de 2026. Es una foto de una fecha, y repetida otro día la clasificación puede moverse. No es un juicio sobre la calidad de ninguna clínica. El análisis completo de esta edición está en{" "}
          <Link href={STUDY_HREF}>el estudio publicado</Link>.
        </p>

        <ArticleCta
          title="¿Aparece tu clínica cuando un paciente pregunta a la IA?"
          text="GenScore mide tu caso concreto con esta misma metodología: tus preguntas, tu ciudad, tus competidores. Prueba de 7 días, sin tarjeta."
          cta="Medir mi clínica gratis"
          href="/signup"
        />
      </div>
    </BlogPageShell>
  );
}
