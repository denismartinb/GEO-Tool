import Link from "next/link";
import { Gauge } from "@/components/ui/gauge";
import { Icon } from "@/components/ui/icon";
import { InfoTip } from "@/components/ui/info-tip";
import { Delta } from "@/components/ui/delta";

/**
 * PRELAUNCH-HARDENING-1 Fase R7 — un trozo de la pantalla de Auditoría web.
 *
 * `page.tsx` tenía 1.933 líneas con catorce componentes de presentación
 * definidos dentro, así que para cambiar una fila había que navegar la página
 * entera. Son todos componentes de servidor y puros: reciben datos ya
 * calculados y devuelven marcado. Cero cambios de lógica y cero cambios de
 * marcado — el `ux-pilot` es quien lo verifica, porque esta fase SÍ toca UI
 * (log §83).
 */

export function scoreColor(score: number | null): string {
  if (score === null) return "var(--ink-4)";
  return score < 40 ? "var(--neg-ink)" : score < 70 ? "var(--warn)" : "var(--pos)";
}

/**
 * Hero "Preparación GEO" gauge — the SAME shared `Gauge` component Overview
 * uses (270° sweep, gradient stroke, Bricolage numeral via `.gauge-num`),
 * not the bespoke flat-arc SVG this page had before (founder-approved
 * 2026-08-02: "los gauges son muy distintos" del artefacto — that bespoke
 * version never got the visual treatment the rest of the console already
 * has). `.wa2-scope .gauge-num` in globals.css gives it the same
 * Bricolage/gradient treatment `.ov2-scope`/`.cit2-scope` already apply.
 */
/**
 * Half-circle variant, matching the approved mockup's "Salud del sitio" dial
 * (founder review 2026-08-03 — second pass on this same point: adopting the
 * shared component fixed consistency but not the shape).
 */
export function ScoreGauge({ score }: { score: number | null }) {
  const size = 168;
  const stroke = 15;
  if (score === null) {
    const height = size / 2 + stroke / 2;
    const r = (size - stroke) / 2;
    return (
      <svg width={size} height={height} role="img" aria-label="Diagnóstico general sin datos" style={{ flexShrink: 0 }}>
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="var(--surface-sunk)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <text x="50%" y={size / 2 - 4} textAnchor="middle" style={{ fontSize: 26, fontWeight: 700, fill: "var(--ink-4)" }}>
          —
        </text>
      </svg>
    );
  }
  return <Gauge value={score} size={size} stroke={stroke} variant="semi" />;
}

/** Small Lighthouse-style score ring for per-page rows in Salud técnica (WEB-AUDIT-R4). `label` names WHICH page the ring belongs to — QA report: a screen reader tabbing the page list heard the same generic phrase on every ring. */
export function ScoreRing({ score, label }: { score: number; label: string }) {
  const size = 38;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Salud técnica de ${label}: ${score} de 100`}
      style={{ flexShrink: 0 }}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-soft)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: 11.5, fontWeight: 800, fill: "var(--ink)", fontVariantNumeric: "tabular-nums" }}
      >
        {score}
      </text>
    </svg>
  );
}

/** 4px progress bar under a hero tile / history row (WEB-AUDIT-R4). */
export function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 4, borderRadius: 999, background: "var(--line-soft)", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", borderRadius: 999, background: color }} />
    </div>
  );
}

export function SubScoreTile({
  label,
  value,
  hint,
  delta,
  pct,
}: {
  label: string;
  value: string;
  hint: string;
  /** null also when the delta exists but isn't trustworthy enough to show — see isDeltaTrustworthy. */
  delta: number | null;
  /** 0-100 fill for the tile's progress bar; null → no bar (signal never computed). */
  pct: number | null;
}) {
  return (
    <div style={{ padding: "9px 11px", background: "var(--surface-2)", borderRadius: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)", flex: 1, minWidth: 0 }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-.01em", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
        {value}
        {delta !== null && delta !== 0 && (
          <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 600 }}>
            <Delta value={delta} suffix=" pt" />
          </span>
        )}
      </div>
      {pct !== null && (
        <div style={{ marginTop: 6 }}>
          <MiniBar pct={pct} color={scoreColor(pct)} />
        </div>
      )}
      <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: pct !== null ? 5 : 2 }}>{hint}</div>
    </div>
  );
}

/**
 * WEB-AUDIT-TECH-ALL-PLANS-1: coverage/surfacing stay Pro-only (batched
 * Gemini grounding, genuinely expensive) while the technical tile next to
 * them now works on every plan. Reusing SubScoreTile's "—"/"Sin auditar"
 * here would claim "never run" when the real fact is "not included in your
 * plan" — a different, false claim about the user's own account
 * (`.claude/rules/web-audit.md`: "Ningún número de relleno"). Same box, same
 * grid slot as SubScoreTile so the three-tile row never reflows by plan.
 */
export function LockedSubScoreTile({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={{ padding: "9px 11px", background: "var(--surface-2)", borderRadius: 10, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
        <Icon name="lock" size={12} />
        <span style={{ fontSize: 14, fontWeight: 750, color: "var(--ink-3)" }}>No está en tu plan</span>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 5 }}>{hint}</div>
      <Link
        href="/dashboard/settings/billing"
        style={{ fontSize: 10.5, fontWeight: 650, color: "var(--accent)", marginTop: 4, display: "inline-block" }}
      >
        Ver planes
      </Link>
    </div>
  );
}
