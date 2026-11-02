"use client";

import { useState, type CSSProperties } from "react";
import { Ic } from "@/components/ins/ic";
import { Seg } from "@/components/ins/kit/seg";
import { aiViewHeadline, type AiView, type AiViewPage } from "@/lib/web-audit/ai-view";
import type { SitePlatform } from "@/lib/web-audit/page-checks";

/**
 * AI-VIEW-CONSOLE-1 (log §449): «Lo que lee la IA» in Auditoría GEO, the
 * console's version of the extension block. One row per audited page as an AI
 * bot receives it, and one fix for the whole domain, folded (Denis,
 * 2026-11-02: «integrada en el bloque, en desplegable, con menos texto»).
 * Every figure comes from `buildAiView`; the examples are examples.
 */

type Plat = "wordpress" | "shopify" | "next" | "other";

const PLATS: Record<Plat, { label: string; steps: string[]; file: string; code: string }> = {
  wordpress: {
    label: "WordPress",
    steps: [
      "Busca el plugin o bloque que pinta esas secciones (tablas de precios, pestañas, carruseles).",
      "Desactiva su carga diferida o «Ajax», o cámbialo por un bloque nativo (Columnas, Tabla, Lista).",
      "Si un plugin de caché «retrasa JavaScript», excluye esas secciones."
    ],
    file: "Bloque «HTML personalizado»",
    code: `<h2>Título de la sección</h2>\n<p>El texto que hoy carga el plugin, escrito aquí.</p>`
  },
  shopify: {
    label: "Shopify",
    steps: [
      "Lo que cargan las apps (reseñas, tablas, recomendaciones) suele ir por JavaScript.",
      "Pon el texto importante en la descripción del producto o en una sección del tema.",
      "Deja las apps para lo accesorio."
    ],
    file: "sections/contenido.liquid",
    code: `<section>\n  <h2>{{ section.settings.titulo }}</h2>\n  <p>{{ section.settings.texto }}</p>\n</section>`
  },
  next: {
    label: "React / Next.js",
    steps: [
      "Esas páginas se pintan en el navegador: genera su HTML en el servidor.",
      "En Next.js, quita \"use client\" de la página y carga los datos en el servidor, o genérala estática.",
      "En React sin Next, añade un prerender que guarde el HTML de cada ruta."
    ],
    file: "app/pagina/page.tsx",
    code: `// Sin "use client": la página se genera en el servidor\nexport default async function Pagina() {\n  const datos = await getDatos();\n  return (\n    <main>\n      <h1>{datos.titulo}</h1>\n      <p>{datos.texto}</p>\n    </main>\n  );\n}`
  },
  other: {
    label: "Otra",
    steps: [
      "Pide que esas secciones se sirvan en el HTML de la página, no desde un script.",
      "Para comprobarlo, desactiva JavaScript en el navegador y recarga: lo que no se vea, no lo lee la IA."
    ],
    file: "HTML",
    code: `<main>\n  <h1>Titular de la página</h1>\n  <p>El texto principal, escrito en la plantilla.</p>\n</main>`
  }
};

const toPlat = (p: SitePlatform | null): Plat => (p === "wordpress" || p === "shopify" ? p : p === "next" || p === "react" ? "next" : "other");

const STATE: Record<AiViewPage["state"], [string, string]> = {
  ok: ["Llega completa", "b-pos"],
  thin: ["Poco texto", "b-warm"],
  empty: ["Llega vacía", "b-warm"]
};

function CopyBlock({ file, code }: { file: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable: the code is on screen and selectable.
    }
  }
  return (
    <div className="aiv-code">
      <div className="aiv-code-h">
        <span>{file}</span>
        <button type="button" className="btn ghost sm" onClick={copy}>
          <Ic n={copied ? "check" : "copy"} sm />
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre tabIndex={0}>{code}</pre>
    </div>
  );
}

export function AiViewSection({ view, domain, llms }: { view: AiView; domain: string; llms: string }) {
  const [open, setOpen] = useState<string | null>(view.bad[0]?.path ?? null);
  const [plat, setPlat] = useState<Plat>(toPlat(view.platform));
  const { ok, total, bad, pages } = view;
  const maxW = Math.max(1, ...pages.map((p) => p.words));
  const headline = aiViewHeadline(view);
  const P = PLATS[plat];
  const no = <span className="nx">No está en el HTML</span>;

  return (
    <section className="card aiv" id="lo-que-lee-la-ia" aria-labelledby="aiv-title">
      <div className="card-h">
        <h3 id="aiv-title">Lo que lee la IA</h3>
        <span className="badge b-pos">
          <Ic n="check" sm />
          Comprobado
        </span>
      </div>
      <div className="card-b">
        <div className="aiv-top">
          <div className="aiv-big">
            <b className="num">
              {ok}
              <small> de {total}</small>
            </b>
            <p>{headline}</p>
          </div>
          <div className="aiv-seg" role="img" aria-label={`${ok} de ${total} páginas llegan completas`}>
            {pages.map((p, i) => (
              <i key={p.path} className={p.state} style={{ "--d": `${i * 70}ms` } as CSSProperties} />
            ))}
          </div>
          <div className="aiv-leg">
            <span>
              <i className="ok" />
              Llega completa
            </span>
            <span>
              <i className="thin" />
              Poco texto
            </span>
            <span>
              <i className="empty" />
              Llega vacía
            </span>
          </div>
        </div>

        <div className="aiv-lbl">Páginas revisadas · palabras que llegan en el HTML</div>
        <div className="aiv-list">
          {pages.map((p) => {
            const isOpen = open === p.path;
            const [label, tone] = STATE[p.state];
            return (
              <div key={p.path} className={`aiv-r ${p.state}${isOpen ? " open" : ""}`}>
                <button type="button" className="h" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.path)}>
                  <code className="p">{p.path}</code>
                  <span className="wb">
                    <span className="aiv-bar" aria-hidden="true">
                      <i style={{ width: `${Math.max(4, (p.words / maxW) * 100)}%` }} />
                    </span>
                    <span className="num">{p.words.toLocaleString("es-ES")} palabras</span>
                  </span>
                  <span className={`badge ${tone}`}>{label}</span>
                  <Ic n="chevd" sm />
                </button>
                {isOpen && (
                  <div className="b">
                    <div className="aiv-get">
                      <div>
                        <span>Titular</span>
                        {p.hasH1 ? <b>Está en el HTML</b> : no}
                      </div>
                      <div>
                        <span>Secciones</span>
                        {p.h2Count > 0 ? <b>{p.h2Count === 1 ? "1 sección" : `${p.h2Count} secciones`}</b> : no}
                      </div>
                      <div>
                        <span>Datos estructurados</span>
                        {p.ldTypes.length ? <b>{p.ldTypes.join(", ")}</b> : <em>Ninguno</em>}
                      </div>
                    </div>
                    <p>
                      {p.state === "ok"
                        ? "La IA recibe el contenido de esta página sin ejecutar JavaScript."
                        : p.state === "empty"
                          ? "Llega vacía: su contenido sólo aparece después de ejecutar JavaScript."
                          : "Llega poco texto: el contenido principal lo pinta un script después."}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {bad.length > 0 && (
          <details className="aiv-fix">
            <summary>
              <span className="badge b-blue">Para todo el dominio</span>
              <b>Cómo arreglarlo</b>
              <Ic n="chevd" sm />
            </summary>
            <div className="aiv-fix-b">
              <p>Casi siempre es la misma causa en toda la web (el tema, un plugin o el framework), así que se arregla una vez.</p>
              <Seg
                label="Tu web está hecha con"
                options={(Object.keys(PLATS) as Plat[]).map((k) => [k, PLATS[k].label] as const)}
                value={plat}
                onChange={setPlat}
              />
              <ol className="aiv-steps">
                {P.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <CopyBlock file={P.file} code={P.code} />
              <p className="aiv-hint">
                Es un ejemplo: cambia el texto por el de tu página.
                {view.platform ? " La plataforma sale marcada según lo que detecta la auditoría." : ""}
              </p>
              <details className="aiv-md">
                <summary>
                  <span className="badge b-line">Segunda opción</span>
                  <b>Versiones en Markdown</b>
                  <Ic n="chevd" sm />
                </summary>
                <div className="aiv-md-b">
                  <p>
                    Un fichero <code className="p">.md</code> por página con el texto limpio. Lo leen sobre todo agentes y herramientas
                    que siguen llms.txt; no sustituye al arreglo de arriba.
                  </p>
                  <ol className="aiv-steps">
                    <li>Abre cada página con la extensión de Chrome y pulsa «Descargar el .md».</li>
                    <li>Súbelo en la misma dirección terminada en .md.</li>
                    <li>Añade esto a tu llms.txt:</li>
                  </ol>
                  <CopyBlock file="llms.txt" code={llms} />
                </div>
              </details>
            </div>
          </details>
        )}

        <p className="aiv-hint">
          Pedimos cada página de {domain} como un bot de IA: sin sesión y sin ejecutar JavaScript. Para ver frase a frase qué no
          les llega, abre la página con la extensión de Chrome.
        </p>
      </div>
    </section>
  );
}
