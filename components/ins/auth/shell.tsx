"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AU_N, AUFX, setAuthState, startMist } from "./fx";
import { runSplash } from "./splash/engine";
import { gMarkInner } from "./splash/g-mark";
import { SPLASH_LAST_KEY, SPLASH_SEEN_KEY, WEB_SPLASH_KEY, pickVariant } from "./splash/timeline";

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
 *
 * APP-LAUNCH-1 (log §389): `launch` marks an opening of the app (`?source=twa`)
 * and replays the splash even if this tab already saw it; the marker is then
 * removed from the address so a reload does not replay it. `continueTo` is set
 * when the session is already open: the console is prefetched while the
 * splash plays and opened as soon as the G lands.
 *
 * SPLASH-WEB-1: `web` is the web login (never the app). The lockup carries the
 * geometric G too. With "intro", the first visit of a browser gets the short
 * entrance (the G draws itself and flies to the lockup, ≈1,6 s, a tap skips
 * it); every later visit shows the form at once and only the lockup G draws.
 * "still" (an error, a `?next=` link, after signing out or deleting the
 * account) never animates. The choice is taken before first paint: by the
 * inline script on a full load, by a layout effect on a client navigation.
 */
export function AuthShell({
  children,
  lit = 0,
  splash = false,
  launch = false,
  continueTo,
  web
}: {
  children: ReactNode;
  lit?: 0 | 1 | 2;
  splash?: boolean;
  launch?: boolean;
  continueTo?: string;
  web?: "intro" | "still";
}) {
  const router = useRouter();
  const cv = useRef<HTMLCanvasElement | null>(null);
  const scRef = useRef<HTMLDivElement | null>(null);
  const spRef = useRef<HTMLDivElement | null>(null);
  const gid = `lg${useId().replace(/[^a-z0-9]/gi, "")}`;
  const webPlan = useRef<"splash" | "draw" | "none" | null>(null);
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
    let left = false;
    const enter = () => {
      if (left || !continueTo) return;
      left = true;
      router.replace(continueTo);
    };
    if (continueTo) router.prefetch(continueTo);
    if (launch) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("source");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      } catch {
        /* the marker stays: a reload replays the splash, nothing worse */
      }
    }
    const sc = scRef.current;
    const root = spRef.current;
    const lockG = sc?.querySelector<SVGElement>(".au-lock svg");
    const lockW = sc?.querySelector<HTMLElement>(".au-lock span");
    if (!sc || !root || !lockG || !lockW) {
      if (sc) sc.dataset.splash = "done";
      enter();
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || (!launch && readStore("session", SPLASH_SEEN_KEY))) {
      sc.dataset.splash = "done";
      enter();
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
        enter();
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
  }, [splash, launch, continueTo, router]);

  useLayoutEffect(() => {
    if (splash || web !== "intro") return;
    const sc = scRef.current;
    const root = spRef.current;
    const lockG = sc?.querySelector<SVGElement>(".au-lock svg");
    const lockW = sc?.querySelector<HTMLElement>(".au-lock span");
    if (!sc || !root || !lockG || !lockW) return;
    if (webPlan.current === null) webPlan.current = decideWebEntrance();
    if (webPlan.current === "none") {
      sc.dataset.splash = "done";
      return;
    }
    if (webPlan.current === "draw") {
      sc.dataset.splash = "done";
      sc.dataset.gdraw = "1";
      return;
    }
    sc.dataset.splash = "run";
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    let clear = 0;
    const stop = runSplash({
      root,
      variant: "breve",
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
  }, [splash, web]);

  const geo = splash || web !== undefined;
  const webIntro = !splash && web === "intro";

  return (
    <div ref={scRef} className={`sc-full sc-auth ${cls}`.trim()} data-st={lit} data-splash={splash ? "run" : undefined} suppressHydrationWarning>
      {webIntro ? <script dangerouslySetInnerHTML={{ __html: WEB_ENTRANCE_SCRIPT }} /> : null}
      <canvas ref={cv} className="au-cv" aria-hidden="true" />
      <div className="au-col">
        <div className="au-lock">
          {geo ? (
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
      {splash || webIntro ? <div ref={spRef} className="sp-root" role="button" aria-label={continueTo ? "Toca para entrar" : "Toca para ir al inicio de sesión"} /> : null}
    </div>
  );
}

/**
 * SPLASH-WEB-1: what the web login does this time. Reading and writing the
 * marker happen here, once per mount. Blocked storage means no splash: better
 * none than one on every visit.
 */
function decideWebEntrance(): "splash" | "draw" | "none" {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "none";
  try {
    if (window.localStorage.getItem(WEB_SPLASH_KEY)) return "draw";
    window.localStorage.setItem(WEB_SPLASH_KEY, "1");
    return "splash";
  } catch {
    return "draw";
  }
}

/**
 * Runs while the HTML is parsed, before the first paint of a full load, so a
 * first visit never flashes the form and a returning one draws the lockup G
 * from the start. Same rule as `decideWebEntrance`, without writing: the
 * layout effect writes the marker.
 */
const WEB_ENTRANCE_SCRIPT = `(function(){try{var s=document.currentScript.parentElement;if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;if(localStorage.getItem(${JSON.stringify(WEB_SPLASH_KEY)})){s.setAttribute("data-gdraw","1")}else{s.setAttribute("data-splash","run")}}catch(e){}})()`;
