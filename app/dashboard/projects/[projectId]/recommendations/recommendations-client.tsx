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
  action_suggested?: string;
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

type FilterMode = "all" | "high" | "quick" | "content" | "technical" | "authority";

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
  const assumptions = ev.assumptions ?? [];
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
          {/* Two-column evidence grid */}
          <div className="rec-evidence-grid">
            {/* Columna izquierda — Por qué importa */}
            <div className="rec-evidence-col">
              <div className="rec-evidence-col-label">Por qué importa</div>
              {ev.why_this_matters ? (
                <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>
                  {ev.why_this_matters}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "var(--ink-4)", fontStyle: "italic", margin: 0 }}>
                  Sin datos de razonamiento disponibles.
                </p>
              )}
              {affectedPrompts.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 600, marginBottom: 4 }}>
                    {affectedPrompts.length} prompt{affectedPrompts.length !== 1 ? "s" : ""} afectado{affectedPrompts.length !== 1 ? "s" : ""}
                  </div>
                  <ul style={{ fontSize: 12.5, color: "var(--ink-3)", paddingLeft: 16, margin: 0 }}>
                    {affectedPrompts.slice(0, 4).map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {assumptions.length > 0 && (
                <p style={{ fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.5, margin: 0 }}>
                  <span style={{ fontWeight: 600 }}>Supuestos: </span>
                  {assumptions.join(" ")}
                </p>
              )}
            </div>

            {/* Columna derecha — Evidencia */}
            <div className="rec-evidence-col">
              <div className="rec-evidence-col-label">Evidencia</div>
              {snippets.length > 0 ? (
                snippets.slice(0, 3).map((snippet, i) => (
                  <div key={i} className="rec-snippet">&ldquo;{snippet}&rdquo;</div>
                ))
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--ink-4)", margin: 0 }}>
                  Sin fragmentos de evidencia disponibles.
                </p>
              )}
              {competitors.length > 0 && (
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  <span style={{ fontWeight: 600 }}>Competidores: </span>
                  {competitors.join(", ")}
                </p>
              )}
              {domains.length > 0 && (
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  <span style={{ fontWeight: 600 }}>Dominios: </span>
                  {domains.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* Acción sugerida — solo si existe en evidence_json */}
          {ev.action_suggested && (
            <div
              style={{
                marginTop: 4,
                padding: "12px 16px",
                background: "var(--surface-sunk)",
                borderRadius: 10,
                border: "1.5px solid var(--line)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: "var(--ink-4)",
                  marginBottom: 6,
                }}
              >
                Acción sugerida
              </div>
              <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6, margin: 0 }}>
                {ev.action_suggested}
              </p>
            </div>
          )}
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

  // Detect which type filters have data
  const hasContent = recommendations.some((r) => r.recommendation_type === "content");
  const hasTechnical = recommendations.some((r) => r.recommendation_type === "technical");
  const hasAuthority = recommendations.some((r) => r.recommendation_type === "authority");

  const filtered = recommendations.filter((r) => {
    if (filter === "high") return r.priority_rank <= 3;
    if (filter === "quick") return isQuickWin(r);
    if (filter === "content") return r.recommendation_type === "content";
    if (filter === "technical") return r.recommendation_type === "technical";
    if (filter === "authority") return r.recommendation_type === "authority";
    return true;
  });

  const tabs: [FilterMode, string][] = [
    ["all", "Todas"],
    ["high", "Alta prioridad"],
    ["quick", "Victorias rápidas"],
    ...(hasContent ? [["content", "Contenido"] as [FilterMode, string]] : []),
    ...(hasTechnical ? [["technical", "Técnico"] as [FilterMode, string]] : []),
    ...(hasAuthority ? [["authority", "Autoridad"] as [FilterMode, string]] : []),
  ];

  return (
    <>
      {/* Filters */}
      <div className="filters">
        <div className="seg">
          {tabs.map(([key, label]) => (
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
