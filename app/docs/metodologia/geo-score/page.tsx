import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageShell } from "@/components/docs/docs-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { DefinedTermSchema } from "@/components/seo/defined-term-schema";
import { SITE_ORIGIN } from "@/lib/brand/canonical-definition";
import {
  GEO_SCORE_ALTERNATE_PATHS,
  GEO_SCORE_CANONICAL_URL,
  GEO_SCORE_DEFINITION,
  GEO_SCORE_TERM_ID
} from "@/lib/brand/geo-score-definition";
import { getDocPage } from "@/lib/docs/nav";
import { contentMetadata } from "@/lib/seo/metadata";

const SLUG = "metodologia/geo-score";
const page = getDocPage(SLUG)!;

export const metadata: Metadata = contentMetadata({
  title: `${page.title} — GenScore`,
  description: page.description,
  path: `/docs/${SLUG}`
});

export default function GeoScoreMethodologyPage() {
  return (
    <DocsPageShell activeSlug={SLUG}>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.genscore.es" },
          { name: "Docs", url: "https://www.genscore.es/docs" },
          { name: page.title, url: `https://www.genscore.es/docs/${SLUG}` }
        ]}
      />
      {/*
        SEO-POS-1 Fase E, E4. Esta página es el documento de referencia del
        término, y aquí lo declara: mismo `@id` que emiten el glosario y el
        artículo, `url` apuntando a sí misma, las otras dos como `sameAs`. Ya
        era la canónica de hecho —seis artículos y `/docs/informes/overview`
        mandan aquí al lector— pero nada lo decía en un formato que un motor
        pudiera leer, así que las tres URLs competían por el mismo término.
      */}
      <DefinedTermSchema
        term="GEO Score"
        description={GEO_SCORE_DEFINITION}
        url={GEO_SCORE_CANONICAL_URL}
        inDefinedTermSetUrl={`${SITE_ORIGIN}/glosario`}
        id={GEO_SCORE_TERM_ID}
        sameAs={GEO_SCORE_ALTERNATE_PATHS.map((path) => `${SITE_ORIGIN}${path}`)}
      />
      <h1>{page.title}</h1>
      <p className="docs-updated">Actualizado el 13 de agosto de 2026</p>

      <p>
        El GEO Score (0-100) resume en un solo número varias señales que no significan lo mismo por
        separado. No es una media simple: cada una mide algo distinto y no todas pesan igual, y cuando
        alguna no se puede medir en un escaneo concreto se deja fuera y se dice — nunca se rellena con un
        valor inventado.
      </p>

      <h2>Qué mira</h2>
      <p>
        En orden de importancia dentro del número, de más a menos. Ese orden no es arbitrario: reproduce
        cómo se razona un análisis de visibilidad — primero si estás en la conversación, después con qué
        protagonismo, después cómo te va frente al conjunto, y por último si hay evidencia real detrás.
      </p>
      <div className="docs-table-wrap">
      <table>
        <tbody>
          <tr>
            <th>Componente</th>
            <th>Qué mide</th>
          </tr>
          <tr>
            <td>Presencia</td>
            <td>
              ¿Aparece tu marca en la respuesta, sí o no? La señal más fundamental, y la que más manda en el
              número: sin mención no hay nada que interpretar.
            </td>
          </tr>
          <tr>
            <td>Prominencia</td>
            <td>Cuando aparece, ¿lo hace pronto y con protagonismo, o como una mención tardía?</td>
          </tr>
          <tr>
            <td>Cuota de voz</td>
            <td>De toda la atención que la IA reparte entre marcas mencionadas, cuánta es tuya.</td>
          </tr>
          <tr>
            <td>Autoridad</td>
            <td>¿Esa presencia está respaldada por una cita o fuente real, o es solo una mención suelta?</td>
          </tr>
          <tr>
            <td>Diagnóstico técnico</td>
            <td>
              La salud técnica de tu web para los motores de IA. Se mide sin IA de por medio, así que el
              mismo sitio da siempre el mismo número — es el único que no depende de lo que conteste un
              modelo. Si tu web no se puede leer bien, ninguna otra mejora funciona: por eso
              entra dentro del score y no al lado.
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      <h2>Qué pasa cuando algo no se puede medir</h2>
      <p>
        La <strong>prominencia</strong> solo existe cuando la marca aparece mencionada — si no aparece en
        ningún prompt del escaneo, no hay posición que promediar y esa señal se queda fuera. La{" "}
        <strong>cuota de voz</strong> sigue la misma regla: si ni tu marca ni ningún competidor rastreado
        aparece mencionado en todo el escaneo, no hay voz que repartir — se descarta en vez de asumir un
        valor por defecto para una marca invisible en un mercado vacío.
      </p>
      <p>
        La regla, en una frase: <strong>lo que no se ha podido medir se excluye y se declara, nunca se
        sustituye por un cero.</strong>{" "}
        Un cero es una afirmación —&laquo;lo medimos y salió lo peor
        posible&raquo;— y usarlo para decir &laquo;no lo sabemos&raquo; es la forma más fácil de mentir con
        una métrica sin falsear un solo dato.
      </p>

      <h2>Por qué el número no salta de un escaneo a otro</h2>
      <p>
        El GEO Score que ves no sale de un escaneo suelto, sino de la <strong>tendencia de tus últimas
        mediciones comparables</strong>. Los motores de IA consultan la web en vivo cada vez que responden,
        así que dos escaneos idénticos ven un internet distinto y sus resultados oscilan aunque no hayas
        cambiado nada. Publicar una sola observación como si fuera la respuesta convertía ese ruido en
        saltos de decenas de puntos.
      </p>
      <p>
        Tiene un coste que conviene conocer: <strong>una mejora real tarda un par de escaneos en reflejarse
        del todo</strong> en el número principal. A cambio, cuando sube es porque ha subido de verdad.
      </p>
      <p>
        Esa tendencia nunca mezcla escaneos que no midan lo mismo. Si cambias prompts, motores o plan, o si
        cambia la metodología del score, el número vuelve a ser el de tu último escaneo hasta que vuelva a
        haber mediciones comparables entre sí.
      </p>

      <h2>Confianza del escaneo</h2>
      <p>
        Cada GEO Score lleva una etiqueta de confianza, y depende de cuántas respuestas reales lo
        sostienen: cuantas más, más fiable. Con una muestra pequeña, una sola respuesta mueve el resultado
        demasiado como para sacar conclusiones — la etiqueta lo refleja en vez de aparentar una precisión
        que la muestra no tiene.
      </p>

      <h2>Franjas de madurez</h2>
      <p>
        El indicador visual clasifica el score en tres franjas —«competitivo», «emergente» e «inicial»—
        para que un número suelto signifique algo de un vistazo. La franja solo se publica cuando la muestra
        da para sostenerla: con pocas respuestas verás el número, pero no la etiqueta.
      </p>

      {/*
        E4: el enlazado que faltaba en la dirección que faltaba. El glosario y
        el artículo ya mandaban aquí; esta página no devolvía a ninguno de los
        dos, así que el lector que quería la versión corta o la guía tenía que
        buscarlas. Con los tres enlazados en las dos direcciones, la relación
        entre las tres URLs es explícita también para quien no lee schema.
      */}
      {/*
        `glossary-related` reutilizada a propósito fuera de `/glosario`: es el
        bloque de "sigue explorando" del sitio —separador arriba, lista de
        enlaces— y aquí cumple exactamente ese papel. Su `h2` lo gana
        `.docs-content h2`, que va después en la hoja, así que el titular
        conserva el tamaño de los demás de esta página.
      */}
      <div className="glossary-related">
        <h2>Esta misma métrica, explicada de otras formas</h2>
        <p>Esta página es la referencia: si algo se contradice, manda lo que diga aquí.</p>
        <ul>
          <li>
            <Link href="/glosario/geo-score">Glosario: el GEO Score en una definición corta</Link>
          </li>
          <li>
            <Link href="/blog/que-es-el-geo-score">
              Artículo: qué es el GEO Score y cómo leerlo sin engañarte
            </Link>
          </li>
        </ul>
      </div>
    </DocsPageShell>
  );
}
