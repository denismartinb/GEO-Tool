"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { faviconImgProps } from "@/lib/domains/favicon";
import type { SuggestedCompetitor } from "@/lib/llm/gemini";
import { createCompetitorAction, getSuggestedCompetitorsAction } from "../actions";

/**
 * COMPETITOR-SUGGESTIONS-1 — replaces "Marcas que aparecen y no sigues".
 *
 * Suggestions come from the project's real business profile via a grounded
 * search (lib/competitors/suggest-competitors.ts), not from what the AI
 * happened to name in a scan. Because that lookup takes seconds on a cache
 * miss, it is fetched from the client after paint rather than awaited during
 * the server render — the block is always on screen, showing a skeleton while
 * it resolves, so the section no longer appears and disappears depending on
 * what the last scan produced (founder, 2026-08-03: "quiero que aparezcan
 * otros competidores sugeridos para seguir siempre").
 *
 * "+ Seguir" uses `createCompetitorAction` directly: the domain already came
 * back with the suggestion, so unlike the old emerging-brands flow there is
 * no second Gemini call to resolve it.
 */

function SuggestionRow({
  projectId,
  suggestion,
  onFollowed
}: {
  projectId: string;
  suggestion: SuggestedCompetitor;
  onFollowed: (domain: string) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [failedFavicon, setFailedFavicon] = useState(false);
  const favicon = faviconImgProps(suggestion.domain, 26);

  function follow() {
    setError(null);
    startTransition(async () => {
      const result = await createCompetitorAction({
        projectId,
        name: suggestion.name,
        domain: suggestion.domain
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      // Drop it locally straight away so the row does not linger while the
      // server component re-renders; the next read filters it out anyway.
      onFollowed(suggestion.domain);
      router.refresh();
    });
  }

  return (
    <div className="cm2-emg">
      {!favicon || failedFavicon ? (
        <span className="cm2-rank-fav" style={{ background: "var(--ink-4)" }}>
          {suggestion.name.slice(0, 1).toUpperCase()}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- external favicon service, not a static asset (same pattern as podium-row)
        <img
          {...favicon}
          alt=""
          className="cm2-rank-fav-img"
          width={26}
          height={26}
          loading="lazy"
          onError={() => setFailedFavicon(true)}
        />
      )}
      <div className="cm2-emg-main">
        <div className="cm2-rank-nm">
          <span className="cm2-rank-nm-txt">{suggestion.name}</span>
        </div>
        <div className="cm2-emg-meta">{suggestion.domain}</div>
        {error ? <div className="cm2-emg-err">{error}</div> : null}
      </div>
      <button type="button" className="cm2-btn-mini" onClick={follow} disabled={isPending}>
        {isPending ? (
          "Añadiendo…"
        ) : (
          <>
            <Icon name="plus" size={11} />
            Seguir
          </>
        )}
      </button>
    </div>
  );
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; suggestions: SuggestedCompetitor[] };

export function SuggestedCompetitorsSection({ projectId }: { projectId: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [isRefreshing, startRefresh] = useTransition();

  const load = useCallback(
    async (refresh: boolean, isCancelled?: () => boolean) => {
      const result = await getSuggestedCompetitorsAction({ projectId, refresh });
      if (isCancelled?.()) return;
      setState(
        result.success
          ? { status: "ready", suggestions: result.suggestions }
          : { status: "error", message: result.error }
      );
    },
    [projectId]
  );

  useEffect(() => {
    let cancelled = false;
    void load(false, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  function refresh() {
    startRefresh(async () => {
      setState({ status: "loading" });
      await load(true);
    });
  }

  return (
    <div className="card">
      <div className="cm2-emg-intro">
        Marcas que compiten de verdad con la tuya, según a qué se dedica tu negocio. Revísalas antes
        de seguir a una.
      </div>

      {state.status === "loading" ? (
        <div className="cm2-sug-skel" aria-live="polite" aria-busy="true">
          <span className="cm2-sug-skel-txt">Buscando competidores…</span>
          {[0, 1, 2].map((i) => (
            <div className="cm2-sug-skel-row" key={i}>
              <span className="cm2-sug-skel-fav" />
              <span className="cm2-sug-skel-bar" />
            </div>
          ))}
        </div>
      ) : null}

      {state.status === "error" ? <div className="cm2-emg-err cm2-sug-msg">{state.message}</div> : null}

      {state.status === "ready" && state.suggestions.length === 0 ? (
        <div className="cm2-sug-msg">
          Ya sigues a todos los competidores que hemos encontrado para tu negocio.
        </div>
      ) : null}

      {state.status === "ready"
        ? state.suggestions.map((suggestion) => (
            <SuggestionRow
              key={suggestion.domain}
              projectId={projectId}
              suggestion={suggestion}
              onFollowed={(domain) =>
                setState((prev) =>
                  prev.status === "ready"
                    ? { status: "ready", suggestions: prev.suggestions.filter((s) => s.domain !== domain) }
                    : prev
                )
              }
            />
          ))
        : null}

      {state.status !== "loading" ? (
        <div className="cm2-sug-foot">
          <button type="button" className="cm2-btn-mini" onClick={refresh} disabled={isRefreshing}>
            {isRefreshing ? "Buscando…" : "Buscar más"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
