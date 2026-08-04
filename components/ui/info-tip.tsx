type InfoTipProps = {
  text: string;
};

/**
 * Small "i" icon that reveals an explanatory tooltip on hover/focus/tap.
 * Pure CSS (no client JS) so it works inside server components.
 *
 * The bubble is 220px wide and, by default, anchored to this component's own
 * 14×14px trigger — nothing constrains it to the viewport. A trigger placed
 * anywhere past ~155px from its row's right edge overflows for real
 * (visibility:hidden does not remove it from layout), invisibly until
 * something actually hovers it or measures scrollWidth against the right
 * element. Found four times independently (2026-08-01 through 2026-08-03,
 * see the `.info-tip-anchor` comment in app/globals.css) before it became a
 * documented pattern instead of a fifth bespoke fix.
 *
 * Wrap whatever element should own the tooltip's safe width — normally the
 * immediate label/heading row this sits in, not a whole card — in
 * `className="info-tip-anchor"` (or a wider-scoped equivalent already in
 * that selector list, e.g. `.cit2-kpis`). Skipping this is not a cosmetic risk:
 * every prior case was a REAL, permanent horizontal overflow on mobile.
 */
export function InfoTip({ text }: InfoTipProps) {
  return (
    <span className="info-tip" tabIndex={0} role="note" aria-label={text}>
      <span className="info-tip-icon" aria-hidden="true">i</span>
      <span className="info-tip-bubble">{text}</span>
    </span>
  );
}
