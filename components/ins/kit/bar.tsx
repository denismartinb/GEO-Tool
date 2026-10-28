import type { CSSProperties } from "react";

/** Thin bar with an end marker (`bar()` in the prototype). `Motion` adds `.lit` to animate it. */
export function Bar({
  value,
  max = 100,
  cls = "",
  color,
  delay = 0,
  label,
}: {
  value: number;
  max?: number;
  cls?: string;
  color?: string;
  delay?: number;
  label?: string;
}) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  const style = {
    "--w": `${w}%`,
    "--bd": `${delay}ms`,
    ...(color ? { "--c": color } : {}),
  } as CSSProperties;
  return (
    <div
      className={`tb ${cls}`.trim()}
      style={style}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    >
      <i />
      <b />
    </div>
  );
}

/** Row of ticks (`ticks()`): only the dial, the engine row, the scan counter and accents. */
export function Ticks({
  count,
  on,
  cls = "",
  id,
}: {
  count: number;
  on: number;
  cls?: string;
  id?: string;
}) {
  return (
    <div className={`tk ${cls}`.trim()} id={id} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          className={i < on ? "on" : ""}
          style={{ "--td": `${i * 14}ms` } as CSSProperties}
        />
      ))}
    </div>
  );
}
