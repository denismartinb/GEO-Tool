"use client";

import { useState, useTransition } from "react";
import { addPrompts } from "@/app/dashboard/projects/[projectId]/actions";

/**
 * «Vigilar prompt» for a Google question (log §287, §289): it goes through
 * `addPrompts` in manual mode, the same path as adding a prompt by hand
 * (plan cap, categorisation and a scan of just that prompt). It reads as
 * watched the moment it is pressed, because adding takes a few seconds, and
 * goes back if the action fails. Shared by «Posición en Google» and the
 * Google cards of Recomendaciones (log §292).
 */

export type WatchState =
  | { kind: "idle" }
  | { kind: "adding" }
  | { kind: "added"; scanLaunched: boolean }
  | { kind: "error"; message: string };

export function useWatchPrompt(projectId: string, query: string, alreadyTracked: boolean) {
  const [state, setState] = useState<WatchState>({ kind: "idle" });
  const [, startTransition] = useTransition();
  const tracked = alreadyTracked || state.kind === "adding" || state.kind === "added";

  const watch = () => {
    setState({ kind: "adding" });
    startTransition(async () => {
      try {
        const result = await addPrompts({ projectId, mode: "manual", manualPrompts: [query] });
        setState(result.success ? { kind: "added", scanLaunched: result.scanLaunched } : { kind: "error", message: result.error });
      } catch {
        setState({ kind: "error", message: "No se ha podido añadir. Inténtalo de nuevo." });
      }
    });
  };

  return { state, tracked, watch };
}

/** The line under the question while it is added, once added, or on failure. */
export function watchStatusText(state: WatchState): { text: string; tone: "muted" | "ok" | "error" } | null {
  if (state.kind === "adding") return { text: "Añadiéndola a tus prompts…", tone: "muted" };
  if (state.kind === "added") {
    return {
      text: state.scanLaunched
        ? "Añadida a tus prompts. La estamos preguntando a los motores de IA."
        : "Añadida a tus prompts. Entrará en tu próximo escaneo.",
      tone: "ok"
    };
  }
  if (state.kind === "error") return { text: state.message, tone: "error" };
  return null;
}

export function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
