"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import {
  markGoogleRecommendationAction,
  undoGoogleRecommendationAction
} from "@/app/dashboard/projects/[projectId]/actions";
import type { GoogleRecKind } from "@/lib/search-console/recommendations";

/**
 * «Marcar como hecho» / «Ahora no» on a Google card (SEARCH-SEO-1 Fase 3e,
 * log §294). The card hides at once and leaves «Deshacer» in its place; it
 * comes back if the save fails. The next load offers the next case of the
 * same kind. Without migration 0042 (`canPersist` false) the buttons don't
 * render at all.
 */

type Handled = "done" | "dismissed";

const FrameContext = createContext<{ mark: (status: Handled) => void; pending: boolean } | null>(null);

export function GoogleRecFrame({
  projectId,
  kind,
  query,
  position,
  impressions,
  ctr,
  canPersist,
  children
}: {
  projectId: string;
  kind: GoogleRecKind;
  query: string;
  position: number | null;
  impressions: number | null;
  ctr: number | null;
  canPersist: boolean;
  children: ReactNode;
}) {
  const [handled, setHandled] = useState<Handled | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mark = (status: Handled) => {
    setError(null);
    setHandled(status);
    startTransition(async () => {
      const result = await markGoogleRecommendationAction({ projectId, kind, query, status, position, impressions, ctr });
      if (!result.success) {
        setHandled(null);
        setError(result.error);
      }
    });
  };

  const undo = () => {
    setError(null);
    startTransition(async () => {
      const result = await undoGoogleRecommendationAction({ projectId, kind, query });
      if (result.success) setHandled(null);
      else setError(result.error);
    });
  };

  if (handled) {
    return (
      <article className="grec-card grec-card-handled">
        <p className="grec-handled">
          {handled === "done" ? "Marcada como hecha." : "La dejamos para más adelante."} La próxima vez que entres verás
          otra en su lugar.{" "}
          <button type="button" className="grec-undo" onClick={undo} disabled={pending}>
            Deshacer
          </button>
        </p>
        {error && (
          <p className="grec-status grec-status-error" role="alert">
            {error}
          </p>
        )}
      </article>
    );
  }

  return (
    <FrameContext.Provider value={canPersist ? { mark, pending } : null}>
      <article className="grec-card">
        {children}
        {error && (
          <p className="grec-status grec-status-error" role="alert">
            {error}
          </p>
        )}
      </article>
    </FrameContext.Provider>
  );
}

/** The secondary button of a card. Renders nothing when the state can't be saved. */
export function GoogleRecMark({ status, label }: { status: Handled; label: string }) {
  const ctx = useContext(FrameContext);
  if (!ctx) return null;
  return (
    <button type="button" className="btn btn-ghost btn-sm" disabled={ctx.pending} onClick={() => ctx.mark(status)}>
      {label}
    </button>
  );
}
