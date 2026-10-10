import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Delta } from "@/components/ui/delta";
import { scoreColor } from "../../web-audit/_components/score-tiles";

/**
 * The coverage tiles (Contenido / Implementado) and the history bars. They
 * came from the Auditoría web screen with the coverage map itself
 * (SEARCH-SEO-1 Fase 1b, log §271); markup unchanged.
 */

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
