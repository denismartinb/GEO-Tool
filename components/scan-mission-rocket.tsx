"use client";

import { useEffect, useState } from "react";
import { computeMissionBeat, type MissionBeat } from "@/lib/scan/mission-beats";
import type { ActiveScanRun } from "@/components/scan-in-progress";

type LiveRun = ActiveScanRun & { id: string };

const POLL_INTERVAL_MS = 3000;

/**
 * ONBOARDING-ROCKET-1 — full-screen first-scan experience
 * (`docs/design-reference/scan-states-1/rev4-cohete-vivo.html`).
 *
 * Only mounted for the very first scan of a project (`page.tsx` decides that
 * from `completedRunsCount === 0`, computed server-side — no new signal). A
 * project's daily scans keep the plain `ScanInProgress` bar; this component
 * spends a first impression only once per domain.
 *
 * Polling mirrors `ScanInProgressLive` exactly (same endpoint, same interval,
 * same "ignore a superseded run id" guard) rather than sharing code with it —
 * the two render completely different markup and the only shared logic
 * (`computeScanStage`) already lives one level down, inside
 * `computeMissionBeat`.
 *
 * Deliberately does NOT render a "carga entregada · N puntos" beat with a
 * number. `entrega` (see mission-beats.ts) fires once every response has a
 * terminal extraction outcome, which is BEFORE the run's finalize step
 * persists the score — this component has no score to show at that instant.
 * The real reveal is `ScanProgressPoller` (already mounted by the parent)
 * calling `router.refresh()` once `scan_runs.status` goes terminal, which
 * swaps this whole component out for the real dashboard server-side. Showing
 * a placeholder score here to "keep pace" with the design reference would be
 * exactly the fake progress CLAUDE.md forbids.
 */
export function ScanMissionRocket({ projectId, initial }: { projectId: string; initial: LiveRun }) {
  const [run, setRun] = useState<LiveRun>(initial);

  useEffect(() => {
    let cancelled = false;

    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/scan-status`, { cache: "no-store" });
        if (!res.ok || cancelled) return;

        const data: { run: LiveRun | null } = await res.json();
        if (!data.run || data.run.id !== initial.id) return;

        setRun(data.run);
        if (data.run.status !== "pending" && data.run.status !== "running") {
          clearInterval(id);
        }
      } catch {
        // Transient network error — the next tick retries.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId, initial.id]);

  const beat = computeMissionBeat(run);

  return (
    <div className="mrk-wrap fade-in">
      <div className="mrk-stage">
        <RocketScene beat={beat} />
      </div>
      <div className="mrk-copy">
        <span className="mrk-eyebrow">{eyebrowFor(beat)}</span>
        <h2 className="mrk-title">{titleFor(beat)}</h2>
        <p className="mrk-sub">{subtitleFor(beat)}</p>
        {beat.key !== "entrega" && <p className="mrk-joke">{jokeFor(beat)}</p>}
      </div>
    </div>
  );
}

function eyebrowFor(beat: MissionBeat): string {
  switch (beat.key) {
    case "rampa":
      return "En la rampa";
    case "ignicion":
      return "Ignición";
    case "ascenso":
      return "Ascenso";
    case "orbita":
      return "En órbita";
    case "entrega":
      return "Cerrando la misión";
  }
}

function titleFor(beat: MissionBeat): string {
  switch (beat.key) {
    case "rampa":
      return "Preparando tu primer escaneo";
    case "ignicion":
      return "Motores encendidos";
    case "ascenso":
      return `${beat.done} de ${beat.total}`;
    case "orbita":
      return beat.total === null ? "Abriendo la carga" : `${beat.done} de ${beat.total} respuestas leídas`;
    case "entrega":
      return "Casi está";
  }
}

function subtitleFor(beat: MissionBeat): string {
  switch (beat.key) {
    case "rampa":
      return "Un momento — estamos colocando la cola de trabajo.";
    case "ignicion":
      return "Gemini, ChatGPT y Claude, preguntados a la vez.";
    case "ascenso":
      return "Puedes irte tranquilo: seguimos trabajando aunque cierres esta pestaña.";
    case "orbita":
      return "Extraemos de cada respuesta las menciones, las posiciones y las citas.";
    case "entrega":
      return "Estamos calculando tu puntuación GEO.";
  }
}

function jokeFor(beat: MissionBeat): string {
  switch (beat.key) {
    case "rampa":
      return "Tú no tienes que hacer nada.";
    case "ignicion":
      return "Los tres a la vez. Sí, se puede.";
    case "ascenso":
      return "Esto no se cae.";
    case "orbita":
      return "Traerlas era la mitad del viaje.";
    default:
      return "";
  }
}

/**
 * One scene per beat, not one scene that morphs (rev.4).
 *
 * The mission travels from a daylit pad to open space, so the sky itself is
 * different per beat and a single morphing scene cannot express that. Each
 * scene is keyed by beat so React remounts it and `.mrk-scene` fades the new
 * sky in instead of hard-cutting.
 *
 * The data rule, which every scene below obeys: **only the ascent altitude
 * and the órbita ring fraction carry information**. Stars, clouds, smoke,
 * steam, sparks, packets and Earth are ambient — they run at a constant rate
 * with no start or end state, precisely so none of them can be read as
 * progress. That is what the founder's "el cohete está parado" fix could not
 * be allowed to break: motion everywhere, meaning in exactly two places.
 */
function RocketScene({ beat }: { beat: MissionBeat }) {
  switch (beat.key) {
    case "rampa":
      return <PadScene key="rampa" lit={false} />;
    case "ignicion":
      return <PadScene key="ignicion" lit />;
    case "ascenso":
      return <ClimbScene key="ascenso" climb={beat.climb} />;
    case "orbita":
      return <OrbitScene key="orbita" ringFrac={beat.ringFrac} />;
    case "entrega":
      return <DeliveryScene key="entrega" />;
  }
}

/** The rocket body itself, shared by every scene. `dark` is the in-space livery. */
function RocketBody({ dark = false }: { dark?: boolean }) {
  return (
    <>
      <rect x="184" y="208" width="9" height="8" rx="2" className="mrk-nozzle" />
      <rect x="196" y="208" width="9" height="9" rx="2" className="mrk-nozzle" />
      <rect x="208" y="208" width="9" height="8" rx="2" className="mrk-nozzle" />
      <path d="M184 188 L174 210 L184 206 Z" className="mrk-fin" />
      <path d="M217 188 L227 210 L217 206 Z" className="mrk-fin" />
      <path
        d="M200 138 q16 16 16 39 v30 h-32 v-30 q0 -23 16 -39 Z"
        className={dark ? "mrk-hull-dark" : "mrk-hull"}
      />
      <path
        d="M200 138 q16 16 16 39 h-32 q0 -23 16 -39 Z"
        className={dark ? "mrk-hull-dark-shade" : "mrk-hull-shade"}
      />
    </>
  );
}

/** Three engine flames. Only ever rendered when the engines are actually lit. */
function Flames({ tall = false }: { tall?: boolean }) {
  return (
    <g>
      <path className="mrk-flame" d={tall ? "M190 216 q5 24 0 36 q-5 -12 0 -36 Z" : "M190 216 q5 20 0 30 q-5 -10 0 -30 Z"} />
      <path className="mrk-flame f2" d={tall ? "M200 217 q6 30 0 44 q-6 -14 0 -44 Z" : "M200 217 q6 24 0 35 q-6 -11 0 -35 Z"} />
      <path className="mrk-flame f3" d={tall ? "M210 216 q5 24 0 36 q-5 -12 0 -36 Z" : "M210 216 q5 20 0 30 q-5 -10 0 -30 Z"} />
    </g>
  );
}

/**
 * Beats 1-2. Same pad, same rocket; `lit` is the whole difference between
 * "waiting on the pad" and "engines running".
 *
 * Unlit, the life comes from the ground crew: steam venting by the nozzles,
 * two cloud layers crossing at different speeds, tower beacons blinking out
 * of phase, a systems-check glow in the window. The rocket is the one thing
 * standing still, which is what makes it read as *held*, not as frozen.
 */
function PadScene({ lit }: { lit: boolean }) {
  const p = lit ? "ig" : "ra";
  return (
    <svg className="mrk-sky mrk-scene" viewBox="0 0 400 280" role="img" aria-hidden="true">
      <defs>
        <linearGradient id={`${p}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={lit ? "#F5F9FF" : "#FDFEFF"} />
          <stop offset="1" stopColor={lit ? "#CFDEF6" : "#E7EEFA"} />
        </linearGradient>
        <linearGradient id={`${p}-plume`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(37,99,235,.30)" />
          <stop offset="1" stopColor="rgba(37,99,235,0)" />
        </linearGradient>
        <radialGradient id={`${p}-glow`}>
          <stop offset="0" stopColor="rgba(79,123,255,.55)" />
          <stop offset="1" stopColor="rgba(79,123,255,0)" />
        </radialGradient>
        <clipPath id={`${p}-clip`}>
          <rect width="400" height="280" rx="20" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${p}-clip)`}>
        <rect width="400" height="280" fill={`url(#${p}-sky)`} />

        {!lit && (
          <>
            {/* Two parallax cloud layers. Content is duplicated at +400 (the
                viewBox width) so the wrap is seamless. */}
            <g className="mrk-clouds-slower" opacity=".55" fill="#FFFFFF">
              <ellipse cx="70" cy="52" rx="34" ry="10" />
              <ellipse cx="94" cy="46" rx="22" ry="8" />
              <ellipse cx="300" cy="90" rx="28" ry="8" />
              <ellipse cx="470" cy="52" rx="34" ry="10" />
              <ellipse cx="494" cy="46" rx="22" ry="8" />
              <ellipse cx="700" cy="90" rx="28" ry="8" />
            </g>
            <g className="mrk-clouds-slow" opacity=".8" fill="#FFFFFF">
              <ellipse cx="180" cy="34" rx="40" ry="11" />
              <ellipse cx="212" cy="28" rx="24" ry="8" />
              <ellipse cx="352" cy="130" rx="30" ry="9" />
              <ellipse cx="580" cy="34" rx="40" ry="11" />
              <ellipse cx="612" cy="28" rx="24" ry="8" />
              <ellipse cx="752" cy="130" rx="30" ry="9" />
            </g>
          </>
        )}

        {/* Four-point sparkles — the only "stars" that survive on a white sky. */}
        <g fill="#C3D3EC">
          <path className="mrk-tw" d="M52 78 l1.5 4.3 4.3 1.5 -4.3 1.5 -1.5 4.3 -1.5 -4.3 -4.3 -1.5 4.3 -1.5z" />
          <path className="mrk-tw s2" d="M338 44 l1.3 3.7 3.7 1.3 -3.7 1.3 -1.3 3.7 -1.3 -3.7 -3.7 -1.3 3.7 -1.3z" />
          <path className="mrk-tw s3" d="M296 160 l1.1 3.2 3.2 1.1 -3.2 1.1 -1.1 3.2 -1.1 -3.2 -3.2 -1.1 3.2 -1.1z" />
        </g>

        <rect x="0" y="228" width="400" height="52" fill={lit ? "#C4D3EA" : "#D3DEF0"} />
        <rect x="0" y="227" width="400" height="1.4" fill={lit ? "#A2B5D3" : "#B3C2DC"} />
        <rect x="150" y="202" width="6" height="26" fill={lit ? "#AFC0DB" : "#C3D0E5"} />
        <rect x="244" y="202" width="6" height="26" fill={lit ? "#AFC0DB" : "#C3D0E5"} />
        {!lit && (
          <>
            <rect x="145" y="198" width="16" height="4" rx="2" fill="#AEBED8" />
            <rect x="239" y="198" width="16" height="4" rx="2" fill="#AEBED8" />
          </>
        )}
        <circle
          className="mrk-beacon"
          cx="153"
          cy={lit ? 200 : 198}
          r="2"
          fill="var(--brand-cyan)"
          style={lit ? { animationDuration: "1.6s" } : undefined}
        />
        <circle
          className="mrk-beacon"
          cx="247"
          cy={lit ? 200 : 198}
          r="2"
          fill="var(--brand-cyan)"
          style={lit ? { animationDuration: "1.6s", animationDelay: "-.8s" } : { animationDelay: "-1.9s" }}
        />

        {lit ? (
          <>
            <ellipse className="mrk-glow" cx="200" cy="230" rx="52" ry="10" fill={`url(#${p}-glow)`} />
            {/* Smoke rolling out along the pad, both directions. */}
            <g fill="#B7C6DF">
              <circle className="mrk-smoke-l" cx="186" cy="224" r="11" />
              <circle className="mrk-smoke-l" cx="179" cy="228" r="8" style={{ animationDelay: "-.9s" }} />
              <circle className="mrk-smoke-l" cx="190" cy="229" r="13" style={{ animationDelay: "-1.9s" }} />
              <circle className="mrk-smoke-r" cx="214" cy="224" r="11" style={{ animationDelay: "-.4s" }} />
              <circle className="mrk-smoke-r" cx="222" cy="228" r="8" style={{ animationDelay: "-1.4s" }} />
              <circle className="mrk-smoke-r" cx="210" cy="229" r="13" style={{ animationDelay: "-2.3s" }} />
            </g>
            <g fill="#7FA2FF">
              <circle className="mrk-spark" cx="196" cy="224" r="1.4" style={{ "--dx": "-30px", "--dy": "-16px" } as React.CSSProperties} />
              <circle className="mrk-spark" cx="204" cy="224" r="1.2" style={{ "--dx": "34px", "--dy": "-12px", animationDelay: "-.5s" } as React.CSSProperties} />
              <circle className="mrk-spark" cx="200" cy="226" r="1.3" style={{ "--dx": "-20px", "--dy": "-24px", animationDelay: "-.9s" } as React.CSSProperties} />
              <circle className="mrk-spark" cx="207" cy="225" r="1.1" style={{ "--dx": "26px", "--dy": "-22px", animationDelay: "-1.1s" } as React.CSSProperties} />
            </g>
          </>
        ) : (
          /* Venting steam by the base — the pad breathing while nothing flies. */
          <g fill="#C6D3E8">
            <circle className="mrk-puff" cx="176" cy="222" r="6" />
            <circle className="mrk-puff" cx="170" cy="225" r="4.5" style={{ animationDelay: "-1.3s" }} />
            <circle className="mrk-puff" cx="180" cy="226" r="5" style={{ animationDelay: "-2.4s" }} />
            <circle className="mrk-puff" cx="228" cy="223" r="5.5" style={{ animationDelay: "-3.1s" }} />
            <circle className="mrk-puff" cx="233" cy="226" r="4" style={{ animationDelay: "-4.3s" }} />
            <circle className="mrk-puff" cx="224" cy="225" r="4.5" style={{ animationDelay: "-.6s" }} />
          </g>
        )}

        <g className={lit ? "mrk-shake" : undefined}>
          {lit && (
            <>
              <path d="M188 220 L212 220 L218 262 L182 262 Z" fill={`url(#${p}-plume)`} />
              <Flames />
            </>
          )}
          <RocketBody />
          <circle cx="200" cy="176" r="6.5" className="mrk-window" />
          <circle cx="200" cy="176" r="4" fill="var(--brand-blue)" />
          {!lit && <circle className="mrk-winpulse" cx="200" cy="176" r="4" fill="#7FE3EC" />}
        </g>
      </g>
    </svg>
  );
}

/**
 * Beat 3. The rocket's height is the ONLY data-bound thing on screen and it
 * keeps rev.3's exact contract: translateY(-150px × climb).
 *
 * The sensation of speed is sold entirely by the sky falling past — two cloud
 * layers at different rates (the near one crosses IN FRONT of the rocket,
 * which is what makes the parallax read) plus thin air lines. Ground is gone:
 * we are already above it.
 */
function ClimbScene({ climb }: { climb: number }) {
  return (
    <svg className="mrk-sky mrk-scene" viewBox="0 0 400 280" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="as-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8FB0E2" />
          <stop offset=".55" stopColor="#BCD0EF" />
          <stop offset="1" stopColor="#E1EAF9" />
        </linearGradient>
        <linearGradient id="as-plume" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(37,99,235,.26)" />
          <stop offset="1" stopColor="rgba(37,99,235,0)" />
        </linearGradient>
        <clipPath id="as-clip">
          <rect width="400" height="280" rx="20" />
        </clipPath>
      </defs>
      <g clipPath="url(#as-clip)">
        <rect width="400" height="280" fill="url(#as-sky)" />

        {/* First stars, where the sky is already darkening. */}
        <g fill="#F2F7FF">
          <circle className="mrk-tw s2" cx="66" cy="22" r="1.2" />
          <circle className="mrk-tw" cx="322" cy="30" r="1.1" />
          <circle className="mrk-tw s3" cx="238" cy="16" r="1" />
        </g>

        {/* Far layer. Duplicated at −280 (the viewBox height) for a seamless wrap. */}
        <g className="mrk-fall-far" opacity=".4" fill="#FFFFFF">
          <ellipse cx="90" cy="40" rx="26" ry="7" />
          <ellipse cx="310" cy="120" rx="22" ry="6" />
          <ellipse cx="180" cy="210" rx="24" ry="6" />
          <ellipse cx="90" cy="-240" rx="26" ry="7" />
          <ellipse cx="310" cy="-160" rx="22" ry="6" />
          <ellipse cx="180" cy="-70" rx="24" ry="6" />
        </g>

        <g className="mrk-fall-lines" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" opacity=".38">
          <line x1="60" y1="30" x2="60" y2="58" />
          <line x1="128" y1="150" x2="128" y2="184" />
          <line x1="282" y1="90" x2="282" y2="118" />
          <line x1="348" y1="200" x2="348" y2="234" />
          <line x1="60" y1="-250" x2="60" y2="-222" />
          <line x1="128" y1="-130" x2="128" y2="-96" />
          <line x1="282" y1="-190" x2="282" y2="-162" />
          <line x1="348" y1="-80" x2="348" y2="-46" />
        </g>

        {/* REAL altitude. Nothing else in this scene may encode the fraction. */}
        <g className="mrk-glide" style={{ transform: `translateY(${(-150 * climb).toFixed(1)}px)` }}>
          <g className="mrk-sway">
            <path d="M188 220 L212 220 L220 274 L180 274 Z" fill="url(#as-plume)" />
            <Flames tall />
            <RocketBody />
            <circle cx="200" cy="176" r="6.5" className="mrk-window" />
            <circle cx="200" cy="176" r="4" fill="var(--brand-blue)" />
          </g>
        </g>

        {/* Near layer, deliberately AFTER the rocket so it passes in front. */}
        <g className="mrk-fall-near" opacity=".85" fill="#FFFFFF">
          <ellipse cx="52" cy="90" rx="40" ry="11" />
          <ellipse cx="80" cy="84" rx="24" ry="8" />
          <ellipse cx="330" cy="230" rx="44" ry="12" />
          <ellipse cx="360" cy="224" rx="26" ry="9" />
          <ellipse cx="250" cy="20" rx="30" ry="9" />
          <ellipse cx="52" cy="-190" rx="40" ry="11" />
          <ellipse cx="80" cy="-196" rx="24" ry="8" />
          <ellipse cx="330" cy="-50" rx="44" ry="12" />
          <ellipse cx="360" cy="-56" rx="26" ry="9" />
          <ellipse cx="250" cy="-260" rx="30" ry="9" />
        </g>
      </g>
    </svg>
  );
}

/** Earth's limb with its surface drifting inside the planet's own clip. */
function EarthLimb({ prefix, bright = false }: { prefix: string; bright?: boolean }) {
  return (
    <>
      <circle cx="200" cy="600" r="376" fill="none" stroke={`rgba(9,197,214,${bright ? ".18" : ".14"})`} strokeWidth="9" />
      <circle cx="200" cy="600" r="373" fill="none" stroke={`rgba(127,227,236,${bright ? ".6" : ".5"})`} strokeWidth="1.6" />
      <circle cx="200" cy="600" r="372" fill={`url(#${prefix}-earth)`} />
      <g clipPath={`url(#${prefix}-earthclip)`}>
        <g className="mrk-earthspin">
          <g fill="#2E6BA8" opacity=".75">
            <path d="M20 252 q18 -12 44 -8 q20 4 30 16 q-30 10 -52 6 q-20 -4 -22 -14 Z" />
            <path d="M150 268 q24 -16 58 -10 q26 6 34 18 l-92 0 Z" />
            <path d="M290 246 q20 -10 42 -4 q16 6 20 14 q-26 8 -44 4 q-14 -4 -18 -14 Z" />
            <path d="M420 252 q18 -12 44 -8 q20 4 30 16 q-30 10 -52 6 q-20 -4 -22 -14 Z" />
            <path d="M550 268 q24 -16 58 -10 q26 6 34 18 l-92 0 Z" />
            <path d="M690 246 q20 -10 42 -4 q16 6 20 14 q-26 8 -44 4 q-14 -4 -18 -14 Z" />
          </g>
          <g fill="#FFFFFF" opacity=".1">
            <ellipse cx="90" cy="240" rx="34" ry="5" />
            <ellipse cx="240" cy="258" rx="40" ry="6" />
            <ellipse cx="360" cy="238" rx="26" ry="4" />
            <ellipse cx="490" cy="240" rx="34" ry="5" />
            <ellipse cx="640" cy="258" rx="40" ry="6" />
            <ellipse cx="760" cy="238" rx="26" ry="4" />
          </g>
        </g>
      </g>
    </>
  );
}

/** Shared starfield: two parallax layers, each duplicated at +400 to wrap. */
function StarField() {
  return (
    <>
      <g className="mrk-stars-2" fill="#CFE0FF" opacity=".55">
        <circle cx="30" cy="40" r="1" />
        <circle cx="120" cy="98" r=".9" />
        <circle cx="210" cy="26" r="1" />
        <circle cx="290" cy="120" r=".8" />
        <circle cx="360" cy="66" r="1" />
        <circle cx="70" cy="160" r=".9" />
        <circle cx="250" cy="176" r=".8" />
        <circle cx="160" cy="140" r="1" />
        <circle cx="430" cy="40" r="1" />
        <circle cx="520" cy="98" r=".9" />
        <circle cx="610" cy="26" r="1" />
        <circle cx="690" cy="120" r=".8" />
        <circle cx="760" cy="66" r="1" />
        <circle cx="470" cy="160" r=".9" />
        <circle cx="650" cy="176" r=".8" />
        <circle cx="560" cy="140" r="1" />
      </g>
      <g className="mrk-stars-1" fill="#EAF1FF">
        <circle className="mrk-tw" cx="56" cy="30" r="1.5" />
        <circle cx="188" cy="72" r="1.2" />
        <circle className="mrk-tw s2" cx="314" cy="34" r="1.4" />
        <circle cx="98" cy="130" r="1.1" />
        <circle className="mrk-tw s3" cx="356" cy="150" r="1.3" />
        <circle cx="240" cy="112" r="1.1" />
        <circle cx="150" cy="184" r="1.2" />
        <circle className="mrk-tw s3" cx="456" cy="30" r="1.5" />
        <circle cx="588" cy="72" r="1.2" />
        <circle className="mrk-tw" cx="714" cy="34" r="1.4" />
        <circle cx="498" cy="130" r="1.1" />
        <circle className="mrk-tw s2" cx="756" cy="150" r="1.3" />
        <circle cx="640" cy="112" r="1.1" />
        <circle cx="550" cy="184" r="1.2" />
      </g>
    </>
  );
}

/**
 * Beat 4 — the long one, and the one the founder saw dead in production.
 *
 * The fix is a camera trick, not a busier rocket: the vehicle only bobs and
 * blips its attitude thrusters while the ENVIRONMENT moves — parallax stars,
 * Earth rotating underneath, a shooting star every 13s. Data packets stream
 * from the open cargo bay toward the ring at a constant rate: they are flow,
 * not fraction, so they carry no information.
 *
 * The ring is the single data-bound element. With no known total it becomes a
 * genuinely indeterminate spinning arc rather than inventing a position —
 * the one place a spinner is honest, because the progress really is unknown.
 */
function OrbitScene({ ringFrac }: { ringFrac: number | null }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg className="mrk-sky mrk-scene" viewBox="0 0 400 280" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="or-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#04070F" />
          <stop offset=".6" stopColor="#0A1526" />
          <stop offset="1" stopColor="#14293F" />
        </linearGradient>
        <linearGradient id="or-earth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1B4A7A" />
          <stop offset="1" stopColor="#0C1D33" />
        </linearGradient>
        <linearGradient id="or-shoot" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(207,224,255,0)" />
          <stop offset="1" stopColor="#CFE0FF" />
        </linearGradient>
        <clipPath id="or-clip">
          <rect width="400" height="280" rx="20" />
        </clipPath>
        <clipPath id="or-earthclip">
          <circle cx="200" cy="600" r="372" />
        </clipPath>
      </defs>
      <g clipPath="url(#or-clip)">
        <rect width="400" height="280" fill="url(#or-sky)" />
        <StarField />

        <g className="mrk-shoot">
          <line x1="40" y1="34" x2="18" y2="23" stroke="url(#or-shoot)" strokeWidth="1.4" strokeLinecap="round" />
        </g>

        <EarthLimb prefix="or" />

        {/* Ambient flow from the hold to the ring: constant rate, no start or
            end state, so it can never be mistaken for a fraction. */}
        <g transform="translate(136 104) rotate(3)">
          <line x1="6" y1="0" x2="108" y2="0" stroke="rgba(127,227,236,.18)" strokeWidth="1" />
          <circle className="mrk-packet" cx="0" cy="0" r="2" fill="#7FE3EC" />
          <circle className="mrk-packet p2" cx="0" cy="0" r="1.5" fill="#7FE3EC" />
          <circle className="mrk-packet p3" cx="0" cy="0" r="1.8" fill="var(--brand-blue-2)" />
        </g>

        <g transform="rotate(-8 118 112) translate(-42 -31) scale(.8)">
          <g className="mrk-bob">
            <path className="mrk-thrust" d="M186 218 q-6 8 -10 18 q8 -4 12 -12 Z" fill="#7FE3EC" />
            <path className="mrk-thrust t2" d="M214 218 q6 8 10 18 q-8 -4 -12 -12 Z" fill="#7FE3EC" />
            <RocketBody dark />
            {/* open cargo bay */}
            <rect x="186" y="196" width="28" height="4" rx="2" fill="#7FE3EC" opacity=".8" />
            <circle cx="200" cy="176" r="6.5" className="mrk-window" />
            <circle cx="200" cy="176" r="4" fill="var(--brand-cyan)" />
          </g>
        </g>

        <g transform="translate(295 112)">
          <circle r="40" fill="rgba(10,21,38,.55)" />
          <circle className="mrk-ringpop" r="3" fill="#7FE3EC" />
          <circle r={r} fill="none" className="mrk-ring-track" strokeWidth="5" />
          {ringFrac === null ? (
            <g className="mrk-spin">
              <circle
                r={r}
                fill="none"
                className="mrk-ring-fill"
                strokeWidth="5"
                strokeDasharray={`${(c * 0.22).toFixed(1)} ${(c * 0.78).toFixed(1)}`}
              />
            </g>
          ) : (
            <circle
              r={r}
              fill="none"
              className="mrk-ring-fill"
              strokeWidth="5"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - ringFrac)}
              transform="rotate(-90)"
            />
          )}
        </g>
      </g>
    </svg>
  );
}

/**
 * Beat 5. The ring is genuinely complete — that is real state, not a
 * flourish — and it breathes while sparks converge into the core: the score
 * assembling. Still no number, for the reason given at the top of this file.
 */
function DeliveryScene() {
  const c = 2 * Math.PI * 46;
  return (
    <svg className="mrk-sky mrk-scene" viewBox="0 0 400 280" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="en-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#04070F" />
          <stop offset=".6" stopColor="#0A1526" />
          <stop offset="1" stopColor="#182F4B" />
        </linearGradient>
        <linearGradient id="en-earth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1E5387" />
          <stop offset="1" stopColor="#0C1D33" />
        </linearGradient>
        <clipPath id="en-clip">
          <rect width="400" height="280" rx="20" />
        </clipPath>
        <clipPath id="en-earthclip">
          <circle cx="200" cy="600" r="372" />
        </clipPath>
      </defs>
      <g clipPath="url(#en-clip)">
        <rect width="400" height="280" fill="url(#en-sky)" />
        <StarField />
        <EarthLimb prefix="en" bright />

        <g transform="rotate(-6 112 128) translate(-50 -18) scale(.76)">
          <g className="mrk-bob d2">
            <RocketBody dark />
            <circle cx="200" cy="176" r="6.5" className="mrk-window" />
            <circle cx="200" cy="176" r="4" fill="var(--brand-cyan)" />
            <circle className="mrk-winpulse" cx="200" cy="176" r="4" fill="#7FE3EC" style={{ animationDuration: "2.6s" }} />
          </g>
        </g>

        <g transform="translate(282 118)">
          <circle className="mrk-breathe" r="58" fill="none" stroke="rgba(79,123,255,.35)" strokeWidth="2" />
          <circle r="40" fill="rgba(10,21,38,.55)" />
          <circle className="mrk-ringpop" r="4" fill="#7FE3EC" />
          <circle r="46" fill="none" className="mrk-ring-track" strokeWidth="5" />
          <circle
            r="46"
            fill="none"
            className="mrk-ring-fill"
            strokeWidth="5"
            strokeDasharray={c}
            strokeDashoffset={0}
            transform="rotate(-90)"
          />
          <g fill="#7FE3EC">
            <circle className="mrk-converge" r="1.8" style={{ "--dx": "-66px", "--dy": "-30px" } as React.CSSProperties} />
            <circle className="mrk-converge c2" r="1.5" style={{ "--dx": "58px", "--dy": "-44px" } as React.CSSProperties} />
            <circle className="mrk-converge c3" r="1.6" style={{ "--dx": "-44px", "--dy": "52px" } as React.CSSProperties} />
            <circle className="mrk-converge c4" r="1.4" style={{ "--dx": "66px", "--dy": "34px" } as React.CSSProperties} />
          </g>
        </g>
      </g>
    </svg>
  );
}
