"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ic } from "@/components/ins/ic";
import { PageHead } from "@/components/ins/page-head";
import { ProjectFav } from "@/components/ins/project-fav";
import { Bar } from "@/components/ins/kit/bar";
import { Roll } from "@/components/ins/kit/roll";
import { EngineLogo, engineName } from "@/components/ins/kit/engine";
import { MOBILE_QUERY, useMedia } from "@/components/ins/kit/use-media";
import { ManageSheet } from "@/components/ins/competitors/manage-sheet";
import { Suggested } from "@/components/ins/competitors/suggested";
import {
  competitorsLead,
  heatTone,
  lineStyle,
  orderRanking,
  segments,
  spreadLabels,
  type EvoSeries,
  type RankEntry,
} from "@/lib/ins/competitors-model";
import type { PromptGapCategory, PromptGapSummary } from "@/lib/competitors/prompt-gap";

export type EvoData = { dates: string[]; series: EvoSeries[]; visibleKeys: string[] };
export type HeatRow = { key: string; name: string; you: boolean; cells: Array<{ rate: number; title: string }> };
export type TerrainRow = { topic: string; brandRate: number; leaderName: string | null; leaderRate: number; gap: number };

type Props = {
  projectId: string;
  domain: string;
  brand: string;
  competitorCount: number;
  /** Denominator sentence (answers, prompts, engines), composed by the page. */
  basis: string | null;
  hasData: boolean;
  hasCompetitors: boolean;
  lead: Parameters<typeof competitorsLead>[0];
  ranking: RankEntry[];
  aliases: string[];
  evo: EvoData | null;
  heat: { engines: string[]; rows: HeatRow[] } | null;
  terrain: TerrainRow[];
  gap: PromptGapSummary | null;
  manage: {
    active: Array<{ id: string; name: string; domain: string }>;
    inactive: Array<{ id: string; name: string; domain: string }>;
  };
};

const fmtD = (v: number) => v.toFixed(1).replace(".", ",");

/* ---------- evolution of the mean position: 1º at the top ---------- */
/** Monotone cubic path through the points: smooth, never overshoots a value. */
function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  const f = (v: number) => v.toFixed(1);
  if (n < 3) return pts.map((p, i) => `${i ? "L" : "M"}${f(p.x)},${f(p.y)}`).join(" ");
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const sl = dx.map((d, i) => (d === 0 ? 0 : (pts[i + 1].y - pts[i].y) / d));
  const m = [sl[0]];
  for (let i = 1; i < n - 1; i++) m.push(sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2);
  m.push(sl[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / sl[i], b = m[i + 1] / sl[i], h = Math.hypot(a, b);
    if (h > 3) { m[i] = (3 * a * sl[i]) / h; m[i + 1] = (3 * b * sl[i]) / h; }
  }
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const c = dx[i] / 3;
    d += ` C${f(pts[i].x + c)},${f(pts[i].y + m[i] * c)} ${f(pts[i + 1].x - c)},${f(pts[i + 1].y - m[i + 1] * c)} ${f(pts[i + 1].x)},${f(pts[i + 1].y)}`;
  }
  return d;
}

function EvoChart({ data, off, mobile }: { data: EvoData; off: ReadonlySet<string>; mobile: boolean }) {
  const n = data.dates.length;
  const all = data.series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const bottom = Math.max(5, Math.ceil(Math.max(...all, 1)));
  const W = mobile ? 380 : 760;
  const H = mobile ? 260 : 300;
  const L = mobile ? 26 : 34;
  const R = mobile ? 92 : 112;
  const T = 14;
  const B = 30;
  const X = (i: number) => L + (n > 1 ? (i * (W - L - R)) / (n - 1) : 0);
  const Y = (v: number) => T + ((v - 1) / (bottom - 1)) * (H - T - B);
  const on = data.series.filter((s) => !off.has(s.key));
  const rivals = data.series.filter((s) => !s.isBrand);
  const labels = spreadLabels(
    on.flatMap((s) => {
      const last = [...s.values].reverse().find((v): v is number => v != null);
      return last == null ? [] : [{ key: s.key, label: s.label, isBrand: Boolean(s.isBrand), v: last, y: Y(last) }];
    }),
  );
  const summary = on
    .flatMap((s) => {
      const first = s.values.find((v): v is number => v != null);
      const last = [...s.values].reverse().find((v): v is number => v != null);
      return first == null || last == null ? [] : [`${s.label} del ${fmtD(first)}º al ${fmtD(last)}º`];
    })
    .join("; ");
  const ordered = [...on].sort((a, b) => Number(Boolean(a.isBrand)) - Number(Boolean(b.isBrand)));

  return (
    <svg className="cp-evo" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Puesto medio en los últimos ${n} escaneos: ${summary}`}>
      {Array.from({ length: bottom }, (_, k) => k + 1).map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R + 8} y1={Y(v)} y2={Y(v)} stroke="var(--rule-2)" />
          <text className="ax" x={L - 10} y={Y(v) + 3.5} textAnchor="end">
            {v}º
          </text>
        </g>
      ))}
      {data.dates.map((d, i) => (
        <g key={i}>
          <line x1={X(i)} x2={X(i)} y1={H - B} y2={H - B + 5} stroke="var(--ink-4)" />
          {mobile && i % 2 ? null : (
            <text className="ax" x={X(i)} y={H - 8} textAnchor="middle">
              {d}
            </text>
          )}
        </g>
      ))}
      <line x1={L} x2={W - R + 8} y1={H - B} y2={H - B} stroke="var(--ink-4)" />
      {ordered.map((s) => {
        const st = lineStyle(s, Math.max(rivals.findIndex((r) => r.key === s.key), 0));
        return (
          <g key={s.key}>
            {segments(s.values).map((seg, k) =>
              seg.length > 1 ? (
                <path
                  key={k}
                  className="cp-ln"
                  d={smoothPath(seg.map(({ i, v }) => ({ x: X(i), y: Y(v) })))}
                  fill="none"
                  stroke={st.stroke}
                  strokeWidth={st.width}
                  strokeDasharray={st.dash || undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null,
            )}
            {s.values.map((v, i) =>
              v == null ? null : s.isBrand ? (
                <circle key={i} cx={X(i)} cy={Y(v)} r={i === n - 1 ? 4 : 2.5} fill={i === n - 1 ? st.stroke : "var(--surface)"} stroke={st.stroke} strokeWidth="1.5" />
              ) : i === n - 1 ? (
                <circle key={i} cx={X(i)} cy={Y(v)} r="2.5" fill={st.stroke} />
              ) : null,
            )}
          </g>
        );
      })}
      {labels.map((l) => (
        <text key={l.key} className={`cp-el${l.isBrand ? " me" : ""}`} x={X(n - 1) + 12} y={l.y + 4}>
          {l.label} <tspan className="v">{fmtD(l.v)}º</tspan>
        </text>
      ))}
    </svg>
  );
}

const GAP_LABEL: Record<PromptGapCategory, string> = {
  absent: "Ausente",
  behind: "Por detrás",
  ahead: "Por delante",
  exclusive: "En exclusiva",
  none: "Sin nadie",
};
const GAP_DESC: Record<PromptGapCategory, string> = {
  absent: "Responden con tus rivales y sin ti.",
  behind: "Sales, pero detrás de un rival.",
  ahead: "Sales por delante de tus rivales.",
  exclusive: "Sólo sales tú.",
  none: "No sale ninguna marca.",
};
const GAP_EMPTY: Record<PromptGapCategory, string> = {
  absent: "Ningún prompt del último escaneo te deja fuera mientras un rival aparece.",
  behind: "Ningún prompt te posiciona por detrás de un rival en el último escaneo.",
  ahead: "Ningún prompt te posiciona por delante de un rival en el último escaneo.",
  exclusive: "Ningún prompt te menciona en exclusiva, sin rivales presentes.",
  none: "Todos los prompts del último escaneo mencionan a alguien.",
};
const GAP_ORDER: PromptGapCategory[] = ["absent", "behind", "ahead", "exclusive", "none"];
const GAP_PAGE = 5;

export function InsCompetitors(p: Props) {
  const router = useRouter();
  const mobile = useMedia(MOBILE_QUERY);
  const [managing, setManaging] = useState<"manage" | null>(null);
  const [off, setOff] = useState<ReadonlySet<string>>(
    () => new Set(p.evo ? p.evo.series.filter((s) => !p.evo!.visibleKeys.includes(s.key)).map((s) => s.key) : []),
  );
  const firstGap = p.gap ? (GAP_ORDER.find((c) => p.gap!.counts[c] > 0) ?? "absent") : "absent";
  const [gapCat, setGapCat] = useState<PromptGapCategory>(firstGap);
  const [gapShown, setGapShown] = useState(GAP_PAGE);

  const ordered = useMemo(() => orderRanking(p.ranking), [p.ranking]);
  const maxMention = Math.max(...ordered.map((r) => r.mentionRate), 1);
  const maxCite = Math.max(...ordered.map((r) => r.citationRate), 1);
  const lead = competitorsLead(p.lead);
  const heatMax = p.heat ? Math.max(65, ...p.heat.rows.flatMap((r) => r.cells.map((c) => c.rate))) : 65;

  const toggle = (key: string) =>
    setOff((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else if (p.evo && p.evo.series.length - next.size > 1) next.add(key);
      return next;
    });

  const goPrompts = (competitor: string | null) =>
    router.push(`/dashboard/projects/${p.projectId}/prompts${competitor ? `?competitor=${encodeURIComponent(competitor)}` : ""}`);

  const manageButton = (
    <button
      type="button"
      className="btn line sm"
      onClick={() => setManaging("manage")}
      aria-label="Gestionar competidores"
      title="Gestionar competidores"
    >
      <Ic n="users" sm />
      <span className="ph-lbl">Gestionar competidores</span>
    </button>
  );

  const gapRows = p.gap ? p.gap.rowsByCategory[gapCat] : [];

  return (
    <>
      <PageHead
        title="Competidores"
        count={`${p.competitorCount} ${p.competitorCount === 1 ? "competidor" : "competidores"}`}
        action={manageButton}
        lead={
          lead.length > 0
            ? lead.map((part, i) => (part.strong ? <b key={i}>{part.text}</b> : <span key={i}>{part.text}</span>))
            : null
        }
      />

      {!p.hasCompetitors ? (
        <div className="empty-s">
          <b>No hay competidores configurados</b>
          <p>Añade el primer competidor para ver cómo te comparas con él en las respuestas de la IA.</p>
        </div>
      ) : !p.hasData ? (
        <div className="empty-s">
          <b>Sin datos de competencia todavía</b>
          <p>Las menciones de tus competidores aparecerán aquí tras completar el primer escaneo.</p>
          <Link href={`/dashboard/projects/${p.projectId}`} className="btn line sm">
            Ir a visión general <Ic n="chevr" sm />
          </Link>
        </div>
      ) : (
        <>
          <section className="sec">
            <div className="card cx-rank">
              <div className="card-h">
                <h3>Ranking</h3>
                <span className="see num" style={{ cursor: "default" }}>
                  Ordenado por menciones{p.basis ? ` · ${p.basis}` : ""}
                </span>
              </div>
              <div className="card-b">
                <div className="cx-h" aria-hidden="true">
                  <span>#</span>
                  <span>Marca</span>
                  <span>Menciones</span>
                  <span>Citas</span>
                  <span>Puesto medio</span>
                </div>
                <ol className="cx-l">
                  {ordered.map((r, i) => (
                    <li key={r.key} className={`cx-r${r.you ? " me" : ""}`}>
                      <span className="pos num">{String(i + 1).padStart(2, "0")}</span>
                      <span className="who">
                        <ProjectFav domain={r.domain} name={r.name} />
                        <span>
                          <b>{r.name}</b>
                          {r.you ? <span className="you">Tú</span> : null}
                          <span className="mono">{r.domain}</span>
                        </span>
                      </span>
                      <span className="mt">
                        <i>Menciones</i>
                        <b className="num">
                          <Roll value={r.mentionRate} />
                          <small>%</small>
                        </b>
                        <Bar value={r.mentionRate} max={maxMention * 1.08} cls={`thin ${r.you ? "" : "ink nomark"}`} delay={i * 60} />
                      </span>
                      <span className="mt">
                        <i>Citas</i>
                        <b className="num">
                          <Roll value={r.citationRate} />
                          <small>%</small>
                        </b>
                        <Bar value={r.citationRate} max={maxCite * 1.08} cls={`thin nomark ${r.you ? "" : "ink"}`} delay={i * 60 + 40} />
                      </span>
                      <span className="avg num">
                        <i>Puesto medio</i>
                        {r.meanRank != null ? `${fmtD(r.meanRank)}º` : "-"}
                        {r.meanRank != null && !r.qualified ? <small className="thin-tag">pocas menciones</small> : null}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="cp-note">Menciones: respuestas que nombran la marca. Citas: respuestas que enlazan su web como fuente.</p>
                <p className="cp-al" id="identidad-de-marca">
                  <Ic n="shield" sm />
                  <span>
                    {p.aliases.length > 0 ? (
                      <>
                        También cuenta como {p.brand}:{" "}
                        {p.aliases.map((a, i) => <b key={a}>{i > 0 ? ", " : ""}{a}</b>)}.
                      </>
                    ) : (
                      <>Se analiza {p.brand}, no hay ningún alias de marca configurado.</>
                    )}
                  </span>
                  <button type="button" className="btn sm ghost" onClick={() => setManaging("manage")}>
                    Gestionar alias
                  </button>
                </p>
              </div>
            </div>
          </section>

          {p.evo ? (
            <section className="sec">
              <div className="eyebrow">Evolución del puesto medio</div>
              <div className="card">
                <div className="card-b">
                  <div className="cp-tg" role="group" aria-label="Marcas en el gráfico">
                    {p.evo.series.map((s) => {
                      const st = lineStyle(s, Math.max(p.evo!.series.filter((x) => !x.isBrand).findIndex((x) => x.key === s.key), 0));
                      return (
                        <button key={s.key} type="button" className="fchip" aria-pressed={!off.has(s.key)} onClick={() => toggle(s.key)}>
                          <i className="cp-sw" style={{ borderTop: `2px ${st.dash ? "dashed" : "solid"} ${st.stroke}` }} />
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="cp-evw">
                    <EvoChart data={p.evo} off={off} mobile={mobile} />
                  </div>
                  <p className="cp-note">
                    Puesto medio en el que la IA nombra a cada marca cuando la nombra. Más arriba es mejor. Últimos {p.evo.dates.length} escaneos.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {p.heat || p.terrain.length > 0 ? (
            <section className="sec grid2 cx-two">
              {p.heat ? (
                <div className="card">
                  <div className="card-h">
                    <h3>Presencia por motor</h3>
                  </div>
                  <div className="card-b">
                    <div className="cx-hm" role="table" aria-label="Porcentaje de respuestas de cada motor que nombran a cada marca">
                      <div className="cx-hr h" role="row" style={{ gridTemplateColumns: `minmax(0,1.2fr) repeat(${p.heat.engines.length},minmax(0,1fr))` }}>
                        <span role="columnheader" />
                        {p.heat.engines.map((k) => (
                          <span key={k} role="columnheader">
                            <EngineLogo provider={k} size={14} />
                            <em>{engineName(k)}</em>
                          </span>
                        ))}
                      </div>
                      {p.heat.rows.map((r) => (
                        <div key={r.key} className={`cx-hr${r.you ? " me" : ""}`} role="row" style={{ gridTemplateColumns: `minmax(0,1.2fr) repeat(${p.heat!.engines.length},minmax(0,1fr))` }}>
                          <span role="cell" className="n">
                            <span>{r.name}</span>
                          </span>
                          {r.cells.map((c, i) => {
                            const t = heatTone(c.rate, heatMax);
                            return (
                              <span key={i} role="cell" className={`cx-c${t > 46 ? " on-dk" : ""}`} style={{ ["--t" as string]: `${t}%` }} title={c.title} aria-label={`${engineName(p.heat!.engines[i])}: ${c.rate}%`}>
                                <b className="num">{c.rate}</b>
                              </span>
                            );
                          })}
                        </div>
                      ))}
                      <div className="cx-scale" aria-hidden="true">
                        <span>0%</span>
                        <i />
                        <span>{heatMax}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {p.terrain.length > 0 ? (
                <div className="card">
                  <div className="card-h">
                    <h3>Terreno por tema</h3>
                  </div>
                  <div className="card-b cp-terr">
                    {p.terrain.map((t, i) => (
                      <div key={t.topic} className="cp-tr">
                        <div className="h">
                          <b>{t.topic}</b>
                          <span className={`cx-lead ${t.gap > 0 ? "pos" : t.gap < 0 ? "warm" : ""}`}>
                            {t.gap > 0 ? "Lideras tú" : t.gap < 0 ? `Lidera ${t.leaderName}` : "Empate"}
                          </span>
                        </div>
                        <div className="l">
                          <span>Tú</span>
                          <Bar value={t.brandRate} cls="thin" delay={i * 60} />
                          <b className="num">{t.brandRate}%</b>
                        </div>
                        <div className="l">
                          <span>{t.leaderName ?? "Rival"}</span>
                          <Bar value={t.leaderRate} cls="thin ink nomark" delay={i * 60} />
                          <b className="num o">{t.leaderRate}%</b>
                        </div>
                      </div>
                    ))}
                    <p className="cp-note">Porcentaje de respuestas del tema que nombran a cada marca, frente al rival que más sale en él.</p>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {p.gap ? (
            <section className="sec">
              <div className="eyebrow">Brecha de prompts</div>
              <div className="fchips cp-gh" role="group" aria-label="Brecha">
                {GAP_ORDER.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="fchip"
                    aria-pressed={gapCat === c}
                    onClick={() => {
                      setGapCat(c);
                      setGapShown(GAP_PAGE);
                    }}
                  >
                    {GAP_LABEL[c]}
                    <span className="c num">{p.gap!.counts[c]}</span>
                  </button>
                ))}
              </div>
              <p className="cp-gd">{GAP_DESC[gapCat]}</p>
              {gapRows.length === 0 ? (
                <p className="cp-gd">{GAP_EMPTY[gapCat]}</p>
              ) : (
                gapRows.slice(0, gapShown).map((row) => (
                  <button key={row.promptId} type="button" className="cp-gr" onClick={() => goPrompts(row.competitors[0]?.name ?? null)}>
                    <span className="pt">{row.promptText || "Prompt sin texto disponible"}</span>
                    <span className="cs">
                      {row.competitors.length > 0 ? (
                        row.competitors.map((c) => (
                          <span key={c.name} className="cp-cb">
                            {c.name}
                            {c.position != null ? ` · #${c.position}` : ""}
                          </span>
                        ))
                      ) : (
                        <span className="o">Ninguna marca de tu lista</span>
                      )}
                    </span>
                    <span className="e" aria-label={row.engines.length ? `Motores: ${row.engines.map(engineName).join(", ")}` : "Ningún motor"}>
                      {row.engines.map((k) => (
                        <EngineLogo key={k} provider={k} size={13} />
                      ))}
                    </span>
                    <Ic n="chevr" sm />
                  </button>
                ))
              )}
              {gapRows.length > gapShown ? (
                <button type="button" className="btn sm line" style={{ marginTop: 12 }} onClick={() => setGapShown((n) => n + GAP_PAGE)}>
                  Ver {Math.min(GAP_PAGE, gapRows.length - gapShown)} más ({gapRows.length - gapShown} restantes)
                </button>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      <section className="sec">
        <div className="card cp-sug cx-sug">
          <div className="card-h">
            <h3>Competidores sugeridos</h3>
          </div>
          <div className="card-b">
            <p className="cp-sp">Marcas que compiten de verdad con la tuya, según a qué se dedica tu negocio. Revísalas antes de seguirlas.</p>
            <Suggested projectId={p.projectId} />
          </div>
        </div>
      </section>

      {managing ? (
        <ManageSheet projectId={p.projectId} brand={p.brand} active={p.manage.active} inactive={p.manage.inactive} aliases={p.aliases} onClose={() => setManaging(null)} />
      ) : null}
    </>
  );
}

export { type Props as InsCompetitorsProps };
