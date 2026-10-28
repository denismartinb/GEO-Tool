"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { computeScanStage, type ActiveScanRun } from "@/components/scan-in-progress";
import { PendulumWave } from "@/components/ins/kit/pendulum";
import { Roll } from "@/components/ins/kit/roll";
import { Ticks } from "@/components/ins/kit/bar";
import { engineName } from "@/components/ins/kit/engine";

type LiveRun = ActiveScanRun & { id: string };

const POLL_INTERVAL_MS = 3000;
const TICKS = 68;

/**
 * «Escaneo en curso» card of Visión general (`.scan` in the prototype). Every
 * figure is a real counter from the run: the pendulums are ambient and never
 * encode progress. It also owns the refresh when the run ends or another one
 * takes over, so the screen fills in without a reload (VERCEL-COST-1: one
 * poller per screen, log §352).
 */
export function LiveScanCard({
  projectId,
  initial,
  providers
}: {
  projectId: string;
  initial: LiveRun;
  providers: readonly string[];
}) {
  const router = useRouter();
  const [run, setRun] = useState<LiveRun>(initial);

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/scan-status`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: { run: LiveRun | null } = await res.json();
        const live = data.run;
        const terminal = !live || (live.status !== "pending" && live.status !== "running");
        const superseded = Boolean(live) && live!.id !== initial.id;
        if (terminal || superseded) {
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
  }, [projectId, initial.id, router]);

  const stage = computeScanStage(run);
  const pct = stage.kind === "preparing" ? 0 : stage.pct;
  const counter =
    stage.kind === "generating"
      ? { n: stage.done, of: `de ${stage.total} consultas a los motores` }
      : stage.kind === "analyzing" && stage.total !== null
        ? { n: stage.done, of: `de ${stage.total} respuestas leídas` }
        : null;
  const finishing = stage.kind === "analyzing" && (stage.total === null || stage.done >= stage.total);

  return (
    <section className="card scan" aria-label="Escaneo en curso">
      <div className="pend">
        <PendulumWave providers={providers} />
        <div className="pend-l" style={{ gridTemplateColumns: `repeat(${Math.max(1, providers.length)},1fr)` }}>
          {providers.map((p) => (
            <span key={p}>{engineName(p)}</span>
          ))}
        </div>
      </div>
      <div className="scan-r" aria-live="polite">
        <div className="k">
          <span className="pulse" />
          Escaneo en curso
        </div>
        {counter ? (
          <div className="n">
            <Roll value={counter.n} />
            <small>{counter.of}</small>
          </div>
        ) : (
          <div className="n">
            <small style={{ marginLeft: 0 }}>Preparando el escaneo…</small>
          </div>
        )}
        <Ticks count={TICKS} on={Math.floor((pct / 100) * TICKS)} />
        <div className="s">{finishing ? <span className="shimmer">Calculando tu Puntuación GEO</span> : "Puedes salir. Seguimos solos."}</div>
      </div>
    </section>
  );
}
