/**
 * Rolling counter (`roll()` in the prototype). Server-rendered at its final
 * value; `Motion` replays the roll on arrival. The digits are decorative
 * (`aria-hidden`), the number is in the `aria-label`.
 */
export function Roll({
  value,
  className = "",
}: {
  value: number | string;
  className?: string;
}) {
  const text = String(value);
  return (
    <span className={`roll num ${className}`.trim()} aria-label={text}>
      {text.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="col" aria-hidden="true">
            <span data-d={ch} style={{ transform: `translateY(-${ch}em)` }}>
              {"0123456789".split("").map((d) => (
                <i key={d}>{d}</i>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} className="st" aria-hidden="true">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
