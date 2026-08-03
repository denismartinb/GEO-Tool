"use client";

import { useState } from "react";
import { getEngineMeta } from "@/lib/scan/engine-meta";
import type { PromptGapCategory, PromptGapRow, PromptGapSummary } from "@/lib/competitors/prompt-gap";

const CATEGORY_ORDER: PromptGapCategory[] = ["absent", "behind", "ahead", "exclusive", "none"];

const CATEGORY_LABEL: Record<PromptGapCategory, string> = {
  absent: "Ausente",
  behind: "Por detrás",
  ahead: "Por delante",
  exclusive: "En exclusiva",
  none: "Sin nadie"
};

const CATEGORY_BAR_COLOR: Record<PromptGapCategory, string> = {
  absent: "var(--brand-neg)",
  behind: "#f0a3aa",
  ahead: "var(--brand-blue-2)",
  exclusive: "var(--pos)",
  none: "var(--line)"
};

const EMPTY_COPY: Record<PromptGapCategory, string> = {
  absent: "Ningún prompt del último escaneo te deja fuera mientras un rival aparece.",
  behind: "Ningún prompt te posiciona por detrás de un rival en el último escaneo.",
  ahead: "Ningún prompt te posiciona por delante de un rival en el último escaneo.",
  exclusive: "Ningún prompt te menciona en exclusiva, sin rivales presentes.",
  none: "Todos los prompts del último escaneo mencionan a alguien."
};

const PAGE_SIZE = 5;

function PromptRow({ projectId, row }: { projectId: string; row: PromptGapRow }) {
  const leadingCompetitor = row.competitors[0] ?? null;

  function goToPrompts() {
    const url = leadingCompetitor
      ? `/dashboard/projects/${projectId}/prompts?competitor=${encodeURIComponent(leadingCompetitor.name)}`
      : `/dashboard/projects/${projectId}/prompts`;
    window.location.href = url;
  }

  return (
    <div
      className="cm2-prow"
      onClick={goToPrompts}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToPrompts();
        }
      }}
    >
      <div className="cm2-prow-main">
        <div className="cm2-prow-q">{row.promptText || "Prompt sin texto disponible"}</div>
        <div className="cm2-prow-m">
          {row.competitors.map((c) => (
            <span className="cm2-chip cm2-chip-neg" key={c.name}>
              {c.name}
              {c.position != null ? ` · #${c.position}` : ""}
            </span>
          ))}
          {row.engines.map((provider) => {
            const meta = getEngineMeta(provider);
            return (
              <span className="cm2-chip cm2-chip-eng" style={{ background: meta.color }} key={provider}>
                {meta.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PromptGapSection({ projectId, summary }: { projectId: string; summary: PromptGapSummary }) {
  const [active, setActive] = useState<PromptGapCategory>(
    CATEGORY_ORDER.find((c) => summary.counts[c] > 0) ?? "absent"
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const total = summary.totalPrompts || 1;
  const rows = summary.rowsByCategory[active];
  const visibleRows = rows.slice(0, visibleCount);

  function selectCategory(category: PromptGapCategory) {
    setActive(category);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <div className="card">
      <div className="cm2-segs">
        {CATEGORY_ORDER.map((category) => (
          <button
            key={category}
            type="button"
            className={`cm2-seg${active === category ? " on" : ""}`}
            onClick={() => selectCategory(category)}
            aria-pressed={active === category}
          >
            <div className="v">{summary.counts[category]}</div>
            <div className="k">{CATEGORY_LABEL[category]}</div>
          </button>
        ))}
      </div>

      <div className="cm2-gapbar">
        {CATEGORY_ORDER.filter((c) => summary.counts[c] > 0).map((category) => (
          <div
            key={category}
            style={{ width: `${(summary.counts[category] / total) * 100}%`, background: CATEGORY_BAR_COLOR[category] }}
          />
        ))}
      </div>
      <div className="cm2-gaplegend">
        {CATEGORY_ORDER.filter((c) => summary.counts[c] > 0).map((category) => (
          <span key={category}>
            <span className="d" style={{ background: CATEGORY_BAR_COLOR[category] }} />
            {CATEGORY_LABEL[category]}
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="cm2-prow-empty">{EMPTY_COPY[active]}</div>
      ) : (
        <>
          {visibleRows.map((row) => (
            <PromptRow key={row.promptId} projectId={projectId} row={row} />
          ))}
          {rows.length > visibleCount ? (
            <button type="button" className="cm2-prow-more" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
              Ver {Math.min(PAGE_SIZE, rows.length - visibleCount)} prompts más ({rows.length - visibleCount} restantes)
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
