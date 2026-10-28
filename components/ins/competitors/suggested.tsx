"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ic } from "@/components/ins/ic";
import { ProjectFav } from "@/components/ins/project-fav";
import { useToast } from "@/components/ins/toasts";
import type { SuggestedCompetitor } from "@/lib/llm/gemini";
import { createCompetitorAction, getSuggestedCompetitorsAction } from "@/app/dashboard/projects/[projectId]/actions";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; suggestions: SuggestedCompetitor[] };

/**
 * «Competidores sugeridos» (COMPETITOR-SUGGESTIONS-1): fetched after paint,
 * since a cache miss takes seconds. «Seguir» creates the competitor straight
 * away with the domain that came with the suggestion (CONSOLE-INSTRUMENTO-1
 * F5b, log §361).
 */
export function Suggested({ projectId }: { projectId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [followed, setFollowed] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [refreshing, startRefresh] = useTransition();

  const load = useCallback(
    async (refresh: boolean, cancelled?: () => boolean) => {
      const r = await getSuggestedCompetitorsAction({ projectId, refresh });
      if (cancelled?.()) return;
      setState(r.success ? { status: "ready", suggestions: r.suggestions } : { status: "error", message: r.error });
    },
    [projectId],
  );

  useEffect(() => {
    let off = false;
    void load(false, () => off);
    return () => {
      off = true;
    };
  }, [load]);

  async function follow(s: SuggestedCompetitor) {
    setBusy(s.domain);
    setRowError(({ [s.domain]: _gone, ...rest }) => rest);
    const r = await createCompetitorAction({ projectId, name: s.name, domain: s.domain });
    setBusy(null);
    if (!r.success) {
      setRowError((cur) => ({ ...cur, [s.domain]: r.error }));
      return;
    }
    setFollowed((cur) => new Set(cur).add(s.domain));
    toast(`Sigues a ${s.name}.`, "La mediremos en tu próximo escaneo.", "users");
    router.refresh();
  }

  const list = state.status === "ready" ? state.suggestions : [];

  return (
    <div className="cp-sug-l" aria-busy={state.status === "loading"}>
      {state.status === "loading" ? (
        <div className="cp-sr cp-load" role="status">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          <span className="shimmer">Buscando competidores…</span>
        </div>
      ) : null}
      {state.status === "error" ? <p className="cp-sp">{state.message}</p> : null}
      {state.status === "ready" && list.length === 0 ? (
        <p className="cp-sp">Ya sigues a todos los competidores que hemos encontrado para tu negocio.</p>
      ) : null}
      {list.map((s) => {
        const on = followed.has(s.domain);
        return (
          <div key={s.domain} className="cp-sr">
            <ProjectFav domain={s.domain} name={s.name} />
            <span className="t">
              <b>{s.name}</b>
              <span>
                <span className="mono">{s.domain}</span>
                {rowError[s.domain] ? ` · ${rowError[s.domain]}` : ""}
              </span>
            </span>
            <button
              type="button"
              className={`cp-fb${on ? " on" : ""}`}
              aria-pressed={on}
              disabled={on || busy === s.domain}
              aria-label={`${on ? "Siguiendo a" : "Seguir a"} ${s.name}`}
              onClick={() => follow(s)}
            >
              {on ? (
                <>
                  <Ic n="check" sm />
                  Siguiendo
                </>
              ) : busy === s.domain ? (
                "Añadiendo…"
              ) : (
                <>
                  <Ic n="plus" sm />
                  Seguir
                </>
              )}
            </button>
          </div>
        );
      })}
      {state.status !== "loading" ? (
        <div className="cp-sf">
          <button
            type="button"
            className="btn sm line"
            disabled={refreshing}
            onClick={() =>
              startRefresh(async () => {
                setState({ status: "loading" });
                await load(true);
              })
            }
          >
            <Ic n="search" sm />
            {refreshing ? "Buscando…" : "Buscar más"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
