import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageShell } from "@/components/docs/docs-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { getDocPage } from "@/lib/docs/nav";
import { contentMetadata } from "@/lib/seo/metadata";

const SLUG = "empezar/primer-escaneo";
const page = getDocPage(SLUG)!;

export const metadata: Metadata = contentMetadata({
  title: `${page.title} — GenScore`,
  description: page.description,
  path: `/docs/${SLUG}`
});

export default function PrimerEscaneoPage() {
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
      <p className="docs-updated">Actualizado el 9 de octubre de 2026</p>

      <p>
        Registrar un dominio en GenScore dispara una secuencia fija de pasos, siempre en el mismo orden.
        No hay configuración manual obligatoria antes del primer resultado: el sistema sugiere competidores
        y prompts, y tú los ajustas si hace falta.
      </p>

      <h2>La secuencia</h2>
      <ol>
        <li><strong>Nuevo dominio.</strong> Introduces tu dominio y creas el proyecto.</li>
        <li>
          <strong>Competidores sugeridos.</strong> Gemini propone un primer set de competidores a partir del
          dominio. Puedes aceptarlos, editarlos o añadir los tuyos antes de escanear.
        </li>
        <li>
          <strong>Prompts sugeridos.</strong> Igual que con los competidores: Gemini propone las preguntas
          reales que un cliente haría a un asistente de IA sobre tu categoría. Cuántos puedes monitorizar
          depende de tu plan (ver <Link href="/docs/planes-y-limites">Planes y límites</Link>).
        </li>
        <li>
          <strong>Primer escaneo.</strong> GenScore lanza cada prompt contra los motores de IA de tu plan y
          extrae si tu marca aparece, en qué posición y con qué citas.
        </li>
        <li>
          <strong>El escaneo pasa por sus estados.</strong> Cada ejecución empieza en <code>pending</code>,
          pasa a <code>running</code> mientras se procesan los prompts, y termina en <code>completed</code>
          (o <code>failed</code> si algo va mal) — nunca se queda colgado indefinidamente.
        </li>
        <li>
          <strong>Overview con datos reales.</strong> En cuanto el escaneo termina, la pantalla de{" "}
          <Link href="/docs/informes/overview">Overview</Link> muestra tu GEO Score y el resto de
          indicadores con los datos de ese escaneo — nunca con datos de ejemplo.
        </li>
      </ol>

      <h2>Qué incluye la prueba gratuita</h2>
      <p>
        Toda cuenta nueva empieza con 7 días de Pro completo, sin tarjeta: hasta 5 dominios, los tres
        motores de IA y escaneo diario, así que al acabar la prueba ya tienes varios escaneos y la
        tendencia de tu visibilidad. Si al terminar no contratas un plan, no se te cobra nada: tu cuenta
        pasa a solo lectura, sigues viendo tus datos y vuelves a escanear en cuanto elijas un plan.
      </p>

      <h2>Preguntas frecuentes</h2>
      <p>
        <strong>¿Puedo cambiar los competidores o prompts después del primer escaneo?</strong> Sí, en
        cualquier momento desde el proyecto — el siguiente escaneo usará la configuración actualizada.
      </p>
      <p>
        <strong>¿Qué pasa si el escaneo falla?</strong> El estado pasa a <code>failed</code> con un motivo
        legible; puedes volver a lanzarlo sin perder la configuración del proyecto.
      </p>
    </DocsPageShell>
  );
}
