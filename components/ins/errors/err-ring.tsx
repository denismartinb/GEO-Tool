/** Empty instrument for the 404 and error screens: a ring of ticks with nothing to read. */
export function ErrRing({ label, warm = false }: { label: string; warm?: boolean }) {
  return (
    <div className="er-ring" aria-hidden="true">
      <svg viewBox="0 0 160 160">
        {Array.from({ length: 60 }, (_, i) => {
          const a = ((-90 + i * 6) * Math.PI) / 180;
          const major = i % 5 === 0;
          return (
            <line
              key={i}
              className={warm && i < 9 ? "w" : undefined}
              x1={(80 + (major ? 60 : 64) * Math.cos(a)).toFixed(1)}
              y1={(80 + (major ? 60 : 64) * Math.sin(a)).toFixed(1)}
              x2={(80 + 72 * Math.cos(a)).toFixed(1)}
              y2={(80 + 72 * Math.sin(a)).toFixed(1)}
            />
          );
        })}
      </svg>
      <span className="num">{label}</span>
    </div>
  );
}
