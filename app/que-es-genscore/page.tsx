import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { KeyTakeaway, NumberedSection, CompareTable, Verdict, ArticleCta } from "@/components/blog/article";
import { CANONICAL_DEFINITION, CANONICAL_DEFINITION_LONG } from "@/lib/brand/canonical-definition";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";
const PAGE_URL = `${SITE_URL}/que-es-genscore`;

export const metadata: Metadata = contentMetadata({
  title: "Qué es GenScore: la plataforma GEO para medir tu visibilidad en IA — GenScore",
  description: CANONICAL_DEFINITION_LONG,
  path: "/que-es-genscore"
});

const faqItems = [
  {
    question: "¿Qué es GenScore?",
    answer: CANONICAL_DEFINITION_LONG
  },
  {
    question: "¿Qué mide exactamente GenScore?",
    answer:
      "Cinco señales sobre las respuestas reales de ChatGPT, Gemini y Claude: si el modelo menciona tu marca, con qué prominencia dentro de la respuesta, en qué posición frente a tus competidores, si respalda la mención citando tu web, y si tu web está técnicamente preparada para que la extraigan. Todo eso se resume en el GEO Score, una puntuación de 0 a 100 por dominio."
  },
  {
    question: "¿En qué se diferencia GenScore de una herramienta SEO?",
    answer:
      "Una herramienta SEO mide tu posición en una lista de resultados. GenScore mide si un modelo generativo te nombra dentro de una respuesta redactada, algo que no depende del ranking: puedes estar primero en Google y no aparecer nunca en la respuesta de ChatGPT, y al revés. Son señales distintas y se corrigen con acciones distintas."
  },
  {
    question: "¿Hay otros productos que se llaman GenScore?",
    answer:
      "Sí. El nombre lo comparten productos de otros sectores —bioinformática, salud mental, evaluación de riesgo entre empresas— y alguna entidad local sin relación con ninguno. GenScore, con S mayúscula, es la plataforma de Generative Engine Optimization en genscore.es. Si buscabas cualquiera de las otras, esta no es."
  },
  {
    question: "¿Se puede probar sin pagar?",
    answer:
      "Sí. El plan gratuito escanea de verdad —no es una demo ni una prueba con caducidad— y no pide tarjeta. Cubre un dominio con unos 10 prompts sobre un motor; los planes de pago amplían prompts, dominios y llevan los tres motores."
  }
];

/**
 * SoftwareApplication de la propia página de entidad. El `Organization` global
 * vive en el layout raíz; aquí se declara el **producto**, y `isPartOf` /
 * `publisher` los enlaza para que no queden como dos entidades sueltas que
 * casualmente comparten nombre.
 *
 * Sin `aggregateRating` ni `review`: no tenemos reseñas públicas acumuladas, y
 * un rating inventado en schema es exactamente la clase de dato falso que
 * CLAUDE.md prohíbe — con el agravante de que Google penaliza el marcado
 * inventado cuando lo detecta.
 */
function softwareApplicationSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GenScore",
    url: SITE_URL,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Generative Engine Optimization",
    operatingSystem: "Web",
    inLanguage: "es",
    description: CANONICAL_DEFINITION_LONG,
    publisher: { "@type": "Organization", name: "GenScore", url: SITE_URL },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      description: "Plan gratuito permanente, sin tarjeta."
    }
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

export default function QueEsGenScorePage() {
  return (
    <BlogPageShell>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Qué es GenScore", url: PAGE_URL }
        ]}
      />
      {softwareApplicationSchema()}
      <FaqPageSchema items={faqItems} />

      <h1 className="lp-h2">Qué es GenScore</h1>

      <div className="blog-body">
        <KeyTakeaway label="En una frase">{CANONICAL_DEFINITION_LONG}</KeyTakeaway>

        <h2>El problema que resuelve</h2>
        <p>
          Cada vez más gente pregunta directamente a un asistente de IA en vez de buscar en Google. Y
          esos motores no devuelven una lista de enlaces: redactan una respuesta y recomiendan marcas
          por su nombre, normalmente dos o tres. O estás en esa respuesta o no existes para quien
          pregunta.
        </p>
        <p>
          El problema es que <strong>esa visibilidad no se ve desde ningún sitio</strong>. Tu analítica
          registra la visita, no la conversación que la provocó. Tu herramienta de SEO mide posiciones
          en una lista que el asistente no usa. Y preguntarle tú mismo una vez no vale: la misma
          pregunta da respuestas distintas según el día, el contexto y las palabras exactas.{" "}
          <Link href="/geo">Eso es el GEO</Link>, y es una señal nueva que necesita su propia medición.
        </p>

        <h2>Cómo funciona</h2>

        <NumberedSection n={1} title="Defines tu dominio y tus competidores">
          Das de alta tu web. GenScore propone los competidores con los que de verdad te comparan en tu
          categoría, y tú los ajustas — la comparación sale mal si el conjunto está mal elegido.
        </NumberedSection>

        <NumberedSection n={2} title="Se generan los prompts que hace tu cliente">
          No palabras clave: preguntas completas, como las escribe una persona. Es la diferencia entre
          medir <em>"software CRM"</em> y medir <em>"qué CRM me recomiendas para una agencia de cinco
          personas"</em>, que es lo que alguien teclea de verdad.
        </NumberedSection>

        <NumberedSection n={3} title="Se lanzan contra ChatGPT, Gemini y Claude">
          Escaneos reales y repetidos en el tiempo, no una consulta suelta. De cada respuesta se extrae
          si te mencionan, en qué posición dentro del texto, junto a qué competidores, y si citan tu web
          como fuente.
        </NumberedSection>

        <NumberedSection n={4} title="Obtienes tu GEO Score y qué hacer con él">
          Una puntuación de 0 a 100 por dominio que resume esas señales, con su desglose visible, y —esto
          es lo que nos separa del resto de la categoría— <strong>las acciones concretas para
          mejorarla</strong>: qué contenido falta, qué páginas arreglar, y desde el plan Pro el borrador
          ya redactado (FAQ, datos estructurados, briefs).
        </NumberedSection>

        <h2>En qué se diferencia del SEO</h2>
        <CompareTable>
          <table>
            <tbody>
              <tr>
                <th></th>
                <th>SEO</th>
                <th>GEO (GenScore)</th>
              </tr>
              <tr>
                <td>Qué mide</td>
                <td>Tu posición en una lista de resultados</td>
                <td>Si un modelo te nombra dentro de una respuesta redactada</td>
              </tr>
              <tr>
                <td>Unidad</td>
                <td>Palabra clave</td>
                <td>Pregunta completa, como la escribe una persona</td>
              </tr>
              <tr>
                <td>Competencia</td>
                <td>Diez resultados en la primera página</td>
                <td>Dos o tres marcas nombradas, o ninguna</td>
              </tr>
              <tr>
                <td>Palanca principal</td>
                <td>Enlaces y autoridad de dominio</td>
                <td>Contenido extraíble, citable y con fuentes que el modelo reconozca</td>
              </tr>
            </tbody>
          </table>
        </CompareTable>
        <p>
          No se sustituyen: se solapan en lo técnico y divergen en todo lo demás. Un buen SEO ayuda,
          pero no basta — y esa es exactamente la brecha que GenScore hace medible. Está desarrollado en{" "}
          <Link href="/blog/que-es-geo-generative-engine-optimization">qué es el GEO</Link> y en{" "}
          <Link href="/glosario/geo-score">qué es el GEO Score</Link>.
        </p>

        <h2>Para quién es</h2>
        <p>
          Para equipos hispanohablantes que necesitan saber si aparecen en respuestas de IA y qué hacer
          al respecto: desde autónomos y pymes —el plan gratuito no pide tarjeta ni pasar por ventas—
          hasta agencias que siguen varios dominios de cliente a la vez. El producto está en castellano,
          interfaz y soporte, que en esta categoría es la excepción y no la norma. Puedes ver los planes
          y sus límites reales en <Link href="/pricing">Precios</Link>, y cómo se compara con otras
          herramientas en <Link href="/comparativas">Comparativas</Link>.
        </p>

        <Verdict title="No confundir con los otros GenScore" badge="Desambiguación">
          El nombre lo comparten productos de sectores muy distintos: un GenScore de bioinformática,
          otro de salud mental, otro de evaluación de riesgo entre empresas, y alguna entidad local sin
          relación con ninguno. <strong>Este GenScore es la plataforma de Generative Engine
          Optimization en genscore.es.</strong> Si buscabas cualquiera de las otras, esta no es —
          te ahorramos el clic.
        </Verdict>

        <h2>Preguntas frecuentes</h2>
        {faqItems.map((item) => (
          <div key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </div>
        ))}

        <ArticleCta
          title="Mira dónde apareces hoy"
          text="Lanza tu primer escaneo con GenScore y comprueba si ChatGPT, Gemini y Claude nombran tu marca. Gratis, sin tarjeta."
        />
      </div>
    </BlogPageShell>
  );
}
