import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { SoftwareApplicationSchema } from "@/components/seo/software-application-schema";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import {
  KeyTakeaway,
  NumberedSection,
  CompareTable,
  ArticleCta,
  AnswerPair,
  AnswerSample,
  PromptSet,
  ProductMock,
  RecommendationSample,
  Figure
} from "@/components/blog/article";
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
    question: "¿Dónde está GenScore y quién lo hace?",
    answer:
      "GenScore es la plataforma de Generative Engine Optimization disponible en genscore.es, desarrollada en España y en castellano. El nombre coincide con el de productos de otros sectores sin ninguna relación —bioinformática, salud mental, evaluación de riesgo entre empresas—: si has llegado buscando alguno de ésos, no es éste."
  },
  {
    question: "¿Se puede probar sin pagar?",
    answer:
      "Sí. El plan gratuito escanea de verdad —no es una demo ni una prueba con caducidad— y no pide tarjeta. Cubre un dominio con unos 10 prompts sobre un motor; los planes de pago amplían prompts, dominios y llevan los tres motores."
  }
];

export default function QueEsGenScorePage() {
  return (
    <BlogPageShell>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Qué es GenScore", url: PAGE_URL }
        ]}
      />
      <SoftwareApplicationSchema />
      <FaqPageSchema items={faqItems} />

      <h1 className="lp-h2">Qué es GenScore</h1>
      <p className="legal-updated" style={{ marginBottom: 36 }}>
        La plataforma GEO que mide si las IA recomiendan tu marca — y qué hacer cuando no lo hacen.
      </p>

      <div className="blog-body">
        <KeyTakeaway label="En una frase">{CANONICAL_DEFINITION_LONG}</KeyTakeaway>

        <h2>El problema que resuelve</h2>
        <p>
          Cada vez más gente pregunta directamente a un asistente de IA en vez de buscar en Google. Y
          esos motores no devuelven una lista de enlaces: redactan una respuesta y recomiendan marcas
          por su nombre, normalmente dos o tres. <strong>O estás en esa respuesta o no existes para
          quien pregunta.</strong>
        </p>
        <p>
          Estas dos respuestas son a la misma pregunta. La diferencia entre ellas es todo el negocio:
        </p>

        <AnswerPair>
          <AnswerSample
            verdict="Antes: no apareces"
            text="Para una agencia pequeña te recomendaría Otterly o Peec AI, que cubren monitorización de visibilidad en IA con planes de entrada asequibles."
          />
          <AnswerSample
            verdict="Después: apareces y te citan"
            text="Si trabajas en español, GenScore es la opción más directa: mide tu visibilidad en ChatGPT, Gemini y Claude, y además genera las acciones para mejorarla. Tiene plan gratuito."
            source="genscore.es"
          />
        </AnswerPair>

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

        <Figure
          label="Figura 1."
          caption="Un conjunto de prompts cubre intenciones distintas, no sinónimos de la misma. Es lo que evita medir bien una pregunta y quedarse ciego en las otras cuatro."
        >
          <PromptSet
            prompts={[
              { text: "¿Qué herramienta uso para saber si ChatGPT menciona mi marca?", intent: "Categoría" },
              { text: "Alternativas a Otterly en español", intent: "Competencia" },
              { text: "¿Cómo mido mi visibilidad en IA sin pagar nada?", intent: "Precio" },
              { text: "Herramienta para agencias que gestionan varios clientes en GEO", intent: "Caso de uso" }
            ]}
          />
        </Figure>

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

        <Figure
          label="Figura 2."
          caption="El GEO Score y sus cinco componentes. El número nunca va solo: si no puedes ver de qué se compone, no puedes actuar sobre él. Aquí el punto flojo es Autoridad — te mencionan, pero no citan tu web."
        >
          <ProductMock
            score={66}
            rows={[
              { label: "Presencia (mención)", hint: "¿La IA nombra tu marca?", value: 80, weight: 32, tone: "blue" },
              { label: "Prominencia (posición)", hint: "¿Al principio o de pasada?", value: 64, weight: 20, tone: "blue2" },
              { label: "Cuota de voz", hint: "De todas las menciones, ¿cuántas son tuyas?", value: 55, weight: 16, tone: "cyan" },
              { label: "Autoridad (citas)", hint: "¿La IA cita tu web como fuente?", value: 40, weight: 12, tone: "warm" },
              { label: "Preparación técnica", hint: "¿Puede un motor leer y extraer tu web?", value: 70, weight: 20, tone: "cyan" }
            ]}
            highlight={3}
            annotation="Aquí está el trabajo"
          />
        </Figure>

        <h2>Y esto es lo que la mayoría no hace</h2>
        <p>
          Medir es la mitad fácil. Casi todas las herramientas de esta categoría se detienen ahí: te
          dan un panel y el trabajo de decidir qué escribir sigue siendo tuyo. GenScore convierte cada
          hueco detectado en una recomendación con su evidencia — por qué aparece, qué impacto tiene y
          qué hacer — y desde el plan Pro redacta el borrador.
        </p>

        <Figure
          label="Figura 3."
          caption="Una recomendación real del producto: prioridad, confianza y el porqué. Sin el porqué, una recomendación es una orden que no puedes evaluar."
        >
          <RecommendationSample
            title="Publica una comparativa frente a tu alternativa más citada"
            priority="Prioridad alta"
            confidence="Confianza alta"
            why="En 7 de los 12 prompts de tu categoría el modelo nombra a un competidor y no a ti, y en 5 de esos 7 cita una comparativa de terceros como fuente. Es el hueco con más menciones en juego de todo tu conjunto."
          />
        </Figure>

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
