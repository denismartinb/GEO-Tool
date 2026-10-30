"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { AU_N, AUFX, setAuthState, startMist } from "./fx";
import { runSplash } from "./splash/engine";
import { gMarkInner } from "./splash/g-mark";
import { SPLASH_LAST_KEY, SPLASH_SEEN_KEY, pickVariant } from "./splash/timeline";

function readStore(kind: "local" | "session", key: string): string | null {
  try {
    return (kind === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function writeStore(kind: "local" | "session", key: string, value: string) {
  try {
    (kind === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    /* storage blocked: the splash then rotates at random */
  }
}

/**
 * Full-screen frame of the entry screens (login, signup, forgot password,
 * 2FA): the GenScore lockup, then the content over Bruma. `lit` is how far
 * the account is open at first paint: 0 email, 1 half, 2 done. `splash` is
 * true only inside the Android app: the lockup then carries the geometric G
 * and, once per opening, one of three animated entrances lands on it (log §382).
 */
export function AuthShell({ children, lit = 0, splash = false }: { children: ReactNode; lit?: 0 | 1 | 2; splash?: boolean }) {
  const cv = useRef<HTMLCanvasElement | null>(null);
  const scRef = useRef<HTMLDivElement | null>(null);
  const spRef = useRef<HTMLDivElement | null>(null);
  const gid = `lg${useId().replace(/[^a-z0-9]/gi, "")}`;
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

  useEffect(() => {
    if (!splash) return;
    const sc = scRef.current;
    const root = spRef.current;
    const lockG = sc?.querySelector<SVGElement>(".au-lock svg");
    const lockW = sc?.querySelector<HTMLElement>(".au-lock span");
    if (!sc || !root || !lockG || !lockW) {
      if (sc) sc.dataset.splash = "done";
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || readStore("session", SPLASH_SEEN_KEY)) {
      sc.dataset.splash = "done";
      return;
    }
    const variant = pickVariant(readStore("local", SPLASH_LAST_KEY));
    writeStore("local", SPLASH_LAST_KEY, variant);
    writeStore("session", SPLASH_SEEN_KEY, "1");
    sc.dataset.splash = "run";
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    let clear = 0;
    const stop = runSplash({
      root,
      variant,
      lockG,
      lockW,
      onRelease: () => {
        if (sc.dataset.splash === "run") sc.dataset.splash = "out";
      },
      onDone: () => {
        sc.dataset.splash = "done";
        html.style.overflow = prevOverflow;
        clear = window.setTimeout(() => root.replaceChildren(), 450);
      }
    });
    return () => {
      stop();
      window.clearTimeout(clear);
      html.style.overflow = prevOverflow;
      root.replaceChildren();
    };
  }, [splash]);

  return (
    <div ref={scRef} className={`sc-full sc-auth ${cls}`.trim()} data-st={lit} data-splash={splash ? "run" : undefined}>
      <canvas ref={cv} className="au-cv" aria-hidden="true" />
      <div className="au-col">
        <div className="au-lock">
          {splash ? (
            <svg viewBox="0 0 292 292" aria-hidden="true" dangerouslySetInnerHTML={{ __html: gMarkInner(gid) }} />
          ) : (
            <svg viewBox="0 0 285 292" aria-hidden="true">
              <use href="#e-gs" />
            </svg>
          )}
          <span>GenScore</span>
        </div>
        {children}
      </div>
      {splash ? <div ref={spRef} className="sp-root" aria-hidden="true" /> : null}
    </div>
  );
}
