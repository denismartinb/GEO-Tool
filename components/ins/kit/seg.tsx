"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Segmented control with the sliding indicator (`seg()` / `segInd()` in the prototype). */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<readonly [T, ReactNode]>;
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const place = () => {
      const on = root.querySelector<HTMLElement>('button[aria-pressed="true"]');
      const ind = root.querySelector<HTMLElement>(".ind");
      if (!on || !ind) return;
      ind.style.left = `${on.offsetLeft}px`;
      ind.style.width = `${on.offsetWidth}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(root);
    return () => ro.disconnect();
  }, [value, options]);
  return (
    <div className="seg" role="tablist" aria-label={label} ref={ref}>
      <span className="ind" />
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-pressed={value === key}
          aria-selected={value === key}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
