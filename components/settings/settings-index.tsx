"use client";

import { useEffect, useState } from "react";
import type { SettingsIndexEntry } from "@/lib/settings/index-entries";

/**
 * CONSOLE-REDESIGN-1. The spine of the single settings page.
 *
 * It carries state, not just links — the owner's name, how many alerts are on,
 * which plan. With only three entries a column that merely navigated would not
 * earn its 186px; carrying state is what makes one page beat the four tabs it
 * replaces, because the whole account reads at a glance without scrolling.
 *
 * "Eliminar cuenta" is deliberately absent: it is the last block on the page
 * and reaching it takes scrolling, not one click (founder, 2026-08-06).
 *
 * Hidden below 900px by CSS rather than by a viewport check here: mobile is one
 * scroll with no section navigation at all, and a JS media query would flash
 * the index on first paint before deciding to remove it.
 *
 * `buildSettingsIndex` lives in `lib/settings/index-entries.ts`, NOT here — the
 * page is a Server Component and calling a function exported from a
 * `"use client"` module during a server render throws. See that file.
 */
export function SettingsIndex({ entries }: { entries: SettingsIndexEntry[] }) {
  const [active, setActive] = useState(entries[0]?.id ?? "");

  useEffect(() => {
    const headings = entries
      .map((entry) => document.getElementById(entry.id))
      .filter((node): node is HTMLElement => node !== null);

    if (!headings.length) return;

    // Bottom margin pulls the observation band up to the top third of the
    // viewport: without it the last section can never win, because it is
    // often too short to push the one above it out of view.
    const observer = new IntersectionObserver(
      (records) => {
        const visible = records
          .filter((record) => record.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      { rootMargin: "0px 0px -66% 0px", threshold: 0 }
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [entries]);

  return (
    <nav className="set-idx" aria-label="Secciones de ajustes">
      {entries.map((entry) => (
        <a
          key={entry.id}
          href={`#${entry.id}`}
          className={`set-ie ${active === entry.id ? "on" : ""}`}
          aria-current={active === entry.id ? "true" : undefined}
        >
          <b>{entry.label}</b>
          <span>{entry.detail}</span>
        </a>
      ))}
    </nav>
  );
}
