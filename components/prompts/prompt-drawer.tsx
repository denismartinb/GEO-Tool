"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";

export type PromptResult = {
  id: string;
  prompt_text_snapshot: string;
  raw_response_text: string | null;
  brand_mentioned: boolean;
  citation_found: boolean;
  mentioned_competitors_count: number;
  citations_count: number;
  sentiment: string | null;
  extracted_json: unknown;
  extraction_error: string | null;
};

type ExtractedJson = {
  brand?: { mentioned?: boolean; evidence?: string[] };
  competitors?: Array<{ name?: string; mentioned?: boolean; evidence?: string[] }>;
  citations?: Array<{ url?: string; domain?: string; label?: string; evidence?: string }>;
  sentiment?: string;
  summary?: string;
  confidence?: string;
};

type Props = {
  result: PromptResult | null;
  onClose: () => void;
};

const sentimentLabels: Record<string, string> = {
  positive: "Positivo",
  neutral: "Neutral",
  negative: "Negativo",
  mixed: "Mixto",
  unknown: "Desconocido"
};

export function PromptDrawer({ result, onClose }: Props) {
  const [tab, setTab] = useState<"resumen" | "respuesta">("resumen");

  if (!result) return null;

  const extracted: ExtractedJson | null =
    result.extracted_json && typeof result.extracted_json === "object"
      ? (result.extracted_json as ExtractedJson)
      : null;

  const brandEvidence = extracted?.brand?.evidence ?? [];
  const mentionedCompetitors = (extracted?.competitors ?? []).filter(
    (c) => c.mentioned && c.name
  );
  const citations = extracted?.citations ?? [];
  const confidence = extracted?.confidence;
  const sentiment = result.sentiment ?? extracted?.sentiment ?? null;

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Detalle del prompt">
        <div className="drawer-head">
          <Icon name="prompts" size={17} />
          <div className="t">Detalle del prompt</div>
          <button
            className="icon-btn"
            style={{ marginLeft: "auto", width: 30, height: 30 }}
            onClick={onClose}
            aria-label="Cerrar"
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="drawer-body">
          {/* Prompt box */}
          <div className="prompt-box">
            <div className="qico">
              <Icon name="search" size={15} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="q">{result.prompt_text_snapshot}</div>
              <div className="prompt-box-meta">
                <span>Motor: Gemini</span>
                {sentiment && (
                  <span>
                    Sentimiento:{" "}
                    {sentimentLabels[sentiment] ?? sentiment}
                  </span>
                )}
                {confidence && <span>Confianza: {confidence}</span>}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="drawer-tabs">
            <button
              className={tab === "resumen" ? "on" : ""}
              onClick={() => setTab("resumen")}
            >
              Resumen
            </button>
            <button
              className={tab === "respuesta" ? "on" : ""}
              onClick={() => setTab("respuesta")}
            >
              Respuesta de IA
            </button>
          </div>

          {/* Tab: Resumen */}
          {tab === "resumen" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Brand presence */}
              <div className="aside-card">
                <div className="ac-title">Presencia de tu marca</div>
                <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                  <div>
                    <div
                      style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}
                      className="tnum"
                    >
                      {result.brand_mentioned ? (
                        <span style={{ color: "var(--pos-ink)" }}>Sí</span>
                      ) : (
                        <span style={{ color: "var(--neg-ink)" }}>No</span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--ink-3)",
                        fontWeight: 600,
                        marginTop: 4
                      }}
                    >
                      mencionada
                    </div>
                  </div>
                  <div>
                    <div
                      style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}
                      className="tnum"
                    >
                      {result.citation_found ? (
                        <span style={{ color: "var(--accent-ink)" }}>Sí</span>
                      ) : (
                        <span style={{ color: "var(--ink-3)" }}>No</span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--ink-3)",
                        fontWeight: 600,
                        marginTop: 4
                      }}
                    >
                      citada
                    </div>
                  </div>
                </div>
                {brandEvidence.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "var(--ink-4)",
                        marginBottom: 6
                      }}
                    >
                      Evidencia
                    </div>
                    {brandEvidence.slice(0, 3).map((ev, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 12.5,
                          color: "var(--ink-2)",
                          lineHeight: 1.55,
                          fontStyle: "italic",
                          marginBottom: 6,
                          paddingLeft: 8,
                          borderLeft: "2px solid var(--line-strong)"
                        }}
                      >
                        {ev}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Competitors */}
              <div className="aside-card">
                <div className="ac-title">
                  Competidores detectados ({result.mentioned_competitors_count})
                </div>
                {mentionedCompetitors.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
                    Ningún competidor mencionado en esta respuesta.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {mentionedCompetitors.map((c, i) => (
                      <div key={i} className="brand-presence">
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            background: "var(--surface-sunk)",
                            border: "1px solid var(--line)",
                            display: "grid",
                            placeItems: "center",
                            fontSize: 10,
                            fontWeight: 800,
                            color: "var(--ink-3)",
                            flexShrink: 0
                          }}
                        >
                          {c.name?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <span className="nm">{c.name}</span>
                        {c.evidence && c.evidence.length > 0 && (
                          <span
                            style={{
                              fontSize: 11.5,
                              color: "var(--ink-4)",
                              marginLeft: "auto",
                              maxWidth: 200,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                            title={c.evidence[0]}
                          >
                            {c.evidence[0]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Citations */}
              <div className="aside-card">
                <div className="ac-title">Fuentes citadas ({result.citations_count})</div>
                {citations.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--ink-4)" }}>
                    Sin fuentes citadas en esta respuesta.
                  </div>
                ) : (
                  <div>
                    {citations.map((cite, i) => (
                      <div key={i} className="src-item">
                        <Icon name="globe" size={13} className="si-ico" />
                        <div>
                          <div className="si-url">{cite.domain ?? cite.url ?? "—"}</div>
                          {cite.label && (
                            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
                              {cite.label}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab: Respuesta de IA */}
          {tab === "respuesta" && (
            <div className="resp-full">
              <div className="eng-head">
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: "#1a73e8",
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    flexShrink: 0
                  }}
                >
                  G
                </div>
                <b style={{ fontSize: 13.5 }}>Gemini</b>
                {sentiment && (
                  <span
                    className={`badge ${
                      sentiment === "positive"
                        ? "badge-pos"
                        : sentiment === "negative"
                        ? "badge-neg"
                        : sentiment === "neutral"
                        ? "badge-neutral"
                        : "badge-warn"
                    }`}
                    style={{ marginLeft: "auto" }}
                  >
                    {sentimentLabels[sentiment] ?? sentiment}
                  </span>
                )}
              </div>
              {result.extraction_error && (
                <div
                  className="feedback error"
                  style={{ marginBottom: 16, fontSize: 12.5 }}
                >
                  Error de extracción: {result.extraction_error}
                </div>
              )}
              {result.raw_response_text ? (
                <div className="body" style={{ whiteSpace: "pre-wrap" }}>
                  {result.raw_response_text}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--ink-4)" }}>
                  No hay texto de respuesta disponible.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
