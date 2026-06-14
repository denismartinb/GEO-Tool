type InfoTipProps = {
  text: string;
};

/**
 * Small "i" icon that reveals an explanatory tooltip on hover/focus/tap.
 * Pure CSS (no client JS) so it works inside server components.
 */
export function InfoTip({ text }: InfoTipProps) {
  return (
    <span className="info-tip" tabIndex={0} role="note" aria-label={text}>
      <span className="info-tip-icon" aria-hidden="true">i</span>
      <span className="info-tip-bubble">{text}</span>
    </span>
  );
}
