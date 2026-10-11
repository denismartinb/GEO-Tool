"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * The loading scene of «Posición en Google» (log §289): a search box and a
 * few results where one of them, «tu web», climbs. It is ambient on purpose:
 * it says nothing about how far along the request is, because nothing here
 * knows. With reduced motion it stays still on its final frame.
 */

const ROWS = [
  { id: "a", width: "78%" },
  { id: "b", width: "64%" },
  { id: "you", width: "70%" },
  { id: "c", width: "56%" }
];

/** Where «tu web» sits in each beat of the loop (0 = first result). */
const BEATS = [2, 1, 0, 1];
const BEAT_MS = 1400;

function orderFor(beat: number): string[] {
  const others = ROWS.filter((r) => r.id !== "you").map((r) => r.id);
  others.splice(BEATS[beat], 0, "you");
  return others;
}

export function GscLoading() {
  const reduce = useReducedMotion();
  const [beat, setBeat] = useState(reduce ? 2 : 0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setBeat((b) => (b + 1) % BEATS.length), BEAT_MS);
    return () => window.clearInterval(id);
  }, [reduce]);

  const order = orderFor(reduce ? 2 : beat);

  return (
    <div className="card gsc-load" role="status" aria-live="polite">
      <div className="gsc-load-scene" aria-hidden="true">
        <div className="gsc-load-search">
          <motion.svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            animate={reduce ? undefined : { rotate: [0, -12, 0, 12, 0] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <path d="M15.5 15.5L21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </motion.svg>
          <motion.span
            className="gsc-load-typed"
            initial={{ width: reduce ? "62%" : "0%" }}
            animate={reduce ? undefined : { width: ["0%", "62%", "62%", "0%"] }}
            transition={{ duration: BEAT_MS * 4 / 1000, times: [0, 0.35, 0.85, 1], repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.span
            className="gsc-load-caret"
            animate={reduce ? undefined : { opacity: [1, 0, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        </div>
        <ol className="gsc-load-results">
          {order.map((id, i) => {
            const row = ROWS.find((r) => r.id === id)!;
            const you = id === "you";
            return (
              <motion.li
                key={id}
                layout={!reduce}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className={you ? "is-you" : undefined}
              >
                <span className="gsc-load-pos">{i + 1}</span>
                <span className="gsc-load-lines">
                  <span className="gsc-load-title" style={{ width: row.width }} />
                  <span className="gsc-load-url" />
                </span>
                {you ? <span className="gsc-load-tag">tu web</span> : null}
              </motion.li>
            );
          })}
        </ol>
        <svg className="gsc-load-chart" viewBox="0 0 240 56" preserveAspectRatio="none">
          <motion.path
            d="M2 48 C 30 44, 46 40, 66 36 S 104 38, 124 28 S 168 22, 186 16 S 222 10, 238 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={reduce ? undefined : { pathLength: [0, 1, 1], opacity: [1, 1, 0] }}
            transition={{ duration: BEAT_MS * 4 / 1000, times: [0, 0.7, 1], repeat: Infinity, ease: "easeOut" }}
          />
        </svg>
      </div>
      <div className="gsc-load-copy">
        <b>Obteniendo tus datos de Google Search Console…</b>
        <span>Tus búsquedas, tu puesto y tus páginas de los últimos 28 días.</span>
      </div>
    </div>
  );
}
