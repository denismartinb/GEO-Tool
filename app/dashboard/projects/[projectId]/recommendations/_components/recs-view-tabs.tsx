"use client";

import { useState, type ReactNode } from "react";

type View = "ia" | "google";

/**
 * RECS-SHORT-CARD-1 (log §301): «Mejora IA» / «Mejora Google». Both halves
 * are rendered on the server and stay mounted; the pills only hide one, so
 * the Google block keeps streaming behind its skeleton (log §298) while the
 * AI half is in view. Only mounted when Search Console is connected.
 */
export function RecsViewTabs({ ai, google }: { ai: ReactNode; google: ReactNode }) {
  const [view, setView] = useState<View>("ia");
  const tabs: [View, string][] = [
    ["ia", "Mejora IA"],
    ["google", "Mejora Google"]
  ];

  return (
    <>
      <div className="rec2-views" role="tablist" aria-label="Tipo de mejora">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`rec2-view-${key}`}
            aria-selected={view === key}
            aria-controls={`rec2-panel-${key}`}
            className={view === key ? "on" : ""}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="rec2-panel-ia" aria-labelledby="rec2-view-ia" hidden={view !== "ia"}>
        {ai}
      </div>
      <div role="tabpanel" id="rec2-panel-google" aria-labelledby="rec2-view-google" hidden={view !== "google"}>
        {google}
      </div>
    </>
  );
}
