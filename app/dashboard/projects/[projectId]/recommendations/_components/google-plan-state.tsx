"use client";

import { createContext, useContext, useEffect } from "react";

/**
 * Which Google card took the plan's second slot (RECS-ONE-QUEUE-1, log §306).
 * `pending` while the Google rows stream in; `null` when there is none, so the
 * third AI action takes its place.
 */
export type GooglePlanKind = "push_page_one" | "improve_snippet";
export type GooglePlanState = "pending" | GooglePlanKind | null;

/** Set by `GooglePlanMarker`; a no-op outside `RecommendationsClient`. */
export const GooglePlanReport = createContext<(state: GooglePlanKind | null) => void>(() => {});

/**
 * Rendered by the plan slot once Google has answered, with or without a card.
 * Its mount is what tells the plan whether slot 2 is Google's or the third AI
 * action's.
 */
export function GooglePlanMarker({ kind }: { kind: GooglePlanKind | null }) {
  const report = useContext(GooglePlanReport);
  useEffect(() => {
    report(kind);
  }, [report, kind]);
  return null;
}
