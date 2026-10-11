"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDemoSlotShort, listDemoSlots } from "@/lib/demo/slots";

/**
 * DEMO-CALL-1 — the home's secondary call to action (option A, approved by
 * the founder on 2026-10-11): a small pill with the next real free slot.
 *
 * The slot is computed after mount, in the browser: the home is static, and a
 * slot baked in at build time would soon be in the past. Until then the pill
 * shows the opening hours, which are always true.
 */
export function HeroCallPill() {
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    const first = listDemoSlots(new Date())[0];
    if (first) setNext(formatDemoSlotShort(first));
  }, []);

  return (
    <Link href="/demo?desde=portada" className="lp-hero-call">
      <span className="ic" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="14" height="12" rx="2" />
          <path d="M16 10l6-3v10l-6-3z" />
        </svg>
      </span>
      <span className="label">Videollamada de 20 min</span>
      <span className="next">
        <span className="dot" aria-hidden="true" />
        {next ? (
          <>
            <span className="k">Próximo hueco: </span>
            {next}
          </>
        ) : (
          "L–V, 18:00–21:00"
        )}
        <span className="arr" aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
