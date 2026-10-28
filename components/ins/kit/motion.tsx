"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Port of `armMotion()` from the prototype: arms the rolling counters, ticks,
 * dials and bars inside it. The first visit of a screen in a session animates;
 * later ones paint the final frame at once, as does `prefers-reduced-motion`.
 */
function seenKey(id: string) {
  return `gs-ins-seen:${id}`;
}

function wasSeen(id: string): boolean {
  try {
    if (window.sessionStorage.getItem(seenKey(id))) return true;
    window.sessionStorage.setItem(seenKey(id), "1");
    return false;
  } catch {
    return false;
  }
}

/**
 * Late arms: a block that streams in after the first paint (a Suspense
 * boundary) mounts after `armMotion` ran, so its ticks, dials and bars never
 * got `.lit` and stayed empty. Anything not yet armed is armed on arrival.
 */
export function armMotion(root: HTMLElement, animate: boolean) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const now = !animate || reduce;
  root.querySelectorAll<HTMLElement>(".roll:not([data-armed])").forEach((r) => {
    r.dataset.armed = "1";
    r.querySelectorAll<HTMLElement>(".col>span").forEach((s, k) => {
      const d = Number(s.dataset.d);
      if (now) {
        s.style.transition = "none";
        s.style.transform = `translateY(-${d}em)`;
        return;
      }
      s.style.transition = "none";
      s.style.transform = "translateY(0)";
      s.style.setProperty("--rd", `${k * 60}ms`);
      void s.offsetHeight;
      s.style.transition = "";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          s.style.transform = `translateY(-${d}em)`;
        })
      );
    });
  });
  const lit = root.querySelectorAll<HTMLElement>(".tk:not([data-armed]),.dial:not([data-armed]),.tb:not([data-armed])");
  lit.forEach((e) => (e.dataset.armed = "1"));
  if (now) {
    lit.forEach((e) => {
      e.classList.add("lit");
      e.style.transition = "none";
      e.querySelectorAll<HTMLElement>("*").forEach((x) => (x.style.transition = "none"));
    });
    requestAnimationFrame(() =>
      lit.forEach((e) => {
        e.style.transition = "";
        e.querySelectorAll<HTMLElement>("*").forEach((x) => (x.style.transition = ""));
      })
    );
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => lit.forEach((e) => e.classList.add("lit"))));
  }
}

export function Motion({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const animate = !wasSeen(id);
    armMotion(root, animate);
    const mo = new MutationObserver(() => {
      if (root.querySelector(".roll:not([data-armed]),.tk:not([data-armed]),.dial:not([data-armed]),.tb:not([data-armed])")) {
        armMotion(root, animate);
      }
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [id]);
  return (
    <div ref={ref} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
