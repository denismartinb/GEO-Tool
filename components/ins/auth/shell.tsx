"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AU_N, AUFX, setAuthState, startMist } from "./fx";

/**
 * Full-screen frame of the entry screens (login, signup, forgot password,
 * 2FA): the GenScore lockup, then the content over Bruma. `lit` is how far
 * the account is open at first paint: 0 email, 1 half, 2 done.
 */
export function AuthShell({ children, lit = 0 }: { children: ReactNode; lit?: 0 | 1 | 2 }) {
  const cv = useRef<HTMLCanvasElement | null>(null);
  const cls = lit === 2 ? "lit-full" : lit === 1 ? "lit-half" : "";

  useEffect(() => {
    AUFX.st = 0;
    AUFX.en = 0;
    const el = cv.current;
    const stop = el ? startMist(el) : () => {};
    const id = requestAnimationFrame(() => setAuthState(lit === 2 ? AU_N : lit === 1 ? AU_N / 2 : 0, lit === 2));
    return () => {
      cancelAnimationFrame(id);
      stop();
    };
  }, [lit]);

  return (
    <div className={`sc-full sc-auth ${cls}`.trim()} data-st={lit}>
      <canvas ref={cv} className="au-cv" aria-hidden="true" />
      <div className="au-col">
        <div className="au-lock">
          <svg viewBox="0 0 285 292" aria-hidden="true">
            <use href="#e-gs" />
          </svg>
          <span>GenScore</span>
        </div>
        {children}
      </div>
    </div>
  );
}
