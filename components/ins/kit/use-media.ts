"use client";

import { useEffect, useState } from "react";

/** `matchMedia` as state; false on the server and on the first client render. */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);
  return on;
}

export const MOBILE_QUERY = "(max-width:760px)";
export const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia(REDUCED_QUERY).matches
  );
}
