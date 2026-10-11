"use client";

import Link from "next/link";
import { CheckIcon, useWatchPrompt, watchStatusText } from "@/components/search-console/watch-prompt";
import { GoogleRecMark } from "./google-rec-frame";

/**
 * «Vigilar prompt» on the Google + IA card (log §293), same action as
 * «Posición en Google», with «Ahora no» next to it until it is watched (§294).
 * Outlined, like every card of the carousel (RECS-ONE-QUEUE-1, log §306).
 */
export function GoogleWatchActions({ projectId, query }: { projectId: string; query: string }) {
  const { state, tracked, watch } = useWatchPrompt(projectId, query, false);
  const status = watchStatusText(state);
  return (
    <>
      <div className="grec-acts">
        {tracked ? (
          <Link className="gsc-qbtn is-done" href={`/dashboard/projects/${projectId}/prompts`} title="Ver en Prompts">
            <CheckIcon />
            Prompt vigilado
          </Link>
        ) : (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={watch}>
              Vigilar prompt
            </button>
            <GoogleRecMark status="dismissed" label="Ahora no" quiet />
          </>
        )}
      </div>
      {status && (
        <p className={`grec-status grec-status-${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>
          {status.text}
        </p>
      )}
    </>
  );
}
