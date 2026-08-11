"use client";

import { useEffect, useState } from "react";
import { AUDIT_TICKER_INTERVAL_MS, tickerLineAt } from "@/lib/web-audit/audit-ticker";

/**
 * SCAN-STATES-3 — the sixth beat: re-entry, i.e. the web audit
 * (`docs/design-reference/scan-states-1/rev6-reentrada.html`, mockup approved
 * by the founder on 2026-08-10).
 *
 * WHERE THIS RENDERS, and why it is narrower than the mockup asked for.
 * The mockup put the full-screen re-entry on Auditoría web "mientras dure".
 * Checked against the page: it does NOT take the screen over today — a
 * project with a previous audit keeps reading its data while a new one runs,
 * with only an "Auditando…" pill in the header. So this renders **only when
 * there is nothing to hide**: no coverage summary and no technical snapshot,
 * i.e. the domain's first audit. Same rule the rocket follows with
 * `isFirstScan`, and the same mistake it avoids — hiding real content behind
 * an animation, which is exactly what the founder caught earlier in the day.
 *
 * NOTHING IN THIS SCENE CARRIES DATA. The rocket's descent, the heat, the
 * Earth: all ambient, all constant-rate. Re-using the órbita ring would imply
 * a fraction of "the audit", and nothing measures the audit as a whole — the
 * technical half publishes no progress until it finishes. The one real figure
 * that exists (coverage `{covered, total}`) is not read here, so this beat
 * shows no number at all rather than a plausible one.
 *
 * The ticker is the point of the beat: it names the sixteen checks that are
 * genuinely running. Its content and its traceability live in
 * `lib/web-audit/audit-ticker.ts`, guarded by a test that reads `issues.ts`
 * itself — a line describing a check the product does not perform cannot be
 * added without turning the suite red.
 */
export function ReentryMission({ domain }: { domain: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // One clock, ticking on the ticker's own cadence — no per-line timeout
    // chain, so a suspended tab resumes on the right line instead of drifting.
    const id = setInterval(() => setElapsed((ms) => ms + AUDIT_TICKER_INTERVAL_MS), AUDIT_TICKER_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const line = tickerLineAt(elapsed);

  return (
    <section className="mrk-full night rnt" aria-live="polite">
      <div className="mrk-rail">
        <span className="mrk-rail-left">
          <span className="mrk-rail-tick" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="11" height="11">
              <path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <b>{domain}</b> ya tiene puntuación
        </span>
        <span className="mrk-rail-right">16 comprobaciones técnicas</span>
      </div>

      <div className="mrk-canvas">
        <div className="mrk-scene-slot">
          <ReentryScene />
        </div>
        <div className="mrk-copy">
          <span className="mrk-eyebrow">Reentrada</span>
          <h2 className="mrk-title">Revisando tu web</h2>

          {/* The ticker. `key` remounts it per line so the fade replays — the
              only thing that changes on screen every four seconds, and the
              reason this beat does not read as frozen across several minutes. */}
          <div className="rnt-tick" key={line.check}>
            <p className="rnt-tick-t">{line.title}</p>
            <p className="rnt-tick-d">{line.detail}</p>
          </div>

          <p className="mrk-sub">Tarda unos minutos. Puedes irte: seguimos aunque cierres esta pestaña.</p>
          <p className="mrk-joke">Lo caro del viaje es volver entero.</p>
        </div>
      </div>
    </section>
  );
}

/**
 * The vehicle coming home. Heat on the shield, the Earth filling the bottom,
 * embers streaming off — every one of them ambient, on a constant loop.
 *
 * Cyan rather than amber for the heat: `#FFB020` belongs to the logo's dot
 * and nothing else (`docs/brand/brand-guidelines.md`).
 */
function ReentryScene() {
  return (
    <svg className="mrk-sky mrk-scene" viewBox="0 0 400 280" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="rnt-earth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A6FA8" />
          <stop offset="1" stopColor="#0C1D33" />
        </linearGradient>
        <radialGradient id="rnt-heat">
          <stop offset="0" stopColor="rgba(127,227,236,.85)" />
          <stop offset="1" stopColor="rgba(127,227,236,0)" />
        </radialGradient>
        <linearGradient id="rnt-trail" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="rgba(127,227,236,.45)" />
          <stop offset="1" stopColor="rgba(127,227,236,0)" />
        </linearGradient>
        <clipPath id="rnt-clip">
          <rect width="400" height="280" />
        </clipPath>
      </defs>

      <g clipPath="url(#rnt-clip)">
        {/* Stars, thinning as the atmosphere takes over — parallax layers
            duplicated at +400 so the wrap is seamless. */}
        <g className="mrk-stars-2" fill="#CFE0FF" opacity=".4">
          <circle cx="40" cy="34" r="1" />
          <circle cx="150" cy="70" r=".9" />
          <circle cx="268" cy="28" r="1" />
          <circle cx="352" cy="86" r=".8" />
          <circle cx="440" cy="34" r="1" />
          <circle cx="550" cy="70" r=".9" />
          <circle cx="668" cy="28" r="1" />
          <circle cx="752" cy="86" r=".8" />
        </g>
        <g className="mrk-stars-1" fill="#EAF1FF" opacity=".75">
          <circle className="mrk-tw" cx="86" cy="22" r="1.3" />
          <circle className="mrk-tw s2" cx="300" cy="58" r="1.2" />
          <circle className="mrk-tw s3" cx="196" cy="40" r="1.1" />
          <circle className="mrk-tw s3" cx="486" cy="22" r="1.3" />
          <circle className="mrk-tw" cx="700" cy="58" r="1.2" />
          <circle className="mrk-tw s2" cx="596" cy="40" r="1.1" />
        </g>

        {/* Earth, much closer than in órbita: the whole point of coming back. */}
        <circle cx="200" cy="470" r="290" fill="none" stroke="rgba(9,197,214,.16)" strokeWidth="10" />
        <circle cx="200" cy="470" r="286" fill="none" stroke="rgba(127,227,236,.55)" strokeWidth="1.8" />
        <circle cx="200" cy="470" r="285" fill="url(#rnt-earth)" />

        {/* The vehicle: nose down, shield lit, embers trailing up behind it. */}
        <g className="rnt-craft">
          <ellipse className="rnt-glow" cx="200" cy="150" rx="62" ry="40" fill="url(#rnt-heat)" />
          <path className="rnt-trail" d="M186 150 L214 150 L226 66 L174 66 Z" fill="url(#rnt-trail)" />

          <g className="rnt-embers" fill="#7FE3EC">
            <circle cx="188" cy="132" r="1.6" />
            <circle cx="208" cy="120" r="1.2" style={{ animationDelay: "-.7s" }} />
            <circle cx="197" cy="108" r="1.4" style={{ animationDelay: "-1.4s" }} />
            <circle cx="213" cy="136" r="1.1" style={{ animationDelay: "-2.1s" }} />
          </g>

          {/* Rotated 180°: it is falling shield-first, not flying. */}
          <g transform="rotate(180 200 150) translate(0 -34)">
            <rect x="184" y="164" width="9" height="8" rx="2" className="mrk-nozzle" />
            <rect x="196" y="164" width="9" height="9" rx="2" className="mrk-nozzle" />
            <rect x="208" y="164" width="9" height="8" rx="2" className="mrk-nozzle" />
            <path d="M184 144 L174 166 L184 162 Z" className="mrk-fin" />
            <path d="M217 144 L227 166 L217 162 Z" className="mrk-fin" />
            <path d="M200 94 q16 16 16 39 v30 h-32 v-30 q0 -23 16 -39 Z" className="mrk-hull-dark" />
            <path d="M200 94 q16 16 16 39 h-32 q0 -23 16 -39 Z" className="mrk-hull-dark-shade" />
            <circle cx="200" cy="132" r="6.5" className="mrk-window" />
            <circle cx="200" cy="132" r="4" fill="var(--brand-cyan)" />
          </g>

          {/* The shield itself, taking the heat at the leading edge. */}
          <path className="rnt-shield" d="M172 158 q28 22 56 0 q-28 12 -56 0 Z" fill="#7FE3EC" />
        </g>
      </g>
    </svg>
  );
}
