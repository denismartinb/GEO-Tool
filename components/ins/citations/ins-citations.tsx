"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Ic } from "@/components/ins/ic";
import { ProjectFav } from "@/components/ins/project-fav";
import { Bar } from "@/components/ins/kit/bar";
import { Roll } from "@/components/ins/kit/roll";
import { Seg } from "@/components/ins/kit/seg";
import { EngineLogo, engineName } from "@/components/ins/kit/engine";
import { isWebUrl } from "@/lib/search-console/insights";
import { fold } from "@/lib/ins/prompts-model";
import {
  CITATION_TABS,
  citationsLead,
  filterPages,
  tabCounts,
  type CitationTab,
  type OriginGroup,
  type PageItem,
  type ReachItem,
} from "@/lib/ins/citations-model";

type Props = {
  projectId: string;
  domain: string;
  /** % of answers with a citation (last scan), null when not measured. */
  answersWithCitation: number | null;
  totalCited: number;
  ownCited: number;
  pages: PageItem[];
  origins: OriginGroup[];
  reach: ReachItem[];
};

const ORIGIN_COLOR: Record<OriginGroup["key"], string> = {
  own: "var(--blue)",
  named: "var(--blue-soft)",
  competitor: "var(--ink-2)",
  other: "var(--tick-off)",
};

const REACH_SHOWN = 5;
const PAGES_SHOWN = 25;
const DONUT_R = 78;
const DONUT_C = 2 * Math.PI * DONUT_R;
const DONUT_GAP = 4;

function Marked({ text, query }: { text: string; query: string }) {
  const q = fold(query.trim());
  if (!q) return <>{text}</>;
  const at = fold(text).indexOf(q);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

function Donut({
  origins,
  total,
  hi,
  setHi,
  onPick,
}: {
  origins: OriginGroup[];
  total: number;
  hi: OriginGroup["key"] | null;
  setHi: (k: OriginGroup["key"] | null) => void;
  onPick: (tab: CitationTab) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) el.classList.add("now");
    const id = requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("on")));
    return () => cancelAnimationFrame(id);
  }, []);
  const active = hi ? origins.find((o) => o.key === hi) : null;
  let offset = 0;
  return (
    <div className="ct-dn" ref={ref}>
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r={DONUT_R} className="ct-dt" />
        {origins.map((o, i) => {
          const len = (DONUT_C * o.percent) / 100;
          const seg = (
            <circle
              key={o.key}
              className={`ct-ds${hi && hi !== o.key ? " dim" : ""}`}
              cx="100"
              cy="100"
              r={DONUT_R}
              style={
                {
                  "--c": ORIGIN_COLOR[o.key],
                  "--len": Math.max(len - DONUT_GAP, 1).toFixed(1),
                  "--C": DONUT_C.toFixed(1),
                  "--off": (-offset).toFixed(1),
                  "--bd": `${i * 110}ms`,
                } as React.CSSProperties
              }
              tabIndex={0}
              role="button"
              aria-label={`${o.label}: ${o.percent}% de las páginas citadas. Ver sus páginas`}
              onMouseEnter={() => setHi(o.key)}
              onMouseLeave={() => setHi(null)}
              onFocus={() => setHi(o.key)}
              onBlur={() => setHi(null)}
              onClick={() => onPick(o.tab)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick(o.tab);
                }
              }}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="ct-dc" aria-live="polite">
        <div className="v num">
          {active ? (
            <>
              {active.percent}
              <small>%</small>
            </>
          ) : (
            <Roll value={total} />
          )}
        </div>
        <p>{active ? `${active.label} · ${active.pages} ${active.pages === 1 ? "página" : "páginas"}` : "páginas distintas"}</p>
      </div>
    </div>
  );
}

export function InsCitations(p: Props) {
  const [tab, setTab] = useState<CitationTab>("Todas");
  const [query, setQuery] = useState("");
  const [shownPages, setShownPages] = useState(PAGES_SHOWN);
  const [openReach, setOpenReach] = useState<string | null>(null);
  const [moreReach, setMoreReach] = useState(false);
  const [hi, setHi] = useState<OriginGroup["key"] | null>(null);
  const reachRef = useRef<HTMLElement>(null);
  const pagesRef = useRef<HTMLElement>(null);

  const counts = useMemo(() => tabCounts(p.pages), [p.pages]);
  const rows = useMemo(() => filterPages(p.pages, tab, query), [p.pages, tab, query]);
  const lead = citationsLead({ totalCited: p.totalCited, own: p.ownCited, reachable: p.reach.length });
  const maxPage = Math.max(...p.pages.map((r) => r.cited), 1);
  const maxReach = Math.max(...p.reach.map((r) => r.cites), 1);
  const ownShare = p.totalCited > 0 ? Math.round((p.ownCited / p.totalCited) * 100) : 0;

  const scrollTo = (el: HTMLElement | null) => {
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };
  const pickTab = (next: CitationTab) => {
    setTab(next);
    setShownPages(PAGES_SHOWN);
  };
  const goPages = (next: CitationTab) => {
    pickTab(next);
    scrollTo(pagesRef.current);
  };
  const filterDomain = (domain: string) => {
    setQuery(domain);
    pickTab("Todas");
    scrollTo(pagesRef.current);
  };

  const reachList = moreReach ? p.reach : p.reach.slice(0, REACH_SHOWN);
  const visibleRows = rows.slice(0, shownPages);

  return (
    <div className="sc-cit">
      <div className="eyebrow bare">
        Páginas citadas ·{" "}
        <span className="mono" style={{ letterSpacing: 0, textTransform: "none" }}>
          {p.domain}
        </span>
      </div>
      <h1 style={{ marginTop: 14 }}>Páginas citadas</h1>
      {lead.length > 0 ? (
        <p className="lead">
          {lead.map((part, i) =>
            part.jump ? (
              <a
                key={i}
                href="#ct-reach-s"
                onClick={(e) => {
                  e.preventDefault();
                  scrollTo(reachRef.current);
                }}
              >
                {part.text}
              </a>
            ) : part.strong ? (
              <b key={i}>{part.text}</b>
            ) : (
              <Fragment key={i}>{part.text}</Fragment>
            ),
          )}
        </p>
      ) : null}
      <div className="pills">
        <Link className="chip" href={`/dashboard/projects/${p.projectId}/web-audit`}>
          <Ic n="audit" sm />
          ¿Tus páginas se pueden citar?
        </Link>
      </div>

      <section className="sec">
        <div className="kpis ct-k">
          <div className="kpi">
            <div className="l">Respuestas con cita</div>
            <div className="v">
              {p.answersWithCitation !== null ? (
                <>
                  <b>
                    <Roll value={Math.round(p.answersWithCitation)} />
                  </b>
                  <span className="u">%</span>
                </>
              ) : (
                <b>-</b>
              )}
            </div>
            <p className="ct-kc">De las respuestas del último escaneo citan al menos una página.</p>
          </div>
          <div className="kpi">
            <div className="l">Citas totales</div>
            <div className="v">
              <b>
                <Roll value={p.totalCited} />
              </b>
            </div>
            <p className="ct-kc">A {p.pages.length} páginas distintas.</p>
          </div>
          <div className="kpi">
            <div className="l">Citas a tu web</div>
            <div className="v">
              <b>
                <Roll value={p.ownCited} />
              </b>
              {p.totalCited > 0 ? <span className="badge b-warm">{ownShare}%</span> : null}
            </div>
            <p className="ct-kc">A páginas de {p.domain}.</p>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="eyebrow">De dónde salen las citas</div>
        <div className="card ct-or">
          <div className="ct-ol">
            <h3 className="ct-dh">Páginas citadas por la IA en tus prompts</h3>
            <Donut origins={p.origins} total={p.pages.length} hi={hi} setHi={setHi} onPick={goPages} />
          </div>
          <div className="ct-orr">
            {p.origins.map((o) => (
              <button
                key={o.key}
                type="button"
                className={`ct-og${hi && hi !== o.key ? " dim" : ""}`}
                title="Ver estas páginas en la lista"
                onClick={() => goPages(o.tab)}
                onMouseEnter={() => setHi(o.key)}
                onMouseLeave={() => setHi(null)}
                onFocus={() => setHi(o.key)}
                onBlur={() => setHi(null)}
              >
                <i style={{ background: ORIGIN_COLOR[o.key] }} />
                <span className="t">
                  <b>{o.label}</b>
                  <span>{o.description}</span>
                </span>
                <b className="num p">
                  {o.percent}
                  <small>%</small>
                </b>
                <Ic n="chevr" sm />
              </button>
            ))}
            <p className="ct-fn">
              <Ic n="shield" sm />
              «Te nombran» sale de la respuesta de la IA, no de la página: no leemos el contenido de las páginas citadas.
            </p>
          </div>
        </div>
      </section>

      {p.reach.length > 0 ? (
        <section className="sec" id="ct-reach-s" ref={reachRef}>
          <div className="eyebrow">Fuentes alcanzables</div>
          <div className="ct-rh">
            <h2>
              {p.reach.length} {p.reach.length === 1 ? "web que la IA cita y no te nombra" : "webs que la IA cita y no te nombran"}
            </h2>
            <p>Agrupadas por web. Las respuestas donde aparecen no te nombran: escribirles es la vía más directa para entrar.</p>
          </div>
          <div className="ct-rl">
            {reachList.map((r, i) => {
              const open = openReach === r.domain;
              return (
                <div key={r.domain} className={`ct-rr${open ? " open" : ""}`}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenReach(open ? null : r.domain)}
                  >
                    <ProjectFav domain={r.domain} name={r.domain} size={22} />
                    <span className="t">
                      <b>{r.domain}</b>
                      <span className="num">
                        {r.cites} {r.cites === 1 ? "cita" : "citas"} · {r.pages} {r.pages === 1 ? "página" : "páginas"} ·{" "}
                        {r.engines.length} {r.engines.length === 1 ? "motor" : "motores"}
                      </span>
                    </span>
                    <span className="e" aria-label={`La citan ${r.engines.map(engineName).join(", ")}`}>
                      {r.engines.map((k) => (
                        <EngineLogo key={k} provider={k} size={13} />
                      ))}
                    </span>
                    <Bar value={r.cites} max={maxReach} cls="thin ink nomark" delay={i * 50} />
                    <Ic n="chevd" sm />
                  </button>
                  {open ? (
                    <div className="ct-rx">
                      <div className="lbl">Preguntas donde la citan sin nombrarte</div>
                      <ul>
                        {r.prompts.slice(0, 4).map((q) => (
                          <li key={q}>{q}</li>
                        ))}
                      </ul>
                      {r.coCited.length > 0 ? (
                        <p className="ct-co">
                          <Ic n="warn" sm />
                          Citada en una respuesta donde también apareció {r.coCited.slice(0, 2).join(", ")} (sin verificar en la página).
                        </p>
                      ) : null}
                      <div className="acts">
                        <button type="button" className="btn sm line" onClick={() => filterDomain(r.domain)}>
                          <Ic n="search" sm />
                          Ver sus páginas
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {p.reach.length > REACH_SHOWN ? (
              <button type="button" className="more" aria-expanded={moreReach} onClick={() => setMoreReach((v) => !v)}>
                {moreReach ? "Ver menos" : `Ver ${p.reach.length - REACH_SHOWN} más`}
                <Ic n="chevd" sm />
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="sec" id="ct-pages" ref={pagesRef}>
        <div className="eyebrow">Todas las páginas</div>
        <div className="toolbar ct-tool">
          <Seg
            label="Filtrar páginas"
            value={tab}
            onChange={pickTab}
            options={CITATION_TABS.map((t) => [t, <>{t} <span className="num">{counts[t]}</span></>] as const)}
          />
          <label className="search">
            <Ic n="search" sm />
            <input
              type="search"
              placeholder="Busca una página o un dominio"
              value={query}
              aria-label="Buscar página o dominio"
              onChange={(e) => {
                setQuery(e.target.value);
                setShownPages(PAGES_SHOWN);
              }}
            />
          </label>
        </div>
        <div className="ct-cnt num">
          {rows.length > 0
            ? rows.length > visibleRows.length
              ? `Las ${visibleRows.length} más citadas de ${rows.length} páginas`
              : `${rows.length} ${rows.length === 1 ? "página" : "páginas"}`
            : ""}
        </div>
        <div className="ct-tb" role="table" aria-label="Páginas citadas">
          <div className="ct-tr h" role="row">
            <span role="columnheader">Página citada</span>
            <span role="columnheader">Tipo</span>
            <span role="columnheader">Citas</span>
          </div>
          {visibleRows.map((r, i) => (
            <div className="ct-tr" role="row" key={r.id}>
              <span role="cell" className="pg">
                <ProjectFav domain={r.domain || r.url} name={r.domain || r.title} size={22} />
                <span>
                  <b>
                    <Marked text={r.title} query={query} />
                  </b>
                  {isWebUrl(r.url) ? (
                    <a className="mono" href={r.url} target="_blank" rel="noopener noreferrer">
                      {r.url.replace(/^https?:\/\/(www\.)?/i, "")}
                    </a>
                  ) : (
                    <span className="mono">{r.url}</span>
                  )}
                </span>
              </span>
              <span role="cell">
                <span
                  className={`badge ${
                    r.category === "brand" ? "b-blue" : r.category === "competitor" ? "b-line ct-cb" : "b-line"
                  }`}
                >
                  {r.typeLabel}
                </span>
              </span>
              <span role="cell" className="n">
                <Bar value={r.cited} max={maxPage} cls={`thin nomark${r.category === "brand" ? "" : " ink"}`} delay={i * 30} />
                <b className="num">{r.cited}</b>
              </span>
            </div>
          ))}
          {rows.length === 0 ? (
            <div className="empty-s">
              No hay páginas con estos filtros.
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn sm line"
                  onClick={() => {
                    setQuery("");
                    pickTab("Todas");
                  }}
                >
                  Quitar filtros
                </button>
              </div>
            </div>
          ) : null}
        </div>
        {rows.length > visibleRows.length ? (
          <button type="button" className="more" onClick={() => setShownPages((n) => n + PAGES_SHOWN)}>
            Ver {Math.min(PAGES_SHOWN, rows.length - visibleRows.length)} más
            <Ic n="chevd" sm />
          </button>
        ) : null}
      </section>
    </div>
  );
}
