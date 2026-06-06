type DotMeterProps = {
  n: number;
  max?: number;
  tone?: "h" | "m" | "l";
};

export function DotMeter({ n, max = 5, tone = "h" }: DotMeterProps) {
  return (
    <span className="ie-dots">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={`ie-dot ${i < n ? `on-${tone}` : ""}`} />
      ))}
    </span>
  );
}
