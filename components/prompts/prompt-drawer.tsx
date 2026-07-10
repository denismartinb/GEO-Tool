"use client";

import { useState } from "react";
import type { ResultRow } from "@/app/dashboard/projects/[projectId]/prompts/page";
import { DeletePromptButton } from "@/app/dashboard/projects/[projectId]/prompts/delete-prompt-button";
import { InfoTip } from "@/components/ui/info-tip";

type Competitor = {
  id: string;
  name: string;
  domain: string;
};

type Props = {
  projectId: string;
  results: ResultRow[];
  competitors: Competitor[];
  onClose: () => void;
};

type ExtractedJson = {
  brand?: { mentioned?: boolean; evidence?: string[] };
  competitors?: Array<{ name?: string; mentioned?: boolean; evidence?: string[] }>;
  citations?: Array<{
    url?: string | null;
    domain?: string | null;
    title?: string | null;
    source?: "grounding" | "inline";
  }>;
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

function providerLabel(provider: string | null): string {
  return provider === "claude" ? "Claude" : "Gemini";
}

/**
 * Mirrors the frontend display rule from docs/adr/0006: the raw Google
 * grounding-redirect URL (vertexaisearch.cloud.google.com/...) must never be
 * rendered. Unresolved grounding citations (domain: null) fall back to
 * title, then a generic label. Inline citations without a domain keep
 * showing their raw url, since those are not Google redirect wrappers.
 */
function citationDisplayLabel(cite: {
  url?: string | null;
  domain?: string | null;
  title?: string | null;
  source?: "grounding" | "inline";
}): string {
  if (cite.domain) return cite.domain;
  if (cite.source === "grounding") return cite.title?.trim() || "Fuente sin resolver";
  return cite.url ?? "—";
}

function parseExtracted(raw: unknown): ExtractedJson | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as ExtractedJson)
    : null;
}

// Mirrors the sentiment-mode aggregation used in prompts-client.tsx and
// page.tsx's topic groups: the most frequent non-null sentiment across this
// prompt's per-engine rows.
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

export function PromptDrawer({ projectId, results, competitors, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("resumen");

  if (!results.length) return null;

  const extractedList = results.map((r) => parseExtracted(r.extracted_json));

  const brandMentioned = results.some((r) => r.brand_mentioned);
  const citationFound = results.some((r) => r.citation_found);
  const brandEvidence = Array.from(
    new Set(extractedList.flatMap((e) => e?.brand?.evidence ?? []))
  );

  const mentionedMap = new Map<string, { mentioned: boolean; evidence: string[] }>();
  for (const ext of extractedList) {
    for (const c of ext?.competitors ?? []) {
      if (!c.name) continue;
      const key = c.name.toLowerCase();
      const prev = mentionedMap.get(key) ?? { mentioned: false, evidence: [] };
      mentionedMap.set(key, {
        mentioned: prev.mentioned || !!c.mentioned,
        evidence: Array.from(new Set([...prev.evidence, ...(c.evidence ?? [])])),
      });
    }
  }

  const combinedCitations: Array<{
    url?: string | null;
    domain?: string | null;
    title?: string | null;
    source?: "grounding" | "inline";
  }> = [];
  const seenCitationKeys = new Set<string>();
  for (const ext of extractedList) {
    for (const cite of ext?.citations ?? []) {
      const key = (cite.domain ?? cite.title ?? cite.url ?? "").toLowerCase();
      if (!key || seenCitationKeys.has(key)) continue;
      seenCitationKeys.add(key);
      combinedCitations.push(cite);
    }
  }

  const brandRow = {
    name: "Tu marca",
    isOwn: true,
    mentioned: brandMentioned,
    evidence: brandEvidence,
    sentiment: dominantSentiment(results),
  };

  const competitorRows = competitors.map((comp) => {
    const match = mentionedMap.get(comp.name.toLowerCase());
    return {
      name: comp.name,
      isOwn: false,
      mentioned: match?.mentioned ?? false,
      evidence: match?.evidence ?? [],
      sentiment: null as string | null,
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

  const uniqueProviderLabels = Array.from(
    new Set(results.map((r) => providerLabel(r.provider)))
  );

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
              {results[0].prompt_text_snapshot ?? "Prompt"}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              {results[0].prompt_id ? (
                <DeletePromptButton projectId={projectId} promptId={results[0].prompt_id} onDeleted={onClose} />
              ) : null}
              <button
                onClick={onClose}
                style={{
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
                <div className="ac-title" style={{ display: "flex", alignItems: "center" }}>
                  Presencia de tu marca en este prompt
                  <InfoTip text="Mencionada: la IA nombra tu marca por lo que ya sabe de ella (fame), sin depender de tu web. Citada: la respuesta incluye una fuente verificada apuntando a tu propio dominio — solo esta segunda señal depende de contenido que publiques." />
                </div>
                <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: brandMentioned
                          ? "var(--pos-ink)"
                          : "var(--neg-ink)",
                      }}
                    >
                      {brandMentioned ? "Sí" : "No"}
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
                        color: citationFound
                          ? "var(--accent-ink)"
                          : "var(--ink-4)",
                      }}
                    >
                      {citationFound ? "Sí" : "No"}
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
              {brandEvidence.length > 0 && (
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
                    {brandEvidence.map((ev, i) => (
                      <li key={i}>{ev}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Citas */}
              {combinedCitations.length > 0 && (
                <div className="aside-card">
                  <div className="ac-title">
                    Citas ({combinedCitations.length})
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
                    {combinedCitations.map((cite, i) => (
                      <li
                        key={i}
                        style={{
                          padding: "4px 0",
                          borderBottom: "1px solid var(--line-soft)",
                        }}
                      >
                        <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>
                          {citationDisplayLabel(cite)}
                        </span>
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
                Analizado con {uniqueProviderLabels.join(" y ")}.
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
                  {results.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--line)" }}>
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
                              background: r.provider === "claude" ? "#cc785c" : "#1a73e8",
                              display: "grid",
                              placeItems: "center",
                              color: "#fff",
                              fontSize: 9,
                              fontWeight: 800,
                            }}
                          >
                            {r.provider === "claude" ? "C" : "G"}
                          </div>
                          <span style={{ fontWeight: 600 }}>
                            {providerLabel(r.provider)}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "8px" }}>
                        <span
                          className={`badge ${r.brand_mentioned ? "badge-pos" : "badge-neutral"}`}
                        >
                          {r.brand_mentioned ? "Sí" : "No"}
                        </span>
                      </td>
                      <td style={{ padding: "8px" }}>
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
                            {sentimentLabels[r.sentiment] ?? r.sentiment}
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
                  ))}
                </tbody>
              </table>

              {results.map(
                (r) =>
                  r.raw_response_text && (
                    <div key={r.id} className="resp-full" style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--ink-4)",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {providerLabel(r.provider)}
                      </div>
                      <div className="body" style={{ whiteSpace: "pre-wrap" }}>
                        {r.raw_response_text}
                      </div>
                    </div>
                  )
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
