import { Gauge } from "@/components/ui/gauge";
import { Sparkline } from "@/components/ui/sparkline";
import { Delta } from "@/components/ui/delta";
import type { GaugeHeadline } from "@/lib/metrics/gauge-headline";
import { isUnverifiableReason } from "@/lib/scoring/measurement-basis";

/**
 * Copy for a scan that cannot be compared because nothing was recorded to
 * compare against (a scan from before the measurement basis existed). Plain on
 * purpose and with NO promise: whether the next scan fixes it depends on there
 * being enough comparable runs, which a further scan may still not provide
 * (Director, 2026-10-08). Never "se resuelve con el próximo escaneo".
 */
export const COPY_NOT_ENOUGH_COMPARABLE_SCANS =
  "Todavía no hay suficientes escaneos comparables para mostrar una tendencia. Puedes ver el resultado de este escaneo y cómo se midió.";

/**
 * Same sentence for the case where THIS scan is itself from before the basis
 * was recorded: the "Base de esta medición" note then has nothing to show about
 * how it was measured ("no se puede detallar aquí"), so the copy must not offer
 * it. Found by looking at the rendered card, not by a test: the first version
 * invited the reader to a detail that said it did not exist.
 */
export const COPY_NOT_ENOUGH_COMPARABLE_SCANS_NO_BASIS =
  "Todavía no hay suficientes escaneos comparables para mostrar una tendencia. Puedes ver el resultado de este escaneo.";

/**
 * The note's own type. NOT `.ov2-gauge-trend-cap` (10.5px, --ink-4): that grey
 * is 2.6:1 on white — below WCAG AA — and was fine for a caption but not for
 * the one sentence that explains why a number is missing. --ink-3 is 4.8:1 on
 * white (5.4:1 inside `.ov2-scope`, where it remaps to --brand-ink-3).
 */
const WITHHELD_NOTE_STYLE = {
  marginTop: 6,
  fontSize: 12,
  lineHeight: 1.45,
  fontWeight: 500,
  color: "var(--ink-3)"
} as const;

/**
 * The Overview's "Puntuación GEO" card: ring, band, variation and trend.
 * Extracted from the page so its three states can be rendered in a test:
 *
 *  - comparable scans: median, variation and sparkline;
 *  - scans that did not measure the same thing: ONLY the median, the variation
 *    and the sparkline go away — the latest scan's own score stays on screen
 *    and the reason is stated (MEASUREMENT-BASIS-1);
 *  - too few answers for a claim: the existing nudge, unchanged.
 *
 * The band is derived from the visible score and is never withheld
 * (GEO-BAND-ALWAYS-1, founder decision 2026-09-12) — it asserts nothing about
 * a comparison across scans.
 */
export function GeoScoreGaugeCard({
  headline,
  bandLabel,
  bandTone,
  sampleNudge,
  basisRecorded
}: {
  headline: GaugeHeadline;
  bandLabel: string;
  bandTone: string;
  sampleNudge: string | null;
  /** Whether THIS scan recorded how it was measured (`details_json.measurement_basis`). */
  basisRecorded: boolean;
}) {
  const { score, trend, deltaVerdict, withheldReason, windowPublished } = headline;
  const trendVisible = trend.length >= 2 && deltaVerdict?.kind === "publish";

  return (
    <div className="ov2-gauge-card" data-testid="geo-score-gauge-card">
      <div className="ov2-gauge-ring">
        <Gauge value={score} size={96} stroke={10} />
      </div>
      <div className="ov2-gauge-info">
        <div className="ov2-gauge-lbl">Puntuación GEO</div>
        <div className="ov2-gauge-badges">
          <span className={`badge badge-${bandTone}`}>{bandLabel}</span>
          {deltaVerdict?.kind === "publish" && deltaVerdict.value !== 0 && <Delta value={deltaVerdict.value} suffix=" pt" />}
        </div>
        {/* The sparkline is the delta in graphical form: a line joining the
            last N scores asserts a trend between them just as literally as
            "+44 pt" does, so it is withheld under the same condition as the
            number. */}
        {trendVisible ? (
          <>
            <Sparkline data={trend} w={200} h={30} color="var(--brand-blue)" />
            <div className="ov2-gauge-trend-cap">Últimos {trend.length} escaneos</div>
          </>
        ) : sampleNudge ? (
          <div className="ov2-gauge-trend-cap">{sampleNudge}</div>
        ) : withheldReason ? (
          <div style={WITHHELD_NOTE_STYLE} data-testid="gauge-withheld-reason">
            {isUnverifiableReason(withheldReason) ? (
              basisRecorded ? COPY_NOT_ENOUGH_COMPARABLE_SCANS : COPY_NOT_ENOUGH_COMPARABLE_SCANS_NO_BASIS
            ) : (
              <>
                {windowPublished ? "Sin variación" : "Sin mediana ni variación"}: {withheldReason}. Esta es la
                puntuación de tu último escaneo.
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
