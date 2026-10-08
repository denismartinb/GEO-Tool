import { Gauge } from "@/components/ui/gauge";
import { Sparkline } from "@/components/ui/sparkline";
import { Delta } from "@/components/ui/delta";
import type { GaugeHeadline } from "@/lib/metrics/gauge-headline";

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
  sampleNudge
}: {
  headline: GaugeHeadline;
  bandLabel: string;
  bandTone: string;
  sampleNudge: string | null;
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
          <div className="ov2-gauge-trend-cap" data-testid="gauge-withheld-reason">
            {windowPublished ? "Sin variación" : "Sin mediana ni variación"}: {withheldReason}. Esta es la puntuación de
            tu último escaneo.
          </div>
        ) : null}
      </div>
    </div>
  );
}
