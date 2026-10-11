"use client";

import Link from "next/link";
import { CheckIcon, useWatchPrompt, watchStatusText } from "@/components/search-console/watch-prompt";

/** «Vigilar prompt» on the Google + IA card (log §293), same action as «Posición en Google». */
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
          <button type="button" className="btn btn-primary btn-sm" onClick={watch}>
            Vigilar prompt
          </button>
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
