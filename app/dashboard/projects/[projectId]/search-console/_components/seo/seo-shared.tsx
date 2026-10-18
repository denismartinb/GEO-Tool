"use client";

import type { ActionType } from "@/lib/seo-tracking/topic-actions";
import type { KeywordView, TopicView } from "@/lib/seo-tracking/view-model";

/** SEO-TRACK-1 PR B (log §341): small pieces shared by the tabs of «Posición en Google». */

export const ACTION_TYPE: Record<ActionType, { label: string; cls: string }> = {
  content: { label: "Contenido", cls: "skw-chip-blue" },
  title: { label: "Título", cls: "skw-chip-warn" },
  site: { label: "Tu web", cls: "skw-chip-grey" },
  local: { label: "Local", cls: "skw-chip-pos" },
  links: { label: "Enlaces", cls: "skw-chip-vio" }
};

export function ActionChip({ type }: { type: ActionType }) {
  const t = ACTION_TYPE[type];
  return <span className={`skw-chip ${t.cls}`}>{t.label}</span>;
}

/** Position this week and its move against last week. */
export function PositionCell({ k }: { k: KeywordView }) {
  if (k.state === "pending") return <span className="skw-out">Pendiente</span>;
  if (k.state === "error") return <span className="skw-out">Sin leer esta semana</span>;
  if (k.position === null) return <span className="skw-out">Fuera del Top 20</span>;
  let move = <span className="skw-faint">=</span>;
  if (k.previous === undefined) move = <span className="skw-faint">nueva</span>;
  else if (k.previous === null) move = <span className="skw-up">entra</span>;
  else if (k.position < k.previous) move = <span className="skw-up">↑{k.previous - k.position}</span>;
  else if (k.position > k.previous) move = <span className="skw-down">↓{k.position - k.previous}</span>;
  return (
    <span className="skw-pos">
      <b>{k.position}</b> {move}
    </span>
  );
}

/** Stacked bar of where the topic's keywords are: page 1, page 2, outside the Top 20. */
export function DistBar({ topic }: { topic: TopicView }) {
  const n = topic.pageOne + topic.pageTwo + topic.outside;
  if (n === 0) return <span className="skw-distl">Primera foto el lunes</span>;
  const seg = (v: number, cls: string) => (v ? <i className={cls} style={{ width: `${(v / n) * 100}%` }} /> : null);
  return (
    <>
      <span
        className="skw-dist"
        role="img"
        aria-label={`${topic.pageOne} en la página 1, ${topic.pageTwo} en la página 2, ${topic.outside} fuera del Top 20`}
      >
        {seg(topic.pageOne, "skw-g1")}
        {seg(topic.pageTwo, "skw-g2")}
        {seg(topic.outside, "skw-g3")}
      </span>
      <span className="skw-distl">
        <span>
          <i className="skw-g1" />
          {topic.pageOne} en la página 1
        </span>
        {topic.pageTwo > 0 && (
          <span>
            <i className="skw-g2" />
            {topic.pageTwo} en la página 2
          </span>
        )}
        {topic.outside > 0 && (
          <span>
            <i className="skw-g3" />
            {topic.outside} fuera del Top 20
          </span>
        )}
      </span>
    </>
  );
}

/** 8-week line of the topic's mean position. Lower position is drawn higher. */
export function HistoryLine({ points }: { points: Array<number | null> }) {
  const known = points.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (known.length < 2) return null;
  const vals = known.map((p) => p.v);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = Math.max(1, max - min);
  const x = (i: number) => i * (300 / (points.length - 1));
  const y = (v: number) => 10 + ((v - min) / span) * 66;
  const d = known.map((p, j) => `${j ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = known[known.length - 1];
  return (
    <>
      <svg className="skw-spark" viewBox="0 0 300 90" preserveAspectRatio="none" role="img" aria-label={`Puesto medio: de ${known[0].v} a ${last.v}`}>
        <line x1="0" y1="84" x2="300" y2="84" stroke="var(--line)" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx={x(last.i)} cy={y(last.v)} r="3.5" fill="var(--accent)" />
      </svg>
      <div className="skw-legend">
        <span>Primera semana con dato: {known[0].v}</span>
        <span>
          Esta semana: <b>{last.v}</b>
        </span>
      </div>
    </>
  );
}

export function pathOf(url: string | null): string {
  if (!url) return "—";
  try {
    const p = new URL(url).pathname.replace(/\/+$/, "");
    return p || "/";
  } catch {
    return url;
  }
}
