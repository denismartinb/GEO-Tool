"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Ic } from "@/components/ins/ic";

/**
 * «Cuadro claro» of «Visibilidad en agentes» (CONSOLE-INSTRUMENTO-1, prototype
 * `i-src/screens/agents.js`, `ckBlock`): the big dial with the score, four
 * small dials, one warning light per component and the headline. Every figure
 * is handed in already computed from the stored agentic review; this file only
 * draws. The ignition (needle sweep, bulb check) plays once per arrival and is
 * ambient: it does not encode progress. With reduced motion it sits in its
 * final state.
 */

export type ClusterBand = "ok" | "mid" | "bad" | "na";

export type ClusterDial = { id: string; name: string; value: number | null; band: ClusterBand; label: string };
export type ClusterLight = { id: string; icon: string; band: ClusterBand; title: string; line: string };

const SWEEP = 270;
const START = 135;

function pt(cx: number, cy: number, r: number, f: number): [number, number] {
  const t = ((START + SWEEP * f) * Math.PI) / 180;
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
}

function arc(cx: number, cy: number, r: number, f0: number, f1: number): string {
  const [x0, y0] = pt(cx, cy, r, f0);
  const [x1, y1] = pt(cx, cy, r, f1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${(f1 - f0) * SWEEP > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const deg = (v: number) => `${(START + (SWEEP * v) / 100).toFixed(1)}deg`;

function MainDial({ score, target }: { score: number; target: number | null }) {
  const c = 160;
  const r = 118;
  const full = arc(c, c, r, 0, 1);
  const label = (n: number) => pt(c, c, r + 42, n / 100);
  return (
    <div className="ck-main">
      <span className="ck-sweep" aria-hidden="true" />
      <svg viewBox="0 0 320 300" role="img" aria-label={`Visibilidad agéntica ${score} de 100`}>
        <g className="ck-tk">
          {Array.from({ length: 51 }, (_, i) => {
            const f = i / 50;
            const major = i % 5 === 0;
            const [x0, y0] = pt(c, c, r + 14, f);
            const [x1, y1] = pt(c, c, r + (major ? 26 : 20), f);
            return (
              <line
                key={i}
                className={major ? "mj" : undefined}
                style={{ "--k": i } as React.CSSProperties}
                x1={x0.toFixed(1)}
                y1={y0.toFixed(1)}
                x2={x1.toFixed(1)}
                y2={y1.toFixed(1)}
              />
            );
          })}
        </g>
        {[0, 20, 40, 60, 80, 100].map((n) => {
          const [x, y] = label(n);
          return (
            <text key={n} x={x.toFixed(1)} y={(y + 4).toFixed(1)} textAnchor="middle">
              {n}
            </text>
          );
        })}
        <path className="z bad" d={arc(c, c, r + 8, 0, 0.494)} />
        <path className="z mid" d={arc(c, c, r + 8, 0.506, 0.744)} />
        <path className="z ok" d={arc(c, c, r + 8, 0.756, 1)} />
        <path className="trk" d={full} />
        <path className="val" d={full} pathLength={100} stroke="var(--blue)" />
        {target !== null ? (
          <g className="tgt">
            <circle cx={pt(c, c, r + 8, target / 100)[0].toFixed(1)} cy={pt(c, c, r + 8, target / 100)[1].toFixed(1)} r="4" />
            <text x={pt(c, c, r - 30, target / 100)[0].toFixed(1)} y={(pt(c, c, r - 30, target / 100)[1] + 4).toFixed(1)} textAnchor="middle">
              {target}
            </text>
          </g>
        ) : null}
        <g className="ndl">
          <line x1={c} y1={c} x2={c + r - 16} y2={c} />
          <circle className="tip" cx={c + r - 16} cy={c} r="3.5" />
        </g>
        <circle className="hub" cx={c} cy={c} r="11" />
        <circle className="hub2" cx={c} cy={c} r="4" />
      </svg>
      <div className="rd">
        <b className="num">{score}</b>
        <small>de 100</small>
        <span>Visibilidad agéntica</span>
      </div>
    </div>
  );
}

function SmallDial({ dial, index, href }: { dial: ClusterDial; index: number; href: string }) {
  const c = 60;
  const r = 44;
  const value = dial.value;
  return (
    <Link
      className={`ck-sm ${dial.band}`}
      href={href}
      style={{ "--v": value ?? 0, "--av": deg(value ?? 0), "--d": `${(1.5 + index * 0.14).toFixed(2)}s` } as React.CSSProperties}
      aria-label={`${dial.name}: ${dial.label}`}
    >
      <span className="dl">
        <svg viewBox="0 0 120 112" aria-hidden="true">
          <g className="ck-tk">
            {Array.from({ length: 11 }, (_, k) => {
              const [x0, y0] = pt(c, c, r + 7, k / 10);
              const [x1, y1] = pt(c, c, r + 12, k / 10);
              return <line key={k} x1={x0.toFixed(1)} y1={y0.toFixed(1)} x2={x1.toFixed(1)} y2={y1.toFixed(1)} />;
            })}
          </g>
          <path className="trk" d={arc(c, c, r, 0, 1)} />
          {value !== null ? <path className="val" d={arc(c, c, r, 0, 1)} pathLength={100} /> : null}
          {value !== null ? (
            <g className="ndl">
              <line x1={c} y1={c} x2={c + r - 8} y2={c} />
            </g>
          ) : null}
          <circle className="hub" cx={c} cy={c} r="5" />
        </svg>
        <span className="in">
          <b className="num">{value === null ? "–" : value}</b>
        </span>
      </span>
      <b className="nm">{dial.name}</b>
      <span className="st">
        <i className="sh" aria-hidden="true" />
        {dial.label}
      </span>
    </Link>
  );
}

export function VisibilityCluster({
  score,
  target,
  dials,
  lights,
  headline,
  note,
  auditHref
}: {
  score: number;
  target: number | null;
  dials: ClusterDial[];
  lights: ClusterLight[];
  headline: string;
  note: React.ReactNode;
  auditHref: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Server HTML is the final state (`done`); on arrival the ignition plays once.
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.remove("done");
    void el.offsetWidth;
    el.classList.add("go");
  }, []);

  const hrefOf = (id: string) => `${auditHref}?componente=${id}`;
  return (
    <section className="sec" aria-label="Visibilidad agéntica">
      <div
        ref={ref}
        className="card ck ck-lt done"
        style={
          {
            "--v": score,
            "--av": deg(score),
            "--a0": deg(0),
            "--a100": deg(100),
            "--avlo": deg(Math.max(0, score - 5))
          } as React.CSSProperties
        }
      >
        <span className="agh-tab">
          <Ic n="agent" sm />
          Visibilidad agéntica
        </span>
        <div className="ck-clu">
          <div className="ck-side">
            {dials.slice(0, 2).map((d, i) => (
              <SmallDial key={d.id} dial={d} index={i} href={hrefOf(d.id)} />
            ))}
          </div>
          <MainDial score={score} target={target} />
          <div className="ck-side">
            {dials.slice(2, 4).map((d, i) => (
              <SmallDial key={d.id} dial={d} index={i + 2} href={hrefOf(d.id)} />
            ))}
          </div>
        </div>
        <div className="ck-lights" role="list" aria-label="Testigos">
          {lights.map((l, i) => (
            <Link key={l.id} role="listitem" className={`lt ${l.band}`} href={hrefOf(l.id)} style={{ "--i": i } as React.CSSProperties}>
              <span className="bulb">
                <Ic n={l.icon} />
              </span>
              <span className="tx">
                <b>{l.title}</b>
                <small>{l.line}</small>
              </span>
            </Link>
          ))}
        </div>
        <div className="ck-ft">
          <div>
            <h2>{headline}</h2>
            <p>{note}</p>
          </div>
          <Link className="btn ck-btn" href={auditHref}>
            Ver la auditoría
            <Ic n="arrowr" sm />
          </Link>
        </div>
      </div>
    </section>
  );
}
