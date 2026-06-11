"use client";

import React, { useState } from "react";
import { PromptDrawer } from "@/components/prompts/prompt-drawer";
import type { ResultRow, TopicGroup } from "./page";

type Competitor = {
  id: string;
  name: string;
  domain: string;
};

type PromptsClientProps = {
  results: ResultRow[];
  hasTopics: boolean;
  topicGroups: TopicGroup[];
  competitors: Competitor[];
  totalPrompts: number;
  totalTopics: number;
};

function sentimentLabel(s: string | null): string {
  const map: Record<string, string> = {
    positive: "Positivo",
    neutral: "Neutral",
    negative: "Negativo",
    mixed: "Mixto",
  };
  return s ? (map[s] ?? s) : "—";
}

export function PromptsClient({
  results,
  hasTopics,
  topicGroups,
  competitors,
  totalPrompts,
  totalTopics,
}: PromptsClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(
    () => new Set(topicGroups.map((g) => g.category))
  );

  const selectedResult =
    selectedId !== null ? results.find((r) => r.id === selectedId) ?? null : null;

  function toggleTopic(cat: string) {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  return (
    <>
      {/* Modo flat sin topics */}
      {!hasTopics && (
        <>
          <div
            style={{
              border: "1.5px dashed var(--line-strong)",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 13,
              color: "var(--ink-3)",
              marginBottom: 16,
            }}
          >
            Tus prompts no tienen topics asignados todavía. Cuando Lumira genere
            topics automáticamente, aparecerán agrupados aquí.
          </div>

          <div className="card">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 16 }}>Prompt</th>
                  <th>Marca</th>
                  <th className="num">Competidores</th>
                  <th className="num">Citas</th>
                  <th>Sentimiento</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.id}
                    className="hoverable"
                    onClick={() => setSelectedId(r.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ paddingLeft: 16, maxWidth: 360 }}>
                      <span
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          fontSize: 13,
                          color: "var(--ink)",
                          lineHeight: 1.45,
                        }}
                      >
                        {r.prompt_text_snapshot ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${r.brand_mentioned ? "badge-pos" : "badge-neg"}`}
                      >
                        {r.brand_mentioned ? "Mencionada" : "Ausente"}
                      </span>
                    </td>
                    <td className="num">
                      {r.mentioned_competitors_count ?? 0}
                    </td>
                    <td className="num">
                      {r.citations_count ?? 0}
                    </td>
                    <td>
                      {r.sentiment ? (
                        <span
                          className={`badge ${
                            r.sentiment === "positive"
                              ? "badge-pos"
                              : r.sentiment === "negative"
                                ? "badge-neg"
                                : "badge-neutral"
                          }`}
                        >
                          {sentimentLabel(r.sentiment)}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-4)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modo Topics */}
      {hasTopics && (
        <>
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-3)",
              marginBottom: 16,
            }}
          >
            Monitorizas{" "}
            <b style={{ color: "var(--ink)" }}>{totalPrompts} prompts</b>{" "}
            agrupados en{" "}
            <b style={{ color: "var(--ink)" }}>{totalTopics} topics</b>. Pulsa
            un prompt para ver la respuesta de cada motor de IA.
          </p>

          <div className="card">
            <table className="tbl topics-tbl">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 16 }}>Topic / Prompt</th>
                  <th className="num">Visibilidad</th>
                  <th className="num">Menciones</th>
                  <th>Marca</th>
                  <th className="num">Citas</th>
                  <th>Sentimiento</th>
                </tr>
              </thead>
              <tbody>
                {topicGroups.map((group) => (
                  <React.Fragment key={`topic-${group.category}`}>
                    <tr
                      className="topic-row"
                      onClick={() => toggleTopic(group.category)}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ paddingLeft: 16 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span className="topic-chevron">
                            {expandedTopics.has(group.category) ? "▾" : "▸"}
                          </span>
                          <span className="topic-label">{group.category}</span>
                          <span className="nav-count" style={{ marginLeft: 4 }}>
                            {group.results.length}
                          </span>
                        </div>
                      </td>
                      <td className="num">
                        <span style={{ fontWeight: 700, fontSize: 13 }}>
                          {group.visibilidad}%
                        </span>
                      </td>
                      <td className="num">
                        <span style={{ fontWeight: 700, fontSize: 13 }}>
                          {group.menciones}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                          {group.menciones}/{group.results.length}
                        </span>
                      </td>
                      <td className="num">
                        {group.citasTotal > 0 ? (
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{group.citasTotal}</span>
                        ) : (
                          <span style={{ color: "var(--ink-4)" }}>0</span>
                        )}
                      </td>
                      <td>
                        {group.sentimentDominant ? (
                          <span
                            className={`badge ${
                              group.sentimentDominant === "positive"
                                ? "badge-pos"
                                : group.sentimentDominant === "negative"
                                  ? "badge-neg"
                                  : "badge-neutral"
                            }`}
                          >
                            {sentimentLabel(group.sentimentDominant)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--ink-4)" }}>—</span>
                        )}
                      </td>
                    </tr>
                    {expandedTopics.has(group.category) &&
                      group.results.map((r) => (
                        <tr
                          key={r.id}
                          className="prompt-row hoverable"
                          onClick={() => setSelectedId(r.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <td style={{ paddingLeft: 36 }}>
                            <span
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                fontSize: 13,
                                color: "var(--ink)",
                                lineHeight: 1.45,
                              }}
                            >
                              {r.prompt_text_snapshot ?? "—"}
                            </span>
                          </td>
                          <td className="num">
                            <span style={{ color: "var(--ink-4)" }}>—</span>
                          </td>
                          <td className="num">
                            <span style={{ color: "var(--ink-4)" }}>—</span>
                          </td>
                          <td>
                            <span
                              className={`badge ${r.brand_mentioned ? "badge-pos" : "badge-neg"}`}
                            >
                              {r.brand_mentioned ? "Mencionada" : "Ausente"}
                            </span>
                          </td>
                          <td className="num">
                            {(r.citations_count ?? 0) > 0 ? (
                              r.citations_count
                            ) : (
                              <span style={{ color: "var(--ink-4)" }}>0</span>
                            )}
                          </td>
                          <td>
                            {r.sentiment ? (
                              <span
                                className={`badge ${
                                  r.sentiment === "positive"
                                    ? "badge-pos"
                                    : r.sentiment === "negative"
                                      ? "badge-neg"
                                      : "badge-neutral"
                                }`}
                              >
                                {sentimentLabel(r.sentiment)}
                              </span>
                            ) : (
                              <span style={{ color: "var(--ink-4)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <PromptDrawer
        result={selectedResult}
        competitors={competitors}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
