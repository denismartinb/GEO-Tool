import type { ReactNode } from "react";

/**
 * STUDY-HOME-1 — gráficos del estudio «De buscar a preguntar» (log §251).
 *
 * Son los gráficos del PDF del estudio pasados a componentes de servidor:
 * barras horizontales, columnas y comparación por motor. La misma regla que el
 * resto de la librería: **ningún visual es decorativo, todos son evidencia**.
 * Cada barra mide una cifra publicada con su fuente, y la cifra va escrita al
 * lado — un lector de pantalla, o alguien que no distingue el largo de una
 * barra, lee el número, no el dibujo. Van siempre dentro de un `Figure`, que
 * es quien pone el pie con la fuente.
 *
 * Paleta del artículo: tinta, azul y cian (log §247). El degradado azul→cian
 * marca la fila de la IA, que es de lo que habla el estudio; el resto va en
 * gris claro para no competir con ella.
 */

/** Ancho de una barra en %, con un mínimo visible para que un 1% no desaparezca. */
function barWidth(value: number, max: number): string {
  return `${Math.max((value / max) * 100, 1.5)}%`;
}

export type BarRow = {
  label: string;
  /** Porcentaje, 0–100: decide el largo de la barra. */
  value: number;
  /** Texto de la cifra; por defecto `${value}%`. */
  display?: string;
  /** Variación junto a la cifra («+15 pts»). */
  delta?: string;
  /** Resalta la fila con el degradado de la IA. */
  highlight?: boolean;
};

/** Barras horizontales con la cifra a la derecha (AIMC, IAB en el PDF). */
export function BarChart({ title, rows, max = 100 }: { title: string; rows: BarRow[]; max?: number }) {
  return (
    <div className="art-bars">
      <div className="art-chart-t">{title}</div>
      <ul>
        {rows.map((row) => (
          <li key={row.label} className={row.highlight ? "art-bars-row is-hl" : "art-bars-row"}>
            <span className="art-bars-l">{row.label}</span>
            <span className="art-bars-track" aria-hidden="true">
              <span className="art-bars-fill" style={{ width: barWidth(row.value, max) }} />
            </span>
            <span className="art-bars-v">
              {row.display ?? `${row.value}%`}
              {row.delta && <em>{row.delta}</em>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Column = { label: string; value: number; display?: string; highlight?: boolean };

/** Columnas verticales para comparar dos o tres situaciones (Pew en el PDF). */
export function ColumnChart({ title, columns, max = 30 }: { title: string; columns: Column[]; max?: number }) {
  return (
    <div className="art-cols">
      <div className="art-chart-t">{title}</div>
      <ul>
        {columns.map((col) => (
          <li key={col.label} className={col.highlight ? "art-cols-c is-hl" : "art-cols-c"}>
            <span className="art-cols-v">{col.display ?? `${col.value}%`}</span>
            <span
              className="art-cols-bar"
              aria-hidden="true"
              // La cifra va encima de la barra: se le reservan 40px del alto.
              style={{ height: `calc((100% - 40px) * ${Math.max(col.value / max, 0.015)})` }}
            />
            <span className="art-cols-l">{col.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Dos gráficos lado a lado dentro de una misma figura; en móvil, uno debajo de otro. */
export function ChartPair({ children }: { children: ReactNode }) {
  return <div className="art-chartpair">{children}</div>;
}

const ENGINES = [
  { key: "gemini", name: "Gemini" },
  { key: "chatgpt", name: "ChatGPT" },
  { key: "claude", name: "Claude" }
] as const;

export type EngineRow = { brand: string; gemini: number; chatgpt: number; claude: number };

/**
 * Presencia de cada marca motor a motor: tres barras por marca. Existe para
 * enseñar de un golpe lo que en prosa cuesta un párrafo —que la misma marca
 * puede salir casi siempre en un motor y nunca en otro—. Sólo porcentajes,
 * motores por su nombre y sin versión (regla del fundador, log §246).
 */
export function EngineChart({ title, rows }: { title: string; rows: EngineRow[] }) {
  return (
    <div className="art-eng">
      <div className="art-chart-t">{title}</div>
      <div className="art-eng-legend" aria-hidden="true">
        {ENGINES.map((e) => (
          <span key={e.key} className={`art-eng-k art-eng-${e.key}`}>
            {e.name}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.brand} className="art-eng-row">
          <span className="art-eng-b">{row.brand}</span>
          <ul aria-label={row.brand}>
            {ENGINES.map((e) => (
              <li key={e.key} className={`art-eng-${e.key}`}>
                <span className="art-eng-name">{e.name}</span>
                <span className="art-eng-track" aria-hidden="true">
                  <span className="art-eng-fill" style={{ width: row[e.key] ? barWidth(row[e.key], 100) : 0 }} />
                </span>
                <span className="art-eng-v">{row[e.key]}%</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Panel oscuro de lectura en dos columnas, como los recuadros «Qué significa»
 * del PDF. Es interpretación, no dato nuevo: lo que va dentro tiene que
 * apoyarse en cifras que el artículo ya ha dado con su fuente.
 */
export function InsightPanel({ children }: { children: ReactNode }) {
  return <div className="art-insights">{children}</div>;
}

export function Insight({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="art-insight">
      <div className="art-insight-t">{title}</div>
      {children}
    </div>
  );
}
