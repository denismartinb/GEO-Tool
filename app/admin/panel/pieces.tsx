import type React from "react";
import { linePoints, type DeltaView } from "@/lib/admin/kpi/model";

/** ADMIN-PANEL-1 — the small pieces every card of /admin/panel shares. */

export function Source({ children }: { children: React.ReactNode }) {
  return <span className="adm-pn-src">{children}</span>;
}

export function CardHead({ title, source }: { title: string; source: string }) {
  return (
    <div className="adm-pn-ch">
      <h2>{title}</h2>
      <Source>{source}</Source>
    </div>
  );
}

export function Unavailable({ children }: { children: React.ReactNode }) {
  return <p className="adm-pn-empty">{children}</p>;
}

export function DeltaLine({ delta, fallback }: { delta: DeltaView | null; fallback?: string }) {
  if (!delta) return <span className="adm-pn-mut">{fallback ?? "sin periodo anterior con datos"}</span>;
  return <span className={`adm-pn-${delta.tone}`}>{delta.text}</span>;
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  return (
    <svg className="adm-pn-spark" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={linePoints(values, 120, 36)} />
    </svg>
  );
}

export function Kpi(props: { label: string; source: string; value: string; delta?: React.ReactNode; spark?: number[] }) {
  return (
    <div className="adm-pn-card adm-pn-kpi">
      <div className="adm-pn-kpi-top">
        <span className="adm-pn-lbl">{props.label}</span>
        <Source>{props.source}</Source>
      </div>
      <div className="adm-pn-big">{props.value}</div>
      <div className="adm-pn-kpi-foot">
        <span className="adm-pn-kpi-delta">{props.delta}</span>
        {props.spark ? <Sparkline values={props.spark} /> : null}
      </div>
    </div>
  );
}
