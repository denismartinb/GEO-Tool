"use client";

import { useState } from "react";
import { PromptDrawer, type PromptResult } from "@/components/prompts/prompt-drawer";

type ResultRow = PromptResult & {
  confidence: string | null;
  sentiment_label: string;
};

type Props = {
  results: ResultRow[];
};

export function PromptsClient({ results }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = results.find((r) => r.id === selectedId) ?? null;

  return (
    <>
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ paddingLeft: 16 }}>Prompt</th>
              <th>Marca</th>
              <th className="num">Competidores</th>
              <th className="num">Citas</th>
              <th>Sentimiento</th>
              <th>Confianza</th>
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
                <td style={{ maxWidth: 360, paddingLeft: 16 }}>
                  <span
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      fontSize: 13,
                      fontWeight: 550,
                      color: "var(--ink)",
                      lineHeight: 1.45
                    }}
                  >
                    {r.prompt_text_snapshot}
                  </span>
                </td>
                <td>
                  <span
                    className={`badge ${r.brand_mentioned ? "badge-pos" : "badge-neg"}`}
                  >
                    {r.brand_mentioned ? "Mencionada" : "Ausente"}
                  </span>
                </td>
                <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {r.mentioned_competitors_count > 0 ? (
                    <span style={{ color: "var(--warn-ink)", fontWeight: 700 }}>
                      {r.mentioned_competitors_count}
                    </span>
                  ) : (
                    <span style={{ color: "var(--ink-4)" }}>0</span>
                  )}
                </td>
                <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {r.citations_count > 0 ? (
                    <span style={{ color: "var(--accent-ink)", fontWeight: 700 }}>
                      {r.citations_count}
                    </span>
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
                          : r.sentiment === "neutral"
                          ? "badge-neutral"
                          : "badge-warn"
                      }`}
                    >
                      {r.sentiment_label}
                    </span>
                  ) : (
                    <span style={{ color: "var(--ink-4)", fontSize: 12 }}>—</span>
                  )}
                </td>
                <td>
                  {r.confidence ? (
                    <span className="badge badge-neutral">{r.confidence}</span>
                  ) : (
                    <span style={{ color: "var(--ink-4)", fontSize: 12 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <PromptDrawer result={selected} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}
