"use client";

import { useEffect, useState } from "react";
import { computeMissionBeat, type MissionBeat } from "@/lib/scan/mission-beats";
import type { ActiveScanRun } from "@/components/scan-in-progress";

type LiveRun = ActiveScanRun & { id: string };

const POLL_INTERVAL_MS = 3000;

/**
 * ONBOARDING-ROCKET-1 — full-screen first-scan experience
 * (`docs/design-reference/scan-states-1/rev3-cohete-secuencia.html`).
 *
 * Only mounted for the very first scan of a project (`page.tsx` decides that
 * from `completedRunsCount === 0`, computed server-side — no new signal). A
 * project's daily scans keep the plain `ScanInProgress` bar; this component
 * spends a first impression only once per domain.
 *
 * Polling mirrors `ScanInProgressLive` exactly (same endpoint, same interval,
 * same "ignore a superseded run id" guard) rather than sharing code with it —
 * the two render completely different markup and the only shared logic
 * (`computeScanStage`) already lives one level down, inside
 * `computeMissionBeat`.
 *
 * Deliberately does NOT render a "carga entregada · N puntos" beat with a
 * number. `entrega` (see mission-beats.ts) fires once every response has a
 * terminal extraction outcome, which is BEFORE the run's finalize step
 * persists the score — this component has no score to show at that instant.
 * The real reveal is `ScanProgressPoller` (already mounted by the parent)
 * calling `router.refresh()` once `scan_runs.status` goes terminal, which
 * swaps this whole component out for the real dashboard server-side. Showing
 * a placeholder score here to "keep pace" with the design reference would be
 * exactly the fake progress CLAUDE.md forbids.
 */
export function ScanMissionRocket({ projectId, initial }: { projectId: string; initial: LiveRun }) {
  const [run, setRun] = useState<LiveRun>(initial);

  useEffect(() => {
    let cancelled = false;

    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/scan-status`, { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const data: { run: LiveRun | null } = await res.json();
        if (!data.run || data.run.id !== initial.id) return;

        setRun(data.run);
        if (data.run.status !== "pending" && data.run.status !== "running") {
          clearInterval(id);
        }
      } catch {
        // Transient network error — the next tick retries.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId, initial.id]);

  const beat = computeMissionBeat(run);

  return (
    <div className="mrk-wrap fade-in">
      <div className="mrk-stage">
        <RocketScene beat={beat} />
      </div>
      <div className="mrk-copy">
        <span className="mrk-eyebrow">{eyebrowFor(beat)}</span>
        <h2 className="mrk-title">{titleFor(beat)}</h2>
        <p className="mrk-sub">{subtitleFor(beat)}</p>
        {beat.key !== "entrega" && <p className="mrk-joke">{jokeFor(beat)}</p>}
      </div>
    </div>
  );
}

function eyebrowFor(beat: MissionBeat): string {
  switch (beat.key) {
    case "rampa":
      return "En la rampa";
    case "ignicion":
      return "Ignición";
    case "ascenso":
      return "Ascenso";
    case "orbita":
      return "En órbita";
    case "entrega":
      return "Cerrando la misión";
  }
}

function titleFor(beat: MissionBeat): string {
  switch (beat.key) {
    case "rampa":
      return "Preparando tu primer escaneo";
    case "ignicion":
      return "Motores encendidos";
    case "ascenso":
      return `${beat.done} de ${beat.total}`;
    case "orbita":
      return beat.total === null ? "Abriendo la carga" : `${beat.done} de ${beat.total} respuestas leídas`;
    case "entrega":
      return "Casi está";
  }
}

function subtitleFor(beat: MissionBeat): string {
  switch (beat.key) {
    case "rampa":
      return "Un momento — estamos colocando la cola de trabajo.";
    case "ignicion":
      return "Gemini, ChatGPT y Claude, preguntados a la vez.";
    case "ascenso":
      return "Puedes irte tranquilo: seguimos trabajando aunque cierres esta pestaña.";
    case "orbita":
      return "Extraemos de cada respuesta las menciones, las posiciones y las citas.";
    case "entrega":
      return "Estamos calculando tu puntuación GEO.";
  }
}

function jokeFor(beat: MissionBeat): string {
  switch (beat.key) {
    case "rampa":
      return "Tú no tienes que hacer nada.";
    case "ignicion":
      return "Los tres a la vez. Sí, se puede.";
    case "ascenso":
      return "Esto no se cae.";
    case "orbita":
      return "Traerlas era la mitad del viaje.";
    default:
      return "";
  }
}

/**
 * Altitude and the órbita ring are the only two things bound to real
 * fractions — everything else (stars, plume flicker) is ambient and carries
 * no information, same rule as the design reference.
 */
function RocketScene({ beat }: { beat: MissionBeat }) {
  const climb = beat.key === "ascenso" ? beat.climb : beat.key === "orbita" || beat.key === "entrega" ? 1 : 0;
  const orbiting = beat.key === "orbita" || beat.key === "entrega";
  const ringFrac = beat.key === "orbita" ? beat.ringFrac : beat.key === "entrega" ? 1 : null;
  const burning = beat.key === "ignicion" || beat.key === "ascenso";

  return (
    <svg className="mrk-sky" viewBox="0 0 400 280" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="mrk-sky-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--brand-canvas)" />
          <stop offset="1" stopColor="var(--brand-blue-soft)" />
        </linearGradient>
        <linearGradient id="mrk-plume-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(37,99,235,.28)" />
          <stop offset="1" stopColor="rgba(37,99,235,0)" />
        </linearGradient>
      </defs>
      <rect width="400" height="280" fill="url(#mrk-sky-g)" rx="20" />

      <g className="mrk-marks">
        <line x1="24" y1="70" x2="376" y2="70" />
        <line x1="24" y1="150" x2="376" y2="150" />
      </g>

      <rect x="0" y="228" width="400" height="34" className="mrk-pad" />
      <rect x="0" y="227" width="400" height="1.2" className="mrk-pad-line" />
      <rect x="150" y="204" width="6" height="24" className="mrk-tower" />
      <rect x="244" y="204" width="6" height="24" className="mrk-tower" />

      {orbiting && ringFrac !== null && <OrbitRing frac={ringFrac} />}

      <g className="mrk-glide" style={{ transform: `translateY(${(-150 * climb).toFixed(1)}px)` }}>
        <g className={`mrk-plume${burning ? " on" : ""}`}>
          <path d="M188 220 L212 220 L218 262 L182 262 Z" fill="url(#mrk-plume-g)" />
        </g>
        <g className={`mrk-flame${burning ? " on" : ""}`}>
          <path className="mrk-flame-a" d="M190 216 q5 20 0 30 q-5 -10 0 -30 Z" />
          <path className="mrk-flame-b" d="M200 217 q6 24 0 35 q-6 -11 0 -35 Z" />
          <path className="mrk-flame-a" d="M210 216 q5 20 0 30 q-5 -10 0 -30 Z" />
        </g>
        <rect x="184" y="208" width="9" height="8" rx="2" className="mrk-nozzle" />
        <rect x="196" y="208" width="9" height="9" rx="2" className="mrk-nozzle" />
        <rect x="208" y="208" width="9" height="8" rx="2" className="mrk-nozzle" />
        <path d="M184 188 L174 210 L184 206 Z" className="mrk-fin" />
        <path d="M217 188 L227 210 L217 206 Z" className="mrk-fin" />
        <path d="M200 138 q16 16 16 39 v30 h-32 v-30 q0 -23 16 -39 Z" className="mrk-hull" />
        <path d="M200 138 q16 16 16 39 h-32 q0 -23 16 -39 Z" className="mrk-hull-shade" />
        <circle cx="200" cy="176" r="6.5" className="mrk-window" />
        <circle cx="200" cy="176" r="4" fill="var(--brand-blue)" />
      </g>
    </svg>
  );
}

/** One ring per órbita: no total means no ring — an indeterminate fraction never fakes a position. */
function OrbitRing({ frac }: { frac: number | null }) {
  if (frac === null) return null;
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <g transform="translate(310,120)">
      <circle r={r} fill="none" className="mrk-ring-track" strokeWidth={5} />
      <circle
        r={r}
        fill="none"
        className="mrk-ring-fill"
        strokeWidth={5}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform="rotate(-90)"
      />
    </g>
  );
}
