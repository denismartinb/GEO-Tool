"use client";

import React, { useState } from "react";
import { PromptDrawer } from "@/components/prompts/prompt-drawer";
import { InfoTip } from "@/components/ui/info-tip";
import { Icon } from "@/components/ui/icon";
import { getEngineMeta, normalizeProvider } from "@/lib/scan/engine-meta";
import type { ResultRow, TopicGroup } from "./page";

type Competitor = {
  id: string;
  name: string;
  domain: string;
};

type PromptsClientProps = {
  projectId: string;
  results: ResultRow[];
  hasTopics: boolean;
  topicGroups: TopicGroup[];
  competitors: Competitor[];
  totalPrompts: number;
  scannedPrompts: number;
  totalTopics: number;
};

type ExtractedCompetitor = { name?: string; mentioned?: boolean };
type ExtractedJsonShape = { competitors?: ExtractedCompetitor[] };

type PromptGroup = {
  key: string;
  promptText: string | null;
  engines: ResultRow[];
  brandMentioned: boolean;
  citationsTotal: number;
  competitorsCount: number;
  sentimentDominant: string | null;
};

function sentimentLabel(s: string | null): string {
  const map: Record<string, string> = {
    positive: "Positivo",
    neutral: "Neutral",
    negative: "Negativo",
    mixed: "Mixto",
    // Founder decision: extraction's "unknown" reads as "Neutral" in the UI
    // instead of leaking the raw English value.
    unknown: "Neutral",
  };
  return s ? (map[s] ?? s) : "—";
}

function parseExtracted(raw: unknown): ExtractedJsonShape {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJsonShape;
}

// Mirrors the sentiment-mode aggregation already used server-side for topic
// groups (page.tsx) — same logic, applied across an individual prompt's
// per-engine rows instead of a whole category's rows.
function dominantSentiment(rows: ResultRow[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.sentiment) continue;
    counts.set(r.sentiment, (counts.get(r.sentiment) ?? 0) + 1);
  }
  let dominant: string | null = null;
  let topCount = 0;
  for (const [sentiment, count] of counts) {
    if (count > topCount) {
      topCount = count;
      dominant = sentiment;
    }
  }
  return dominant;
}

// Union (not sum) across engines: the same competitor mentioned by both
// Gemini and Claude must count once, not twice.
function mentionedCompetitorsUnion(rows: ResultRow[]): number {
  const names = new Set<string>();
  for (const r of rows) {
    const ext = parseExtracted(r.extracted_json);
    for (const c of ext.competitors ?? []) {
      if (c.mentioned && c.name) names.add(c.name.trim().toLowerCase());
    }
  }
  return names.size;
}

// Prompt × engine matrix (ENGINES-VALUE-1): one chip per EXISTING row for
// this prompt, never an invented one for an engine with no row (absence of a
// row means "no data", not "brand absent"). Alphabetical order by normalized
// provider keeps the column stable across rows with different engines present.
function EngineChips({ engines }: { engines: ResultRow[] }) {
  const sorted = [...engines].sort((a, b) =>
    normalizeProvider(a.provider).localeCompare(normalizeProvider(b.provider))
  );

  return (
    <div style={{ display: "flex", gap: 4 }}>
      {sorted.map((r) => {
        const meta = getEngineMeta(r.provider);
        const baseStyle: React.CSSProperties = {
          padding: "2px 8px",
          borderRadius: 999,
          fontSize: 10.5,
          fontWeight: 700,
          whiteSpace: "nowrap",
          flexShrink: 0,
        };

        if (r.brand_mentioned === true) {
          return (
            <span
              key={r.id}
              title={`${meta.label}: marca mencionada`}
              style={{ ...baseStyle, background: meta.color, color: "#fff" }}
            >
              {meta.label}
            </span>
          );
        }

        if (r.brand_mentioned === false) {
          return (
            <span
              key={r.id}
              title={`${meta.label}: marca ausente`}
              style={{
                ...baseStyle,
                background: "transparent",
                border: `1.5px solid ${meta.color}`,
                color: meta.color,
              }}
            >
              {meta.label}
            </span>
          );
        }

        // brand_mentioned === null → failed/unextracted row for this engine.
        return (
          <span
            key={r.id}
            title={`${meta.label}: sin datos en este escaneo`}
            style={{
              ...baseStyle,
              background: "transparent",
              border: "1.5px solid var(--ink-4)",
              color: "var(--ink-4)",
            }}
          >
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

// Multi-engine execution means a prompt can have up to one
// scan_prompt_results row per active engine (Gemini, Claude). Group them
// back into one row per prompt for list display; the full per-engine array
// is still passed to the drawer for drill-down.
function groupByPrompt(rows: ResultRow[]): PromptGroup[] {
  const order: string[] = [];
  const groups = new Map<string, ResultRow[]>();
  for (const r of rows) {
    const key = r.prompt_id ?? r.id;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(r);
  }
  return order.map((key) => {
    const engines = groups.get(key)!;
    return {
      key,
      promptText: engines[0].prompt_text_snapshot,
      engines,
      brandMentioned: engines.some((r) => r.brand_mentioned),
      citationsTotal: engines.reduce((sum, r) => sum + (r.citations_count ?? 0), 0),
      competitorsCount: mentionedCompetitorsUnion(engines),
      sentimentDominant: dominantSentiment(engines),
    };
  });
}

export function PromptsClient({
  projectId,
  results,
  hasTopics,
  topicGroups,
  competitors,
  totalPrompts,
  scannedPrompts,
  totalTopics,
}: PromptsClientProps) {
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(
    () => new Set(topicGroups.map((g) => g.category))
  );

  const selectedEngineResults =
    selectedPromptId !== null
      ? results.filter((r) => (r.prompt_id ?? r.id) === selectedPromptId)
      : [];

  const flatGroups = groupByPrompt(results).sort((a, b) => {
    if (a.brandMentioned === b.brandMentioned) return 0;
    return a.brandMentioned ? 1 : -1;
  });

  // Header insight: how many scanned prompts actually name the brand, and which
  // topics carry / drag the brand's visibility. Derived from the same data
  // already rendered in the table — no extra fetch.
  const scannedGroups = flatGroups.length;
  const brandPresent = flatGroups.filter((g) => g.brandMentioned).length;
  const brandAbsent = scannedGroups - brandPresent;
  const rankedTopics = [...topicGroups].sort((a, b) => b.visibilidad - a.visibilidad);
  const bestTopic = rankedTopics[0] ?? null;
  const worstTopic = rankedTopics.length > 1 ? rankedTopics[rankedTopics.length - 1] : null;

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
      {/* Summary banner — unified with Overview / Citations / Recommendations */}
      <div className="summary mt8" style={{ marginBottom: 16 }}>
        <div className="summary-ico">
          <Icon name="prompts" size={20} />
        </div>
        <div className="summary-txt" style={{ flex: 1 }}>
          GenScore monitoriza{" "}
          <b>{totalPrompts} {totalPrompts === 1 ? "prompt" : "prompts"}</b>
          {hasTopics ? (
            <>
              {" "}agrupados en <b>{totalTopics} topics</b>
            </>
          ) : null}
          .
          {scannedGroups > 0 ? (
            <>
              {" "}Tu marca aparece en <b>{brandPresent} de {scannedGroups}</b>
              {scannedPrompts < totalPrompts ? " escaneados" : ""}
              {brandAbsent > 0 ? (
                <>
                  ; en{" "}
                  <span className="hl-neg">
                    {brandAbsent} {brandAbsent === 1 ? "sigue ausente" : "siguen ausentes"}
                  </span>
                  , donde la IA responde sin nombrarte.
                </>
              ) : (
                <>
                  {" "}—{" "}
                  <span className="hl-pos">presente en todos los escaneados</span>.
                </>
              )}
            </>
          ) : (
            <> Aún no hay resultados de escaneo para estos prompts.</>
          )}
          {hasTopics && bestTopic && worstTopic && bestTopic.category !== worstTopic.category ? (
            <>
              {" "}Tu topic más fuerte es «{bestTopic.category}» ({bestTopic.visibilidad}%); el más
              flojo, «{worstTopic.category}» ({worstTopic.visibilidad}%).
            </>
          ) : null}
        </div>
      </div>

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
            Tus prompts no tienen topics asignados todavía. Cuando GenScore genere
            topics automáticamente, aparecerán agrupados aquí.
          </div>

          <div className="card">
            <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 16 }}>Prompt</th>
                  <th>
                    Marca
                    <InfoTip text="Que la IA nombre tu marca no depende de tu contenido — puede venir solo de lo que el modelo ya sabe de ella. 'Citas', a la derecha, es la señal que sí depende de páginas tuyas que la IA usó como fuente." />
                  </th>
                  <th>Motores</th>
                  <th className="num">Competidores</th>
                  <th className="num">Citas</th>
                  <th>Sentimiento</th>
                </tr>
              </thead>
              <tbody>
                {flatGroups.map((g) => (
                  <tr
                    key={g.key}
                    className="hoverable"
                    onClick={() => setSelectedPromptId(g.key)}
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
                        {g.promptText ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${g.brandMentioned ? "badge-pos" : "badge-neg"}`}
                      >
                        {g.brandMentioned ? "Mencionada" : "Ausente"}
                      </span>
                    </td>
                    <td>
                      <EngineChips engines={g.engines} />
                    </td>
                    <td className="num">{g.competitorsCount}</td>
                    <td className="num">{g.citationsTotal}</td>
                    <td>
                      {g.sentimentDominant ? (
                        <span
                          className={`badge ${
                            g.sentimentDominant === "positive"
                              ? "badge-pos"
                              : g.sentimentDominant === "negative"
                                ? "badge-neg"
                                : "badge-neutral"
                          }`}
                        >
                          {sentimentLabel(g.sentimentDominant)}
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
          </div>
        </>
      )}

      {/* Modo Topics */}
      {hasTopics && (
        <>
          <div className="card">
            <div className="tbl-wrap">
            <table className="tbl topics-tbl">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 16 }}>Topic / Prompt</th>
                  <th className="num">Visibilidad</th>
                  <th className="num">Menciones</th>
                  <th>
                    Marca
                    <InfoTip text="Que la IA nombre tu marca no depende de tu contenido — puede venir solo de lo que el modelo ya sabe de ella. 'Citas', a la derecha, es la señal que sí depende de páginas tuyas que la IA usó como fuente." />
                  </th>
                  <th>Motores</th>
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
                      <td>
                        <span style={{ color: "var(--ink-4)" }}>—</span>
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
                      groupByPrompt(group.results).map((g) => (
                        <tr
                          key={g.key}
                          className="prompt-row hoverable"
                          onClick={() => setSelectedPromptId(g.key)}
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
                              {g.promptText ?? "—"}
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
                              className={`badge ${g.brandMentioned ? "badge-pos" : "badge-neg"}`}
                            >
                              {g.brandMentioned ? "Mencionada" : "Ausente"}
                            </span>
                          </td>
                          <td>
                            <EngineChips engines={g.engines} />
                          </td>
                          <td className="num">
                            {g.citationsTotal > 0 ? (
                              g.citationsTotal
                            ) : (
                              <span style={{ color: "var(--ink-4)" }}>0</span>
                            )}
                          </td>
                          <td>
                            {g.sentimentDominant ? (
                              <span
                                className={`badge ${
                                  g.sentimentDominant === "positive"
                                    ? "badge-pos"
                                    : g.sentimentDominant === "negative"
                                      ? "badge-neg"
                                      : "badge-neutral"
                                }`}
                              >
                                {sentimentLabel(g.sentimentDominant)}
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
          </div>
        </>
      )}

      <PromptDrawer
        projectId={projectId}
        results={selectedEngineResults}
        competitors={competitors}
        onClose={() => setSelectedPromptId(null)}
      />
    </>
  );
}
