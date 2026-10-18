"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * The wait of the agentic audit and checker (log §324), in the spirit of the
 * «Posición en Google» loading scene (log §289): an agent's cursor walks a
 * page, lands on the price, the buy button and the structured data, while the
 * kinds of things GenScore looks for light up in turn.
 *
 * It is ambient on purpose: nothing in it says how far along the review is,
 * and it shows no value of the site, because nothing here knows either.
 * With reduced motion it stays still on its last frame.
 */

const TARGETS = [
  { id: "price", left: "64%", top: "50%" },
  { id: "buy", left: "60%", top: "80%" },
  { id: "data", left: "86%", top: "16%" }
] as const;

const KINDS = ["Producto", "Precios", "Servicio", "Reserva", "Curso", "Entradas", "Suscripción"];
const BEAT_MS = 1100;

export function AgenticLoadingScene({ compact = false }: { compact?: boolean }) {
  const reduce = useReducedMotion();
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setBeat((b) => b + 1), BEAT_MS);
    return () => window.clearInterval(id);
  }, [reduce]);

  const target = TARGETS[beat % TARGETS.length];
  const kind = reduce ? -1 : beat % KINDS.length;
  const hit = (id: string) => reduce || target.id === id;

  return (
    <div className={`als${compact ? " als-compact" : ""}`} aria-hidden="true">
      <div className="als-window">
        <div className="als-bar">
          <span className="als-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="als-url">
            <svg width="10" height="10" viewBox="0 0 24 24">
              <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2.4" />
            </svg>
            <motion.span
              className="als-typed"
              initial={{ width: reduce ? "70%" : "0%" }}
              animate={reduce ? undefined : { width: ["0%", "70%", "70%", "0%"] }}
              transition={{ duration: (BEAT_MS * 6) / 1000, times: [0, 0.3, 0.9, 1], repeat: Infinity, ease: "easeInOut" }}
            />
          </span>
          <motion.span
            className="als-agent"
            animate={reduce ? undefined : { scale: [1, 1.12, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24">
              <rect x="4" y="7" width="16" height="12" rx="4" fill="currentColor" />
              <circle cx="9.5" cy="13" r="1.6" fill="#fff" />
              <circle cx="14.5" cy="13" r="1.6" fill="#fff" />
              <path d="M12 7V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="3.5" r="1.5" fill="currentColor" />
            </svg>
          </motion.span>
        </div>
        <div className="als-page">
          <div className="als-media">
            <motion.span
              className="als-shine"
              animate={reduce ? undefined : { x: ["-120%", "220%"] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.6 }}
            />
          </div>
          <div className="als-info">
            <span className="als-line als-w70" />
            <span className="als-line als-w55" />
            <span className={`als-price${hit("price") ? " is-hit" : ""}`}>
              <span className="als-line als-w30" />
              <Tick on={hit("price")} />
            </span>
            <span className="als-line als-w70 als-thin" />
            <span className="als-line als-w60 als-thin" />
            <span className={`als-buy${hit("buy") ? " is-hit" : ""}`}>
              <span className="als-line als-w40 als-light" />
              <Tick on={hit("buy")} />
            </span>
          </div>
          <span className={`als-data${hit("data") ? " is-hit" : ""}`}>
            {"{ }"}
            <Tick on={hit("data")} />
          </span>
          {reduce ? null : (
            <motion.span
              className="als-cursor"
              initial={false}
              animate={{ left: target.left, top: target.top }}
              transition={{ type: "spring", stiffness: 140, damping: 18 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M4 3l15 8-6.5 1.5L10 19z" fill="currentColor" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              <motion.span
                key={beat}
                className="als-ripple"
                initial={{ scale: 0.2, opacity: 0.7 }}
                animate={{ scale: 1.8, opacity: 0 }}
                transition={{ duration: 0.8, delay: 0.35, ease: "easeOut" }}
              />
            </motion.span>
          )}
        </div>
      </div>
      <div className="als-kinds">
        {KINDS.map((label, i) => (
          <motion.span
            key={label}
            className={`als-kind${i === kind ? " is-on" : ""}`}
            animate={i === kind ? { y: [0, -3, 0] } : { y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            {label}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <motion.span
      className="als-tick"
      initial={false}
      animate={on ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 24 }}
    >
      ✓
    </motion.span>
  );
}
