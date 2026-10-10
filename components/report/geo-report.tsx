"use client";

/* eslint-disable @next/next/no-img-element -- printed pages: next/image lazy-loads, and an image still loading when the print dialog snapshots the page comes out blank. */

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { QUESTION_SET_LABEL, formatShare, type ReportModel, type ReportCell, type ReportQuote } from "@/lib/report/report-model";
import { paginateMatrix } from "@/lib/report/report-pages";
import "./geo-report.css";

/**
 * GEO-REPORT-1 Fase 2 — the eight-page GenScore report
 * (docs/design-reference/geo-report-1/), drawn from `buildReportModel`.
 * Presentational only: every figure and sentence comes from the model, this
 * file decides where it goes. A block the model leaves out (no sources, no
 * audit, no plan) takes its page with it, and the page and section numbers
 * follow.
 *
 * Mounted with `createPortal` straight into `document.body`, each page a
 * direct child of it, for the print reasons in geo-report.css.
 */

const ENGINE_LOGO: Record<string, string> = {
  gemini: "/brand/engines/gemini.svg",
  openai: "/brand/engines/chatgpt.svg",
  claude: "/brand/engines/claude.svg"
};
const ENGINE_SEG: Record<string, string> = { gemini: "gr-g", openai: "gr-o", claude: "gr-c" };
const ENGINE_SWATCH: Record<string, string> = { gemini: "#4f7bff", openai: "#0b1426", claude: "#d97757" };

function EngineLogo({ provider, size }: { provider: string; size: number }) {
  const src = ENGINE_LOGO[provider];
  return src ? <img className="gr-eng" src={src} width={size} height={size} alt="" /> : null;
}

/** "5" from "5%", "<1" from "<1%": the big numbers print the % sign smaller. */
function num(share: number): string {
  return formatShare(share).replace("%", "");
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(
    new Date(iso)
  );
}

function formatMonth(iso: string): string {
  const m = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" })
    .format(new Date(iso))
    .replace(" de ", " ");
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function Quote({ quote, dark }: { quote: ReportQuote; dark: boolean }) {
  return (
    <div className={`gr-quote${dark ? " gr-o" : ""}`}>
      «{quote.text}»
      <span className="gr-src">
        {quote.engineLabel} · {quote.topic}
      </span>
    </div>
  );
}

function Cell({ cell }: { cell: ReportCell }) {
  if (cell.kind === "you") {
    return <span className="gr-pill gr-you">{cell.position ? `${cell.position}.º` : "En lista"}</span>;
  }
  return <span className={`gr-dot ${cell.kind === "others" ? "gr-ag" : "gr-no"}`} />;
}

function Glow() {
  return (
    <svg className="gr-glow" width="100%" height="100%" viewBox="0 0 794 1123" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id="gr-glow" cx="640" cy="140" r="520" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#09c5d6" stopOpacity=".30" />
          <stop offset=".55" stopColor="#2563eb" stopOpacity=".10" />
          <stop offset="1" stopColor="#081223" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="794" height="1123" fill="url(#gr-glow)" />
    </svg>
  );
}

export function GeoReport({ model, fontClassName }: { model: ReportModel; fontClassName: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<ReportPages model={model} fontClassName={fontClassName} />, document.body);
}

export function ReportPages({ model, fontClassName }: { model: ReportModel; fontClassName: string }) {
  const brand = model.brandName;
  const date = formatDate(model.scanDate);
  const engines = model.engines;
  const engineNames = list(engines.map((e) => e.label));
  const matrixPages = paginateMatrix(model.matrix.groups);
  const hasPlan = model.plan.length > 0;

  // Page and section numbers follow the blocks that are actually printed.
  const totalPages = 1 + 1 + matrixPages.length + 1 + (model.sources ? 1 : 0) + (model.technical ? 1 : 0) + (hasPlan ? 1 : 0) + 1;
  let pageNo = 1;
  let secNo = 0;
  const nextSec = () => String(++secNo).padStart(2, "0");

  const page = (title: string, children: ReactNode, extra = "") => {
    pageNo += 1;
    return (
      <section className={`gr-page ${fontClassName} ${extra}`.trim()} key={`p${pageNo}`}>
        <div className="gr-hd">
          <img src="/brand/genscore-logo.svg" className="gr-lg" alt="GenScore" />
          <span>
            {brand} · {title}
          </span>
        </div>
        {children}
        <div className="gr-ft">
          <span>GenScore · genscore.es · Escaneo del {date}</span>
          <span>
            {pageNo} / {totalPages}
          </span>
        </div>
      </section>
    );
  };

  const maxBar = Math.max(...model.competition.bars.map((b) => b.share), 0) || 1;
  const s = model.summary;
  const technicalScore = s.technicalScore;
  const stats: Array<{ hot: boolean; v: string; u: string; l: string }> = [
    { hot: true, v: num(model.cover.mentionShare), u: "%", l: "de las respuestas te nombran" },
    ...(s.ownCitationShare !== null ? [{ hot: false, v: num(s.ownCitationShare), u: "%", l: "de las webs que cita la IA es la tuya" }] : []),
    { hot: false, v: num(s.weakestEngine.mentionShare), u: "%", l: `de las respuestas de ${s.weakestEngine.label} te nombran` },
    ...(technicalScore !== null ? [{ hot: false, v: String(technicalScore), u: "/100", l: "salud técnica de tu web para la IA" }] : [])
  ];

  const pages: ReactNode[] = [];

  // ---- 1 cover ----
  pages.push(
    <section className={`gr-page gr-cover ${fontClassName}`} key="p1">
      <Glow />
      <div className="gr-top">
        <img src="/brand/genscore-logo-white.svg" alt="GenScore" />
        <span>Informe de {brand}</span>
      </div>
      <div className="gr-cgrid">
        {engines.map((e) => (
          <div className="gr-cgr" key={e.provider}>
            <span>{e.label}</span>
            <div className="gr-cbar">
              <i style={{ width: `${Math.round(e.mentionShare * 100)}%` }} />
            </div>
            <b>{formatShare(e.mentionShare)}</b>
          </div>
        ))}
        <div className="gr-cgl">
          <span>Respuestas que te nombran, por motor</span>
        </div>
      </div>
      <div className="gr-mid">
        <div className="gr-eyebrow">Visibilidad en respuestas de IA · {formatMonth(model.scanDate)}</div>
        <h1>Cuando tus clientes preguntan a la IA, ¿te nombra?</h1>
        <div className="gr-sub">
          GenScore hace a {engineNames} las {QUESTION_SET_LABEL} de quien busca lo que ofreces. Este informe resume sus respuestas, las
          webs que citaron y tu propia web.
        </div>
      </div>
      <div className="gr-hero">
        <div className="gr-big">
          {num(model.cover.mentionShare)}
          <small>%</small>
        </div>
        <p>de las respuestas te nombran. Aquí verás en cuáles, quién sale en tu lugar y qué cambiar primero.</p>
      </div>
      <div className="gr-meta">
        <div>
          <div>Dominio</div>
          <div>{model.domain}</div>
        </div>
        <div>
          <div>Escaneo</div>
          <div>{date}</div>
        </div>
        <div>
          <div>Puntuación GEO</div>
          <div>{model.geoScore !== null ? Math.round(model.geoScore) : "—"}</div>
        </div>
      </div>
    </section>
  );

  // ---- 2 summary ----
  pages.push(
    page(
      "Lo esencial",
      <>
        <div className="gr-sec">
          <span className="gr-num">{nextSec()}</span>
          <h2>Lo esencial en una página</h2>
        </div>
        <p className="gr-lede">{s.lede}</p>
        <div className="gr-stats" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
          {stats.map((st) => (
            <div className={`gr-stat${st.hot ? " gr-hot" : ""}`} key={st.l}>
              <div className="gr-v">
                {st.v}
                <small>{st.u}</small>
              </div>
              <div className="gr-l">{st.l}</div>
            </div>
          ))}
        </div>
        <div className="gr-finds">
          {s.findings.map((f) => (
            <div className={`gr-find${f.tone === "info" ? "" : ` gr-${f.tone}`}`} key={f.title}>
              <div className="gr-k">{f.tone === "pos" ? "✓" : f.tone === "neg" ? "✕" : "→"}</div>
              <div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="gr-engp" style={{ gridTemplateColumns: `repeat(${engines.length}, 1fr)` }}>
          {engines.map((e) => (
            <div className="gr-e" key={e.provider}>
              <div className="gr-eh">
                <EngineLogo provider={e.provider} size={18} /> {e.label}
              </div>
              <div className="gr-ev">
                {num(e.mentionShare)}
                <small>%</small>
              </div>
              <div className="gr-el">
                {e.bestPosition ? `Mejor puesto: ${e.bestPosition}.º.` : "No te nombra en ninguna respuesta."}
                {e.citesOwnSite ? " Cita tu web." : ""}
              </div>
            </div>
          ))}
        </div>
      </>
    )
  );

  // ---- 3 map (one or more pages) ----
  const mapSec = nextSec();
  matrixPages.forEach((groups, i) => {
    pages.push(
      page(
        "Mapa de respuestas",
        <>
          {i === 0 ? (
            <>
              <div className="gr-sec">
                <span className="gr-num">{mapSec}</span>
                <h2>Pregunta a pregunta: dónde apareces</h2>
              </div>
              <p className="gr-lede">
                Las {QUESTION_SET_LABEL} que sigues en GenScore, agrupadas por tema.
                {model.matrix.hasCoverage ? " La última columna dice si tienes una página que la responda." : ""}
              </p>
            </>
          ) : null}
          <table className="gr-mx">
            <thead>
              <tr>
                <th className="gr-q">Pregunta principal de búsqueda</th>
                {engines.map((e) => (
                  <th key={e.provider}>
                    <EngineLogo provider={e.provider} size={16} />
                    {e.label}
                  </th>
                ))}
                {model.matrix.hasCoverage ? (
                  <th>
                    ¿Página
                    <br />
                    tuya?
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={`${g.topic}-${g.rows[0]?.promptId}`}>
                  <tr className="gr-grp">
                    <td colSpan={engines.length + 2}>
                      {g.topic}
                      {g.continued ? " (sigue)" : ""}
                    </td>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.promptId}>
                      <td className="gr-q">{r.promptText}</td>
                      {r.cells.map((c) => (
                        <td className="gr-c" key={c.provider}>
                          <Cell cell={c.cell} />
                        </td>
                      ))}
                      {model.matrix.hasCoverage ? (
                        <td className="gr-w">
                          {r.page === "yes" ? (
                            <span className="gr-tag gr-ok">Sí</span>
                          ) : r.page === "gap" ? (
                            <span className="gr-tag gr-gap">No · hueco</span>
                          ) : r.page === "no" ? (
                            <span className="gr-tag gr-mute">No</span>
                          ) : (
                            <span className="gr-tag gr-mute">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {i === matrixPages.length - 1 ? (
            <div className="gr-legend">
              <span>
                <span className="gr-pill gr-you">1.º</span> Te nombra (puesto)
              </span>
              <span>
                <span className="gr-dot gr-ag" /> Nombra a otras marcas
              </span>
              <span>
                <span className="gr-dot gr-no" /> No nombra marcas
              </span>
              {model.matrix.hasCoverage ? (
                <span>
                  <span className="gr-tag gr-gap">No · hueco</span> la IA recomienda a otros y no tienes página
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      )
    );
  });

  // ---- 4 competition ----
  const comp = model.competition;
  pages.push(
    page(
      "Competencia",
      <>
        <div className="gr-sec">
          <span className="gr-num">{nextSec()}</span>
          <h2>Quién aparece en tu lugar</h2>
        </div>
        <p className="gr-lede">Las marcas que más nombra la IA en tus {QUESTION_SET_LABEL}, junto a la tuya.</p>
        <div className="gr-bars">
          {comp.bars.map((b) => (
            <div className={`gr-bar${b.isBrand ? " gr-me" : ""}`} key={b.name}>
              <div className="gr-bn">{b.name}</div>
              <div className="gr-bt">
                {b.byEngine
                  .filter((e) => e.share > 0)
                  .map((e) => (
                    <span
                      key={e.provider}
                      className={`gr-seg ${ENGINE_SEG[e.provider] ?? "gr-o"}`}
                      style={{ width: `${((e.share / maxBar) * 100).toFixed(1)}%` }}
                    />
                  ))}
              </div>
              <div className="gr-bv">{formatShare(b.share)}</div>
            </div>
          ))}
        </div>
        <div className="gr-legend">
          {engines.map((e) => (
            <span key={e.provider}>
              <span className="gr-dot" style={{ background: ENGINE_SWATCH[e.provider] ?? "#0b1426", borderRadius: 3 }} /> {e.label}
            </span>
          ))}
          <span>% de respuestas que nombran a cada una</span>
        </div>
        {comp.cards.length > 0 ? (
          <div className="gr-cards2">
            {comp.cards.map((c) => (
              <div className="gr-card" key={c.name}>
                <div className="gr-ey">{c.eyebrow}</div>
                <h4>{c.name}</h4>
                <p>{c.text}</p>
                {c.quote ? <Quote quote={c.quote} dark /> : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="gr-cloud">
          <h4>Todas las marcas que nombró la IA en estas respuestas</h4>
          <p>Resaltada, la tuya.</p>
          <div className="gr-cs">
            {comp.cloud.map((c) => (
              <span className={c.isBrand ? "gr-me" : undefined} key={c.name}>
                {c.name}
              </span>
            ))}
          </div>
        </div>
      </>
    )
  );

  // ---- 5 sources ----
  const src = model.sources;
  if (src) {
    pages.push(
      page(
        "Fuentes",
        <>
          <div className="gr-sec">
            <span className="gr-num">{nextSec()}</span>
            <h2>Qué webs lee la IA antes de responder</h2>
          </div>
          <p className="gr-lede">
            Las webs que citó la IA en sus respuestas, agrupadas por tipo y ordenadas por frecuencia.
            {src.ownCitationShare !== null ? ` La tuya es el ${formatShare(src.ownCitationShare)}.` : ""}
          </p>
          <div className="gr-srcgrid">
            {src.columns.map((col) => (
              <div className="gr-srccol" key={col.title}>
                <h4>{col.title}</h4>
                {col.domains.map((d) => (
                  <div className="gr-r" key={d}>
                    <span>{d}</span>
                  </div>
                ))}
                {col.includesOwn ? (
                  <div className="gr-r gr-me">
                    <span>{model.domain}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="gr-callout">
            <div>
              <h4>Tus páginas que cita la IA</h4>
              {src.ownPages.length > 0 ? (
                <>
                  <p>
                    {src.ownPages.map((u) => (
                      <Fragment key={u}>
                        <code>{u}</code>
                        <br />
                      </Fragment>
                    ))}
                  </p>
                  {src.ownCitationShare !== null ? <p>Son el {formatShare(src.ownCitationShare)} de las webs que citó.</p> : null}
                </>
              ) : (
                <p>Ninguna todavía: la IA no ha citado tu web en estas respuestas.</p>
              )}
            </div>
            {src.topSource ? (
              <div>
                <h4>La web que más cita</h4>
                <p>
                  <code>{src.topSource.domain}</code>, en el {formatShare(src.topSource.share)} de las respuestas con fuentes.
                </p>
              </div>
            ) : null}
          </div>
          {src.brandQuotes.length > 0 ? (
            <>
              <div className="gr-ey2">Cómo te describe la IA</div>
              <div className="gr-cards2" style={{ marginTop: 8 }}>
                {src.brandQuotes.map((q, i) => (
                  <Quote quote={q} dark={i % 2 === 1} key={`${q.provider}-${i}`} />
                ))}
              </div>
            </>
          ) : null}
        </>
      )
    );
  }

  // ---- 6 technical ----
  const tech = model.technical;
  if (tech) {
    pages.push(
      page(
        "Auditoría técnica",
        <>
          <div className="gr-sec">
            <span className="gr-num">{nextSec()}</span>
            <h2>Tu web, lista para la IA</h2>
          </div>
          <p className="gr-lede">Las mismas comprobaciones que ves en Auditoría web, sobre las páginas principales de tu dominio.</p>
          <div className="gr-scorebox gr-one">
            {tech.score !== null ? (
              <div className="gr-s gr-me">
                <div className="gr-v">
                  {tech.score}
                  <small>/100</small>
                </div>
                <div className="gr-l">
                  <b>{brand}</b>Salud técnica para la IA · páginas principales
                </div>
              </div>
            ) : null}
            {tech.coverageShare !== null ? (
              <div className="gr-s">
                <div className="gr-v">
                  {num(tech.coverageShare)}
                  <small>%</small>
                </div>
                <div className="gr-l">
                  <b>Cobertura de contenido</b>Preguntas principales de búsqueda con una página tuya que las responde
                </div>
              </div>
            ) : null}
          </div>
          {tech.checks.length > 0 ? (
            <table className="gr-tt">
              <thead>
                <tr>
                  <th>Comprobación</th>
                  <th className="gr-me">{brand}</th>
                </tr>
              </thead>
              <tbody>
                {tech.checks.map((c) => (
                  <tr key={c.label}>
                    <td className="gr-k">
                      {c.label}
                      {c.detail ? <small>{c.detail}</small> : null}
                    </td>
                    <td className="gr-me">
                      <span className={`gr-${c.state}`}>{c.text}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {tech.reading ? (
            <div className="gr-read">
              <b>Lectura:</b> {tech.reading.charAt(0).toLowerCase() + tech.reading.slice(1)}
            </div>
          ) : null}
        </>
      )
    );
  }

  // ---- 7 plan ----
  if (hasPlan) {
    pages.push(
      page(
        "Plan de acción",
        <>
          <div className="gr-sec">
            <span className="gr-num">{nextSec()}</span>
            <h2>{model.plan.length === 1 ? "Tu primera acción" : `Tus ${model.plan.length === 2 ? "dos" : "tres"} primeras acciones`}</h2>
          </div>
          <p className="gr-lede">
            Las primeras de tu plan en GenScore. Márcalas como hechas en Recomendaciones y el próximo escaneo te dirá si la IA ha cambiado su
            respuesta.
          </p>
          <div className="gr-acts">
            {model.plan.map((a, i) => (
              <div className="gr-act" key={`${a.title}-${i}`}>
                <div className="gr-k">{i + 1}</div>
                <div>
                  <h3>{a.title}</h3>
                  <p>{a.description}</p>
                  {a.firstStep ? (
                    <p>
                      <b>Primer paso:</b> {a.firstStep}
                    </p>
                  ) : null}
                  {a.topics.length > 0 || a.engineLabels.length > 0 ? (
                    <div className="gr-meta">
                      {a.topics.map((t) => (
                        <span className="gr-chip" key={t}>
                          {t}
                        </span>
                      ))}
                      {a.engineLabels.length > 0 ? <span className="gr-chip gr-g">{list(a.engineLabels)}</span> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )
    );
  }

  // ---- 8 back ----
  pageNo += 1;
  pages.push(
    <section className={`gr-page gr-back gr-last ${fontClassName}`} key="back">
      <Glow />
      <div className="gr-hd" style={{ position: "relative" }}>
        <img src="/brand/genscore-logo-white.svg" className="gr-lg" alt="GenScore" />
        <span>{brand} · Siguientes pasos</span>
      </div>
      <div className="gr-bigq">
        <div className="gr-eyebrow">{nextSec()} · ¿Y ahora qué?</div>
        <h2>La misma foto, en tu próximo escaneo</h2>
        <p>
          GenScore vuelve a hacer estas {QUESTION_SET_LABEL} en cada escaneo y te avisa de lo que cambia, pregunta a pregunta y motor a
          motor.
        </p>
        <p>El detalle de cada respuesta, tu plan completo y la evolución de tu Puntuación GEO están en tu consola.</p>
        <div className="gr-sig">
          <span>genscore.es</span>
        </div>
      </div>
      <div className="gr-meth">
        <div>
          <h4>Las preguntas principales de búsqueda</h4>
          <p>Son las que elegiste al dar de alta tu dominio a partir de lo que vendes, y las puedes cambiar en Prompts.</p>
          <h4>Los motores</h4>
          <p>
            {engineNames}, preguntados múltiples veces, en distintos momentos. Las apps de consumo pueden responder algo distinto, y cada
            motor cambia con el tiempo.
          </p>
        </div>
        <div>
          <h4>Qué contamos</h4>
          <p>
            Una mención es que la respuesta nombre a tu marca, y el puesto es el orden en que aparece. Las fuentes son las URLs que citó el
            propio motor. Las citas son texto literal de la IA, no hechos verificados.
          </p>
          <h4>Límites</h4>
          <p>La IA no responde siempre igual: los porcentajes son la foto de este escaneo. Por eso GenScore repite la medición.</p>
        </div>
      </div>
      <div className="gr-ft" style={{ position: "relative" }}>
        <span>GenScore · genscore.es · Escaneo del {date}</span>
        <span>
          {pageNo} / {totalPages}
        </span>
      </div>
    </section>
  );

  return <>{pages}</>;
}
