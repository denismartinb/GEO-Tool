import type { CSSProperties, ReactNode } from "react";

/**
 * Loading skeletons of the console (CONSOLE-SKELETONS-1, log §398). Every
 * `loading.tsx` under `app/dashboard` builds from these pieces, so the shape
 * matches the Instrumento screen it stands in for (the shared `PageHead`
 * included) and the colours come from the Instrumento tokens, dark mode too.
 * Server components, no data: the pulse is ambient, never progress.
 */

type Size = number | string;

export function Sk({
  w,
  h,
  className,
  style
}: {
  w?: Size;
  h?: Size;
  className?: string;
  style?: CSSProperties;
}) {
  return <span className={`sk${className ? ` ${className}` : ""}`} style={{ width: w, height: h, ...style }} aria-hidden="true" />;
}

/** The `.ins` page every skeleton lives in, announced once as loading. */
export function SkPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="ins">
      <div className={`page sk-page${className ? ` ${className}` : ""}`} role="status" aria-busy="true">
        <span className="sr">Cargando…</span>
        {children}
      </div>
    </div>
  );
}

/** Same row as `PageHead`: title, an optional action and the data sentence. */
export function SkHead({ action = false, lead = 2 }: { action?: boolean; lead?: number }) {
  return (
    <>
      <div className="sk-h">
        <Sk className="sk-t" />
        {action ? <Sk className="sk-a pill" /> : null}
      </div>
      {lead > 0 ? (
        <div className="sk-lead">
          {Array.from({ length: lead }, (_, i) => (
            <Sk key={i} w={i === lead - 1 && lead > 1 ? "62%" : "100%"} />
          ))}
        </div>
      ) : null}
    </>
  );
}

export function SkSection({ children, title = true, side, style }: { children: ReactNode; title?: boolean; side?: ReactNode; style?: CSSProperties }) {
  return (
    <section className="sk-sec" style={style}>
      {title ? (
        <div className="sk-sec-h">
          <Sk />
          {side ?? null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function SkCard({ children, flush = false, className, style }: { children?: ReactNode; flush?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <div className={`sk-card${flush ? " flush" : ""}${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </div>
  );
}

/** A figures strip like `.kpis` or the pillars: label, figure and a bar. `row` keeps it in one row on a phone. */
export function SkStrip({ n = 4, row = false, bar = true }: { n?: number; row?: boolean; bar?: boolean }) {
  return (
    <div className={`sk-strip${row ? " row" : ""}`} style={{ "--n": n } as CSSProperties}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i}>
          <Sk w="60%" h={11} />
          <Sk className="sk-v" />
          {bar ? <Sk className="sk-bar" w="90%" /> : null}
        </div>
      ))}
    </div>
  );
}

export function SkTabs({ n = 3 }: { n?: number }) {
  return (
    <div className="sk-tabs">
      {Array.from({ length: n }, (_, i) => (
        <Sk key={i} className="pill" />
      ))}
    </div>
  );
}

/** List rows: a leading mark, two lines and a figure on the right. */
export function SkRows({
  n = 4,
  lead = "icon",
  figure = true
}: {
  n?: number;
  lead?: "icon" | "num" | "dot" | "none";
  figure?: boolean;
}) {
  return (
    <div>
      {Array.from({ length: n }, (_, i) => (
        <div className="sk-row" key={i}>
          {lead === "icon" ? <Sk w={28} h={28} style={{ borderRadius: 8 }} /> : null}
          {lead === "num" ? <Sk w={30} h={26} style={{ borderRadius: 6 }} /> : null}
          {lead === "dot" ? <Sk w={9} h={9} className="circ strong" /> : null}
          <div className="sk-grow">
            <Sk w={`${[72, 58, 66, 50, 62][i % 5]}%`} h={13} className="strong" />
            <Sk w={`${[38, 30, 44, 34, 26][i % 5]}%`} h={10} />
          </div>
          {figure ? <Sk w={46} h={20} className="strong" /> : null}
        </div>
      ))}
    </div>
  );
}
