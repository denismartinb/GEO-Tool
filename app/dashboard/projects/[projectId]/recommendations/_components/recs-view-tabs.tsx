"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type View = "ia" | "google";

/** Set by `GoogleRecsPresent`; a no-op outside `RecsViewTabs`. */
const GoogleRecsArrived = createContext<(present: boolean) => void>(() => {});

/**
 * Rendered by `GoogleRecs` only when Google returned at least one card. Its
 * mount is what turns the pills on: a connected Search Console that yields
 * nothing (wrong account, no data, Google failing) shows no tab at all. Its
 * unmount turns them off again, e.g. when the last card is marked as done.
 */
export function GoogleRecsPresent() {
  const arrived = useContext(GoogleRecsArrived);
  useEffect(() => {
    arrived(true);
    return () => arrived(false);
  }, [arrived]);
  return null;
}

/**
 * RECS-SHORT-CARD-1 (log §302): «Mejora IA» / «Mejora Google». Both halves
 * are rendered on the server and stay mounted; the Google half streams in
 * hidden behind its Suspense (log §298). The pills only appear once Google
 * recommendations have actually arrived (`GoogleRecsPresent`); until then,
 * and for good if none arrive, the page is just the AI half.
 */
export function RecsViewTabs({ ai, google }: { ai: ReactNode; google: ReactNode }) {
  const [hasGoogle, setHasGoogle] = useState(false);
  const [view, setView] = useState<View>("ia");
  const [markArrived] = useState(() => (present: boolean) => setHasGoogle(present));
  const tabs: [View, string][] = [
    ["ia", "Mejora IA"],
    ["google", "Mejora Google"]
  ];
  const current: View = hasGoogle ? view : "ia";

  return (
    <GoogleRecsArrived.Provider value={markArrived}>
      {hasGoogle && (
        <div className="rec2-views" role="tablist" aria-label="Tipo de mejora">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`rec2-view-${key}`}
              aria-selected={current === key}
              aria-controls={`rec2-panel-${key}`}
              className={current === key ? "on" : ""}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div
        role={hasGoogle ? "tabpanel" : undefined}
        id="rec2-panel-ia"
        aria-labelledby={hasGoogle ? "rec2-view-ia" : undefined}
        hidden={current !== "ia"}
      >
        {ai}
      </div>
      <div
        role={hasGoogle ? "tabpanel" : undefined}
        id="rec2-panel-google"
        aria-labelledby={hasGoogle ? "rec2-view-google" : undefined}
        hidden={current !== "google"}
      >
        {google}
      </div>
    </GoogleRecsArrived.Provider>
  );
}
