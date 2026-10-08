import {
  MEASUREMENT_API_LIMIT_NOTICE,
  describeMeasurementBasis,
  type MeasurementBasis
} from "@/lib/scoring/measurement-basis";
import { getEngineMeta } from "@/lib/scan/engine-meta";

const NOTE_STYLE = {
  marginTop: 14,
  border: "1px solid var(--line-soft)",
  borderRadius: 12,
  background: "var(--surface, #fff)",
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--ink-2)"
} as const;
const SUMMARY_STYLE = { cursor: "pointer", padding: "10px 14px", fontWeight: 650, color: "var(--ink-1, inherit)" } as const;
const BODY_STYLE = { padding: "0 14px 12px", display: "grid", gap: 8 } as const;
const LIST_STYLE = { margin: 0, paddingLeft: 18 } as const;
const LIMIT_STYLE = { margin: 0, fontSize: 12, color: "var(--ink-3)" } as const;
const PARAGRAPH_STYLE = { margin: 0 } as const;

export type EngineSensitivity = Record<string, { score_without: number | null; delta: number | null }>;

function formatPoints(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

/**
 * "Base de esta medición" (MEASUREMENT-BASIS-1): what the number above was
 * measured over, why its confidence is what it is, how much it rests on each
 * engine, and the limit that it comes from model APIs. Collapsed by default —
 * a qualifier you read when you doubt the number, not tinta repeated on every
 * visit (same reasoning RECS-REDESIGN-1 applied to confidence on cards).
 *
 * Server-renderable on purpose (no hooks, no client state) so it can be
 * rendered to static HTML in a test and in a capture.
 */
export function MeasurementBasisNote({
  basis,
  confidenceReason,
  sensitivity,
  defaultOpen = false
}: {
  basis: MeasurementBasis | null;
  confidenceReason: string | null;
  sensitivity: EngineSensitivity | null;
  /** Collapsed in the product; open only for tests and review captures of its content. */
  defaultOpen?: boolean;
}) {
  const lines = describeMeasurementBasis(basis);
  const sensitivityEntries = Object.entries(sensitivity ?? {})
    .filter(([, value]) => typeof value.score_without === "number" && typeof value.delta === "number")
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <details style={NOTE_STYLE} data-testid="measurement-basis-note" open={defaultOpen}>
      <summary style={SUMMARY_STYLE}>Base de esta medición</summary>
      <div style={BODY_STYLE}>
        {basis ? (
          <ul style={LIST_STYLE}>
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p style={PARAGRAPH_STYLE}>
            Este escaneo se midió antes de que se registrara su base (preguntas, modelos, país e idioma), así que
            no se puede detallar aquí.
          </p>
        )}
        {confidenceReason ? (
          <p style={PARAGRAPH_STYLE}>
            <strong>Confianza.</strong> {confidenceReason}
          </p>
        ) : null}
        {sensitivityEntries.length > 0 ? (
          <p style={PARAGRAPH_STYLE}>
            <strong>Si faltara un motor.</strong>{" "}
            {sensitivityEntries
              .map(([provider, value]) => {
                const delta = value.delta as number;
                const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
                return `Sin ${getEngineMeta(provider).label || provider}: ${formatPoints(value.score_without as number)} (${sign}${formatPoints(Math.abs(delta))})`;
              })
              .join(" · ")}
            . Se recalcula con las respuestas restantes; no es una predicción.
          </p>
        ) : null}
        <p style={LIMIT_STYLE}>{MEASUREMENT_API_LIMIT_NOTICE}</p>
      </div>
    </details>
  );
}
