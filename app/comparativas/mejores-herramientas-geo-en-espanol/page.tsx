import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { COMPARATIVAS_BREADCRUMB } from "@/lib/comparativas";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { KeyTakeaway, CompareTable, ArticleCta } from "@/components/blog/article";
import { TOOLS, PILLAR_RESEARCH_DATE } from "@/lib/comparativas/mejores-herramientas-geo";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";
const PAGE_URL = `${SITE_URL}/comparativas/mejores-herramientas-geo-en-espanol`;

export const metadata: Metadata = contentMetadata({
  title: "Las mejores herramientas GEO en 2026 (y cuál elegir según tu caso) — GenScore",
  description:
    "GenScore, CreceRank, Otterly, Peec AI, Profound, Mentio, Scrunch AI y AthenaHQ comparadas: qué hace cada una, para quién es, y cuál elegir según tus motores, tu presupuesto y tu idioma.",
  path: "/comparativas/mejores-herramientas-geo-en-espanol"
});

const faqItems = [
  {
    question: "¿Necesito varias herramientas GEO a la vez, o solo una?",
    answer:
      "Con una basta para empezar. Todas las de esta lista miden lo mismo en el fondo — presencia, posición y citación en motores generativos — así que el criterio de elección no es \"cuál mide mejor\", sino en qué punto del proceso te dejan (solo diagnóstico, o también la solución) y si tu equipo trabaja en español."
  },
  {
    question: "¿Cuál es la más barata para empezar?",
    answer:
      "GenScore, y es la única de las ocho con plan gratuito permanente y sin tarjeta: puedes escanear antes de decidir si pagas algo. Entre las de pago, Otterly y CreceRank arrancan alrededor de 29 $/mes, aunque en Otterly Gemini y Google AI Mode son add-ons con coste extra sobre ese precio base, así que ese número no es el que acabas pagando si necesitas esos motores."
  },
  {
    question: "¿Alguna de estas herramientas tiene interfaz en español?",
    answer:
      "Dos de las ocho: GenScore y CreceRank. Otterly confirma interfaz en inglés, y para Peec AI, Profound, Scrunch AI, AthenaHQ y Mentio no se ha podido confirmar soporte de español — la documentación pública que hemos consultado está en inglés. Entre las dos que sí lo tienen, la diferencia está en los motores y en dónde te dejan: GenScore ejecuta Gemini y Claude además de ChatGPT, y es la única de las dos que genera el borrador de la solución además de medir, con escaneo gratuito permanente para probarlo sin tarjeta."
  }
];

function itemListSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Las mejores herramientas GEO en 2026",
    itemListElement: TOOLS.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      url: t.url
    }))
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

export default function MejoresHerramientasGeoPage() {
  return (
    <BlogPageShell activeHref="/comparativas" breadcrumb={COMPARATIVAS_BREADCRUMB}>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Comparativas", url: `${SITE_URL}/comparativas` },
          { name: "Mejores herramientas GEO", url: PAGE_URL }
        ]}
      />
      {itemListSchema()}
      <FaqPageSchema items={faqItems} />

      <h1 className="lp-h2">Las mejores herramientas GEO en 2026</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        Datos consultados el {PILLAR_RESEARCH_DATE}. GenScore, Otterly y Peec AI tienen su propia
        comparativa detallada, enlazada más abajo; CreceRank, Mentio, Profound, Scrunch AI y AthenaHQ se
        tratan con menos profundidad porque sus páginas oficiales de precios no se pudieron consultar de
        forma directa — ver metodología al final.
      </p>

      <div className="blog-body">
        <KeyTakeaway label="En una frase">
          Todas las herramientas de esta lista miden si un motor generativo menciona, posiciona o cita
          tu marca — la diferencia real entre ellas no es cuánto miden, sino <strong>en qué punto del
          proceso te dejan</strong> (solo diagnóstico, o también la solución) y si tu equipo puede
          trabajar en su idioma nativo.
        </KeyTakeaway>

        <h2>¿Por qué necesitas una herramienta GEO?</h2>
        <p>
          Cada vez más gente pregunta directamente a ChatGPT, Gemini o Claude en vez de buscar en
          Google — y esos motores no devuelven una lista de enlaces, elaboran una respuesta y
          recomiendan marcas por su nombre. Puedes tener un SEO excelente y aun así ser invisible en
          esa respuesta, porque es una señal distinta: no se mide con un ranking, sino con si el modelo
          te menciona, en qué posición, y si respalda esa mención con una cita real a tu web. Una
          herramienta GEO existe para hacer eso medible — puedes leer la explicación completa en{" "}
          <Link href="/glosario/geo">qué es el GEO</Link>.
        </p>
        <p>
          El problema de medirlo a mano es el mismo de siempre: una consulta aislada no representa la
          realidad, porque cada cliente pregunta con palabras distintas y las respuestas cambian con el
          tiempo. Estas herramientas automatizan ese seguimiento repetido — la pregunta que de verdad
          importa al elegir una no es cuál mide mejor, sino cuál encaja con tu presupuesto, tu idioma y
          qué haces después de ver el resultado.
        </p>

        <h2>Las 8 herramientas, de un vistazo</h2>
        <CompareTable>
          <table>
            <tbody>
              <tr>
                <th>Herramienta</th>
                <th>Para quién</th>
                <th>Precio orientativo</th>
                <th>Español</th>
              </tr>
              {TOOLS.map((t) => (
                <tr key={t.slug}>
                  <td>
                    <strong>{t.name}</strong>
                  </td>
                  <td>{t.bestFor}</td>
                  <td>{t.pricingNote}</td>
                  <td>{t.spanishSupport}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CompareTable>

        {TOOLS.map((t) => (
          <div className="tool-profile-card" key={t.slug}>
            <h3>{t.name}</h3>
            <p>{t.oneLiner}</p>
            <p>{t.distinctiveFeature}</p>
            {t.context && <p>{t.context}</p>}
            {t.comparisonHref && (
              <p>
                <Link href={t.comparisonHref}>Ver la comparativa completa GenScore vs {t.name}</Link>
              </p>
            )}
          </div>
        ))}

        <h2>Si trabajas en español, la decisión se reduce a dos</h2>
        <p>
          De las ocho, solo <strong>GenScore y CreceRank</strong> son productos en castellano. Las otras
          seis obligan a que alguien de tu equipo traduzca un panel en inglés todos los días,
          normalmente la misma persona que escribe el contenido. Así que para un equipo hispanohablante
          la comparación real es entre dos, y se decide en dos preguntas concretas:
        </p>
        <ul>
          <li>
            <strong>¿Dónde preguntan tus clientes?</strong> GenScore ejecuta ChatGPT, Gemini y Claude —
            los tres en todos los planes de pago, sin add-ons. CreceRank cubre ChatGPT, Perplexity y AI
            Overviews. No es &ldquo;cuál cubre más&rdquo;, son conjuntos distintos: si tu tráfico viene
            de asistentes conversacionales, el nuestro; si te juegas la partida en resultados de Google
            con IA, el suyo.
          </li>
          <li>
            <strong>¿Qué haces con el informe?</strong> Aquí la diferencia no es de matiz. CreceRank
            prioriza accionables; GenScore además <strong>redacta el borrador</strong> — FAQ, datos
            estructurados y briefs — desde el plan Pro. Es el punto donde se detienen las ocho
            herramientas de esta lista menos una.
          </li>
        </ul>
        <p>
          Y hay una tercera diferencia que no necesita argumentación: <strong>GenScore es la única de
          las ocho con escaneo gratuito permanente y sin tarjeta</strong>. Puedes comprobar las dos
          respuestas de arriba con tus propios prompts, sobre tu propio dominio, antes de pagar nada a
          nadie.
        </p>
        <p>
          Del resto, <strong>Otterly</strong> sigue siendo razonable si necesitas cobertura de muchos
          mercados y no te importa pagar add-ons por motor según creces, y <strong>Peec AI</strong> si
          vas a lanzar prompts en varios países desde el primer día. Ninguna de las dos genera el
          contenido de la solución, y ninguna está en castellano.
        </p>

        <h2>Qué mirar antes de decidir, más allá de la tabla</h2>
        <p>
          Ninguna tabla comparativa sustituye a probar la herramienta con tus propios prompts, pero
          estas son las preguntas que de verdad cambian la decisión según nuestra investigación de las
          seis:
        </p>
        <ul>
          <li>
            <strong>¿El precio de entrada incluye los motores que te importan, o los añades aparte?</strong>{" "}
            Varias herramientas de esta lista cobran un add-on por cada motor adicional al plan base —
            confirma qué está incluido de verdad antes de comparar precios entre sí.
          </li>
          <li>
            <strong>¿Necesitas cobertura multi-país, o solo un mercado?</strong> Si monitorizas una sola
            región, esa diferencia entre herramientas deja de importar y el precio de entrada pesa más
            en la decisión.
          </li>
          <li>
            <strong>¿Qué haces tú mismo con el resultado?</strong> La mayoría de estas herramientas se
            detienen en el diagnóstico — decidir qué contenido publicar o reescribir sigue siendo
            trabajo tuyo, salvo donde se indica lo contrario arriba.
          </li>
          <li>
            <strong>¿Tu equipo necesita trabajar en español?</strong> Es la variable con menos margen de
            duda de toda la lista: solo una de las seis lo confirma.
          </li>
        </ul>

        <h2>Preguntas frecuentes</h2>
        {faqItems.map((item) => (
          <div key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </div>
        ))}

        <h2>Metodología</h2>
        <p>
          Los datos de GenScore vienen directamente de los planes reales del producto (la misma fuente
          que usa la página de <Link href="/pricing">Precios</Link>). Los datos de Otterly y Peec AI
          proceden de sus respectivas comparativas dedicadas, enlazadas arriba, con su propia
          investigación y fecha de consulta. Los de CreceRank, Mentio, Profound, Scrunch AI y AthenaHQ proceden de una
          búsqueda agregada de reseñas de terceros — sus páginas oficiales de precios no se pudieron
          consultar de forma directa durante la investigación — así que sus cifras de precio se tratan
          como orientativas, nunca como un hecho cerrado. Si detectas un dato desactualizado o inexacto
          en cualquiera de las seis, dínoslo y lo corregimos.
        </p>

        <ArticleCta
          title="¿Quieres ver tu GEO Score real antes de decidir?"
          text="Lanza tu escaneo gratuito con GenScore y compara con datos propios, no solo con esta tabla. Sin tarjeta."
        />
      </div>
    </BlogPageShell>
  );
}
