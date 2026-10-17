"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgenticCheckResult } from "@/lib/agentic-audit/api-contract";
import {
  buildScanScript,
  laneProgress,
  SCAN_DURATION_S,
  SCAN_HOLD_AT,
  scriptedTime,
  type ScanTarget
} from "@/lib/agentic-audit/scan-script";

/**
 * AGENTIC-COMMERCE-1: the wait of the agentic checker. It plays the script
 * of `scan-script.ts` while the request is in flight and, once the response
 * is in, with the store's own data (product, price, which assistants get in).
 * One clock drives everything; only the pacing is staged, never a value.
 */

const VISIBLE_LINES = 6;
const RING_C = 2 * Math.PI * 15;

function Ring({ p }: { p: number }) {
  return (
    <svg className="ca-sc-ring" viewBox="0 0 34 34" aria-hidden="true">
      <circle className="ca-sc-rb" cx="17" cy="17" r="15" />
      <circle className="ca-sc-rf" cx="17" cy="17" r="15" strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - p)} />
    </svg>
  );
}

export function AgenticScan({
  target,
  result,
  onDone
}: {
  target: ScanTarget;
  /** `null` while the request is in flight. */
  result: AgenticCheckResult | null;
  onDone: () => void;
}) {
  const [t, setT] = useState(0);
  const startRef = useRef<number | null>(null);
  const arrivedRef = useRef<number | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const resultRef = useRef(result);
  resultRef.current = result;
  const rootRef = useRef<HTMLDivElement>(null);

  const script = useMemo(() => buildScanScript(target, result), [target, result]);

  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, []);

  useEffect(() => {
    let raf = 0;
    let finished = false;
    const step = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = (now - startRef.current) / 1000;
      if (resultRef.current && arrivedRef.current === null) arrivedRef.current = elapsed;
      const next = scriptedTime(elapsed, arrivedRef.current);
      setT(next);
      if (next >= SCAN_DURATION_S) {
        if (!finished) {
          finished = true;
          doneRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const shown = script.lines.filter((line) => line.at <= t);
  const waiting = result === null && t >= SCAN_HOLD_AT;
  const visible = shown.slice(-(waiting ? VISIBLE_LINES - 1 : VISIBLE_LINES));
  const phrase = [...script.phrases].reverse().find((p) => p.at <= t)?.text ?? script.phrases[0].text;

  return (
    <div className="ca-scan" ref={rootRef} aria-busy="true">
      <div className="ca-scan-head">
        <span className="ca-scan-orb" aria-hidden="true" />
        <div>
          <b className="ca-scan-t">Analizando {target.host}</b>
          <span className="ca-scan-s">{phrase}</span>
        </div>
      </div>

      <div className="ca-scan-tk" aria-hidden="true">
        {visible.map((line) => (
          <div key={`${line.at}-${line.text}`} className={`ca-tk-${line.tone}`}>
            {line.text}
          </div>
        ))}
        {waiting ? <div className="ca-tk-wait">esperando respuesta de {target.host}…</div> : null}
      </div>

      <div className="ca-scan-lanes">
        {script.lanes.map((lane) => {
          const p = laneProgress(lane, t);
          const done = Math.floor(p * lane.items.length);
          const status = p <= 0 ? "En cola" : p >= 1 ? "Analizado" : "Analizando…";
          return (
            <div key={lane.id} className={`ca-lane${p > 0 && p < 1 ? " ca-on" : ""}${p >= 1 ? " ca-fin" : ""}`}>
              <div className="ca-lane-h">
                <Ring p={p} />
                <div>
                  <b className="ca-lane-n">{lane.name}</b>
                  <span className="ca-lane-c">{status}</span>
                </div>
              </div>
              <div className="ca-lane-body">
                {lane.note ? (
                  <p className="ca-lane-note">{p >= 1 ? lane.note : ""}</p>
                ) : (
                  <ul className="ca-chk">
                    {lane.items.map((item, i) => {
                      const isDone = p >= 1 || i < done;
                      const isRun = !isDone && i === done && p > 0;
                      const mark = isDone ? (item.state ? `ca-k-${item.state}` : "ca-k-done") : isRun ? "ca-k-run" : "";
                      return (
                        <li key={`${lane.id}-${item.label}`} className={mark}>
                          <i aria-hidden="true" />
                          <span>
                            {item.label}
                            {isDone && item.detail ? <small>{item.detail}</small> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="ca-scan-foot">
        Sólo leemos tu página pública y los ficheros que publica tu dominio. No compramos nada ni guardamos datos de tu tienda.
      </p>
    </div>
  );
}
