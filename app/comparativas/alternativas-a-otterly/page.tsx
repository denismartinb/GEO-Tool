import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { COMPARATIVAS_BREADCRUMB } from "@/lib/comparativas";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { KeyTakeaway, Verdict, CompareTable, Pill, ArticleCta } from "@/components/blog/article";
import {
  ALTERNATIVES,
  LEAVE_REASONS,
  OTTERLY_PLANS,
  OTTERLY_STRENGTHS,
  RESEARCH_DATE
} from "@/lib/comparativas/alternativas-a-otterly";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";
const PAGE_URL = `${SITE_URL}/comparativas/alternativas-a-otterly`;

export const metadata: Metadata = contentMetadata({
  title: "Alternativas a Otterly en 2026: cuál elegir según tu caso — GenScore",
  description:
    "Cinco alternativas a Otterly comparadas por el motivo que te hace buscarlas: quince prompts en el plan de entrada, motores que se cobran aparte, diagnóstico sin ejecución o producto solo en inglés. GenScore resuelve tres de los cuatro y empieza gratis.",
  path: "/comparativas/alternativas-a-otterly"
});

const faqItems = [
  {
    question: "¿Cuál es la mejor alternativa a Otterly?",
    answer:
      "Depende del límite con el que hayas chocado, y por eso esta página está organizada así. Dicho eso, GenScore cubre tres de los cuatro motivos por los que se busca alternativa —precio de entrada, quedarse en el diagnóstico e idioma— y es la única con plan gratuito permanente y producto en castellano. El único caso en el que Otterly sigue siendo mejor opción es si necesitas comparar tu visibilidad país por país en muchos mercados a la vez."
  },
  {
    question: "¿Cuál es la alternativa más barata a Otterly?",
    answer:
      "GenScore, y no por poco: es la única de esta lista con plan gratuito permanente, sin tarjeta y sin caducidad, frente a los 29 $/mes de la entrada de Otterly. En el escalón de ~100 prompts la comparación es 179 €/mes de GenScore Pro —con ChatGPT, Gemini y Claude incluidos— frente a 189 $/mes de Otterly Standard más los add-ons de Gemini y Google AI Mode, que se cobran aparte en todos los niveles."
  },
  {
    question: "¿Puedo probar una alternativa sin dejar Otterly?",
    answer:
      "Sí, y es lo más sensato: cambiar de herramienta reinicia el histórico, porque las series acumuladas no se migran entre proveedores. Con el plan gratuito de GenScore puedes ir acumulando tu propio histórico en paralelo, sin tarjeta y sin fecha de caducidad, y decidir con datos tuyos en vez de con la tabla de nadie."
  },
  {
    question: "¿Qué hace GenScore que Otterly no haga?",
    answer:
      "Tres cosas concretas. Primera: entra en la fase de solución — genera el borrador de FAQ, datos estructurados y briefs desde el plan Pro, mientras que Otterly termina en monitorización, auditoría y reporting. Segunda: incluye ChatGPT, Gemini y Claude en todos los planes de pago sin add-ons, mientras que en Otterly Gemini y Google AI Mode se cobran aparte en todos los niveles. Tercera: es un producto en castellano, interfaz y soporte, no una herramienta en inglés con el equipo traduciendo."
  }
];

function itemListSchema() {
  const json = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Alternativas a Otterly en 2026",
    itemListElement: ALTERNATIVES.map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: a.name,
      url: a.url
    }))
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

function reasonLabel(id: string): string {
  return LEAVE_REASONS.find((r) => r.id === id)?.shortLabel ?? id;
}

export default function AlternativasAOtterlyPage() {
  return (
    <BlogPageShell breadcrumb={COMPARATIVAS_BREADCRUMB}>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Comparativas", url: `${SITE_URL}/comparativas` },
          { name: "Alternativas a Otterly", url: PAGE_URL }
        ]}
      />
      {itemListSchema()}
      <FaqPageSchema items={faqItems} />

      <h1 className="lp-h2">Alternativas a Otterly en 2026</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        Datos consultados el {RESEARCH_DATE}. Las cifras de Otterly proceden de fuentes públicas de
        terceros y son orientativas — confírmalas en otterly.ai antes de decidir.
      </p>

      <div className="blog-body">
        <KeyTakeaway label="En dos frases">
          Otterly monitoriza bien, pero su plan de entrada son quince prompts y los motores que más
          te importan se cobran aparte: por eso casi todo el mundo que busca alternativas ha chocado
          con el precio, con la cobertura real o con que la herramienta te deja con el diagnóstico en
          la mano y sin nada que hacer con él. <strong>GenScore resuelve tres de esos cuatro
          límites</strong> — empieza gratis y sin tarjeta, incluye ChatGPT, Gemini y Claude en todos
          los planes de pago sin add-ons, y es la única de esta lista que además redacta la solución
          en castellano.
        </KeyTakeaway>

        <h2>Qué hace bien Otterly, y a quién le sirve</h2>
        <p>
          Empecemos por lo justo: Otterly no es una mala herramienta, y si te vas conviene saber qué
          dejas. Lo que casi nunca se cuenta es a quién le sirve de verdad cada una de sus ventajas.
        </p>
        <ul>
          {OTTERLY_STRENGTHS.map((s) => (
            <li key={s.claim}>
              <strong>{s.claim}</strong> {s.context}
            </li>
          ))}
        </ul>
        <p>
          Resumido: la lista de arriba es sólida si vendes en muchos países a la vez. Si tu negocio
          vive en España o en un puñado de mercados hispanohablantes con el mismo dominio, tres de
          esas cuatro ventajas son cobertura que pagas y no usas.
        </p>

        <h2>El dato que explica casi todas las salidas: la escalera de prompts</h2>
        <p>
          El precio de Otterly no escala por funciones, escala por cuántas consultas puedes vigilar. Y
          los escalones son grandes:
        </p>
        <CompareTable>
          <table>
            <tbody>
              <tr>
                <th>Plan</th>
                <th>Precio</th>
                <th>Prompts incluidos</th>
              </tr>
              {OTTERLY_PLANS.map((plan) => (
                <tr key={plan.plan}>
                  <td>
                    <strong>{plan.plan}</strong>
                  </td>
                  <td>{plan.price}</td>
                  <td>{plan.prompts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CompareTable>
        <p>
          Los 29 $ de la puerta de entrada compran quince prompts. Para una marca con dos líneas de
          producto y algo de vocabulario propio, quince consultas se agotan enseguida — y el escalón
          siguiente multiplica la factura por 6,5. Encima, Google AI Mode y Gemini se cobran aparte en
          todos los niveles, así que el precio con el que comparaste no es el que acabas pagando.
        </p>

        <h2>Los cuatro motivos reales para buscar alternativa</h2>
        <p>
          Cada uno lleva a una herramienta distinta. Identifica el tuyo antes de mirar la lista, porque
          elegir por ranking general es cómo se acaba pagando el triple por resolver un problema que no
          se tenía:
        </p>
        {LEAVE_REASONS.map((reason, i) => (
          <div key={reason.id}>
            <h3>
              {i + 1}. {reason.title}
            </h3>
            <p>{reason.detail}</p>
          </div>
        ))}

        <h2>Las alternativas, y qué resuelve cada una</h2>
        <CompareTable>
          <table>
            <tbody>
              <tr>
                <th>Alternativa</th>
                <th>Resuelve</th>
                <th>Precio orientativo</th>
                <th>Español</th>
              </tr>
              {ALTERNATIVES.map((alt) => (
                <tr key={alt.slug}>
                  <td>
                    <strong>{alt.name}</strong>
                  </td>
                  <td>
                    {alt.solves.map((id) => (
                      <Pill key={id} tone="si">
                        {reasonLabel(id)}
                      </Pill>
                    ))}
                  </td>
                  <td>{alt.pricingNote}</td>
                  <td>{alt.spanishSupport}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CompareTable>

        {ALTERNATIVES.map((alt) => (
          <div className="tool-profile-card" key={alt.slug}>
            <h3>{alt.name}</h3>
            <p>{alt.oneLiner}</p>
            <p>
              <strong>Dónde no llega:</strong> {alt.tradeoff}
            </p>
            {alt.comparisonHref && (
              <p>
                <Link href={alt.comparisonHref}>Ver la comparativa completa GenScore vs {alt.name}</Link>
              </p>
            )}
          </div>
        ))}

        <Verdict title="Por qué GenScore es la respuesta en tres de los cuatro casos" badge="Cuándo elegir GenScore">
          Si has chocado con el tope de prompts, el plan gratuito permanente te deja comprobar si te
          compensa <strong>sin pagar 189 $ para averiguarlo</strong> y sin dar una tarjeta. Si lo que
          te frena no es medir sino ejecutar, el generador de soluciones redacta el borrador —FAQ,
          datos estructurados, briefs— desde el plan Pro: es donde el resto de esta lista se detiene,
          incluida Otterly. Y si tu equipo trabaja en castellano, es la única con interfaz y soporte
          nativos, sin traducir un panel en inglés cada mañana. Al escalón de ~100 prompts, Pro cuesta
          179 €/mes con los tres motores dentro, frente a 189 $ más add-ons.
        </Verdict>

        <p>
          <strong>Una cautela que vale para cualquier cambio, no solo hacia aquí:</strong> cambiar de
          herramienta reinicia el histórico, porque las series acumuladas no se migran entre
          proveedores. Es un argumento para empezar cuanto antes en la herramienta en la que te vas a
          quedar, no para aguantar en una que ya se te queda corta — y es la razón de que el plan
          gratuito de GenScore no caduque: puedes ir acumulando histórico en paralelo antes de mover
          nada.
        </p>

        <h2>Preguntas frecuentes</h2>
        {faqItems.map((item) => (
          <div key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </div>
        ))}

        <h2>Metodología</h2>
        <p>
          Los datos de GenScore vienen de los planes reales del producto, la misma fuente que usa la
          página de <Link href="/pricing">Precios</Link>. Los de Otterly proceden de agregadores de
          reseñas de terceros consultados en la fecha indicada arriba: su página de precios no es
          accesible desde nuestro entorno, así que ninguna de sus cifras viene de fuente primaria. Se
          publican porque dos fuentes independientes entre sí coinciden y porque cuadran con lo que ya
          investigamos para la{" "}
          <Link href="/comparativas/genscore-vs-otterly">comparativa 1:1 con Otterly</Link>, no porque
          las hayamos podido verificar en origen. Los precios de Semrush y Ahrefs se dan como
          estructura (módulo + suite) y no como cifra cerrada, porque las fuentes públicas se
          contradicen entre sí. Si detectas un dato desactualizado, dínoslo y lo corregimos.
        </p>

        <ArticleCta
          title="Antes de pagar el siguiente escalón, mira cuánto necesitas de verdad"
          text="Lanza un escaneo gratuito con GenScore y compara con datos propios, no con la tabla de nadie. Sin tarjeta."
        />
      </div>
    </BlogPageShell>
  );
}
