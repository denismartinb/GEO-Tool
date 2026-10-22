import type { CSSProperties } from "react";

/**
 * BLOG-ANIM-1 — figuras animadas de los artículos (log §314).
 *
 * Misma regla que el resto de la librería: ningún visual es decorativo. Cada
 * animación enseña el mecanismo del que habla el artículo (una lista que se
 * reordena, una pregunta que se abre en muchas búsquedas, bots que leen y
 * personas que no llegan) y cada cifra que pinta va escrita en texto al lado.
 *
 * Son componentes de servidor con animación CSS pura: sin `requestAnimationFrame`,
 * sin timers y sin estado, así que el navegador las congela solas en una
 * pestaña oculta. Con `prefers-reduced-motion: reduce` se quedan quietas en un
 * fotograma que sigue contando la historia (`app/globals.css`, `.art-anim-*`).
 * Van siempre dentro de un `Figure`, que pone el pie y, si hace falta, la
 * fuente.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;

const SHUFFLE_ROW_PX = 46;

export type ShuffleBrand = {
  name: string;
  /** Posición (1 = primera) en cada una de las cuatro respuestas; `null` = no sale. */
  runs: [number | null, number | null, number | null, number | null];
};

/**
 * La misma pregunta, cuatro respuestas: las marcas cambian de puesto y entran
 * o salen de la lista. Debajo, en cuántas de esas respuestas sale cada una,
 * calculado de las mismas cuatro listas que se ven arriba.
 */
export function ShuffleRuns({ question, brands }: { question: string; brands: ShuffleBrand[] }) {
  const slots = Math.max(...brands.flatMap((b) => b.runs.map((r) => r ?? 0)));
  const presence = brands
    .map((b) => ({ name: b.name, share: Math.round((b.runs.filter((r) => r !== null).length / b.runs.length) * 100) }))
    .sort((a, b) => b.share - a.share);

  return (
    <div className="art-anim art-shuf">
      <div className="art-shuf-q">
        <span className="art-shuf-q-l">Pregunta</span>
        <span className="art-shuf-q-t">«{question}»</span>
      </div>
      <div className="art-shuf-run" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="art-shuf-run-n"
            style={
              {
                "--o1": i === 0 ? 1 : 0,
                "--o2": i === 1 ? 1 : 0,
                "--o3": i === 2 ? 1 : 0,
                "--o4": i === 3 ? 1 : 0
              } as Vars
            }
          >
            Respuesta {i + 1}
          </span>
        ))}
      </div>
      <ol className="art-shuf-list" style={{ height: slots * SHUFFLE_ROW_PX }} aria-hidden="true">
        {brands.map((b) => {
          const vars: Vars = {};
          b.runs.forEach((pos, i) => {
            vars[`--y${i + 1}`] = `${((pos ?? slots) - 1) * SHUFFLE_ROW_PX}px`;
            vars[`--o${i + 1}`] = pos === null ? 0 : 1;
          });
          return (
            <li key={b.name} className="art-shuf-item" style={vars}>
              <span className="art-shuf-dot" />
              {b.name}
            </li>
          );
        })}
      </ol>
      <div className="art-shuf-sum">
        <div className="art-chart-t">En cuántas de esas respuestas sale cada marca</div>
        <ul>
          {presence.map((p) => (
            <li key={p.name} className={p.share === 100 ? "art-bars-row is-hl" : "art-bars-row"}>
              <span className="art-bars-l">{p.name}</span>
              <span className="art-bars-track" aria-hidden="true">
                <span className="art-bars-fill" style={{ width: `${Math.max(p.share, 1.5)}%` }} />
              </span>
              <span className="art-bars-v">{p.share}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Una pregunta que el motor abre en muchas búsquedas antes de responder.
 * Las búsquedas aparecen una tras otra y la respuesta llega al final.
 */
export function FanOut({
  question,
  searches,
  answer
}: {
  question: string;
  searches: string[];
  answer: string;
}) {
  return (
    <div className="art-anim art-fan">
      <div className="art-fan-col art-fan-ask">
        <span className="art-fan-l">Lo que escribe la persona</span>
        <p className="art-fan-card">«{question}»</p>
      </div>
      <div className="art-fan-col art-fan-mid">
        <span className="art-fan-l">Lo que busca el motor por detrás</span>
        <ul>
          {searches.map((s, i) => (
            <li key={s} className="art-fan-q" style={{ "--i": i } as Vars}>
              <span className="art-fan-mag" aria-hidden="true" />
              {s}
            </li>
          ))}
        </ul>
      </div>
      <div className="art-fan-col art-fan-out">
        <span className="art-fan-l">Lo que lee la persona</span>
        <p className="art-fan-card art-fan-ans" style={{ "--n": searches.length } as Vars}>
          {answer}
        </p>
      </div>
    </div>
  );
}

/** Altura de cada bot en el carril, repartida para que no formen una fila. */
const CRAWL_BOT_ROWS = [16, 52, 30, 62, 22, 44, 12, 36, 58, 26];

export type CrawlRow = {
  name: string;
  /** Páginas rastreadas por cada visita enviada. */
  ratio: number;
  /** Cifra tal cual la publica la fuente. */
  display: string;
};

/**
 * Bots que entran a leer una web y, muy de vez en cuando, una persona que
 * sale hacia ella. Debajo, la proporción real de cada empresa en escala
 * logarítmica: en escala lineal, todas menos una serían una raya invisible.
 */
export function CrawlGap({ rows }: { rows: CrawlRow[] }) {
  const maxLog = Math.ceil(Math.log10(Math.max(...rows.map((r) => r.ratio))));
  return (
    <div className="art-anim art-crawl">
      <div className="art-crawl-lane" aria-hidden="true">
        <span className="art-crawl-side">Bots que leen</span>
        <div className="art-crawl-track">
          {CRAWL_BOT_ROWS.map((top, i) => (
            <span key={i} className="art-crawl-bot" style={{ "--i": i, "--t": `${top}px` } as Vars} />
          ))}
          <span className="art-crawl-site">Tu web</span>
          <span className="art-crawl-human" />
        </div>
        <span className="art-crawl-side art-crawl-side-r">Personas que llegan</span>
      </div>
      <div className="art-chart-t">Páginas que rastrea cada empresa por cada visita que manda (escala logarítmica)</div>
      <ul className="art-crawl-rows">
        {rows.map((r) => (
          <li key={r.name} className="art-bars-row">
            <span className="art-bars-l">{r.name}</span>
            <span className="art-bars-track" aria-hidden="true">
              <span
                className="art-bars-fill art-crawl-fill"
                style={{ width: `${Math.max((Math.log10(r.ratio) / maxLog) * 100, 1.5)}%` }}
              />
            </span>
            <span className="art-bars-v">{r.display}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type CitationShare = {
  label: string;
  /** Porcentaje de las citas, tal cual lo publica la fuente. */
  share: number;
  /** `brand` = lo que la marca controla; se pinta apagado. */
  tone: "hl" | "earned" | "brand";
};

/**
 * De cada 100 enlaces que cita la IA, de dónde sale cada uno. Las casillas se
 * encienden por grupos, en el orden de la leyenda, y cada grupo lleva su cifra
 * escrita al lado: el dibujo redondea a casillas enteras, el texto no.
 */
export function CitationMix({ shares }: { shares: CitationShare[] }) {
  const cells: CitationShare["tone"][] = [];
  shares.forEach((s) => {
    for (let i = 0; i < Math.round(s.share); i += 1) cells.push(s.tone);
  });
  while (cells.length < 100) cells.push(shares[shares.length - 1].tone);
  return (
    <div className="art-anim art-mix">
      <ol className="art-mix-grid" aria-hidden="true">
        {cells.slice(0, 100).map((tone, i) => (
          <li key={i} className={`art-mix-cell is-${tone}`} style={{ "--i": i } as Vars} />
        ))}
      </ol>
      <ul className="art-mix-legend">
        {shares.map((s) => (
          <li key={s.label} className={`art-mix-key is-${s.tone}`}>
            <span className="art-mix-sw" aria-hidden="true" />
            <span className="art-mix-v">{s.share.toLocaleString("es-ES")}%</span>
            <span className="art-mix-l">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
