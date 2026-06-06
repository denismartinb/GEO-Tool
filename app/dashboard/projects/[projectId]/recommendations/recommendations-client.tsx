"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { DotMeter } from "@/components/ui/dot-meter";

type EvidenceJson = {
  why_this_matters?: string;
  assumptions?: string[];
  affected_prompts?: string[];
  evidence_snippets?: string[];
  mentioned_competitors?: string[];
  citation_domains?: string[];
};

export type Recommendation = {
  id: string;
  priority_rank: number;
  title: string;
  description: string;
  recommendation_type: string;
  impact: string;
  effort: string;
  confidence: string;
  status: string;
  source_type: string;
  evidence_json: EvidenceJson | null;
};

type FilterMode = "all" | "high" | "quick";

function impactToN(val: string): number {
  if (val === "high") return 5;
  if (val === "medium" || val === "med") return 3;
  return 1;
}

function effortToN(val: string): number {
  if (val === "high") return 5;
  if (val === "medium" || val === "med") return 3;
  return 1;
}

function rankClass(rank: number): string {
  if (rank <= 2) return "high";
  if (rank <= 5) return "med";
  return "low";
}

function isQuickWin(rec: Recommendation): boolean {
  return rec.impact === "high" && rec.effort === "low";
}

function RecCard({ rec }: { rec: Recommendation }) {
  const [open, setOpen] = useState(false);

  const ev: EvidenceJson = rec.evidence_json ?? {};
  const affectedPrompts = ev.affected_prompts ?? [];
  const snippets = ev.evidence_snippets ?? [];
  const competitors = ev.mentioned_competitors ?? [];
  const domains = ev.citation_domains ?? [];
  const quickWin = isQuickWin(rec);
  const rankCls = rankClass(rec.priority_rank);

  const priorityLabel =
    rankCls === "high" ? "Alta" : rankCls === "med" ? "Media" : "Baja";
  const priorityBadgeCls =
    rankCls === "high"
      ? "badge badge-neg"
      : rankCls === "med"
        ? "badge badge-warn"
        : "badge badge-neutral";

  return (
    <div className={`rec-card${open ? " open" : ""}`}>
      <div
        className="rec-main"
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        aria-expanded={open}
      >
        {/* Rank pill */}
        <div className={`rec-rank ${rankCls}`}>{rec.priority_rank}</div>

        {/* Center column */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginBottom: 7,
              flexWrap: "wrap",
            }}
          >
            <span className={priorityBadgeCls}>Prioridad {priorityLabel}</span>
            <span className="badge badge-outline">
              {rec.recommendation_type.replaceAll("_", " ")}
            </span>
            {quickWin && (
              <span className="badge badge-pos">
                <Icon name="bolt" size={11} />
                Victoria rápida
              </span>
            )}
            {rec.confidence === "low" && (
              <span className="badge badge-warn">
                <Icon name="info" size={11} />
                Baja confianza
              </span>
            )}
          </div>
          <div className="rec-title">{rec.title}</div>
          <div className="rec-problem">{rec.description}</div>
        </div>

        {/* Right column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 14,
            flexShrink: 0,
          }}
        >
          <div className="rec-metrics">
            <div className="rmetric">
              <div className="l">Impacto</div>
              <div className="v">
                <DotMeter n={impactToN(rec.impact)} tone="h" />
              </div>
            </div>
            <div className="rmetric">
              <div className="l">Esfuerzo</div>
              <div className="v">
                <DotMeter n={effortToN(rec.effort)} tone="m" />
              </div>
            </div>
            <div className="rmetric">
              <div className="l">Confianza</div>
              <div className="v" style={{ fontSize: 12, fontWeight: 700 }}>
                {rec.confidence === "low" ? (
                  <span className="badge badge-warn" style={{ fontSize: 10 }}>
                    Baja
                  </span>
                ) : rec.confidence === "high" ? (
                  "Alta"
                ) : (
                  "Media"
                )}
              </div>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            {open ? "Ocultar" : "Ver"} recomendación
            <Icon name={open ? "chevDown" : "chevRight"} size={14} />
          </button>
        </div>
      </div>

      {/* Expandable detail */}
      <div className="rec-detail">
        <div className="rec-detail-inner">
          {/* Two-column grid: why + evidence */}
          <div className="rec-detail-grid">
            {/* Why this matters */}
            <div className="detail-block">
              <div className="db-label">Por qué importa</div>
              {ev.why_this_matters ? (
                <p>{ev.why_this_matters}</p>
              ) : (
                <p style={{ color: "var(--ink-4)", fontStyle: "italic" }}>
                  Sin datos de razonamiento disponibles.
                </p>
              )}
              {affectedPrompts.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 7,
                    marginTop: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <span className="badge badge-neutral">
                    <Icon name="prompts" size={11} />
                    {affectedPrompts.length} prompt
                    {affectedPrompts.length !== 1 ? "s" : ""} afectado
                    {affectedPrompts.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
              {affectedPrompts.length > 0 && (
                <ul
                  style={{
                    margin: "10px 0 0",
                    paddingLeft: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {affectedPrompts.slice(0, 4).map((p) => (
                    <li
                      key={p}
                      style={{
                        fontSize: 12,
                        color: "var(--ink-2)",
                        display: "flex",
                        gap: 6,
                        alignItems: "flex-start",
                      }}
                    >
                      <span style={{ color: "var(--ink-4)", flexShrink: 0 }}>
                        ·
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Evidence */}
            <div className="detail-block">
              <div className="db-label">Evidencia</div>
              {snippets.length > 0 ? (
                <div className="evidence">
                  {snippets.slice(0, 2).map((s) => (
                    <div key={s} className="ev-quote" style={{ marginBottom: 8 }}>
                      &ldquo;{s}&rdquo;
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--ink-4)", fontStyle: "italic" }}>
                  Sin fragmentos de evidencia disponibles.
                </p>
              )}
              {domains.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <Icon
                    name="link"
                    size={12}
                    className=""
                  />
                  {domains.slice(0, 4).map((d) => (
                    <span
                      key={d}
                      className="badge badge-outline"
                      style={{ fontFamily: "var(--mono)", fontSize: 10 }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              )}
              {competitors.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--ink-4)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Competidores:{" "}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                    {competitors.join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Suggested action */}
          <div className="detail-block">
            <div className="db-label">Acción sugerida</div>
            <div className="rec-action-block">
              <div className="rec-action-ico">
                <Icon name="target" size={16} />
              </div>
              <p style={{ flex: 1, margin: 0 }}>{rec.description}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecommendationsClient({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  const [filter, setFilter] = useState<FilterMode>("all");

  const filtered = recommendations.filter((r) => {
    if (filter === "high") return r.priority_rank <= 3;
    if (filter === "quick") return isQuickWin(r);
    return true;
  });

  return (
    <>
      {/* Filters */}
      <div className="filters">
        <div className="seg">
          {(
            [
              ["all", "Todas"],
              ["high", "Alta prioridad"],
              ["quick", "Victorias rápidas"],
            ] as [FilterMode, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "on" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      {filtered.map((rec) => (
        <RecCard key={rec.id} rec={rec} />
      ))}

      {filtered.length === 0 && (
        <div className="section-empty">
          <div className="section-empty-title">
            No hay recomendaciones con este filtro
          </div>
          <div className="section-empty-desc">
            Prueba con &ldquo;Todas&rdquo; para ver el backlog completo.
          </div>
        </div>
      )}
    </>
  );
}
