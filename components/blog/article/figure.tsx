import type { ReactNode } from "react";

/**
 * GROWTH-3 Fase 3.1 — evidencia visual.
 *
 * `Figure` es el contenedor de TODO lo visual de un artículo: marco, pie y
 * fuente. `ProductMock` es la maqueta del panel de Genscore, construida en
 * SVG/CSS con datos de ejemplo — nunca una captura de la cuenta piloto (ver
 * `docs/adr/0026-article-imagery-policy.md`).
 */

/** Marco + pie de figura. `label` numera la figura; `caption` explica qué se está viendo y de dónde salen los datos. */
export function Figure({
  label,
  caption,
  children
}: {
  label: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <figure className="art-figure">
      <div className="art-frame">{children}</div>
      <figcaption className="art-caption">
        <b>{label}</b>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

export type MockRow = {
  label: string;
  hint: string;
  /** 0-100. */
  value: number;
  /** Peso del componente dentro del GEO Score, si aplica. */
  weight?: number;
  tone?: "blue" | "blue2" | "cyan" | "warm";
};

const GAUGE_R = 54;
const GAUGE_C = 2 * Math.PI * GAUGE_R;

/**
 * Maqueta del panel de GEO Score. Reproduce el lenguaje visual del producto
 * real (gauge + descomposición por componente) para que un artículo pueda
 * mostrar de qué habla sin depender de una captura.
 *
 * `highlight` marca una fila con un anillo y una etiqueta — es el equivalente
 * al recuadro con flecha de las capturas anotadas, pero anclado a la fila en
 * vez de posicionado en absoluto, así que no se descuadra en ningún ancho.
 */
export function ProductMock({
  score,
  rows,
  highlight,
  annotation
}: {
  score: number;
  rows: MockRow[];
  highlight?: number;
  annotation?: string;
}) {
  return (
    <div className="art-mock">
      <div className="art-gauge">
        <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
          <circle cx="66" cy="66" r={GAUGE_R} fill="none" stroke="var(--line)" strokeWidth="11" />
          <circle
            cx="66"
            cy="66"
            r={GAUGE_R}
            fill="none"
            stroke="var(--brand-blue)"
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${(GAUGE_C * score) / 100} ${GAUGE_C}`}
            transform="rotate(-90 66 66)"
          />
        </svg>
        <div className="art-gauge-val">
          <div>
            <div className="art-gauge-num">{score}</div>
            <div className="art-gauge-cap">GEO Score</div>
          </div>
        </div>
      </div>

      <div className="art-rows">
        {rows.map((row, i) => {
          const isHl = highlight === i;
          return (
            <div key={row.label} className={isHl ? "art-row art-row-hl" : "art-row"}>
              {isHl && annotation && (
                <span className="art-anno-lbl">
                  {annotation}
                  <svg width="11" height="7" viewBox="0 0 11 7" fill="none" aria-hidden="true">
                    <path d="M1 1l4.5 4.5L10 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              <div className="art-row-top">
                <span className="art-row-l">
                  {row.label}
                  <em>{row.hint}</em>
                </span>
                <span className="art-row-v">
                  {row.value}%{row.weight !== undefined && <small>peso {row.weight}%</small>}
                </span>
              </div>
              <div className="art-track">
                <div className={`art-fill art-tone-bg-${row.tone ?? "blue"}`} style={{ width: `${row.value}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
