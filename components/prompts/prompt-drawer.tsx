"use client";

import { useState } from "react";
import type { ResultRow } from "@/app/dashboard/projects/[projectId]/prompts/page";

type Competitor = {
  id: string;
  name: string;
  domain: string;
};

type Props = {
  result: ResultRow | null;
  competitors: Competitor[];
  onClose: () => void;
};

type ExtractedJson = {
  brand?: { mentioned?: boolean; evidence?: string[] };
  competitors?: Array<{ name?: string; mentioned?: boolean; evidence?: string[] }>;
  citations?: Array<{ url?: string; domain?: string; label?: string; evidence?: string }>;
  sentiment?: string;
  summary?: string;
};

const sentimentLabels: Record<string, string> = {
  positive: "Positivo",
  neutral: "Neutral",
  negative: "Negativo",
  mixed: "Mixto",
};

type Tab = "resumen" | "respuestas";

export function PromptDrawer({ result, competitors, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("resumen");

  if (!result) return null;

  const extracted =
    result.extracted_json &&
    typeof result.extracted_json === "object" &&
    !Array.isArray(result.extracted_json)
      ? (result.extracted_json as ExtractedJson)
      : null;

  const extractedCompetitors = extracted?.competitors ?? [];

  const mentionedMap = new Map(
    extractedCompetitors
      .filter((c) => c.name)
      .map((c) => [c.name!.toLowerCase(), c])
  );

  const brandRow = {
    name: "Tu marca",
    isOwn: true,
    mentioned: result.brand_mentioned ?? false,
    evidence: extracted?.brand?.evidence ?? [],
    sentiment: result.sentiment,
  };

  const competitorRows = competitors.map((comp) => {
    const match = mentionedMap.get(comp.name.toLowerCase());
    return {
      name: comp.name,
      isOwn: false,
      mentioned: match?.mentioned ?? false,
      evidence: match?.evidence ?? [],
      sentiment: null,
    };
  });

  const allRows = [brandRow, ...competitorRows].sort((a, b) => {
    if (a.isOwn && a.mentioned) return -1;
    if (b.isOwn && b.mentioned) return 1;
    if (a.mentioned !== b.mentioned) return a.mentioned ? -1 : 1;
    if (b.evidence.length !== a.evidence.length)
      return b.evidence.length - a.evidence.length;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {/* Overlay */}
      <div
        className="prompt-drawer-overlay"
        onClick={onClose}
        aria-label="Cerrar panel"
      />

      {/* Drawer */}
      <div className="prompt-drawer" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="drawer-header">
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: "var(--ink)",
                lineHeight: 1.5,
                fontWeight: 500,
                flex: 1,
              }}
            >
              {result.prompt_text_snapshot ?? "Prompt"}
            </p>
            <button
              onClick={onClose}
              style={{
                flexShrink: 0,
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 18,
                color: "var(--ink-4)",
                lineHeight: 1,
                padding: "2px 4px",
              }}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="drawer-tabs">
          <button
            className={`drawer-tab${tab === "resumen" ? " active" : ""}`}
            onClick={() => setTab("resumen")}
          >
            Resumen
          </button>
          <button
            className={`drawer-tab${tab === "respuestas" ? " active" : ""}`}
            onClick={() => setTab("respuestas")}
          >
            Respuestas
          </button>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {tab === "resumen" && (
            <div>
              {/* Presencia de marca */}
              <div className="aside-card">
                <div className="ac-title">Presencia de tu marca en este prompt</div>
                <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: result.brand_mentioned
                          ? "var(--pos-ink)"
                          : "var(--neg-ink)",
                      }}
                    >
                      {result.brand_mentioned ? "Sí" : "No"}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--ink-4)",
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      mencionada
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: result.citation_found
                          ? "var(--accent-ink)"
                          : "var(--ink-4)",
                      }}
                    >
                      {result.citation_found ? "Sí" : "No"}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--ink-4)",
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      citada
                    </div>
                  </div>
                </div>
              </div>

              {/* Brand Ranking Table */}
              <div
                style={{
                  marginBottom: 16,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--ink-4)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Ranking de marcas
              </div>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  marginBottom: 20,
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--ink-4)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      #
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--ink-4)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Marca
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--ink-4)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Sentimiento
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--ink-4)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Cobertura
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((row, i) => (
                    <tr
                      key={row.name}
                      style={{ borderBottom: "1px solid var(--line)" }}
                    >
                      <td
                        style={{
                          padding: "8px",
                          color: "var(--ink-3)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {i + 1}
                      </td>
                      <td style={{ padding: "8px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <div
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 5,
                              background: row.isOwn
                                ? "var(--accent)"
                                : "var(--surface-sunk)",
                              border: "1px solid var(--line)",
                              display: "grid",
                              placeItems: "center",
                              fontSize: 9,
                              fontWeight: 800,
                              color: row.isOwn ? "#fff" : "var(--ink-3)",
                              flexShrink: 0,
                            }}
                          >
                            {row.name[0].toUpperCase()}
                          </div>
                          <span
                            style={{
                              fontWeight: row.isOwn ? 700 : 500,
                              color: "var(--ink)",
                            }}
                          >
                            {row.name}
                            {row.isOwn && (
                              <span
                                style={{
                                  marginLeft: 4,
                                  fontSize: 10,
                                  color: "var(--accent)",
                                  fontWeight: 600,
                                }}
                              >
                                Tú
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        {row.isOwn && row.sentiment ? (
                          <span
                            className={`badge ${
                              row.sentiment === "positive"
                                ? "badge-pos"
                                : row.sentiment === "negative"
                                  ? "badge-neg"
                                  : "badge-neutral"
                            }`}
                          >
                            {sentimentLabels[row.sentiment] ?? row.sentiment}
                          </span>
                        ) : (
                          <span
                            style={{ color: "var(--ink-4)", fontSize: 12 }}
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "8px", textAlign: "right" }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: row.mentioned
                              ? "var(--pos-ink)"
                              : "var(--ink-4)",
                          }}
                        >
                          {row.mentioned ? "100%" : "0%"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Evidencias de la marca */}
              {(extracted?.brand?.evidence ?? []).length > 0 && (
                <div className="aside-card">
                  <div className="ac-title">Evidencias de mención</div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 16,
                      fontSize: 13,
                      color: "var(--ink-2)",
                      lineHeight: 1.6,
                    }}
                  >
                    {(extracted?.brand?.evidence ?? []).map((ev, i) => (
                      <li key={i}>{ev}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Citas */}
              {(extracted?.citations ?? []).length > 0 && (
                <div className="aside-card">
                  <div className="ac-title">
                    Citas ({(extracted?.citations ?? []).length})
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 0,
                      listStyle: "none",
                      fontSize: 12,
                      color: "var(--ink-3)",
                    }}
                  >
                    {(extracted?.citations ?? []).map((cite, i) => (
                      <li
                        key={i}
                        style={{
                          padding: "4px 0",
                          borderBottom: "1px solid var(--line-soft)",
                        }}
                      >
                        <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>
                          {cite.domain ?? cite.url ?? "—"}
                        </span>
                        {cite.label && (
                          <span style={{ marginLeft: 6 }}>{cite.label}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "respuestas" && (
            <div>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--ink-4)",
                  marginBottom: 12,
                }}
              >
                Actualmente GEO Studio analiza con Gemini.
              </p>

              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--ink-4)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Motor de IA
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--ink-4)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Marca
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--ink-4)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Sentimiento
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "4px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--ink-4)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Fecha
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "8px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 5,
                            background: "#1a73e8",
                            display: "grid",
                            placeItems: "center",
                            color: "#fff",
                            fontSize: 9,
                            fontWeight: 800,
                          }}
                        >
                          G
                        </div>
                        <span style={{ fontWeight: 600 }}>Gemini</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px" }}>
                      <span
                        className={`badge ${result.brand_mentioned ? "badge-pos" : "badge-neutral"}`}
                      >
                        {result.brand_mentioned ? "Sí" : "No"}
                      </span>
                    </td>
                    <td style={{ padding: "8px" }}>
                      {result.sentiment ? (
                        <span
                          className={`badge ${
                            result.sentiment === "positive"
                              ? "badge-pos"
                              : result.sentiment === "negative"
                                ? "badge-neg"
                                : "badge-neutral"
                          }`}
                        >
                          {sentimentLabels[result.sentiment] ?? result.sentiment}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-4)" }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "8px",
                        color: "var(--ink-3)",
                        fontSize: 12,
                      }}
                    >
                      Hoy
                    </td>
                  </tr>
                </tbody>
              </table>

              {result.raw_response_text && (
                <div className="resp-full">
                  <div className="body" style={{ whiteSpace: "pre-wrap" }}>
                    {result.raw_response_text}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
