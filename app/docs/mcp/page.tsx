import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageShell } from "@/components/docs/docs-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { getDocPage } from "@/lib/docs/nav";
import { contentMetadata } from "@/lib/seo/metadata";
import { SUPPORT_EMAIL } from "@/lib/support";

const SLUG = "mcp";
const page = getDocPage(SLUG)!;
const ENDPOINT = "https://www.genscore.es/api/mcp";
/** MCP-ACQUISITION-1 (log §425): ChatGPT has its own address. */
const CHATGPT_ENDPOINT = "https://www.genscore.es/api/mcp/chatgpt";

export const metadata: Metadata = contentMetadata({
  title: `${page.title} · GenScore`,
  description: page.description,
  path: `/docs/${SLUG}`
});

/**
 * MCP-SERVER-1 (log §418): setup and tool list of GenScore's MCP server.
 * Both directories ask for a public documentation URL; this is it.
 */
export default function McpDocPage() {
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
      <p className="docs-updated">Actualizado el 1 de noviembre de 2026</p>

      <p>
        GenScore tiene un servidor MCP: conéctalo a Claude o a ChatGPT y pregunta en el chat cómo te ven la IA y Google.
        Las cifras son las mismas que ves en la consola y en la extensión de Chrome. Es de solo lectura: desde el chat
        no se cambia nada de tu cuenta.
      </p>

      <h2>Cómo conectarlo</h2>
      <ul>
        <li>
          <strong>Claude</strong>: en Ajustes, Conectores, añade un conector personalizado con la dirección{" "}
          <code>{ENDPOINT}</code>. Al usar una herramienta de tu cuenta, Claude te pedirá entrar en GenScore.
        </li>
        <li>
          <strong>ChatGPT</strong>: en Ajustes, Apps y conectores, crea una con la dirección{" "}
          <code>{CHATGPT_ENDPOINT}</code> y autenticación OAuth.
        </li>
      </ul>
      <p>
        Al conectar verás una pantalla de GenScore que dice qué app pide acceso y a qué cuenta. Pulsa Permitir y vuelves
        al chat.
      </p>

      <h2>Qué puedes preguntar</h2>
      <div className="docs-table-wrap">
        <table>
          <tbody>
            <tr>
              <th>Herramienta</th>
              <th>Qué contesta</th>
              <th>Cuenta</th>
            </tr>
            <tr>
              <td>listar_dominios</td>
              <td>Tus dominios y tu plan.</td>
              <td>Sí</td>
            </tr>
            <tr>
              <td>ver_dominio</td>
              <td>Puntuación GEO, en qué parte de las respuestas te nombra cada motor, marcas más nombradas y salud técnica.</td>
              <td>Sí</td>
            </tr>
            <tr>
              <td>ver_recomendaciones</td>
              <td>Lo primero que hacer, en orden, con su primer paso.</td>
              <td>Sí</td>
            </tr>
            <tr>
              <td>ver_competidores</td>
              <td>Qué marcas nombra más la IA en tus preguntas principales de búsqueda.</td>
              <td>Sí</td>
            </tr>
            <tr>
              <td>ver_prompts</td>
              <td>Tus prompts por tema y qué hizo cada motor con cada uno en el último escaneo.</td>
              <td>Sí</td>
            </tr>
            <tr>
              <td>ver_auditorias</td>
              <td>Tu web para la IA, para Google y para los agentes de compra, con los problemas que más puntos suman.</td>
              <td>Sí</td>
            </tr>
            <tr>
              <td>ver_posicion_google</td>
              <td>Clics, impresiones, puesto medio y búsquedas casi en la página 1, si has conectado Search Console.</td>
              <td>Sí</td>
            </tr>
            <tr>
              <td>revisar_pagina</td>
              <td>
                La revisión de la extensión de Chrome para cualquier página pública: si la IA puede leerla, cómo está para
                Google y si un agente entiende lo que vende, con qué arreglar y el código para pegar.
              </td>
              <td>No</td>
            </tr>
            <tr>
              <td>buscar_guias</td>
              <td>Lo que dicen las guías, los estudios y el glosario de GenScore sobre una duda, con el enlace a cada uno.</td>
              <td>No</td>
            </tr>
            <tr>
              <td>que_es_genscore</td>
              <td>Qué es GenScore, qué mide y cómo empezar.</td>
              <td>No</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Ejemplos: «¿Cómo va la visibilidad de marca.es en la IA?», «¿Qué hago primero esta semana?», «Revisa
        https://www.tuweb.es/precios», «¿Qué fuentes cita la IA?».
      </p>

      <h2>Qué datos se leen</h2>
      <p>
        Solo los de tu cuenta y solo para responder a lo que preguntas. GenScore no guarda tus conversaciones ni lo que
        pregunta el chat. <code>revisar_pagina</code> lee la página pública que le indiques, su robots.txt y su
        llms.txt desde los servidores de GenScore, como lo haría un bot, y nunca sigue sus enlaces. Más detalle en la{" "}
        <Link href="/privacidad">política de privacidad</Link>.
      </p>

      <h2>Cómo desconectarlo</h2>
      <p>
        En la consola, Ajustes, pestaña Cuenta, apartado Apps conectadas, pulsa Desconectar. También puedes quitarlo
        desde los ajustes de conectores de Claude o ChatGPT.
      </p>

      <h2>Soporte</h2>
      <p>
        Escríbenos a <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </DocsPageShell>
  );
}
