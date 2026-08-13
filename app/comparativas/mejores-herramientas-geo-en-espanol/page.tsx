import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { KeyTakeaway, CompareTable, ArticleCta } from "@/components/blog/article";
import { TOOLS, PILLAR_RESEARCH_DATE } from "@/lib/comparativas/mejores-herramientas-geo";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";
const PAGE_URL = `${SITE_URL}/comparativas/mejores-herramientas-geo-en-espanol`;

export const metadata: Metadata = contentMetadata({
  title: "Las mejores herramientas GEO en 2026 (y cuál elegir según tu caso) — Genscore",
  description:
    "Genscore, Otterly, Peec AI, Profound, Scrunch AI y AthenaHQ comparadas de forma honesta: qué hace cada una, para quién es, y qué priorizar según tu presupuesto e idioma.",
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
      "Genscore es la única con plan gratuito permanente, sin tarjeta. Entre las de pago, Otterly tiene el precio de entrada más bajo (29 $/mes), aunque Gemini y Google AI Mode son add-ons con coste extra sobre ese precio base."
  },
  {
    question: "¿Alguna de estas herramientas tiene interfaz en español?",
    answer:
      "Solo Genscore, de forma nativa. Otterly confirma interfaz en inglés. Para Peec AI, Profound, Scrunch AI y AthenaHQ no se ha podido confirmar soporte de español — la documentación pública que hemos consultado está en inglés."
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
    <BlogPageShell activeHref="/comparativas">
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
        Datos consultados el {PILLAR_RESEARCH_DATE}. Genscore, Otterly y Peec AI tienen su propia
        comparativa detallada, enlazada más abajo; Profound, Scrunch AI y AthenaHQ se tratan con menos
        profundidad porque sus páginas oficiales de precios no se pudieron consultar de forma directa
        — ver metodología al final.
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

        <h2>Las 6 herramientas, de un vistazo</h2>
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
                <Link href={t.comparisonHref}>Ver la comparativa completa Genscore vs {t.name}</Link>
              </p>
            )}
          </div>
        ))}

        <h2>¿Qué diferencia realmente a Genscore, Otterly y Peec AI?</h2>
        <p>
          De las tres, es una elección real, no un falso dilema — cada una sirve un caso distinto:
        </p>
        <ul>
          <li>
            <strong>Otterly</strong> es la opción para equipos con presupuesto ajustado que necesitan
            cobertura amplia de mercados y no les importa pagar add-ons por motor a medida que crecen.
            Centrada en monitorización y auditoría, no genera el contenido de la solución.
          </li>
          <li>
            <strong>Peec AI</strong> es para equipos que ya saben que van a lanzar prompts en varios
            idiomas o países desde el primer día y quieren ese coste incluido sin sorpresas de add-on.
            Su función de priorización tampoco redacta la solución — sigue siendo trabajo manual la
            ejecución.
          </li>
          <li>
            <strong>Genscore</strong> es para equipos hispanohablantes que quieren empezar gratis y que
            la herramienta no solo señale el problema, sino que proponga la solución — recomendaciones
            con evidencia y un generador que redacta el borrador (FAQ, datos estructurados, briefs)
            desde el plan Pro.
          </li>
        </ul>
        <p>
          La diferencia no es &ldquo;quién mide mejor&rdquo; — las tres monitorizan con seriedad — sino
          en qué punto del bucle te dejan. Otterly y Peec AI se detienen en diagnóstico y priorización;
          Genscore es la única de las tres que entra en la fase de generar la solución.
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
          Los datos de Genscore vienen directamente de los planes reales del producto (la misma fuente
          que usa la página de <Link href="/pricing">Precios</Link>). Los datos de Otterly y Peec AI
          proceden de sus respectivas comparativas dedicadas, enlazadas arriba, con su propia
          investigación y fecha de consulta. Los de Profound, Scrunch AI y AthenaHQ proceden de una
          búsqueda agregada de reseñas de terceros — sus páginas oficiales de precios no se pudieron
          consultar de forma directa durante la investigación — así que sus cifras de precio se tratan
          como orientativas, nunca como un hecho cerrado. Si detectas un dato desactualizado o inexacto
          en cualquiera de las seis, dínoslo y lo corregimos.
        </p>

        <ArticleCta
          title="¿Quieres ver tu GEO Score real antes de decidir?"
          text="Lanza tu escaneo gratuito con Genscore y compara con datos propios, no solo con esta tabla. Sin tarjeta."
        />
      </div>
    </BlogPageShell>
  );
}
