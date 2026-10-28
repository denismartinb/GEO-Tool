"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActiveScanRun } from "@/components/scan-in-progress";
import { computeMissionBeat, resolveDisplayBeat, IGNITION_HOLD_MS } from "@/lib/scan/mission-beats";
import { MISSION_PHASES, missionCounter, missionHeadline, missionLine, phaseIndex } from "@/lib/ins/mission-copy";
import { Ic } from "@/components/ins/ic";
import { Motion } from "@/components/ins/kit/motion";
import { PendulumWave } from "@/components/ins/kit/pendulum";
import { Roll } from "@/components/ins/kit/roll";
import { Ticks } from "@/components/ins/kit/bar";
import { EngineLogo, engineName } from "@/components/ins/kit/engine";

type LiveRun = ActiveScanRun & { id: string; engine_counts?: Record<string, number> };

const POLL_INTERVAL_MS = 3000;
const TICKS = 68;

/**
 * «Primer escaneo» (screen `mission` of the approved console). Full screen:
 * the shell steps aside while it is on. Every figure is a count of rows the run
 * already holds; the pendulums are ambient and never encode progress. It owns
 * the refresh that hands the section back when the run ends (ANIMATION-PARITY-1,
 * log §168): one rule for the six sections that mount it.
 */
export function FirstScanMission({
  projectId,
  initial,
  domain,
  providers
}: {
  projectId: string;
  initial: LiveRun;
  domain: string;
  /** Providers this run asks, in scan order. Empty when the plan could not be read. */
  providers: readonly string[];
}) {
  const router = useRouter();
  const [run, setRun] = useState<LiveRun>(initial);
  const [ignitionElapsed, setIgnitionElapsed] = useState(false);
  const enginesQuery = providers.length > 0 ? `?engines=${providers.join(",")}` : "";

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/scan-status${enginesQuery}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: { run: LiveRun | null } = await res.json();
        const live = data.run;
        const isTerminal = !live || !["pending", "running"].includes(live.status);
        const isSuperseded = Boolean(live) && live!.id !== initial.id;
        if (isTerminal || isSuperseded) {
          clearInterval(id);
          if (!cancelled) router.refresh();
          return;
        }
        if (live) setRun(live);
      } catch {
        // Transient network error: the next tick retries.
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId, initial.id, router, enginesQuery]);

  // The lift-off shot gets its seconds whatever the counters do; the scene
  // swap never touches a number (`resolveDisplayBeat`).
  useEffect(() => {
    const t = setTimeout(() => setIgnitionElapsed(true), IGNITION_HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  const beat = resolveDisplayBeat(computeMissionBeat(run), ignitionElapsed);
  const ph = phaseIndex(beat);
  const engineCount = providers.length > 0 ? providers.length : null;
  const counter = missionCounter(beat, run, run.engine_counts ?? null, engineCount);
  const launches = run.total_prompts ?? null;
  const lit = counter.total && counter.total > 0 ? Math.floor((counter.got / counter.total) * TICKS) : 0;

  return (
    <Motion id={`mission-${projectId}`}>
      <div className="ins ins-mission">
        <div className="sc-full sc-mission" aria-live="polite">
          <header className="ms-top">
            <span className="wz-brand ms-brand">
              <svg aria-hidden="true">
                <use href="#e-gs" />
              </svg>
              GenScore
            </span>
            <span className="ms-dom">
              <Ic n="checkc" sm />
              <span className="mono">{domain}</span> dado de alta
            </span>
            <span style={{ flex: 1 }} />
            <Link className="btn ghost sm" href="/dashboard/settings">
              Salir
              <Ic n="arrowr" sm />
            </Link>
          </header>
          <div className="ms-body">
            <div className="ms-ey">
              <span className="pulse" />
              <span>{MISSION_PHASES[ph]}</span>
            </div>
            <div className="ms-n">
              <Roll value={counter.got} />
              {counter.total !== null ? <span className="of num">de {counter.total}</span> : null}
            </div>
            <div className="ms-u">{counter.unit}</div>
            <Ticks count={TICKS} on={lit} cls="ms-tk" />
            <p className="ms-s">
              <strong className="ms-h">{missionHeadline(beat)}</strong>
              <br />
              {ph >= 4 ? <span className="shimmer">{missionLine(beat, engineCount)}</span> : missionLine(beat, engineCount)}
            </p>
            {providers.length > 0 ? (
              <div className="card pend ms-pend">
                <PendulumWave providers={providers} />
                <div className="ms-pl" style={{ gridTemplateColumns: `repeat(${providers.length}, 1fr)` }}>
                  {providers.map((p) => (
                    <span key={p}>
                      <b>
                        <EngineLogo provider={p} size={14} />
                        {engineName(p)}
                      </b>
                      <span className="num">
                        {run.engine_counts?.[p] !== undefined && launches !== null
                          ? `${run.engine_counts[p]} de ${launches}`
                          : " "}
                      </span>
                      {p === "perplexity" ? <span className="new">Nuevo</span> : null}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <ol className="ms-beats" aria-label="Fases">
              {MISSION_PHASES.map((label, i) => (
                <li key={label} className={i < ph ? "done" : i === ph ? "on" : ""}>
                  <i />
                  {label}
                </li>
              ))}
            </ol>
            <p className="ms-note">
              Un escaneo de verdad tarda unos minutos. Puedes cerrar la pestaña: seguimos solos y te avisamos por correo.
            </p>
          </div>
        </div>
      </div>
    </Motion>
  );
}
