import { formatMeanPosition } from "@/lib/competitors/mean-rank-copy";
import Link from "next/link";
import type { ReactNode } from "react";
import { Ic } from "@/components/ins/ic";
import { Roll } from "@/components/ins/kit/roll";
import { Bar } from "@/components/ins/kit/bar";
import { LineChart } from "@/components/ins/kit/charts";
import { EngineLogo, engineName } from "@/components/ins/kit/engine";
import { ProjectFav } from "@/components/ins/project-fav";
import { BAND_LABEL, bandOf, type LeadPart, type LeadTarget } from "@/lib/ins/overview-copy";

/**
 * Presentational blocks of Visión general in the «Instrumento» system
 * (CONSOLE-INSTRUMENTO-1 F3, log §352). They only lay out figures the page has
 * already decided to publish: every gate (sample floor, comparable runs,
 * competitive claim) stays in `page.tsx`, so a block that receives no figure
 * renders nothing instead of a placeholder.
 */

const section = (projectId: string) => `/dashboard/projects/${projectId}`;

export function reportHref(projectId: string) {
  return `/informe/${projectId}`;
}

/** Wraps `/ruta` paths of an action in the code style of the prototype (`hiPath`). */
export function HiPath({ text }: { text: string }) {
  const parts = text.split(/(^|[\s«(])(\/[a-z0-9][a-z0-9\-/.]*[a-z0-9])/g);
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    out.push(parts[i]);
    if (parts[i + 1] !== undefined) out.push(parts[i + 1]);
    if (parts[i + 2] !== undefined) {
      out.push(
        <code key={i} className="p">
          {parts[i + 2]}
        </code>
      );
    }
  }
  return <>{out}</>;
}

function ReportButton({ projectId, className }: { projectId: string; className: string }) {
  return (
    <a className={`btn line sm ${className}`} href={reportHref(projectId)} target="_blank" rel="noopener">
      <Ic n="download" sm />
      Descargar informe
    </a>
  );
}

export function OvHeader({
  projectId,
  domain,
  greeting,
  lead,
  hasReport
}: {
  projectId: string;
  domain: string;
  greeting: string;
  lead: LeadPart[] | null;
  hasReport: boolean;
}) {
  const target: Record<LeadTarget, string> = {
    prompts: `${section(projectId)}/prompts`,
    competitors: `${section(projectId)}/competitors`,
    recommendations: `${section(projectId)}/recommendations`
  };
  return (
    <>
      <div className="eyebrow bare">
        Visión general · <span className="mono" style={{ letterSpacing: 0, textTransform: "none" }}>{domain}</span>
      </div>
      <div className="pr-hd">
        <h1>{greeting}</h1>
        {hasReport ? <ReportButton projectId={projectId} className="hd-d" /> : null}
      </div>
      {lead ? (
        <p className="lead">
          {lead.map((part, i) =>
            typeof part === "string" ? (
              part
            ) : (
              <Link key={i} href={target[part.to]}>
                {part.text}
              </Link>
            )
          )}
        </p>
      ) : null}
      {hasReport ? (
        <div className="pills hd-m">
          <ReportButton projectId={projectId} className="" />
        </div>
      ) : null}
    </>
  );
}

export function PriorityAlert({ title, detail, href }: { title: string; detail: string; href: string }) {
  const dot = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);
  return (
    <div className="alert" role="region" aria-label="Prioridad 1">
      <Ic n="warn" />
      <div className="tx">
        <b>{dot(title)}</b> {detail}
      </div>
      <Link className="btn warm sm" href={href}>
        Arreglarlo
        <Ic n="arrowr" sm />
      </Link>
    </div>
  );
}

export type ScoreHeroProps = {
  projectId: string;
  score: number;
  headline: string;
  /** Windowed series and its already formatted dates ("4 oct"); null when a line would claim a trend we cannot publish. */
  trend: { vals: number[]; dates: string[] } | null;
  /** The one sentence that explains why the line is absent (sample too small). */
  nudge: string | null;
  /** Points against the previous scan, only when the comparison is publishable and not zero. */
  delta: number | null;
  engines: Array<{ provider: string; rate: number }>;
};

export function ScoreHero({ projectId, score, headline, trend, nudge, delta, engines }: ScoreHeroProps) {
  const band = bandOf(score);
  const gap = Math.max(0, 70 - score);
  return (
    <section className="sec" aria-label="Puntuación GEO">
      <div className="card agh agh-a ov-h">
        <span className="agh-tab">
          <Ic n="trend" sm />
          Puntuación GEO
        </span>
        <div className="l">
          <svg className="agh-trace" viewBox="0 0 400 300" aria-hidden="true" preserveAspectRatio="none">
            <path d="M-10 250 C 80 240, 120 120, 210 130 S 330 40, 420 30" />
            <path d="M-10 280 C 90 270, 140 170, 230 175 S 340 90, 420 80" />
          </svg>
          <div className="big num">
            <Roll value={score} />
            <small>de 100</small>
          </div>
          <div
            className="agh-sc"
            role="img"
            aria-label={`${score} de 100, banda ${BAND_LABEL[band]}; Competitivo empieza en 70`}
          >
            <i className="f" style={{ width: `${score}%` }} />
            {gap > 0 ? <i className="g" style={{ left: `${score}%`, width: `${gap}%` }} /> : null}
            <i className="bd" style={{ left: "40%" }} />
            <i className="bd" style={{ left: "70%" }} />
            <span className="mk" style={{ left: `${score}%` }} />
            <span className="gl num" style={{ left: "70%" }}>
              70
            </span>
          </div>
          <div className="ov-bands" aria-hidden="true">
            <span className={band === "initial" ? "on" : ""} style={{ width: "40%" }}>
              {BAND_LABEL.initial}
            </span>
            <span className={band === "emerging" ? "on" : ""} style={{ width: "30%" }}>
              {BAND_LABEL.emerging}
            </span>
            <span className={band === "competitive" ? "on" : ""} style={{ width: "30%" }}>
              {BAND_LABEL.competitive}
            </span>
          </div>
          {delta !== null ? (
            <div className="gn">
              <span className={delta > 0 ? "up" : "dn"}>
                <Ic n={delta > 0 ? "arrowup" : "arrowdown"} sm />
                {delta > 0 ? "+" : "−"}
                {Math.abs(delta)} pt
              </span>{" "}
              frente al escaneo anterior
            </div>
          ) : null}
          <h2>{headline}</h2>
          <Link className="btn line" href={`${section(projectId)}/recommendations`}>
            Ver recomendaciones
            <Ic n="arrowr" sm />
          </Link>
        </div>
        <div className="r">
          <div className="rh ev">
            <b>Evolución</b>
          </div>
          {trend ? (
            <div className="evo">
              <LineChart
                vals={trend.vals}
                dates={trend.dates}
                label={`Puntuación GEO en los últimos ${trend.vals.length} escaneos, de ${trend.vals[0]} a ${trend.vals[trend.vals.length - 1]}`}
              />
            </div>
          ) : nudge ? (
            <p className="ov-nudge">{nudge}</p>
          ) : null}
          {engines.length > 0 ? (
            <>
              <div className="rh sub">
                <b>Te nombran por motor</b>
                <span>Último escaneo</span>
              </div>
              {engines.map((e) => (
                <Link key={e.provider} className="er" href={`${section(projectId)}/prompts`}>
                  <span className="t">
                    <EngineLogo provider={e.provider} size={16} />
                    <b>{engineName(e.provider)}</b>
                    {e.provider === "perplexity" ? <span className="new">Nuevo</span> : null}
                  </span>
                  <span className="bb" aria-hidden="true">
                    <i style={{ width: `${e.rate}%` }} />
                  </span>
                  <span className="m num">
                    <Roll value={e.rate} />
                    <small>%</small>
                  </span>
                  <Ic n="chevr" sm />
                </Link>
              ))}
            </>
          ) : (
            <p className="ov-nudge">Aparecerá aquí después de completar un escaneo.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export type KpiView = {
  key: string;
  label: string;
  value: ReactNode;
  unit?: string;
  badge?: { tone: "pos" | "warm" | "line"; text: string; arrow?: "up" | "down" } | null;
  extra?: ReactNode;
};

export function Kpis({ items }: { items: KpiView[] }) {
  return (
    <section className="sec">
      <div className="eyebrow">Indicadores clave</div>
      <div className="kpis">
        {items.map((k) => (
          <div className="kpi" key={k.key}>
            <div className="l">{k.label}</div>
            <div className="v">
              {typeof k.value === "number" ? <b><Roll value={k.value} /></b> : <b style={{ fontSize: 30 }}>{k.value}</b>}
              {k.unit ? <span className="u">{k.unit}</span> : null}
              {k.badge ? (
                <span className={`badge b-${k.badge.tone}`}>
                  {k.badge.arrow ? <Ic n={k.badge.arrow === "up" ? "arrowup" : "arrowdown"} /> : null}
                  {k.badge.text}
                </span>
              ) : null}
            </div>
            {k.extra}
          </div>
        ))}
      </div>
    </section>
  );
}

export function SentimentBar({ positive, neutral, negative }: { positive: number; neutral: number; negative: number }) {
  return (
    <>
      <div className="sent" role="img" aria-label={`${positive}% positivo, ${neutral}% neutral, ${negative}% negativo`}>
        <i style={{ width: `${positive}%`, background: "var(--pos)" }} />
        <i style={{ width: `${neutral}%`, background: "var(--tick-off)" }} />
        <i style={{ width: `${negative}%`, background: "var(--warm)" }} />
      </div>
      <div className="lg num">
        <span>{positive}%</span>
        <span>{neutral}%</span>
        <span>{negative}%</span>
      </div>
    </>
  );
}

export type BreakdownRow = {
  key: string;
  label: string;
  hint: string;
  /** Null when the component could not be measured in this scan. */
  value: number | null;
};

export function Breakdown({ score, rows }: { score: number; rows: BreakdownRow[] }) {
  return (
    <div className="card">
      <div className="card-h">
        <h3>Desglose del GEO Score</h3>
        <span className="see num" style={{ cursor: "default" }}>
          {score}/100
        </span>
      </div>
      <div className="card-b" style={{ paddingTop: 2 }}>
        {rows.map((r, i) => (
          <div className="brk" key={r.key}>
            <div className="n">
              {r.label}
              <span>{r.hint}</span>
            </div>
            {r.value === null ? (
              <div className="v num">
                <small>No disponible</small>
              </div>
            ) : (
              <div className="v num">
                {r.value}
                <small>/100</small>
              </div>
            )}
            {r.value === null ? (
              <Bar value={0} cls="thin" delay={i * 80} />
            ) : (
              <Bar value={r.value} cls={r.value < 25 ? "warm" : ""} delay={i * 80} label={`${r.label}: ${r.value} de 100`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export type RankRow = {
  key: string;
  name: string;
  domain: string | null;
  isBrand: boolean;
  mentionRate: number | null;
  /** Mean rank when named (log §353), never the row's place in the list. */
  position: number | null;
  qualified: boolean;
};

export function Ranking({
  projectId,
  rows,
  secondLabel,
  gapBeforeLast
}: {
  projectId: string;
  rows: RankRow[];
  /** Header of the second metric; null when this scan has no position data. */
  secondLabel: string | null;
  /** The brand's own row follows a skip from the top 5. */
  gapBeforeLast: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.mentionRate ?? 0));
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="card">
      <div className="card-h">
        <h3>Competidores</h3>
        <Link className="see" href={`${section(projectId)}/competitors`}>
          Ver todo
          <Ic n="chevr" sm />
        </Link>
      </div>
      <div className="card-b" style={{ paddingTop: 10 }}>
        <div className={`rank-h${secondLabel ? "" : " no-avg"}`} aria-hidden="true">
          <span>#</span>
          <span>Marca</span>
          <span>Mención</span>
          {secondLabel ? <span>{secondLabel}</span> : null}
        </div>
        <ol className={`rank${secondLabel ? "" : " no-avg"}`}>
          {rows.map((r, i) => (
            <li key={r.key} className={`rk${r.isBrand ? " me" : ""}${gapBeforeLast && i === rows.length - 1 ? " gap" : ""}`}>
              <span className="pos num">{pad(i + 1)}</span>
              <span className="who">
                <ProjectFav domain={r.domain ?? ""} name={r.name} size={22} />
                <span className="nm">{r.name}</span>
                {r.isBrand ? <span className="you">Tú</span> : null}
                {!r.qualified ? <span className="thin">pocas menciones</span> : null}
              </span>
              <span className="men num">
                <b>
                  {r.mentionRate !== null ? Math.round(r.mentionRate) : "—"}
                  {r.mentionRate !== null ? <small>%</small> : null}
                </b>
              </span>
              {secondLabel ? (
                <span className="avg num">
                  <small>{secondLabel} </small>
                  {r.position !== null ? formatMeanPosition(r.position) : "—"}
                </span>
              ) : null}
              <Bar value={r.mentionRate ?? 0} max={max * 1.08} cls={`thin ${r.isBrand ? "" : "ink nomark"}`.trim()} delay={i * 60} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** A quiet card for a block that has nothing to show yet, with the one way to fill it. */
export function QuietCard({
  title,
  text,
  href,
  cta
}: {
  title: string;
  text: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="card">
      <div className="card-b ov-quiet">
        <h3>{title}</h3>
        <p>{text}</p>
        <Link className="btn line sm" href={href}>
          {cta}
          <Ic n="arrowr" sm />
        </Link>
      </div>
    </div>
  );
}
