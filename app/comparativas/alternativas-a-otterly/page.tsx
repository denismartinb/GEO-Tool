import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
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
  title: "Alternativas a Otterly en 2026: cuál elegir según el límite que hayas encontrado — Genscore",
  description:
    "Cinco alternativas reales a Otterly, ordenadas por el motivo que te hace buscarlas: te quedaste sin prompts, los motores eran add-on, necesitas ejecutar o trabajas en español. Con lo que cada una NO resuelve.",
  path: "/comparativas/alternativas-a-otterly"
});

const faqItems = [
  {
    question: "¿Es Otterly una mala herramienta?",
    answer:
      "No. Es la entrada de pago más barata de la categoría, incluye usuarios ilimitados desde el plan de 29 $/mes, sigue más de 50 mercados y cubre motores que Genscore no ejecuta hoy, como Perplexity y Copilot. La pregunta útil no es si es buena, sino contra qué límite suyo has chocado — porque cada límite tiene una alternativa distinta, y en varios casos la respuesta correcta es quedarte donde estás."
  },
  {
    question: "¿Cuál es la alternativa más barata a Otterly?",
    answer:
      "Genscore es la única de esta lista con plan gratuito permanente y sin tarjeta, así que en precio de entrada no hay comparación posible. Ahora bien, si lo que necesitas son usuarios ilimitados por 29 $/mes, eso lo da Otterly y no lo da el plan gratuito de Genscore: los usuarios ilimitados llegan desde Starter."
  },
  {
    question: "¿Merece la pena cambiar solo por el precio?",
    answer:
      "Casi nunca, y menos a mitad de una medición. Cambiar de herramienta reinicia tu histórico: las series que llevas acumuladas no se migran entre proveedores, así que pierdes la comparación temporal, que es justo lo que hace útil a una herramienta GEO. Si el problema es el tope de prompts, cuenta primero cuántos necesitas de verdad — mucha gente descubre que le sobran con menos de los que creía."
  },
  {
    question: "¿Por qué debería fiarme de una comparativa escrita por un competidor?",
    answer:
      "No deberías fiarte del todo, y eso vale para esta página y para todas las que vas a encontrar buscando lo mismo: prácticamente todos los resultados de \"alternativas a Otterly\" los publica una herramienta rival. Lo que sí puedes hacer es exigir que cada afirmación sea comprobable. Aquí cada alternativa declara qué NO resuelve, incluida la nuestra, y las cifras llevan su fecha de consulta y su fuente para que las verifiques en destino."
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
    <BlogPageShell>
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
        Datos consultados el {RESEARCH_DATE} en fuentes públicas de terceros — la página de precios de
        Otterly no es accesible desde nuestro entorno, así que sus cifras son orientativas.
        Confírmalas en otterly.ai antes de decidir.
      </p>

      <div className="blog-body">
        <KeyTakeaway label="Léelo antes que nada">
          Esta página la escribe un competidor de Otterly. Igual que las otras diez que vas a encontrar
          buscando lo mismo — la diferencia es que aquí lo pone. Lo único que puedes hacer con
          cualquiera de ellas es exigir que cada afirmación sea comprobable, así que{" "}
          <strong>cada alternativa de esta lista declara también qué no resuelve</strong>, Genscore
          incluida, y toda cifra lleva su fecha y su fuente.
        </KeyTakeaway>

        <h2>Primero: en qué es mejor Otterly</h2>
        <p>
          Si has llegado buscando alternativas, lo más probable es que hayas chocado con un límite
          concreto y no con la herramienta entera. Conviene saber qué dejas atrás si te vas:
        </p>
        <ul>
          {OTTERLY_STRENGTHS.map((strength) => (
            <li key={strength}>{strength}</li>
          ))}
        </ul>
        <p>
          Dicho de otra forma: si lo que necesitas es meter a doce personas en la herramienta por 29 $
          al mes, o saber si te mencionan distinto en México que en España, esta página no tiene nada
          mejor que ofrecerte. Quedarte es la respuesta correcta.
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
              <strong>Qué no resuelve:</strong> {alt.tradeoff}
            </p>
            {alt.comparisonHref && (
              <p>
                <Link href={alt.comparisonHref}>Ver la comparativa completa Genscore vs {alt.name}</Link>
              </p>
            )}
          </div>
        ))}

        <Verdict title="Cuándo NO deberías cambiar" badge="La opción que nadie te vende">
          Cambiar de herramienta reinicia tu histórico: las series acumuladas no se migran entre
          proveedores, y la comparación temporal es justo lo que hace útil a una herramienta GEO. Si
          llevas cuatro meses midiendo con Otterly y tu queja es el precio, cuenta primero cuántos
          prompts necesitas de verdad — mucha gente descubre que le sobran con menos de los que creía.
          Ninguna de las cinco de esta lista te va a devolver esos cuatro meses.
        </Verdict>

        <Verdict title="Cuándo Genscore es la respuesta" badge="Cuándo elegir Genscore">
          Si has chocado con el tope de prompts y no quieres pagar 189 $ para averiguar si te compensa,
          el plan gratuito permanente te lo dice sin tarjeta. Si tu cuello de botella no es medir sino
          ejecutar, el generador de soluciones redacta el borrador (FAQ, datos estructurados, briefs)
          desde el plan Pro, que es donde el resto de esta lista se detiene. Y si tu equipo trabaja en
          castellano, es la única con interfaz y soporte nativos. Lo que no vas a encontrar aquí:
          Perplexity, Copilot ni desglose por país.
        </Verdict>

        <h2>Preguntas frecuentes</h2>
        {faqItems.map((item) => (
          <div key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </div>
        ))}

        <h2>Metodología</h2>
        <p>
          Los datos de Genscore vienen de los planes reales del producto, la misma fuente que usa la
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
          text="Lanza un escaneo gratuito con Genscore y compara con datos propios, no con la tabla de nadie. Sin tarjeta."
        />
      </div>
    </BlogPageShell>
  );
}
